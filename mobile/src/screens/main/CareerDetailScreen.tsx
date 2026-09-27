import React, { useState, useEffect } from "react";
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet,
  ActivityIndicator, TextInput,
} from "react-native";
import Toast from "react-native-toast-message";
import { careerApi } from "../../api/career";
import { palette, radius, spacing, typography, cardShadow } from "../../theme/colors";

interface Props {
  career: any;
  userId: string;
  onBack: () => void;
}

const SUBJECTS = ["Mathematics", "Physics", "Chemistry", "Biology", "English", "History", "Geography", "Economics"];

export default function CareerDetailScreen({ career, userId, onBack }: Props) {
  const [tab, setTab] = useState<"overview" | "roadmap" | "skill-gap">("overview");
  const [scores, setScores] = useState<Record<string, number>>({});
  const [assessment, setAssessment] = useState<any>(null);
  const [analysing, setAnalysing] = useState(false);
  const [settingGoal, setSettingGoal] = useState(false);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [showGoalForm, setShowGoalForm] = useState(false);
  const [goalNotes, setGoalNotes] = useState("");

  useEffect(() => {
    careerApi.latestAssessment(userId, career.id)
      .then((r) => setAssessment(r.data))
      .catch(() => {});
  }, []);

  const handleSetGoal = async (isPrimary: boolean) => {
    setSettingGoal(true);
    try {
      await careerApi.setGoal(userId, career.id, isPrimary, goalNotes || undefined);
      Toast.show({ type: "success", text1: `Career goal set! ${isPrimary ? "(Primary) " : ""}+50 XP` });
      setShowGoalForm(false);
      setGoalNotes("");
    } catch (e: any) {
      Toast.show({ type: "error", text1: "Could not set goal", text2: e?.response?.data?.detail || "Please try again." });
    } finally {
      setSettingGoal(false);
    }
  };

  const handleAnalyse = async () => {
    setAnalysing(true);
    try {
      const r = await careerApi.skillGap(userId, career.id, scores);
      setAssessment(r.data);
      Toast.show({ type: "success", text1: "Analysis complete! +30 XP" });
      setTab("skill-gap");
    } catch {
      Toast.show({ type: "error", text1: "Analysis failed", text2: "Please try again." });
    } finally {
      setAnalysing(false);
    }
  };

  const TABS = [
    { id: "overview", label: "Overview" },
    { id: "roadmap", label: "Roadmap" },
    { id: "skill-gap", label: "Skill Gap" },
  ] as const;

  return (
    <View style={styles.container}>
      <View style={styles.hero}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.category}>{career.category}</Text>
        <Text style={styles.careerName}>{career.name}</Text>
        <Text style={styles.overview} numberOfLines={3} ellipsizeMode="tail">{career.overview}</Text>
        {career.avg_salary_lpa && (
          <View style={styles.salaryBadge}>
            <Text style={styles.salaryText}>₹{career.avg_salary_lpa} LPA avg</Text>
          </View>
        )}
      </View>

      {/* Goal buttons / form */}
      {!showGoalForm ? (
        <View style={styles.goalRow}>
          <TouchableOpacity style={styles.goalBtn} onPress={() => setShowGoalForm(true)} disabled={settingGoal}>
            <Text style={styles.goalBtnText}>🎯 Add Goal</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.goalBtn, styles.goalBtnPrimary]} onPress={() => handleSetGoal(true)} disabled={settingGoal}>
            {settingGoal ? <ActivityIndicator color={palette.gray50} size="small" /> : <Text style={styles.goalBtnTextPrimary}>⭐ Set Primary</Text>}
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.goalFormCard}>
          <Text style={styles.goalFormTitle}>Set Career Goal</Text>
          <TextInput
            style={styles.goalFormInput}
            placeholder="Notes (optional)"
            placeholderTextColor={palette.gray400}
            value={goalNotes}
            onChangeText={setGoalNotes}
            multiline
            numberOfLines={2}
          />
          <View style={styles.goalFormBtnRow}>
            <TouchableOpacity
              style={styles.goalFormCancelBtn}
              onPress={() => { setShowGoalForm(false); setGoalNotes(""); }}
              disabled={settingGoal}
            >
              <Text style={styles.goalFormCancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.goalFormAddBtn}
              onPress={() => handleSetGoal(false)}
              disabled={settingGoal}
            >
              {settingGoal ? <ActivityIndicator color={palette.gray700} size="small" /> : <Text style={styles.goalFormAddText}>Add Goal</Text>}
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.goalFormPrimaryBtn}
              onPress={() => handleSetGoal(true)}
              disabled={settingGoal}
            >
              {settingGoal ? <ActivityIndicator color={palette.gray50} size="small" /> : <Text style={styles.goalFormPrimaryText}>Set as Primary</Text>}
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Tabs */}
      <View style={styles.tabBar}>
        {TABS.map(({ id, label }) => (
          <TouchableOpacity key={id} style={[styles.tab, tab === id && styles.tabActive]} onPress={() => setTab(id)}>
            <Text style={[styles.tabText, tab === id && styles.tabTextActive]}>{label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {tab === "overview" && (
          <View style={styles.section}>
            {career.required_subjects?.length > 0 && (
              <View style={styles.block}>
                <Text style={styles.blockTitle}>📚 Required Subjects</Text>
                <View style={styles.tagRow}>
                  {career.required_subjects.map((s: string) => (
                    <View key={s} style={styles.tagPurple}><Text style={styles.tagPurpleText}>{s}</Text></View>
                  ))}
                </View>
              </View>
            )}
            {career.key_skills?.length > 0 && (
              <View style={styles.block}>
                <Text style={styles.blockTitle}>⭐ Key Skills</Text>
                <View style={styles.tagRow}>
                  {career.key_skills.map((s: string) => (
                    <View key={s} style={styles.tagYellow}><Text style={styles.tagYellowText}>{s}</Text></View>
                  ))}
                </View>
              </View>
            )}
            {career.entrance_exams?.length > 0 && (
              <View style={styles.block}>
                <Text style={styles.blockTitle}>🎓 Entrance Exams</Text>
                <View style={styles.tagRow}>
                  {career.entrance_exams.map((e: string) => (
                    <View key={e} style={styles.tagBlue}><Text style={styles.tagBlueText}>{e}</Text></View>
                  ))}
                </View>
              </View>
            )}
            {career.top_colleges?.length > 0 && (
              <View style={styles.block}>
                <Text style={styles.blockTitle}>🏫 Top Colleges</Text>
                {career.top_colleges.slice(0, 6).map((c: string) => (
                  <Text key={c} style={styles.listItem}>✓ {c}</Text>
                ))}
              </View>
            )}
          </View>
        )}

        {tab === "roadmap" && (
          <View style={styles.section}>
            {(career.roadmap ?? []).map((step: any, i: number) => (
              <TouchableOpacity key={i} style={styles.roadmapStep} onPress={() => setExpanded(expanded === i ? null : i)}>
                <View style={styles.roadmapLeft}>
                  <View style={styles.stepNum}><Text style={styles.stepNumText}>{i + 1}</Text></View>
                  {i < (career.roadmap?.length ?? 0) - 1 && <View style={styles.stepLine} />}
                </View>
                <View style={styles.roadmapRight}>
                  <Text style={styles.stepTitle}>{step.step}</Text>
                  {step.duration && <Text style={styles.stepDuration}>{step.duration}</Text>}
                  {expanded === i && step.details && <Text style={styles.stepDetails}>{step.details}</Text>}
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {tab === "skill-gap" && (
          <View style={styles.section}>
            {!assessment ? (
              <View>
                <Text style={styles.blockTitle}>Rate your knowledge (0–100)</Text>
                {SUBJECTS.map((subj) => {
                  const val = scores[subj] ?? 50;
                  return (
                    <View key={subj} style={styles.sliderRow}>
                      <View style={styles.sliderLabelRow}>
                        <Text style={styles.sliderLabel}>{subj}</Text>
                        <Text style={styles.sliderValue}>{val}%</Text>
                      </View>
                      <View style={styles.sliderTrack}>
                        <View style={[styles.sliderFill, { width: `${val}%` as any }]} />
                      </View>
                      <View style={styles.sliderBtns}>
                        {[0, 25, 50, 75, 100].map((pct) => (
                          <TouchableOpacity key={pct} onPress={() => setScores((s) => ({ ...s, [subj]: pct }))}
                            style={[styles.pctBtn, val === pct && styles.pctBtnActive]}>
                            <Text style={[styles.pctBtnText, val === pct && styles.pctBtnTextActive]}>{pct}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </View>
                  );
                })}
                <TouchableOpacity style={styles.analyseBtn} onPress={handleAnalyse} disabled={analysing}>
                  {analysing ? <ActivityIndicator color={palette.gray50} /> : <Text style={styles.analyseBtnText}>⚡ Analyse Skill Gap (+30 XP)</Text>}
                </TouchableOpacity>
              </View>
            ) : (
              <View>
                <View style={styles.readyCard}>
                  <Text style={styles.readyScore}>{assessment.ready_score}%</Text>
                  <Text style={styles.readyLabel}>Career Readiness</Text>
                  <View style={styles.readyBarBg}>
                    <View style={[styles.readyBarFill, { width: `${assessment.ready_score}%` }]} />
                  </View>
                </View>

                {assessment.skill_scores && (
                  <View style={styles.block}>
                    <Text style={styles.blockTitle}>Subject Scores</Text>
                    {Object.entries(assessment.skill_scores as Record<string, number>).map(([subj, sc]) => (
                      <View key={subj} style={styles.scoreRow}>
                        <Text style={styles.scoreLabel} numberOfLines={1} ellipsizeMode="tail">{subj}</Text>
                        <View style={styles.scoreBarBg}>
                          <View style={[styles.scoreBarFill, { width: `${sc}%`, backgroundColor: sc >= 70 ? palette.success500 : sc >= 40 ? palette.warning500 : palette.danger500 }]} />
                        </View>
                        <Text style={styles.scoreValue}>{sc}%</Text>
                      </View>
                    ))}
                  </View>
                )}

                {assessment.gaps?.length > 0 && (
                  <View style={styles.block}>
                    <Text style={styles.blockTitle}>Skill Gaps</Text>
                    {assessment.gaps.map((g: string, i: number) => (
                      <Text key={i} style={styles.gapItem}>● {g}</Text>
                    ))}
                  </View>
                )}

                {assessment.learning_path?.length > 0 && (
                  <View style={styles.block}>
                    <Text style={styles.blockTitle}>⚡ Learning Path</Text>
                    {assessment.learning_path.map((s: string, i: number) => (
                      <View key={i} style={styles.pathStep}>
                        <View style={styles.pathNum}><Text style={styles.pathNumText}>{i + 1}</Text></View>
                        <Text style={styles.pathText}>{s}</Text>
                      </View>
                    ))}
                  </View>
                )}

                <TouchableOpacity style={styles.reanalyseBtn} onPress={() => setAssessment(null)}>
                  <Text style={styles.reanalyseBtnText}>Re-analyse</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}

        <View style={{ height: 32 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: palette.gray50 },
  hero: { padding: spacing.xl, paddingTop: 40, backgroundColor: palette.primary600 },
  backBtn: { marginBottom: spacing.md, minHeight: 32, justifyContent: "center" },
  backText: { color: palette.primary200, fontSize: 14, fontWeight: "600" },
  category: { fontSize: 11, fontWeight: "700", color: palette.primary200, textTransform: "uppercase", letterSpacing: 0.5 },
  careerName: { ...typography.h1, color: "#fff", marginTop: 4, flexWrap: "wrap" },
  overview: { ...typography.bodySm, color: palette.primary200, marginTop: spacing.sm, lineHeight: 20 },
  salaryBadge: { marginTop: spacing.sm, backgroundColor: "rgba(255,255,255,0.15)", borderRadius: radius.sm, paddingHorizontal: spacing.md, paddingVertical: 5, alignSelf: "flex-start" },
  salaryText: { fontSize: 13, fontWeight: "700", color: "#fff" },
  goalRow: { flexDirection: "row", gap: spacing.sm, padding: spacing.md },
  goalBtn: { flex: 1, paddingVertical: spacing.sm, borderRadius: radius.md, backgroundColor: palette.gray100, alignItems: "center", minHeight: 44, justifyContent: "center" },
  goalBtnPrimary: { backgroundColor: palette.primary600 },
  goalBtnText: { fontSize: 13, fontWeight: "600", color: palette.gray700 },
  goalBtnTextPrimary: { fontSize: 13, fontWeight: "700", color: "#fff" },
  goalFormCard: { margin: spacing.md, backgroundColor: "#fff", borderRadius: radius.lg, padding: spacing.md, ...cardShadow },
  goalFormTitle: { fontSize: 13, fontWeight: "700", color: palette.gray800, marginBottom: spacing.sm },
  goalFormInput: { borderWidth: 1, borderColor: palette.gray200, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, fontSize: 13, color: palette.gray800, textAlignVertical: "top", minHeight: 60 },
  goalFormBtnRow: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.md },
  goalFormCancelBtn: { flex: 1, paddingVertical: spacing.sm, borderRadius: radius.md, backgroundColor: palette.gray100, alignItems: "center", minHeight: 44, justifyContent: "center" },
  goalFormCancelText: { fontSize: 12, fontWeight: "600", color: palette.gray700 },
  goalFormAddBtn: { flex: 1, paddingVertical: spacing.sm, borderRadius: radius.md, backgroundColor: palette.primary50, alignItems: "center", minHeight: 44, justifyContent: "center" },
  goalFormAddText: { fontSize: 12, fontWeight: "700", color: palette.gray700 },
  goalFormPrimaryBtn: { flex: 1, paddingVertical: spacing.sm, borderRadius: radius.md, backgroundColor: palette.primary600, alignItems: "center", minHeight: 44, justifyContent: "center" },
  goalFormPrimaryText: { fontSize: 12, fontWeight: "700", color: "#fff" },
  tabBar: { flexDirection: "row", backgroundColor: palette.gray100, margin: spacing.md, borderRadius: radius.md, padding: 4 },
  tab: { flex: 1, paddingVertical: spacing.sm, alignItems: "center", borderRadius: radius.sm, minHeight: 36, justifyContent: "center" },
  tabActive: { backgroundColor: "#fff", ...cardShadow },
  tabText: { fontSize: 12, fontWeight: "600", color: palette.gray500 },
  tabTextActive: { color: palette.primary600, fontWeight: "700" },
  content: { flex: 1 },
  section: { paddingHorizontal: spacing.lg },
  block: { backgroundColor: "#fff", borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.md, ...cardShadow },
  blockTitle: { fontSize: 13, fontWeight: "700", color: palette.gray800, marginBottom: spacing.sm },
  tagRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  tagPurple: { backgroundColor: palette.primary50, paddingHorizontal: spacing.md, paddingVertical: 5, borderRadius: radius.pill },
  tagPurpleText: { fontSize: 12, color: palette.primary700, fontWeight: "600" },
  tagYellow: { backgroundColor: palette.warning50, paddingHorizontal: spacing.md, paddingVertical: 5, borderRadius: radius.pill },
  tagYellowText: { fontSize: 12, color: palette.warning700, fontWeight: "600" },
  tagBlue: { backgroundColor: palette.info50, paddingHorizontal: spacing.md, paddingVertical: 5, borderRadius: radius.pill },
  tagBlueText: { fontSize: 12, color: palette.info700, fontWeight: "600" },
  listItem: { fontSize: 13, color: palette.gray700, paddingVertical: 3 },
  roadmapStep: { flexDirection: "row", marginBottom: 4 },
  roadmapLeft: { alignItems: "center", width: 32 },
  stepNum: { width: 28, height: 28, borderRadius: 14, backgroundColor: palette.primary600, alignItems: "center", justifyContent: "center" },
  stepNumText: { fontSize: 12, fontWeight: "800", color: "#fff" },
  stepLine: { width: 2, flex: 1, backgroundColor: palette.gray200, marginVertical: 4 },
  roadmapRight: { flex: 1, backgroundColor: "#fff", borderRadius: radius.lg, padding: spacing.md, marginLeft: spacing.sm, marginBottom: spacing.sm, ...cardShadow },
  stepTitle: { fontSize: 13, fontWeight: "700", color: palette.gray800 },
  stepDuration: { fontSize: 11, color: palette.gray400, marginTop: 2 },
  stepDetails: { fontSize: 12, color: palette.gray500, marginTop: spacing.sm, lineHeight: 18 },
  sliderRow: { marginBottom: spacing.md },
  sliderLabelRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 6 },
  sliderLabel: { fontSize: 12, color: palette.gray700 },
  sliderValue: { fontSize: 12, fontWeight: "700", color: palette.primary600 },
  sliderTrack: { height: 6, backgroundColor: palette.gray200, borderRadius: 3, marginBottom: 6, overflow: "hidden" },
  sliderFill: { height: 6, backgroundColor: palette.primary600, borderRadius: 3 },
  sliderBtns: { flexDirection: "row", gap: 6 },
  pctBtn: { flex: 1, paddingVertical: spacing.xs, borderRadius: radius.sm, backgroundColor: palette.gray100, alignItems: "center", minHeight: 32, justifyContent: "center" },
  pctBtnActive: { backgroundColor: palette.primary600 },
  pctBtnText: { fontSize: 10, fontWeight: "600", color: palette.gray500 },
  pctBtnTextActive: { color: "#fff" },
  analyseBtn: { backgroundColor: palette.primary600, borderRadius: radius.lg, paddingVertical: spacing.md, alignItems: "center", marginTop: spacing.sm, minHeight: 44, justifyContent: "center" },
  analyseBtnText: { color: "#fff", fontSize: 14, fontWeight: "700" },
  readyCard: { backgroundColor: "#fff", borderRadius: radius.lg, padding: spacing.xl, alignItems: "center", marginBottom: spacing.md, ...cardShadow },
  readyScore: { fontSize: 48, fontWeight: "900", color: palette.primary600 },
  readyLabel: { fontSize: 13, color: palette.gray500, marginTop: 2 },
  readyBarBg: { width: "100%", height: 8, backgroundColor: palette.gray200, borderRadius: 4, marginTop: spacing.sm },
  readyBarFill: { height: 8, backgroundColor: palette.primary600, borderRadius: 4 },
  scoreRow: { flexDirection: "row", alignItems: "center", marginBottom: spacing.sm },
  scoreLabel: { flexBasis: "36%", fontSize: 12, color: palette.gray700 },
  scoreBarBg: { flex: 1, height: 6, backgroundColor: palette.gray100, borderRadius: 3, marginHorizontal: spacing.sm },
  scoreBarFill: { height: 6, borderRadius: 3 },
  scoreValue: { width: 36, fontSize: 11, fontWeight: "700", color: palette.gray700, textAlign: "right" },
  gapItem: { fontSize: 13, color: palette.danger500, paddingVertical: 3 },
  pathStep: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm, marginBottom: spacing.sm },
  pathNum: { width: 22, height: 22, borderRadius: 11, backgroundColor: palette.primary50, alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1 },
  pathNumText: { fontSize: 11, fontWeight: "800", color: palette.primary600 },
  pathText: { flex: 1, fontSize: 13, color: palette.gray700, lineHeight: 19 },
  reanalyseBtn: { borderWidth: 1.5, borderColor: palette.primary600, borderRadius: radius.md, paddingVertical: spacing.sm, alignItems: "center", marginTop: spacing.sm, minHeight: 44, justifyContent: "center" },
  reanalyseBtnText: { color: palette.primary600, fontSize: 14, fontWeight: "600" },
});
