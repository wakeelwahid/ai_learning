import React, { useState, useEffect } from "react";
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet,
  ActivityIndicator, Linking,
} from "react-native";
import Toast from "react-native-toast-message";
import { opportunityApi } from "../../api/career";
import { palette, semantic, radius, spacing, typography, cardShadow } from "../../theme/colors";

// Category tile colors — decorative category identifiers (not semantic
// status/feedback), so kept as flat solid fills rather than the previous
// two-color gradients (no gradients per the design system). One
// representative solid hex per category instead of a [start, end] pair.
const CATEGORIES = [
  { key: "government_jobs", label: "Government Jobs", emoji: "🏛️", color: palette.primary600 },
  { key: "scholarships",    label: "Scholarships",    emoji: "🎓", color: palette.success600 },
  { key: "entrance_exams", label: "Entrance Exams",   emoji: "📝", color: palette.purple600 },
  { key: "internships",    label: "Internships",      emoji: "💼", color: palette.warning600 },
  { key: "olympiads",      label: "Olympiads",        emoji: "🏅", color: palette.danger600 },
];

// Mirrors CATEGORY_META.subcategories in frontend/src/pages/career/OpportunityListPage.tsx
const SUBCATEGORIES: Record<string, { key: string; label: string }[]> = {
  government_jobs: [
    { key: "ssc",      label: "SSC" },
    { key: "railway",  label: "Railway" },
    { key: "banking",  label: "Banking" },
    { key: "defence",  label: "Defence" },
    { key: "upsc",     label: "UPSC" },
    { key: "state",    label: "State Govt" },
  ],
  scholarships: [
    { key: "national", label: "National" },
    { key: "state",    label: "State" },
    { key: "private",  label: "Private" },
  ],
  entrance_exams: [
    { key: "jee",           label: "JEE" },
    { key: "neet",          label: "NEET" },
    { key: "cuet",          label: "CUET" },
    { key: "nda",           label: "NDA" },
    { key: "clat",          label: "CLAT" },
    { key: "ca_foundation", label: "CA Foundation" },
  ],
  internships: [
    { key: "student", label: "Student" },
    { key: "summer",  label: "Summer" },
  ],
  olympiads: [
    { key: "science", label: "Science" },
    { key: "maths",   label: "Maths" },
    { key: "cyber",   label: "Cyber" },
  ],
};

function daysLeft(dateStr: string) {
  return Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86400000);
}

interface Props {
  user?: any;
}

type Screen = "hub" | "list" | "detail";

