import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
  Switch,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigation } from "@react-navigation/native";
import Toast from "react-native-toast-message";
import { parentApi } from "@/api/parent";
import { errorDetail } from "@/api/errorDetail";
import { useLinkedChild } from "@/hooks/useLinkedChild";
import { useLanguage } from "@/contexts/LanguageContext";
import { fmt } from "@/i18n/format";
import { PendingApprovalState, PendingBadge } from "@/components/parent/PendingApproval";
import { palette, radius, cardShadow, typography, spacing } from "@/theme/colors";
import { EmptyState } from "@/components/ui";

// ─── Constants ────────────────────────────────────────────────────────────────

const MIN_MINUTES = 15;
const MAX_MINUTES = 480; // 8 hours
const STEP_MINUTES = 15;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatMinutes(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function clampMinutes(mins: number): number {
  return Math.min(MAX_MINUTES, Math.max(MIN_MINUTES, mins));
}

interface StudyLimitResponse {
  daily_limit_minutes?: number | null;
  is_enabled?: boolean;
  used_today_minutes?: number | null;
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function StudyLimitsScreen() {
  const navigation = useNavigation<any>();
  const queryClient = useQueryClient();
  const { t } = useLanguage();

  const {
    parentId, children, child, childId, hasMultipleChildren, isApproved,
    selectedChildId, selectChild, isLoading: childrenLoading,
  } = useLinkedChild();
  const childName = child?.student_name ?? t("student");

  const [dailyLimitMinutes, setDailyLimitMinutes] = useState(60);
  const [isEnabled, setIsEnabled] = useState(true);
  const [dirty, setDirty] = useState(false);

  const {
    data: limitsData,
    isLoading,
    isError,
    error: limitsError,
    refetch,
  } = useQuery({
    queryKey: ["study-limits", childId, parentId],
    queryFn: () => parentApi.getStudyLimits(childId as string, parentId).then((r) => r.data as StudyLimitResponse),
    enabled: !!childId && !!parentId && isApproved,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  useEffect(() => {
    if (!limitsData || dirty) return;
    if (typeof limitsData.daily_limit_minutes === "number") setDailyLimitMinutes(clampMinutes(limitsData.daily_limit_minutes));
    if (typeof limitsData.is_enabled === "boolean") setIsEnabled(limitsData.is_enabled);
  }, [limitsData, dirty]);

  const todayUsageMinutes: number | null =
    typeof limitsData?.used_today_minutes === "number" ? limitsData.used_today_minutes : null;
  const serverLimit = typeof limitsData?.daily_limit_minutes === "number" ? limitsData.daily_limit_minutes : dailyLimitMinutes;

  const saveMutation = useMutation({
    mutationFn: () =>
      parentApi
        .setStudyLimit(childId as string, parentId, {
          daily_limit_minutes: dailyLimitMinutes,
          is_enabled: isEnabled,
        })
        .then((r) => r.data),
    onSuccess: () => {
      setDirty(false);
      Toast.show({
        type: "success",
        text1: t("studyLimitSaved"),
        text2: fmt(t("studyLimitSavedBody"), {
          name: childName,
          limit: formatMinutes(dailyLimitMinutes),
          suffix: isEnabled ? "" : t("disabledSuffix"),
        }),
      });
      queryClient.invalidateQueries({ queryKey: ["study-limits", childId, parentId] });
      queryClient.invalidateQueries({ queryKey: ["study-limit", childId, parentId] });
    },
    onError: (err: any) => {
      Toast.show({
        type: "error",
        text1: t("couldNotSaveStudyLimit"),
        text2: errorDetail(err, t("checkConnection")),
      });
    },
  });

  const handleStep = (delta: number) => {
    setDirty(true);
    setDailyLimitMinutes((prev) => clampMinutes(prev + delta));
  };

  const handleToggleEnabled = (value: boolean) => {
    setDirty(true);
    setIsEnabled(value);
  };

  const handleSave = () => {
    if (!childId || !parentId) return;
    saveMutation.mutate();
  };

  // ── Usage progress ────────────────────────────────────────────────────────

  const usagePct =
    todayUsageMinutes != null && serverLimit > 0
      ? Math.min(100, Math.round((todayUsageMinutes / serverLimit) * 100))
      : null;

  const usageOverLimit = todayUsageMinutes != null && todayUsageMinutes >= serverLimit;

  // ── Render helpers ──────────────────────────────────────────────────────────

  const renderContent = () => {
    if (childrenLoading) {
      return (
        <View style={styles.centeredState}>
          <ActivityIndicator size="large" color={palette.primary600} />
        </View>
      );
    }

    if (!childId) {
      return (
        <View style={styles.centeredState}>
          <EmptyState
            icon="link-outline"
            title={t("noStudentLinked")}
            description={t("linkStudentFirstLimits")}
          />
        </View>
      );
    }

    if (child && !isApproved) {
      return <PendingApprovalState child={child} />;
    }

    if (isLoading) {
      return (
        <View style={styles.centeredState}>
          <ActivityIndicator size="large" color={palette.primary600} />
          <Text style={styles.loadingTxt}>{t("loadingStudyLimits")}</Text>
        </View>
      );
    }

    if (isError) {
      return (
        <View style={styles.centeredState}>
          <Ionicons name="alert-circle-outline" size={40} color={palette.danger500} />
          <Text style={styles.errorTxt}>{errorDetail(limitsError, t("failedLoadStudyLimits"))}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={() => refetch()}>
            <Text style={styles.retryBtnTxt}>{t("retry")}</Text>
          </TouchableOpacity>
        </View>
      );
    }

    return (
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {todayUsageMinutes != null && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{t("todaysUsage")}</Text>
            <View style={styles.usageRow}>
              <Text style={styles.usageValue}>{formatMinutes(todayUsageMinutes)}</Text>
              <Text style={styles.usageOf} numberOfLines={2}>
                {fmt(t("usedOfToday"), { used: todayUsageMinutes, limit: serverLimit })}
              </Text>
            </View>
            <View style={styles.progressTrack}>
              <View
                style={[
                  styles.progressFill,
                  {
                    width: `${usagePct ?? 0}%` as any,
                    backgroundColor: usageOverLimit ? palette.danger600 : palette.primary600,
                  },
                ]}
              />
            </View>
            {usageOverLimit && (
              <View style={styles.overLimitRow}>
                <Ionicons name="warning-outline" size={14} color={palette.danger600} />
                <Text style={styles.overLimitTxt} numberOfLines={2}>{fmt(t("reachedTodayLimit"), { name: childName })}</Text>
              </View>
            )}
          </View>
        )}

        <View style={styles.card}>
          <View style={styles.toggleRow}>
            <View style={styles.toggleInfo}>
              <View style={[styles.toggleIcon, { backgroundColor: palette.primary600 }]}>
                <Ionicons name="timer-outline" size={18} color="#fff" />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.toggleLabel}>{t("dailyStudyLimit")}</Text>
                <Text style={styles.toggleDesc}>
                  {isEnabled ? t("limitActive") : t("limitOff")}
                </Text>
              </View>
            </View>
            <Switch
              value={isEnabled}
              onValueChange={handleToggleEnabled}
              trackColor={{ false: palette.gray200, true: palette.primary600 }}
              thumbColor="#fff"
              disabled={saveMutation.isPending}
            />
          </View>
        </View>

        <View style={[styles.card, !isEnabled && styles.cardDisabled]}>
          <Text style={styles.cardTitle}>{t("dailyLimit")}</Text>
          <Text style={styles.cardSub}>{fmt(t("dailyLimitHelp"), { name: childName })}</Text>

          <View style={styles.stepperRow}>
            <TouchableOpacity
              style={[styles.stepperBtn, (!isEnabled || dailyLimitMinutes <= MIN_MINUTES) && styles.stepperBtnDisabled]}
              onPress={() => handleStep(-STEP_MINUTES)}
              disabled={!isEnabled || dailyLimitMinutes <= MIN_MINUTES || saveMutation.isPending}
              activeOpacity={0.7}
            >
              <Ionicons name="remove" size={22} color={!isEnabled || dailyLimitMinutes <= MIN_MINUTES ? palette.gray300 : palette.primary600} />
            </TouchableOpacity>

            <View style={styles.stepperValueBox}>
              <Text style={styles.stepperValue}>{formatMinutes(dailyLimitMinutes)}</Text>
            </View>

            <TouchableOpacity
              style={[styles.stepperBtn, (!isEnabled || dailyLimitMinutes >= MAX_MINUTES) && styles.stepperBtnDisabled]}
              onPress={() => handleStep(STEP_MINUTES)}
              disabled={!isEnabled || dailyLimitMinutes >= MAX_MINUTES || saveMutation.isPending}
              activeOpacity={0.7}
            >
              <Ionicons name="add" size={22} color={!isEnabled || dailyLimitMinutes >= MAX_MINUTES ? palette.gray300 : palette.primary600} />
            </TouchableOpacity>
          </View>

          <View style={styles.sliderTrack} pointerEvents={isEnabled ? "auto" : "none"}>
            <View
              style={[
                styles.sliderFill,
                { width: `${((dailyLimitMinutes - MIN_MINUTES) / (MAX_MINUTES - MIN_MINUTES)) * 100}%` },
              ]}
            />
          </View>
          <View style={styles.sliderLabelsRow}>
            <Text style={styles.sliderLabelTxt}>{formatMinutes(MIN_MINUTES)}</Text>
            <Text style={styles.sliderLabelTxt}>{formatMinutes(MAX_MINUTES)}</Text>
          </View>

          <View style={styles.presetRow}>
            {[30, 60, 90, 120, 180].map((preset) => (
              <TouchableOpacity
                key={preset}
                style={[
                  styles.presetChip,
                  dailyLimitMinutes === preset && styles.presetChipActive,
                  !isEnabled && styles.presetChipDisabled,
                ]}
                onPress={() => {
                  setDirty(true);
                  setDailyLimitMinutes(clampMinutes(preset));
                }}
                disabled={!isEnabled || saveMutation.isPending}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.presetChipTxt,
                    dailyLimitMinutes === preset && styles.presetChipTxtActive,
                  ]}
                >
                  {formatMinutes(preset)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={styles.footNote}>
          <Ionicons name="information-circle-outline" size={14} color={palette.gray400} />
          <Text style={styles.footNoteTxt}>{fmt(t("studyLimitFootnote"), { name: childName })}</Text>
        </View>

        <TouchableOpacity
          onPress={handleSave}
          disabled={saveMutation.isPending}
          activeOpacity={0.85}
          style={[styles.saveBtn, saveMutation.isPending && styles.saveBtnDisabled]}
        >
          {saveMutation.isPending ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <>
              <Ionicons name="checkmark-circle" size={18} color="#fff" style={{ marginRight: spacing.sm }} />
              <Text style={styles.saveBtnTxt}>{t("saveStudyLimit")}</Text>
            </>
          )}
        </TouchableOpacity>
      </ScrollView>
    );
  };

  // ── Main render ───────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" />

      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>{t("studyLimits")}</Text>
          {childId && <Text style={styles.headerSubtitle} numberOfLines={1}>{childName}</Text>}
        </View>
        <View style={{ width: 36 }} />
      </View>

      {hasMultipleChildren && (
        <View style={styles.childPickerRow}>
          {children.map((c) => {
            const active = c.student_user_id === selectedChildId;
            return (
              <TouchableOpacity
                key={c.id}
                onPress={() => selectChild(c.student_user_id)}
                style={[styles.childChip, active && styles.childChipActive]}
              >
                <Text style={[styles.childChipTxt, active && styles.childChipTxtActive]} numberOfLines={1}>
                  {c.student_name ?? t("student")}
                </Text>
                {!c.is_approved && <PendingBadge style={{ marginLeft: 6 }} />}
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {renderContent()}
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
    backgroundColor: palette.primary600,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: radius.sm,
    backgroundColor: "rgba(255,255,255,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  headerCenter: { flex: 1, alignItems: "center", minWidth: 0 },
  headerTitle: { fontSize: typography.h4.fontSize, fontWeight: "800", color: "#fff" },
  headerSubtitle: { fontSize: typography.bodySm.fontSize, color: "rgba(255,255,255,0.85)", marginTop: 2 },

  childPickerRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  childChip: { flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.md, paddingVertical: spacing.xs + 2, borderRadius: radius.pill, backgroundColor: palette.gray100, maxWidth: "100%" },
  childChipActive: { backgroundColor: palette.primary50 },
  childChipTxt: { fontSize: 12, fontWeight: "700", color: palette.gray500, flexShrink: 1 },
  childChipTxtActive: { color: palette.primary600 },

  scroll: { flex: 1 },
  scrollContent: { padding: spacing.lg, paddingBottom: spacing["4xl"] },

  card: {
    backgroundColor: "#fff",
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md + 2,
    borderWidth: 1,
    borderColor: palette.gray100,
    ...cardShadow,
  },
  cardDisabled: { opacity: 0.55 },
  cardTitle: { fontSize: typography.bodyMedium.fontSize, fontWeight: "800", color: palette.gray900 },
  cardSub: { fontSize: typography.bodySm.fontSize, color: palette.gray500, marginTop: 2, marginBottom: spacing.xs },

  usageRow: { flexDirection: "row", alignItems: "baseline", flexWrap: "wrap", gap: spacing.xs + 2, marginTop: spacing.sm + 2, marginBottom: spacing.sm + 2 },
  usageValue: { fontSize: typography.display.fontSize - 2, fontWeight: "800", color: palette.gray900 },
  usageOf: { fontSize: typography.bodySm.fontSize + 0.5, color: palette.gray500, flexShrink: 1 },
  progressTrack: {
    height: 10,
    borderRadius: 5,
    backgroundColor: palette.gray100,
    overflow: "hidden",
  },
  progressFill: { height: "100%", borderRadius: 5 },
  overLimitRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs + 2, marginTop: spacing.sm + 2 },
  overLimitTxt: { flex: 1, fontSize: typography.bodySm.fontSize, fontWeight: "600", color: palette.danger600 },

  toggleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  toggleInfo: { flex: 1, flexDirection: "row", alignItems: "center", gap: spacing.md, paddingRight: spacing.sm + 2, minWidth: 0 },
  toggleIcon: {
    width: 38,
    height: 38,
    borderRadius: radius.md - 1,
    alignItems: "center",
    justifyContent: "center",
  },
  toggleLabel: { fontSize: typography.bodyMedium.fontSize, fontWeight: "700", color: palette.gray900 },
  toggleDesc: { fontSize: typography.bodySm.fontSize, color: palette.gray400, marginTop: 2 },

  stepperRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginTop: spacing.md + 2,
    marginBottom: spacing.lg,
    gap: spacing.xl,
  },
  stepperBtn: {
    width: 44,
    height: 44,
    borderRadius: radius.md + 2,
    backgroundColor: palette.primary50,
    alignItems: "center",
    justifyContent: "center",
  },
  stepperBtnDisabled: { backgroundColor: palette.gray100 },
  stepperValueBox: { minWidth: 90, alignItems: "center" },
  stepperValue: { fontSize: typography.display.fontSize - 4, fontWeight: "800", color: palette.gray900 },

  sliderTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: palette.gray100,
    overflow: "hidden",
    marginTop: spacing.xs,
  },
  sliderFill: { height: "100%", borderRadius: 4, backgroundColor: palette.primary600 },
  sliderLabelsRow: { flexDirection: "row", justifyContent: "space-between", marginTop: spacing.xs + 2 },
  sliderLabelTxt: { fontSize: typography.caption.fontSize - 0.5, color: palette.gray400 },

  presetRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.lg },
  presetChip: {
    paddingHorizontal: spacing.md + 2,
    paddingVertical: spacing.sm,
    borderRadius: radius.sm + 2,
    backgroundColor: palette.gray100,
  },
  presetChipActive: { backgroundColor: palette.primary600 },
  presetChipDisabled: { opacity: 0.6 },
  presetChipTxt: { fontSize: typography.bodySm.fontSize, fontWeight: "700", color: palette.gray500 },
  presetChipTxtActive: { color: "#fff" },

  footNote: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.xs + 2,
    marginTop: 2,
    marginBottom: spacing.xl,
    paddingHorizontal: spacing.xs,
  },
  footNoteTxt: { flex: 1, fontSize: typography.caption.fontSize - 0.5, color: palette.gray400, lineHeight: 15 },

  saveBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.md + 2,
    paddingVertical: spacing.md + 3,
    minHeight: 44,
    backgroundColor: palette.primary600,
  },
  saveBtnDisabled: { opacity: 0.7 },
  saveBtnTxt: { fontSize: typography.bodyLg.fontSize - 1, fontWeight: "800", color: "#fff" },

  centeredState: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: spacing["3xl"], gap: spacing.md },
  loadingTxt: { fontSize: typography.body.fontSize, color: palette.gray500, marginTop: spacing.sm },
  errorTxt: { fontSize: typography.body.fontSize, color: palette.danger500, textAlign: "center", lineHeight: 20 },
  retryBtn: {
    marginTop: spacing.xs,
    backgroundColor: palette.primary50,
    paddingHorizontal: spacing["2xl"],
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.md,
    minHeight: 44,
    justifyContent: "center",
  },
  retryBtnTxt: { fontSize: typography.bodySm.fontSize + 0.5, fontWeight: "700", color: palette.primary600 },
});
