import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  StatusBar,
  TouchableOpacity,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Toast from "react-native-toast-message";
import { useAppSelector } from "@/store";
import { parentApi } from "@/api/parent";
import { errorDetail } from "@/api/errorDetail";
import { useLanguage } from "@/contexts/LanguageContext";
import { fmt } from "@/i18n/format";
import type { TranslationKey } from "@/i18n/translations";
import { formatDayMonYear } from "@/utils/dates";
import { palette, semantic, accentSolid, cardShadow, radius, spacing } from "@/theme/colors";

// ─── Types ────────────────────────────────────────────────────────────────────

type Relationship = "father" | "mother" | "guardian";

const RELATIONSHIPS: { key: Relationship; labelKey: TranslationKey; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: "father",   labelKey: "father",   icon: "man" },
  { key: "mother",   labelKey: "mother",   icon: "woman" },
  { key: "guardian", labelKey: "guardian", icon: "people" },
];

interface LinkedStudent {
  id:                 string;
  student_user_id:    string;
  relationship:       string;
  father_name?:        string | null;
  mother_name?:        string | null;
  is_approved:        boolean;
  approved_at?:       string | null;
  student_name?:      string | null;
  student_class?:     number | null;
  student_board?:     string | null;
}

// The backend's linkStudent endpoint requires student_user_id to be a real
// UUID — the Student ID a child copies from Profile → Your Student ID.
const STUDENT_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Platform-wide cap enforced server-side in user_service (Settings.
// MAX_STUDENTS_PER_PARENT) — mirrored here only to disable the form and
// show remaining slots before submit; the backend check is the actual
// source of truth and still applies if this ever drifts out of sync.
const MAX_STUDENTS_PER_PARENT = 7;

// ─── Avatar helpers (mirrors ParentMonitorScreen conventions) ─────────────────

function initials(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "?";
  return trimmed.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
}

const AVATAR_COLORS = Object.values(accentSolid);

function avatarColor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = id.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

// ─── Linked student row ────────────────────────────────────────────────────────

function LinkedStudentRow({
  link,
  onRemove,
  removing,
}: {
  link:     LinkedStudent;
  onRemove: (link: LinkedStudent) => void;
  removing: boolean;
}) {
  const { t } = useLanguage();
  const name = link.student_name?.trim() || t("student");
  const avatarBg = avatarColor(link.student_user_id);
  const relKey = RELATIONSHIPS.find((r) => r.key === link.relationship)?.labelKey;
  const metaParts = [
    link.relationship ? (relKey ? t(relKey) : link.relationship[0].toUpperCase() + link.relationship.slice(1)) : null,
    link.student_class != null ? fmt(t("classLabel"), { n: link.student_class }) : null,
    link.student_board ?? null,
  ].filter(Boolean);
  const linkedSince = link.is_approved ? formatDayMonYear(link.approved_at) : "";

  return (
    <View style={styles.linkedRow}>
      <View style={[styles.linkedAvatar, { backgroundColor: avatarBg }]}>
        <Text style={styles.linkedAvatarTxt}>{initials(name)}</Text>
      </View>
      <View style={styles.linkedInfo}>
        <View style={styles.linkedTopRow}>
          <Text style={styles.linkedName} numberOfLines={1}>{name}</Text>
          {link.is_approved === false ? (
            <View style={styles.pendingBadge}>
              <Text style={styles.pendingBadgeTxt}>{t("pending")}</Text>
            </View>
          ) : null}
        </View>
        {metaParts.length > 0 && (
          <Text style={styles.linkedMeta} numberOfLines={1}>{metaParts.join(" · ")}</Text>
        )}
        {!!linkedSince && (
          <Text style={styles.linkedSince} numberOfLines={1}>{fmt(t("linkedSince"), { date: linkedSince })}</Text>
        )}
      </View>
      <TouchableOpacity
        style={styles.removeBtn}
        onPress={() => onRemove(link)}
        disabled={removing}
        activeOpacity={0.7}
      >
        {removing
          ? <ActivityIndicator size="small" color={palette.danger600} />
          : <Ionicons name="trash-outline" size={18} color={palette.danger600} />
        }
      </TouchableOpacity>
    </View>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function LinkStudentScreen() {
  const navigation = useNavigation<any>();
  const { t } = useLanguage();
  const user = useAppSelector((s) => s.auth.user);
  const parentId = (user as any)?.id ?? (user as any)?.user_id ?? "";
  const queryClient = useQueryClient();

  const [studentInput, setStudentInput]   = useState("");
  const [relationship, setRelationship]   = useState<Relationship>("father");
  const [fatherName, setFatherName]       = useState("");
  const [motherName, setMotherName]       = useState("");
  const [formError, setFormError]         = useState<string | null>(null);
  const [removingId, setRemovingId]       = useState<string | null>(null);

  // ── Already-linked students ────────────────────────────────────────────────

  const {
    data: students = [],
    isLoading: studentsLoading,
    isError: studentsError,
    refetch: refetchStudents,
  } = useQuery<LinkedStudent[]>({
    queryKey: ["parent-students", parentId],
    queryFn: () => parentApi.getStudents(parentId).then((r) => r.data),
    enabled: !!parentId,
    staleTime: 30_000,
  });
  const pendingCount = students.filter((l) => !l.is_approved).length;
  const atCap = students.length >= MAX_STUDENTS_PER_PARENT;

  // ── Link mutation ──────────────────────────────────────────────────────────

  const linkMutation = useMutation({
    mutationFn: async () => {
      const body: {
        student_user_id: string;
        relationship: string;
        father_name?: string;
        mother_name?: string;
      } = {
        student_user_id: studentInput.trim(),
        relationship,
      };
      if (fatherName.trim()) body.father_name = fatherName.trim();
      if (motherName.trim()) body.mother_name = motherName.trim();
      return parentApi.linkStudent(parentId, body).then((r) => r.data);
    },
    onSuccess: (data: any) => {
      const name = typeof data?.student_name === "string" && data.student_name.trim()
        ? data.student_name.trim()
        : t("yourChild");
      Toast.show({
        type: "success",
        text1: t("requestSent"),
        text2: fmt(t("waitingForApproval"), { name }),
      });
      setStudentInput("");
      setFatherName("");
      setMotherName("");
      setRelationship("father");
      queryClient.invalidateQueries({ queryKey: ["parent-students", parentId] });
      queryClient.invalidateQueries({ queryKey: ["link-badges", parentId] });
    },
    onError: (err: any) => {
      Toast.show({
        type: "error",
        text1: t("couldNotSendRequest"),
        text2: errorDetail(err, t("checkDetailsTryAgain")),
      });
    },
  });

  // ── Remove mutation ────────────────────────────────────────────────────────

  const removeMutation = useMutation({
    mutationFn: (link: LinkedStudent) => parentApi.removeLink(link.id),
    onMutate: (link: LinkedStudent) => setRemovingId(link.id),
    onSuccess: (_data, link) => {
      Toast.show({ type: "success", text1: link.is_approved ? t("studentRemoved") : t("requestCancelled") });
      queryClient.invalidateQueries({ queryKey: ["parent-students", parentId] });
      queryClient.invalidateQueries({ queryKey: ["link-badges", parentId] });
    },
    onError: (err: any) => {
      Toast.show({
        type: "error",
        text1: t("couldNotRemoveLink"),
        text2: errorDetail(err, t("pleaseTryAgain")),
      });
    },
    onSettled: () => setRemovingId(null),
  });

  const handleRemove = (link: LinkedStudent) => {
    const name = link.student_name?.trim() || t("thisStudent");
    if (link.is_approved) {
      Alert.alert(
        fmt(t("removeStudentTitle"), { name }),
        t("removeStudentBody"),
        [
          { text: t("cancel"), style: "cancel" },
          { text: t("remove"), style: "destructive", onPress: () => removeMutation.mutate(link) },
        ]
      );
      return;
    }
    Alert.alert(
      t("cancelRequestTitle"),
      fmt(t("cancelRequestBody"), { name }),
      [
        { text: t("keepWaiting"), style: "cancel" },
        { text: t("cancelRequest"), style: "destructive", onPress: () => removeMutation.mutate(link) },
      ]
    );
  };

  const handleSubmit = () => {
    setFormError(null);
    const trimmed = studentInput.trim();
    if (!trimmed) {
      setFormError(t("enterStudentId"));
      return;
    }
    if (!STUDENT_ID_RE.test(trimmed)) {
      setFormError(t("invalidStudentId"));
      return;
    }
    if (!parentId) {
      setFormError(t("accountNotIdentified"));
      return;
    }
    linkMutation.mutate();
  };

  const handleDone = () => {
    if (navigation.canGoBack?.()) navigation.goBack();
  };

  // ── Main render ───────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" />

      <View style={[styles.header, { backgroundColor: palette.primary600 }]}>
        <TouchableOpacity onPress={handleDone} style={styles.backBtn} activeOpacity={0.8}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle} numberOfLines={1}>{t("linkStudentTitle")}</Text>
          <Text style={styles.headerSubtitle} numberOfLines={1}>{t("linkStudentSub")}</Text>
        </View>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t("linkedStudents")}</Text>

          {studentsLoading && (
            <View style={styles.centeredState}>
              <ActivityIndicator size="small" color={palette.primary600} />
              <Text style={styles.loadingTxt}>{t("loadingLinkedStudents")}</Text>
            </View>
          )}

          {!studentsLoading && studentsError && (
            <View style={styles.centeredState}>
              <Ionicons name="alert-circle-outline" size={28} color={palette.danger500} />
              <Text style={styles.errorTxt}>{t("failedLoadLinkedStudents")}</Text>
              <TouchableOpacity style={styles.retryBtn} onPress={() => refetchStudents()}>
                <Text style={styles.retryBtnTxt}>{t("retry")}</Text>
              </TouchableOpacity>
            </View>
          )}

          {!studentsLoading && !studentsError && students.length === 0 && (
            <View style={styles.emptyCard}>
              <View style={styles.emptyIconBox}>
                <Ionicons name="link-outline" size={28} color={palette.gray400} />
              </View>
              <Text style={styles.emptyTitle}>{t("noStudentsLinkedYet")}</Text>
              <Text style={styles.emptyBody}>{t("useFormBelow")}</Text>
            </View>
          )}

          {!studentsLoading && !studentsError && students.length > 0 && (
            <View style={styles.linkedCard}>
              {students.map((link, i) => (
                <View key={link.id}>
                  <LinkedStudentRow
                    link={link}
                    onRemove={handleRemove}
                    removing={removingId === link.id}
                  />
                  {i < students.length - 1 && <View style={styles.linkedDivider} />}
                </View>
              ))}
            </View>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t("linkNewStudent")}</Text>

          {atCap ? (
            <View style={styles.capBanner}>
              <Ionicons name="information-circle" size={18} color={palette.warning700} />
              <Text style={styles.capBannerTxt}>
                {fmt(t("maxLinkedReached"), { max: MAX_STUDENTS_PER_PARENT })}
              </Text>
            </View>
          ) : (
            <Text style={[styles.hint, { marginBottom: 10 }]}>
              {fmt(t("slotsUsed"), { used: students.length, max: MAX_STUDENTS_PER_PARENT })}
              {pendingCount > 0 ? fmt(t("pendingCountSuffix"), { n: pendingCount }) : ""}.
            </Text>
          )}

          <View style={[styles.formCard, atCap && styles.formCardDisabled]} pointerEvents={atCap ? "none" : "auto"}>
            <Text style={styles.label}>{t("studentId")}</Text>
            <TextInput
              style={styles.input}
              placeholder={t("studentIdPlaceholder")}
              placeholderTextColor={palette.gray400}
              value={studentInput}
              onChangeText={(v) => { setStudentInput(v); setFormError(null); }}
              autoCapitalize="none"
              autoCorrect={false}
              editable={!atCap}
            />
            <Text style={styles.hint}>{t("studentIdHint")}</Text>

            <Text style={[styles.label, { marginTop: 18 }]}>{t("relationship")}</Text>
            <View style={styles.relRow}>
              {RELATIONSHIPS.map((r) => {
                const active = relationship === r.key;
                return (
                  <TouchableOpacity
                    key={r.key}
                    style={[styles.relChip, active && styles.relChipActive]}
                    onPress={() => setRelationship(r.key)}
                    activeOpacity={0.8}
                  >
                    <Ionicons name={r.icon} size={16} color={active ? "#fff" : palette.primary600} />
                    <Text style={[styles.relChipTxt, active && styles.relChipTxtActive]}>{t(r.labelKey)}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={[styles.label, { marginTop: 18 }]}>{t("fatherNameOptional")}</Text>
            <TextInput
              style={styles.input}
              placeholder={t("fatherNamePlaceholder")}
              placeholderTextColor={palette.gray400}
              value={fatherName}
              onChangeText={setFatherName}
              editable={!atCap}
            />

            <Text style={[styles.label, { marginTop: 14 }]}>{t("motherNameOptional")}</Text>
            <TextInput
              style={styles.input}
              placeholder={t("motherNamePlaceholder")}
              placeholderTextColor={palette.gray400}
              value={motherName}
              onChangeText={setMotherName}
              editable={!atCap}
            />

            {formError && (
              <View style={styles.formErrorBox}>
                <Ionicons name="alert-circle" size={16} color={palette.danger600} />
                <Text style={styles.formErrorTxt}>{formError}</Text>
              </View>
            )}

            <TouchableOpacity
              onPress={handleSubmit}
              disabled={atCap || linkMutation.isPending}
              activeOpacity={0.85}
              style={[
                styles.submitBtn,
                { backgroundColor: palette.primary600 },
                (atCap || linkMutation.isPending) && styles.submitBtnDisabled,
              ]}
            >
              {linkMutation.isPending
                ? <ActivityIndicator size="small" color="#fff" />
                : (
                  <>
                    <Ionicons name="link" size={18} color="#fff" style={{ marginRight: spacing.sm }} />
                    <Text style={styles.submitBtnTxt}>{t("sendLinkRequest")}</Text>
                  </>
                )
              }
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: palette.gray50 },

  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: radius.sm,
    backgroundColor: "rgba(255,255,255,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  headerCenter:   { flex: 1, alignItems: "center", minWidth: 0 },
  headerTitle:    { fontSize: 16, fontWeight: "700", color: "#fff" },
  headerSubtitle: { fontSize: 12, color: "rgba(255,255,255,0.85)", marginTop: 2 },

  scroll:  { flex: 1 },
  content: { padding: spacing.lg, paddingBottom: spacing["4xl"] },

  section:      { marginBottom: spacing["2xl"] - 2 },
  sectionTitle: { fontSize: 14, fontWeight: "800", color: palette.gray900, marginBottom: spacing.sm + 2 },

  centeredState: { alignItems: "center", justifyContent: "center", paddingVertical: spacing["2xl"], gap: spacing.sm },
  loadingTxt:    { fontSize: 13, color: palette.gray500 },
  errorTxt:      { fontSize: 13, color: palette.danger500, textAlign: "center" },
  retryBtn: {
    marginTop: spacing.xs,
    backgroundColor: palette.primary50,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.sm,
    minHeight: 44,
    justifyContent: "center",
  },
  retryBtnTxt: { fontSize: 12, fontWeight: "700", color: palette.primary600 },

  emptyCard: {
    backgroundColor: "#fff",
    borderRadius: radius.lg,
    paddingVertical: spacing["2xl"] + 4,
    paddingHorizontal: spacing.xl,
    alignItems: "center",
    gap: spacing.sm - 2,
    borderWidth: 1,
    borderColor: palette.gray100,
    ...cardShadow,
  },
  emptyIconBox: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: palette.gray100,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.xs,
  },
  emptyTitle: { fontSize: 14, fontWeight: "700", color: palette.gray700, textAlign: "center" },
  emptyBody:  { fontSize: 12, color: palette.gray400, textAlign: "center", lineHeight: 17 },

  linkedCard: {
    backgroundColor: "#fff",
    borderRadius: radius.lg,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: palette.gray100,
    ...cardShadow,
  },
  linkedDivider: { height: 1, backgroundColor: palette.gray100, marginLeft: spacing.lg },
  linkedRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.md + 2,
    paddingVertical: spacing.md,
    minHeight: 44,
  },
  linkedAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    marginRight: spacing.md,
  },
  linkedAvatarTxt: { color: "#fff", fontSize: 14, fontWeight: "700" },
  linkedInfo:      { flex: 1, minWidth: 0 },
  linkedTopRow:    { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  linkedName:      { fontSize: 14, fontWeight: "700", color: palette.gray900, flexShrink: 1 },
  linkedMeta:      { fontSize: 12, color: palette.gray500, marginTop: 2 },
  linkedSince:     { fontSize: 11, color: palette.success700, marginTop: 2, fontWeight: "600" },
  pendingBadge: {
    backgroundColor: palette.warning100,
    borderRadius: 6,
    paddingHorizontal: spacing.xs + 2,
    paddingVertical: 2,
  },
  pendingBadgeTxt: { fontSize: 10, fontWeight: "700", color: palette.warning700 },
  removeBtn: {
    width: 34,
    height: 34,
    borderRadius: radius.sm,
    backgroundColor: semantic.danger.bg,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: spacing.sm,
  },

  capBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    backgroundColor: palette.warning100,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  capBannerTxt: { flex: 1, fontSize: 12, fontWeight: "600", color: palette.warning700, lineHeight: 17 },

  formCard: {
    backgroundColor: "#fff",
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: palette.gray100,
    ...cardShadow,
  },
  formCardDisabled: { opacity: 0.5 },
  label: { fontSize: 12, fontWeight: "700", color: palette.gray700, marginBottom: spacing.sm - 2 },
  hint:  { fontSize: 11, color: palette.gray400, marginTop: spacing.sm - 2, lineHeight: 15 },
  input: {
    borderWidth: 1,
    borderColor: palette.gray200,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md + 2,
    paddingVertical: 11,
    fontSize: 14,
    color: palette.gray900,
    backgroundColor: palette.gray50,
    minHeight: 44,
  },

  relRow: { flexDirection: "row", gap: spacing.sm, flexWrap: "wrap" },
  relChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm - 2,
    paddingHorizontal: spacing.md + 2,
    paddingVertical: spacing.sm + 1,
    borderRadius: radius.pill,
    backgroundColor: palette.primary50,
    borderWidth: 1,
    borderColor: palette.primary50,
    minHeight: 44,
  },
  relChipActive:   { backgroundColor: palette.primary600, borderColor: palette.primary600 },
  relChipTxt:      { fontSize: 12, fontWeight: "700", color: palette.primary600 },
  relChipTxtActive: { color: "#fff" },

  formErrorBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: semantic.danger.bg,
    borderRadius: radius.sm,
    padding: spacing.sm + 2,
    marginTop: spacing.lg,
  },
  formErrorTxt: { flex: 1, fontSize: 12, color: palette.danger600, lineHeight: 16 },

  submitBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.md + 2,
    minHeight: 44,
    paddingVertical: spacing.md + 2,
    marginTop: spacing.xl,
  },
  submitBtnDisabled: { opacity: 0.7 },
  submitBtnTxt: { color: "#fff", fontSize: 14, fontWeight: "700" },
});
