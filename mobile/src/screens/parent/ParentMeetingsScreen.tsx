import React, { useEffect, useState } from "react";
import {
  View, Text, StyleSheet, SafeAreaView, StatusBar, TouchableOpacity,
  ScrollView, TextInput, ActivityIndicator, Linking, RefreshControl,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Toast from "react-native-toast-message";
import { parentApi, type MeetingRequest, type MeetingStatus } from "@/api/parent";
import { errorDetail } from "@/api/errorDetail";
import { useLinkedChild } from "@/hooks/useLinkedChild";
import { useLanguage } from "@/contexts/LanguageContext";
import { fmt } from "@/i18n/format";
import type { TranslationKey } from "@/i18n/translations";
import { formatDayMonYearTime, parseLocalDateTime, startOfTomorrow } from "@/utils/dates";
import { Badge, ConfirmModal, EmptyState } from "@/components/ui";
import type { BadgeVariant } from "@/components/ui";
import { palette, semantic, radius, spacing, typography, cardShadow } from "@/theme/colors";

const STATUS_META: Record<MeetingStatus, { key: TranslationKey; variant: BadgeVariant }> = {
  pending:   { key: "statusPending",   variant: "warning" },
  confirmed: { key: "statusConfirmed", variant: "success" },
  declined:  { key: "statusDeclined",  variant: "danger" },
  completed: { key: "statusCompleted", variant: "info" },
  cancelled: { key: "statusCancelled", variant: "gray" },
};

const TOPIC_MAX = 200;

function pad2(n: number) { return String(n).padStart(2, "0"); }

function defaultPreferred(): string {
  const d = startOfTomorrow();
  d.setHours(10, 0, 0, 0);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

export default function ParentMeetingsScreen() {
  const navigation = useNavigation<any>();
  const { t } = useLanguage();
  const qc = useQueryClient();
  const { approvedChildren, selectedChildId, isLoading: childrenLoading } = useLinkedChild();

  const [studentId, setStudentId] = useState<string | null>(null);
  const [when, setWhen] = useState(defaultPreferred);
  const [topic, setTopic] = useState("");
  const [notes, setNotes] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [cancelTarget, setCancelTarget] = useState<MeetingRequest | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (studentId && approvedChildren.some((c) => c.student_user_id === studentId)) return;
    const preferred = approvedChildren.find((c) => c.student_user_id === selectedChildId) ?? approvedChildren[0];
    setStudentId(preferred?.student_user_id ?? null);
  }, [approvedChildren, selectedChildId, studentId]);

  const {
    data: meetings = [],
    isLoading: meetingsLoading,
    isError: meetingsError,
    refetch,
  } = useQuery<MeetingRequest[]>({
    queryKey: ["meetings-mine"],
    queryFn: () => parentApi.myMeetings().then((r) => (Array.isArray(r.data) ? r.data : [])),
    staleTime: 15_000,
  });

  const createMutation = useMutation({
    mutationFn: (body: { student_user_id: string; preferred_at: string; topic: string; notes?: string }) =>
      parentApi.createMeeting(body).then((r) => r.data),
    onSuccess: () => {
      Toast.show({ type: "success", text1: t("meetingRequested"), text2: t("meetingRequestedBody") });
      setTopic("");
      setNotes("");
      setWhen(defaultPreferred());
      setFormError(null);
      qc.invalidateQueries({ queryKey: ["meetings-mine"] });
    },
    onError: (err: any) => {
      Toast.show({ type: "error", text1: t("couldNotRequestMeeting"), text2: errorDetail(err, t("pleaseTryAgain")) });
    },
  });

  const cancelMutation = useMutation({
    mutationFn: (id: string) => parentApi.cancelMeeting(id),
    onSuccess: () => {
      Toast.show({ type: "success", text1: t("meetingCancelled") });
      qc.invalidateQueries({ queryKey: ["meetings-mine"] });
    },
    onError: (err: any) => {
      Toast.show({ type: "error", text1: t("couldNotCancelMeeting"), text2: errorDetail(err, t("pleaseTryAgain")) });
    },
    onSettled: () => setCancelTarget(null),
  });

  const submit = () => {
    setFormError(null);
    if (!studentId) { setFormError(t("noApprovedChildren")); return; }
    const parsed = parseLocalDateTime(when);
    if (!parsed) { setFormError(t("invalidDateTime")); return; }
    if (parsed.getTime() < startOfTomorrow().getTime()) { setFormError(t("dateTooEarly")); return; }
    const trimmedTopic = topic.trim();
    if (!trimmedTopic || trimmedTopic.length > TOPIC_MAX) { setFormError(t("topicRequired")); return; }
    createMutation.mutate({
      student_user_id: studentId,
      preferred_at: parsed.toISOString(),
      topic: trimmedTopic,
      ...(notes.trim() ? { notes: notes.trim() } : {}),
    });
  };

  const onRefresh = async () => {
    setRefreshing(true);
    try { await refetch(); } finally { setRefreshing(false); }
  };

  const canSubmit = !!studentId && !createMutation.isPending && approvedChildren.length > 0;

  return (
    <SafeAreaView style={s.safe}>
      <StatusBar barStyle="light-content" />
      <View style={s.header}>
        <View style={s.headerTopRow}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
            <Ionicons name="arrow-back-outline" size={20} color="rgba(255,255,255,0.9)" />
          </TouchableOpacity>
          <Text style={s.headerTitle} numberOfLines={1}>{t("meetingsTitle")}</Text>
          <View style={{ width: 36 }} />
        </View>
        <Text style={s.headerSub} numberOfLines={2}>{t("meetingsSub")}</Text>
      </View>

      <ScrollView
        contentContainerStyle={s.body}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[palette.primary600]} tintColor={palette.primary600} />}
      >
        <View style={s.card}>
          <Text style={s.cardTitle}>{t("requestMeeting")}</Text>

          <Text style={s.label}>{t("childLabel")}</Text>
          {childrenLoading ? (
            <ActivityIndicator color={palette.primary600} style={{ marginVertical: 8 }} />
          ) : approvedChildren.length === 0 ? (
            <Text style={s.hint}>{t("noApprovedChildren")}</Text>
          ) : (
            <View style={s.chipRow}>
              {approvedChildren.map((c) => {
                const active = c.student_user_id === studentId;
                return (
                  <TouchableOpacity
                    key={c.id}
                    style={[s.chip, active && s.chipActive]}
                    onPress={() => setStudentId(c.student_user_id)}
                    activeOpacity={0.8}
                  >
                    <Text style={[s.chipTxt, active && s.chipTxtActive]} numberOfLines={1}>
                      {c.student_name ?? t("student")}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

          <Text style={[s.label, { marginTop: spacing.lg }]}>{t("preferredDateTime")}</Text>
          <TextInput
            style={s.input}
            value={when}
            onChangeText={(v) => { setWhen(v); setFormError(null); }}
            placeholder={t("dateTimePlaceholder")}
            placeholderTextColor={palette.gray400}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="numbers-and-punctuation"
          />
          <Text style={s.hint}>{t("dateTimeHint")}</Text>

          <Text style={[s.label, { marginTop: spacing.lg }]}>{t("topicLabel")}</Text>
          <TextInput
            style={s.input}
            value={topic}
            onChangeText={(v) => { setTopic(v.slice(0, TOPIC_MAX)); setFormError(null); }}
            placeholder={t("topicPlaceholder")}
            placeholderTextColor={palette.gray400}
            maxLength={TOPIC_MAX}
          />
          <Text style={s.counter}>{topic.length}/{TOPIC_MAX}</Text>

          <Text style={[s.label, { marginTop: spacing.md }]}>{t("notesOptional")}</Text>
          <TextInput
            style={[s.input, s.inputMultiline]}
            value={notes}
            onChangeText={setNotes}
            placeholder={t("notesPlaceholder")}
            placeholderTextColor={palette.gray400}
            multiline
            numberOfLines={3}
            textAlignVertical="top"
          />

          {formError && (
            <View style={s.errorBox}>
              <Ionicons name="alert-circle" size={16} color={palette.danger600} />
              <Text style={s.errorTxt}>{formError}</Text>
            </View>
          )}

          <TouchableOpacity
            onPress={submit}
            disabled={!canSubmit}
            activeOpacity={0.85}
            style={[s.submitBtn, !canSubmit && s.submitBtnDisabled]}
          >
            {createMutation.isPending
              ? <ActivityIndicator size="small" color="#fff" />
              : (
                <>
                  <Ionicons name="calendar" size={18} color="#fff" style={{ marginRight: spacing.sm }} />
                  <Text style={s.submitBtnTxt}>{t("sendRequest")}</Text>
                </>
              )}
          </TouchableOpacity>
        </View>

        <Text style={s.sectionTitle}>{t("myRequests")}</Text>

        {meetingsLoading && <ActivityIndicator color={palette.primary600} style={{ marginVertical: 16 }} />}

        {!meetingsLoading && meetingsError && (
          <View style={s.centered}>
            <Ionicons name="alert-circle-outline" size={28} color={palette.danger500} />
            <Text style={s.errorInline}>{t("failedLoadMeetings")}</Text>
            <TouchableOpacity style={s.retryBtn} onPress={() => refetch()}>
              <Text style={s.retryBtnTxt}>{t("retry")}</Text>
            </TouchableOpacity>
          </View>
        )}

        {!meetingsLoading && !meetingsError && meetings.length === 0 && (
          <View style={s.card}>
            <EmptyState icon="calendar-outline" title={t("noMeetingRequests")} description={t("noMeetingRequestsBody")} />
          </View>
        )}

        {meetings.map((m) => {
          const meta = STATUS_META[m.status] ?? STATUS_META.pending;
          const cancellable = m.status === "pending" || m.status === "confirmed";
          return (
            <View key={m.id} style={s.card}>
              <View style={s.rowBetween}>
                <Text style={s.meetingTopic} numberOfLines={2}>{m.topic}</Text>
                <Badge label={t(meta.key)} variant={meta.variant} />
              </View>
              {!!m.student_name && (
                <Text style={s.meetingMeta} numberOfLines={1}>{m.student_name}</Text>
              )}
              <View style={s.metaRow}>
                <Ionicons name="time-outline" size={14} color={palette.gray400} />
                <Text style={s.meetingMeta} numberOfLines={1}>
                  {t("preferred")}: {formatDayMonYearTime(m.preferred_at)}
                </Text>
              </View>
              {m.status === "confirmed" && !!m.scheduled_at && (
                <View style={s.metaRow}>
                  <Ionicons name="checkmark-circle-outline" size={14} color={semantic.success.solid} />
                  <Text style={[s.meetingMeta, { color: semantic.success.text, fontWeight: "700" }]} numberOfLines={1}>
                    {t("scheduled")}: {formatDayMonYearTime(m.scheduled_at)}
                  </Text>
                </View>
              )}
              {!!m.admin_note && (
                <View style={s.noteBox}>
                  <Text style={s.noteLabel}>{t("adminNote")}</Text>
                  <Text style={s.noteTxt}>{m.admin_note}</Text>
                </View>
              )}
              {(m.status === "confirmed" && !!m.meeting_link) || cancellable ? (
                <View style={s.actionRow}>
                  {m.status === "confirmed" && !!m.meeting_link && (
                    <TouchableOpacity
                      style={s.joinBtn}
                      onPress={() => Linking.openURL(m.meeting_link as string).catch(() => {})}
                      activeOpacity={0.85}
                    >
                      <Ionicons name="videocam-outline" size={16} color="#fff" />
                      <Text style={s.joinBtnTxt} numberOfLines={1}>{t("joinMeeting")}</Text>
                    </TouchableOpacity>
                  )}
                  {cancellable && (
                    <TouchableOpacity
                      style={s.cancelBtn}
                      onPress={() => setCancelTarget(m)}
                      disabled={cancelMutation.isPending}
                      activeOpacity={0.8}
                    >
                      <Text style={s.cancelBtnTxt} numberOfLines={1}>{t("cancel")}</Text>
                    </TouchableOpacity>
                  )}
                </View>
              ) : null}
            </View>
          );
        })}

        <View style={{ height: 32 }} />
      </ScrollView>

      <ConfirmModal
        visible={!!cancelTarget}
        variant="destructive"
        title={t("cancelMeetingTitle")}
        message={t("cancelMeetingBody")}
        confirmLabel={t("cancelRequest")}
        cancelLabel={t("keepIt")}
        onConfirm={() => cancelTarget && cancelMutation.mutate(cancelTarget.id)}
        onCancel={() => setCancelTarget(null)}
      />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: palette.gray50 },
  header: { backgroundColor: palette.primary600, paddingTop: spacing.sm, paddingBottom: spacing.xl, paddingHorizontal: spacing["2xl"] - 4 },
  headerTopRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
  backBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: "rgba(255,255,255,0.15)", alignItems: "center", justifyContent: "center" },
  headerTitle: { flex: 1, textAlign: "center", color: "#fff", fontSize: typography.h3.fontSize, fontWeight: "800", letterSpacing: -0.3 },
  headerSub: { color: "rgba(255,255,255,0.7)", fontSize: 13, marginTop: spacing.sm + 2, textAlign: "center" },

  body: { padding: spacing.lg, paddingBottom: spacing["4xl"] },
  card: { backgroundColor: "#fff", borderRadius: radius.lg, padding: spacing.lg, borderWidth: 1, borderColor: palette.gray100, marginBottom: spacing.md, ...cardShadow },
  cardTitle: { fontSize: 15, fontWeight: "800", color: palette.gray900, marginBottom: spacing.md },
  sectionTitle: { fontSize: 14, fontWeight: "800", color: palette.gray900, marginTop: spacing.sm, marginBottom: spacing.sm + 2 },

  label: { fontSize: 12, fontWeight: "700", color: palette.gray700, marginBottom: spacing.sm - 2 },
  hint: { fontSize: 11, color: palette.gray400, marginTop: spacing.sm - 2, lineHeight: 15 },
  counter: { fontSize: 10, color: palette.gray400, textAlign: "right", marginTop: 4 },
  input: {
    borderWidth: 1, borderColor: palette.gray200, borderRadius: radius.md,
    paddingHorizontal: spacing.md + 2, paddingVertical: 11, fontSize: 14,
    color: palette.gray900, backgroundColor: palette.gray50, minHeight: 44,
  },
  inputMultiline: { minHeight: 80 },

  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  chip: { paddingHorizontal: spacing.md + 2, paddingVertical: spacing.sm + 1, borderRadius: radius.pill, backgroundColor: palette.primary50, borderWidth: 1, borderColor: palette.primary50, minHeight: 40, justifyContent: "center", maxWidth: "100%" },
  chipActive: { backgroundColor: palette.primary600, borderColor: palette.primary600 },
  chipTxt: { fontSize: 12, fontWeight: "700", color: palette.primary600 },
  chipTxtActive: { color: "#fff" },

  errorBox: { flexDirection: "row", alignItems: "center", gap: spacing.sm, backgroundColor: semantic.danger.bg, borderRadius: radius.sm, padding: spacing.sm + 2, marginTop: spacing.lg },
  errorTxt: { flex: 1, fontSize: 12, color: palette.danger600, lineHeight: 16 },

  submitBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", borderRadius: radius.md + 2, minHeight: 44, paddingVertical: spacing.md + 2, marginTop: spacing.xl, backgroundColor: palette.primary600 },
  submitBtnDisabled: { opacity: 0.6 },
  submitBtnTxt: { color: "#fff", fontSize: 14, fontWeight: "700" },

  centered: { alignItems: "center", paddingVertical: spacing.xl, gap: spacing.sm },
  errorInline: { fontSize: 13, color: palette.danger500, textAlign: "center" },
  retryBtn: { backgroundColor: palette.primary50, paddingHorizontal: spacing.xl, paddingVertical: spacing.sm + 2, borderRadius: radius.sm, minHeight: 44, justifyContent: "center" },
  retryBtnTxt: { fontSize: 12, fontWeight: "700", color: palette.primary600 },

  rowBetween: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: spacing.sm, flexWrap: "wrap" },
  meetingTopic: { flex: 1, minWidth: 120, fontSize: 14, fontWeight: "800", color: palette.gray900 },
  meetingMeta: { fontSize: 12, color: palette.gray500, flexShrink: 1 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 6 },
  noteBox: { backgroundColor: palette.gray50, borderRadius: radius.sm, padding: spacing.sm + 2, marginTop: spacing.sm + 2 },
  noteLabel: { fontSize: 10, fontWeight: "800", color: palette.gray400, textTransform: "uppercase", letterSpacing: 0.4 },
  noteTxt: { fontSize: 12, color: palette.gray700, marginTop: 2, lineHeight: 17 },
  actionRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.md },
  joinBtn: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: semantic.success.solid, borderRadius: radius.md, paddingHorizontal: spacing.md + 2, minHeight: 40, justifyContent: "center", flexGrow: 1 },
  joinBtnTxt: { color: "#fff", fontSize: 12, fontWeight: "800" },
  cancelBtn: { borderRadius: radius.md, paddingHorizontal: spacing.md + 2, minHeight: 40, justifyContent: "center", alignItems: "center", backgroundColor: semantic.danger.bg, flexGrow: 1 },
  cancelBtnTxt: { color: palette.danger600, fontSize: 12, fontWeight: "800" },
});