export default function CareerHubScreen({ user }: Props) {
  const [screen, setScreen]           = useState<Screen>("hub");
  const [activeCategory, setActiveCategory] = useState<string>("");
  const [activeSubcat, setActiveSubcat] = useState<string>("");
  const [selectedOpp, setSelectedOpp] = useState<any>(null);
  const [summary, setSummary]         = useState<any>(null);
  const [upcoming, setUpcoming]       = useState<any[]>([]);
  const [listItems, setListItems]     = useState<any[]>([]);
  const [loading, setLoading]         = useState(true);
  const [listLoading, setListLoading] = useState(false);

  useEffect(() => {
    Promise.all([
      opportunityApi.hubSummary().then(r => setSummary(r.data?.summary ?? {})),
      opportunityApi.upcoming(14).then(r => setUpcoming(r.data?.opportunities ?? [])),
    ])
      .catch(() => Toast.show({ type: "error", text1: "Could not load Career Hub", text2: "Please check your connection and try again." }))
      .finally(() => setLoading(false));
  }, []);

  const openCategory = async (cat: string) => {
    setActiveCategory(cat);
    setActiveSubcat("");
    setScreen("list");
    setListLoading(true);
    try {
      const r = await opportunityApi.list({ category: cat });
      setListItems(r.data?.opportunities ?? []);
    } catch {
      setListItems([]);
      Toast.show({ type: "error", text1: "Could not load opportunities" });
    }
    finally { setListLoading(false); }
  };

  const openDetail = (opp: any) => {
    setSelectedOpp(opp);
    setScreen("detail");
  };

  // ── Hub ────────────────────────────────────────────────────────────────
  if (screen === "hub") {
    return (
      <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <Text style={styles.heroTitle}>🚀 Career & Opportunities</Text>
          <Text style={styles.heroSub}>Jobs · Scholarships · Exams · Internships · Olympiads</Text>
        </View>

        {loading ? (
          <View style={styles.center}><ActivityIndicator color={palette.primary600} /></View>
        ) : (
          <>
            <Text style={styles.sectionTitle}>Browse Categories</Text>
            <View style={styles.catGrid}>
              {CATEGORIES.map(cat => (
                <TouchableOpacity key={cat.key} onPress={() => openCategory(cat.key)} style={styles.catCardWrap}>
                  <View style={[styles.catCard, { backgroundColor: cat.color }]}>
                    <Text style={styles.catEmoji}>{cat.emoji}</Text>
                    <Text style={styles.catLabel}>{cat.label}</Text>
                    {summary?.[cat.key]?.count > 0 && (
                      <Text style={styles.catCount}>{summary[cat.key].count} open</Text>
                    )}
                  </View>
                </TouchableOpacity>
              ))}
            </View>

            {upcoming.length > 0 && (
              <>
                <Text style={styles.sectionTitle}>⏰ Closing Soon</Text>
                {upcoming.slice(0, 5).map((opp: any) => {
                  const days = daysLeft(opp.last_date);
                  return (
                    <TouchableOpacity key={opp.id} style={styles.card} onPress={() => openDetail(opp)}>
                      <View style={styles.cardRow}>
                        <View style={styles.cardInfo}>
                          <Text style={styles.cardCat}>{opp.category.replace(/_/g, " ")}</Text>
                          <Text style={styles.cardTitle} numberOfLines={2}>{opp.title}</Text>
                          <Text style={styles.cardOrg}>{opp.organization}</Text>
                        </View>
                        <View style={[styles.deadlineBadge, days <= 7 && styles.urgentBadge]}>
                          <Text style={[styles.deadlineDays, days <= 7 && styles.urgentText]}>{days}</Text>
                          <Text style={[styles.deadlineLabel, days <= 7 && styles.urgentText]}>days left</Text>
                        </View>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </>
            )}
          </>
        )}
        <View style={{ height: 32 }} />
      </ScrollView>
    );
  }

  // ── List ────────────────────────────────────────────────────────────────
  if (screen === "list") {
    const catMeta = CATEGORIES.find(c => c.key === activeCategory);
    const subcats = SUBCATEGORIES[activeCategory] ?? [];
    const visibleItems = activeSubcat
      ? listItems.filter((opp: any) => opp.subcategory === activeSubcat)
      : listItems;
    return (
      <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
        <View style={[styles.listHero, { backgroundColor: catMeta?.color ?? palette.primary600 }]}>
          <TouchableOpacity onPress={() => setScreen("hub")} style={styles.backBtn}>
            <Text style={styles.backText}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.listHeroTitle}>{catMeta?.emoji} {catMeta?.label}</Text>
        </View>

        {subcats.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow} contentContainerStyle={styles.chipRowContent}>
            <TouchableOpacity
              onPress={() => setActiveSubcat("")}
              style={[styles.chip, !activeSubcat && styles.chipActive]}
            >
              <Text style={[styles.chipText, !activeSubcat && styles.chipTextActive]}>All</Text>
            </TouchableOpacity>
            {subcats.map(sc => (
              <TouchableOpacity
                key={sc.key}
                onPress={() => setActiveSubcat(sc.key)}
                style={[styles.chip, activeSubcat === sc.key && styles.chipActive]}
              >
                <Text style={[styles.chipText, activeSubcat === sc.key && styles.chipTextActive]}>{sc.label}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}

        {listLoading ? (
          <View style={styles.center}><ActivityIndicator color={palette.primary600} /></View>
        ) : visibleItems.length === 0 ? (
          <View style={styles.center}>
            <Text style={styles.emptyText}>No opportunities yet — check back soon!</Text>
          </View>
        ) : (
          visibleItems.map((opp: any) => {
            const days = daysLeft(opp.last_date);
            return (
              <TouchableOpacity key={opp.id} style={styles.card} onPress={() => openDetail(opp)}>
                <View style={styles.cardRow}>
                  <View style={styles.cardInfo}>
                    <Text style={styles.cardCat}>{opp.subcategory.replace(/_/g, " ")}</Text>
                    <Text style={styles.cardTitle} numberOfLines={2}>{opp.title}</Text>
                    <Text style={styles.cardOrg}>{opp.organization}</Text>
                    {opp.qualification && <Text style={styles.cardDetail}>🎓 {opp.qualification}</Text>}
                    {opp.total_posts && <Text style={styles.cardDetail}>📋 {opp.total_posts.toLocaleString()} posts</Text>}
                  </View>
                  <View style={styles.cardRight}>
                    <View style={[styles.deadlineBadge, days <= 7 && styles.urgentBadge]}>
                      <Text style={[styles.deadlineDays, days <= 7 && styles.urgentText]}>{days < 0 ? "—" : days}</Text>
                      <Text style={[styles.deadlineLabel, days <= 7 && styles.urgentText]}>{days < 0 ? "Closed" : "days left"}</Text>
                    </View>
                    {opp.official_url && (
                      <TouchableOpacity
                        style={styles.applyNowChip}
                        onPress={(e) => { e.stopPropagation(); Linking.openURL(opp.official_url); }}
                      >
                        <Text style={styles.applyNowChipText}>Apply Now</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              </TouchableOpacity>
            );
          })
        )}
        <View style={{ height: 32 }} />
      </ScrollView>
    );
  }

  // ── Detail ────────────────────────────────────────────────────────────
  if (screen === "detail" && selectedOpp) {
    const opp = selectedOpp;
    const days = daysLeft(opp.last_date);
    const closed = days < 0;
    return (
      <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
        <View style={[styles.listHero, { backgroundColor: palette.primary600 }]}>
          <TouchableOpacity onPress={() => setScreen("hub")} style={styles.backBtn}>
            <Text style={styles.backText}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.listHeroTitle} numberOfLines={3}>{opp.title}</Text>
          <Text style={{ color: palette.primary200, fontSize: 12, marginTop: 4 }}>{opp.organization}</Text>
        </View>

        <View style={styles.detailBody}>
          {/* Key info */}
          {[
            opp.total_posts    && { label: "Total Posts", value: opp.total_posts.toLocaleString("en-IN") },
            opp.qualification  && { label: "Qualification", value: opp.qualification },
            (opp.age_min || opp.age_max) && { label: "Age Range", value: `${opp.age_min ?? "—"}–${opp.age_max ?? "—"} years` },
            (opp.salary_min || opp.salary_max) && { label: "Salary", value: `₹${(opp.salary_min ?? 0).toLocaleString()} – ₹${(opp.salary_max ?? 0).toLocaleString()} /mo` },
            { label: "Application Fee", value: opp.application_fee === 0 || !opp.application_fee ? "Free" : `₹${opp.application_fee}` },
            { label: "Last Date", value: new Date(opp.last_date).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" }) },
            opp.exam_date && { label: "Exam Date", value: new Date(opp.exam_date).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" }) },
          ].filter(Boolean).map((row: any, i: number) => (
            <View key={i} style={styles.infoRow}>
              <Text style={styles.infoLabel}>{row.label}</Text>
              <Text style={styles.infoValue} numberOfLines={1} ellipsizeMode="tail">{row.value}</Text>
            </View>
          ))}

          {/* Selection process */}
          {opp.selection_process?.length > 0 && (
            <>
              <Text style={styles.sectionTitle2}>Selection Process</Text>
              {opp.selection_process.map((step: string, i: number) => (
                <View key={i} style={styles.stepRow}>
                  <View style={styles.stepBadge}><Text style={styles.stepNum}>{i + 1}</Text></View>
                  <Text style={styles.stepText}>{step}</Text>
                </View>
              ))}
            </>
          )}

          {/* Apply Now */}
          {!closed && opp.official_url && (
            <TouchableOpacity
              style={styles.applyBtn}
              onPress={() => Linking.openURL(opp.official_url)}
            >
              <Text style={styles.applyText}>Apply Now  ↗</Text>
            </TouchableOpacity>
          )}
          {opp.notification_pdf_url && (
            <TouchableOpacity
              style={styles.pdfBtn}
              onPress={() => Linking.openURL(opp.notification_pdf_url)}
            >
              <Text style={styles.pdfText}>📄 Download Notification PDF</Text>
            </TouchableOpacity>
          )}
          {closed && (
            <View style={styles.closedBtn}>
              <Text style={styles.closedText}>Applications Closed</Text>
            </View>
          )}

          <Text style={styles.disclaimer}>
            Always verify details on the official website before applying.
          </Text>
        </View>
        <View style={{ height: 32 }} />
      </ScrollView>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: palette.gray50 },
  hero: { padding: spacing.xl, paddingTop: spacing["2xl"], borderBottomLeftRadius: radius.xl, borderBottomRightRadius: radius.xl, paddingBottom: spacing["2xl"], backgroundColor: palette.primary600 },
  heroTitle: { fontSize: 22, fontWeight: "800", color: "#fff" },
  heroSub: { fontSize: 12, color: palette.primary200, marginTop: 4 },
  listHero: { padding: spacing.xl, paddingTop: spacing["2xl"], borderBottomLeftRadius: radius.xl, borderBottomRightRadius: radius.xl },
  listHeroTitle: { ...typography.h1, color: "#fff", marginTop: spacing.sm },
  backBtn: { alignSelf: "flex-start", minHeight: 32, justifyContent: "center" },
  backText: { color: palette.primary200, fontSize: 13, fontWeight: "600" },
  center: { alignItems: "center", marginTop: 48 },
  emptyText: { fontSize: 14, color: palette.gray400, textAlign: "center" },
  chipRow: { marginTop: spacing.md, marginBottom: 4 },
  chipRowContent: { paddingHorizontal: spacing.lg, gap: spacing.sm },
  chip: { paddingHorizontal: spacing.md, paddingVertical: 7, borderRadius: radius.pill, backgroundColor: palette.gray100, minHeight: 36, justifyContent: "center" },
  chipActive: { backgroundColor: palette.primary600 },
  chipText: { fontSize: 12, fontWeight: "600", color: palette.gray500 },
  chipTextActive: { color: "#fff" },
  sectionTitle: { ...typography.h4, color: palette.gray800, marginHorizontal: spacing.lg, marginTop: spacing.xl, marginBottom: spacing.md },
  catGrid: { flexDirection: "row", flexWrap: "wrap", paddingHorizontal: spacing.md, gap: spacing.sm, marginBottom: 4 },
  catCardWrap: { width: "47%", borderRadius: radius.xl, overflow: "hidden" },
  catCard: { padding: spacing.lg, minHeight: 100, borderRadius: radius.xl },
  catEmoji: { fontSize: 24, marginBottom: 6 },
  catLabel: { fontSize: 13, fontWeight: "700", color: "#fff" },
  catCount: { fontSize: 11, color: "rgba(255,255,255,0.8)", marginTop: 4, fontWeight: "600" },
  card: { marginHorizontal: spacing.lg, marginVertical: 6, backgroundColor: "#fff", borderRadius: radius.lg, padding: spacing.md, ...cardShadow },
  cardRow: { flexDirection: "row", justifyContent: "space-between", gap: spacing.sm },
  cardInfo: { flex: 1 },
  cardCat: { fontSize: 10, fontWeight: "700", color: palette.primary600, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 3 },
  cardTitle: { fontSize: 14, fontWeight: "700", color: palette.gray800, lineHeight: 19 },
  cardOrg: { fontSize: 12, color: palette.gray500, marginTop: 2 },
  cardDetail: { fontSize: 11, color: palette.gray400, marginTop: 3 },
  cardRight: { alignItems: "center", gap: 6 },
  deadlineBadge: { width: 52, alignItems: "center", justifyContent: "center", backgroundColor: semantic.success.bg, borderRadius: radius.md, padding: spacing.sm },
  urgentBadge: { backgroundColor: semantic.danger.bg },
  deadlineDays: { fontSize: 18, fontWeight: "800", color: palette.success600 },
  deadlineLabel: { fontSize: 9, color: palette.success600, fontWeight: "600" },
  urgentText: { color: palette.danger600 },
  applyNowChip: { backgroundColor: palette.primary600, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: 5 },
  applyNowChipText: { fontSize: 10, fontWeight: "700", color: "#fff" },
  detailBody: { padding: spacing.lg },
  infoRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: palette.gray100 },
  infoLabel: { fontSize: 12, color: palette.gray500, flex: 1 },
  infoValue: { fontSize: 13, fontWeight: "700", color: palette.gray800, flex: 1.5, textAlign: "right" },
  sectionTitle2: { ...typography.h4, color: palette.gray800, marginTop: spacing.xl, marginBottom: spacing.md },
  stepRow: { flexDirection: "row", gap: spacing.md, marginBottom: spacing.sm, alignItems: "flex-start" },
  stepBadge: { width: 26, height: 26, borderRadius: 13, backgroundColor: palette.primary50, alignItems: "center", justifyContent: "center" },
  stepNum: { fontSize: 12, fontWeight: "700", color: palette.primary600 },
  stepText: { flex: 1, fontSize: 13, color: palette.gray700, lineHeight: 19 },
  applyBtn: { marginTop: spacing.xl, backgroundColor: palette.primary600, borderRadius: radius.lg, paddingVertical: spacing.lg, alignItems: "center", minHeight: 48, justifyContent: "center" },
  applyText: { fontSize: 16, fontWeight: "800", color: "#fff" },
  pdfBtn: { marginTop: spacing.md, backgroundColor: palette.gray100, borderRadius: radius.lg, paddingVertical: spacing.md, alignItems: "center", minHeight: 44, justifyContent: "center" },
  pdfText: { fontSize: 14, fontWeight: "600", color: palette.gray700 },
  closedBtn: { marginTop: spacing.xl, backgroundColor: palette.gray100, borderRadius: radius.lg, paddingVertical: spacing.lg, alignItems: "center", minHeight: 48, justifyContent: "center" },
  closedText: { fontSize: 15, fontWeight: "700", color: palette.gray400 },
  disclaimer: { fontSize: 10, color: palette.gray300, textAlign: "center", marginTop: spacing.md },
});
