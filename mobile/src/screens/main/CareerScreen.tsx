import React, { useState, useEffect } from "react";
import {
  View, Text, TouchableOpacity, ScrollView, TextInput,
  StyleSheet, ActivityIndicator, SafeAreaView,
} from "react-native";
import { careerApi } from "../../api/career";
import CareerDetailScreen from "./CareerDetailScreen";
import { palette, accentSolid, radius, spacing, typography, cardShadow } from "../../theme/colors";

const CATEGORY_EMOJIS: Record<string, string> = {
  Engineering: "⚙️", Medical: "🏥", Government: "🏛️", Commerce: "💼",
  Law: "⚖️", Emerging: "🚀", Defense: "🛡️", Creative: "🎨", Science: "🔬",
};
// Career-category tile colors — decorative category identifiers (not
// semantic status/feedback), one flat solid hex each via accentSolid
// (replaces the removed accentGradients two-color pairs; no gradients
// per the design system).
const CATEGORY_COLORS: Record<string, string> = {
  Engineering: accentSolid.indigo,
  Medical: accentSolid.emerald,
  Government: accentSolid.amber,
  Commerce: palette.warning500,
  Law: accentSolid.violet,
  Emerging: accentSolid.rose,
  Defense: palette.gray500,
  Creative: accentSolid.fuchsia,
  Science: accentSolid.teal,
};

interface Props {
  user: any;
}

export default function CareerScreen({ user }: Props) {
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [categories, setCategories] = useState<string[]>([]);
  const [careers, setCareers] = useState<any[]>([]);
  const [dashboard, setDashboard] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [selectedCareer, setSelectedCareer] = useState<any>(null);

  useEffect(() => {
    careerApi.categories().then((r) => setCategories(r.data?.categories ?? [])).catch(() => {});
    loadDashboard();
    loadCareers();
  }, []);

  useEffect(() => {
    loadCareers();
  }, [selectedCategory, search]);

  const loadDashboard = async () => {
    try {
      const r = await careerApi.dashboard(user.id);
      setDashboard(r.data);
    } catch {}
  };

  const loadCareers = async () => {
    setLoading(true);
    try {
      const r = await careerApi.list({ category: selectedCategory ?? undefined, search: search || undefined, limit: 50 });
      setCareers(r.data?.careers ?? []);
    } catch {
      setCareers([]);
    } finally {
      setLoading(false);
    }
  };

  if (selectedCareer) {
    return (
      <CareerDetailScreen
        career={selectedCareer}
        userId={user.id}
        onBack={() => { setSelectedCareer(null); loadDashboard(); }}
      />
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <Text style={styles.heroTitle}>🚀 Career Explorer</Text>
          <Text style={styles.heroSub}>Discover your path · Build your roadmap</Text>
          {dashboard && (
            <View style={styles.statsRow}>
              {[
                { label: "Goals", value: dashboard.goal_count ?? 0 },
                { label: "Assessments", value: dashboard.assessment_count ?? 0 },
                { label: "Careers", value: careers.length },
              ].map(({ label, value }) => (
                <View key={label} style={styles.statBox}>
                  <Text style={styles.statValue}>{value}</Text>
                  <Text style={styles.statLabel}>{label}</Text>
                </View>
              ))}
            </View>
          )}
          {dashboard?.primary_goal && (
            <View style={styles.goalBox}>
              <Text style={styles.goalLabel}>Your Goal</Text>
              <Text style={styles.goalName}>{dashboard.primary_goal.career_name}</Text>
              {dashboard.latest_assessment && (
                <View style={styles.progressRow}>
                  <View style={styles.progressBg}>
                    <View style={[styles.progressFill, { width: `${dashboard.latest_assessment.ready_score}%` }]} />
                  </View>
                  <Text style={styles.progressText}>{dashboard.latest_assessment.ready_score}% ready</Text>
                </View>
              )}
            </View>
          )}
        </View>

        {/* Search */}
        <View style={styles.searchRow}>
          <TextInput
            style={styles.searchInput}
            placeholder="🔍 Search careers..."
            value={search}
            onChangeText={setSearch}
          />
        </View>

        {/* Categories — wraps instead of horizontal-scrolling so every
            category is always visible on any screen width, with none ever
            clipped at the edge or requiring a hidden swipe to discover. */}
        <View style={styles.catList}>
          <TouchableOpacity
            style={[styles.catChip, !selectedCategory && styles.catChipActive]}
            onPress={() => setSelectedCategory(null)}
          >
            <Text style={[styles.catText, !selectedCategory && styles.catTextActive]}>All</Text>
          </TouchableOpacity>
          {categories.map((cat) => (
            <TouchableOpacity
              key={cat}
              style={[styles.catChip, selectedCategory === cat && styles.catChipActive]}
              onPress={() => setSelectedCategory(cat === selectedCategory ? null : cat)}
            >
              <Text style={[styles.catText, selectedCategory === cat && styles.catTextActive]}>
                {CATEGORY_EMOJIS[cat] ?? "📌"} {cat}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Career grid — explicit 2-per-row pairing (flex:1 siblings) instead
            of percentage-width children in a wrapping container, which is
            unreliable on React Native Web (collapses to one column there). */}
        {loading ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator color={palette.primary600} />
          </View>
        ) : (
          <View style={styles.grid}>
            {Array.from({ length: Math.ceil(careers.length / 2) }, (_, rowIdx) => {
              const pair = careers.slice(rowIdx * 2, rowIdx * 2 + 2);
              return (
                <View key={rowIdx} style={styles.gridRow}>
                  {pair.map((career) => (
                    <TouchableOpacity
                      key={career.id}
                      style={styles.careerCard}
                      onPress={() => setSelectedCareer(career)}
                    >
                      <View
                        style={[styles.careerGrad, { backgroundColor: CATEGORY_COLORS[career.category] ?? palette.gray500 }]}
                      >
                        <Text style={styles.careerEmoji}>{CATEGORY_EMOJIS[career.category] ?? "💼"}</Text>
                        <Text style={styles.careerName} numberOfLines={2} ellipsizeMode="tail">{career.name}</Text>
                        {career.avg_salary_lpa && (
                          <Text style={styles.careerSalary}>₹{career.avg_salary_lpa}L</Text>
                        )}
                      </View>
                    </TouchableOpacity>
                  ))}
                  {/* Odd final row: keep the lone card at half width instead of stretching full-width */}
                  {pair.length === 1 && <View style={styles.careerCard} />}
                </View>
              );
            })}
          </View>
        )}

        <View style={{ height: 32 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: palette.gray50 },
  container: { flex: 1, backgroundColor: palette.gray50 },
  hero: { padding: spacing.xl, paddingTop: spacing["2xl"], borderBottomLeftRadius: radius.xl, borderBottomRightRadius: radius.xl, backgroundColor: palette.primary600 },
  heroTitle: { fontSize: 22, fontWeight: "800", color: "#fff" },
  heroSub: { fontSize: 12, color: palette.primary200, marginTop: 2 },
  statsRow: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.md },
  statBox: { flex: 1, backgroundColor: "rgba(255,255,255,0.12)", borderRadius: radius.md, padding: spacing.sm, alignItems: "center" },
  statValue: { fontSize: 16, fontWeight: "800", color: "#fff" },
  statLabel: { fontSize: 10, color: palette.primary200, marginTop: 2 },
  goalBox: { marginTop: spacing.md, backgroundColor: "rgba(255,255,255,0.12)", borderRadius: radius.lg, padding: spacing.md },
  goalLabel: { fontSize: 10, fontWeight: "700", color: palette.primary200, textTransform: "uppercase", letterSpacing: 0.5 },
  goalName: { fontSize: 15, fontWeight: "800", color: "#fff", marginTop: 3 },
  progressRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: 6 },
  progressBg: { flex: 1, height: 4, backgroundColor: "rgba(255,255,255,0.2)", borderRadius: 2 },
  progressFill: { height: 4, backgroundColor: "#fff", borderRadius: 2 },
  progressText: { fontSize: 11, color: palette.primary200, fontWeight: "600" },
  searchRow: { margin: spacing.lg },
  searchInput: { backgroundColor: "#fff", borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, fontSize: 14, borderWidth: 1, borderColor: palette.gray100, minHeight: 44, ...cardShadow },
  catList: { flexDirection: "row", flexWrap: "wrap", paddingHorizontal: spacing.lg, paddingBottom: spacing.sm, gap: spacing.sm },
  catChip: { paddingHorizontal: spacing.md, paddingVertical: 7, borderRadius: radius.pill, backgroundColor: palette.gray100, minHeight: 36, justifyContent: "center" },
  catChipActive: { backgroundColor: palette.primary600 },
  catText: { fontSize: 12, fontWeight: "600", color: palette.gray700 },
  catTextActive: { color: "#fff" },
  loadingRow: { alignItems: "center", marginTop: 40 },
  grid: { paddingHorizontal: spacing.sm, marginTop: spacing.sm, gap: spacing.sm },
  gridRow: { flexDirection: "row", gap: spacing.sm },
  careerCard: { flex: 1, borderRadius: radius.xl, overflow: "hidden", ...cardShadow },
  careerGrad: { padding: spacing.lg, minHeight: 110 },
  careerEmoji: { fontSize: 22, marginBottom: 6 },
  careerName: { fontSize: 13, fontWeight: "700", color: "#fff", lineHeight: 18 },
  careerSalary: { fontSize: 11, fontWeight: "600", color: "rgba(255,255,255,0.8)", marginTop: 6 },
});
