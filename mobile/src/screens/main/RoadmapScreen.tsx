import React, { useState } from "react";
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { palette, radius, spacing, typography, cardShadow } from "../../theme/colors";

// ── Data ──────────────────────────────────────────────────────────────────────

const PHASES = [
  {
    phase:    "Phase 2",
    title:    "AI Learning Assistant",
    emoji:    "🤖",
    // Solid indigo (no indigo/violet gradient pairing per the design system).
    colors:   [palette.primary600, palette.primary600] as [string, string],
    badge:    "Coming Soon",
    badgeBg:  palette.primary100,
    badgeFg:  palette.primary700,
    features: [
      { emoji: "🎯", title: "AI Weak Topic Coach",          stars: 5, desc: "Auto-detects weak topics and recommends videos, notes and quizzes." },
      { emoji: "🤔", title: "AI Doubt Solver",              stars: 5, desc: "Ask syllabus questions and get instant contextual answers." },
      { emoji: "📝", title: "AI Quiz Generator",            stars: 5, desc: "Unlimited quizzes by topic, difficulty and question count." },
      { emoji: "📖", title: "AI Revision Notes Generator",  stars: 4, desc: "Auto-generate chapter summaries, formula sheets and exam notes." },
      { emoji: "📅", title: "AI Exam Preparation Mode",     stars: 5, desc: "Personalised study plan based on exam date and weak areas." },
      { emoji: "🔍", title: "AI Mistake Analysis",          stars: 5, desc: "Explains wrong answers with correct concept and revision links." },
      { emoji: "🃏", title: "AI Flashcard Generator",       stars: 4, desc: "Create flashcards from any chapter or notes automatically." },
      { emoji: "📋", title: "AI Mock Test Creator",         stars: 5, desc: "Board-specific exam-style mock tests with difficulty control." },
      { emoji: "📊", title: "AI Performance Reports",       stars: 5, desc: "Strengths, weaknesses, trends and parent-ready analytics." },
    ],
  },
  {
    phase:    "Phase 3",
    title:    "Gamification & Community",
    emoji:    "🎮",
    colors:   [palette.warning500, palette.danger500] as [string, string],
    badge:    "Coming Soon",
    badgeBg:  palette.warning100,
    badgeFg:  palette.warning600,
    features: [
      { emoji: "🎁", title: "Mystery Reward Box",        stars: 5, desc: "Complete activities to unlock surprise EduPoints, badges and boosts." },
      { emoji: "🏠", title: "House System",              stars: 5, desc: "Join Red, Blue, Green or Yellow house. Monthly rankings and rewards." },
      { emoji: "🌟", title: "Seasonal Events",           stars: 5, desc: "Summer Learning Festival, Winter Revision Challenge and more." },
      { emoji: "👥", title: "Friend System",             stars: 4, desc: "Friend requests, friend leaderboard, activity feed, challenge friends." },
      { emoji: "🗺️", title: "Learning Journey Map",     stars: 4, desc: "Visual topic map showing ✓ completed and 🔒 locked topics." },
      { emoji: "🛡️", title: "Streak Freeze",            stars: 4, desc: "Protect your streak by spending EduPoints." },
      { emoji: "🖼️", title: "Avatar Collection System", stars: 4, desc: "Unlock frames, titles (Quiz Master, Math Ninja) and themes." },
      { emoji: "🏆", title: "Class Championship",       stars: 5, desc: "Monthly competitions between classes. Win badges and premium access." },
    ],
  },
  {
    phase:    "Phase 4",
    title:    "Advanced Ecosystem",
    emoji:    "🚀",
    colors:   [palette.info500, palette.info700] as [string, string],
    badge:    "Future Release",
    badgeBg:  palette.info100,
    badgeFg:  palette.info700,
    features: [
      { emoji: "👩‍🏫", title: "Teacher Dashboard",         stars: 5, desc: "Create classes, assign quizzes, track progress, download reports." },
      { emoji: "💰", title: "Scholarship Program",         stars: 5, desc: "Monthly scholarships and premium access for top performers." },
      { emoji: "✍️", title: "AI Essay Evaluator",          stars: 4, desc: "Automatic essay feedback on structure, grammar and arguments." },
      { emoji: "🔢", title: "AI Math Step Solver",         stars: 5, desc: "Step-by-step solutions so students understand every working step." },
      { emoji: "🛤️", title: "Personalized Learning Path", stars: 5, desc: "Fully adaptive roadmap that learns and adjusts to each student." },
    ],
  },
];

const UPCOMING_CLASSES = [
  { cls: "Class 6",  eta: "Q3 2025", icon: "📗" },
  { cls: "Class 7",  eta: "Q3 2025", icon: "📘" },
  { cls: "Class 8",  eta: "Q4 2025", icon: "📙" },
  { cls: "Class 9",  eta: "Q4 2025", icon: "📕" },
  { cls: "Class 11", eta: "Q1 2026", icon: "🔬" },
  { cls: "Class 12", eta: "Q1 2026", icon: "🎓" },
];

const PHASE1_EXISTING = [
  { emoji: "🎙️", title: "Voice AI Tutor",       status: "Coming Soon" },
  { emoji: "📆", title: "Smart Study Planner",   status: "Coming Soon" },
  { emoji: "🧭", title: "Career Guidance",       status: "Coming Soon" },
  { emoji: "📡", title: "Exam Prediction",       status: "Coming Soon" },
  { emoji: "🎥", title: "Live Classes",          status: "Coming Soon" },
  { emoji: "💬", title: "Discussion Forum",      status: "Coming Soon" },
  { emoji: "🏅", title: "Olympiad Prep",         status: "Coming Soon" },
  { emoji: "📐", title: "JEE / NEET Foundation", status: "Coming Soon" },
];

// ── Component ─────────────────────────────────────────────────────────────────

function Stars({ count }: { count: number }) {
  return <Text style={styles.stars}>{"★".repeat(count)}{"☆".repeat(5 - count)}</Text>;
}

export default function RoadmapScreen() {
  const [activePhase, setActivePhase] = useState(0);

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {/* Hero */}
      <View style={[styles.hero, { backgroundColor: palette.primary600 }]}>
        <Text style={styles.heroTitle}>🚀 What's Coming Next</Text>
        <Text style={styles.heroSub}>
          Building the most comprehensive AI-powered learning platform for Indian students
        </Text>
        <View style={styles.heroBadges}>
          <View style={styles.heroBadge}><Text style={styles.heroBadgeText}>✅ CBSE Class 10 Live Now</Text></View>
          <View style={styles.heroBadge}><Text style={styles.heroBadgeText}>🔜 6 More Classes</Text></View>
        </View>
      </View>

      {/* Upcoming Classes */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>📚 Upcoming Classes</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.classRow}>
          {UPCOMING_CLASSES.map(c => (
            <View key={c.cls} style={styles.classCard}>
              <Text style={styles.classIcon}>{c.icon}</Text>
              <Text style={styles.className}>{c.cls}</Text>
              <View style={styles.etaBadge}><Text style={styles.etaText}>{c.eta}</Text></View>
            </View>
          ))}
        </ScrollView>
      </View>

      {/* Phase 1 existing */}
      <View style={styles.section}>
        <View style={styles.phaseHeader}>
          <View style={[styles.phasePill, { backgroundColor: palette.primary50 }]}>
            <Text style={[styles.phasePillText, { color: palette.primary600 }]}>Phase 1</Text>
          </View>
          <Text style={styles.sectionTitle}>⚡ AI &amp; Learning Features</Text>
        </View>
        <View style={styles.gridTwo}>
          {PHASE1_EXISTING.map(f => (
            <View key={f.title} style={styles.smallCard}>
              <Text style={styles.smallEmoji}>{f.emoji}</Text>
              <Text style={styles.smallTitle}>{f.title}</Text>
              <View style={[styles.statusBadge, { backgroundColor: palette.primary100 }]}>
                <Text style={[styles.statusText, { color: palette.primary700 }]}>{f.status}</Text>
              </View>
            </View>
          ))}
        </View>
      </View>

      {/* Phase tabs */}
      <View style={styles.section}>
        <View style={styles.tabs}>
          {PHASES.map((p, i) =>
            activePhase === i ? (
              <TouchableOpacity key={p.phase} activeOpacity={0.85} onPress={() => setActivePhase(i)}>
                <View style={[styles.tab, styles.tabActive, { backgroundColor: palette.primary600 }]}>
                  <Text style={[styles.tabText, styles.tabTextActive]}>
                    {p.emoji} {p.phase}
                  </Text>
                </View>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                key={p.phase}
                style={styles.tab}
                onPress={() => setActivePhase(i)}
              >
                <Text style={styles.tabText}>
                  {p.emoji} {p.phase}
                </Text>
              </TouchableOpacity>
            )
          )}
        </View>

        {/* Active Phase */}
        {(() => {
          const ph = PHASES[activePhase];
          return (
            <View>
              <LinearGradient colors={ph.colors} style={styles.phaseHero}>
                <Text style={styles.phaseHeroTitle}>{ph.emoji} {ph.title}</Text>
                <View style={[styles.statusBadge, { backgroundColor: "rgba(255,255,255,0.25)", marginTop: 6 }]}>
                  <Text style={{ color: "#fff", fontSize: 10, fontWeight: "700" }}>{ph.badge}</Text>
                </View>
              </LinearGradient>
              {ph.features.map(f => (
                <View key={f.title} style={styles.featureCard}>
                  <View style={styles.featureRow}>
                    <Text style={styles.featureEmoji}>{f.emoji}</Text>
                    <View style={styles.featureInfo}>
                      <Text style={styles.featureTitle}>{f.title}</Text>
                      <Stars count={f.stars} />
                    </View>
                    <View style={[styles.statusBadge, { backgroundColor: ph.badgeBg }]}>
                      <Text style={[styles.statusText, { color: ph.badgeFg }]}>{ph.badge}</Text>
                    </View>
                  </View>
                  <Text style={styles.featureDesc}>{f.desc}</Text>
                </View>
              ))}
            </View>
          );
        })()}
      </View>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container:      { flex: 1, backgroundColor: palette.gray50 },
  hero:           { padding: spacing.xl, paddingTop: spacing["3xl"], paddingBottom: spacing["2xl"], borderBottomLeftRadius: radius.xl, borderBottomRightRadius: radius.xl },
  heroTitle:      { fontSize: 22, fontWeight: "800", color: "#fff" },
  heroSub:        { fontSize: 12, color: palette.primary100, marginTop: spacing.sm, lineHeight: 18 },
  heroBadges:     { flexDirection: "row", gap: spacing.sm, marginTop: spacing.md, flexWrap: "wrap" },
  heroBadge:      { backgroundColor: "rgba(255,255,255,0.2)", paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.sm },
  heroBadgeText:  { color: "#fff", fontSize: 11, fontWeight: "600" },
  section:        { paddingHorizontal: spacing.lg, marginTop: spacing["2xl"] },
  sectionTitle:   { fontSize: 15, fontWeight: "800", color: palette.gray800, marginBottom: spacing.md },
  phaseHeader:    { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginBottom: spacing.md },
  phasePill:      { paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, borderRadius: radius.pill },
  phasePillText:  { ...typography.caption },
  classRow:       { gap: spacing.sm, paddingBottom: 4 },
  classCard:      { backgroundColor: "#fff", borderRadius: radius.lg, padding: spacing.md, alignItems: "center", width: 90, borderWidth: 1, borderColor: palette.gray100, ...cardShadow },
  classIcon:      { fontSize: 24, marginBottom: spacing.xs },
  className:      { fontSize: 11, fontWeight: "700", color: palette.gray800, textAlign: "center" },
  etaBadge:       { marginTop: 5, backgroundColor: palette.primary50, paddingHorizontal: 6, paddingVertical: 2, borderRadius: radius.sm },
  etaText:        { fontSize: 9, fontWeight: "700", color: palette.primary600 },
  gridTwo:        { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  smallCard:      { width: "47%", backgroundColor: "#fff", borderRadius: radius.lg, padding: spacing.md, borderWidth: 1, borderColor: palette.gray100, ...cardShadow },
  smallEmoji:     { fontSize: 20, marginBottom: spacing.xs },
  smallTitle:     { fontSize: 11, fontWeight: "700", color: palette.gray800, marginBottom: spacing.xs, lineHeight: 15 },
  statusBadge:    { alignSelf: "flex-start", paddingHorizontal: spacing.sm, paddingVertical: 3, borderRadius: radius.sm },
  statusText:     { fontSize: 9, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.4 },
  tabs:           { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.md, flexWrap: "wrap" },
  tab:            { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.pill, backgroundColor: palette.gray100, minHeight: 40 },
  tabActive:      { backgroundColor: "transparent" },
  tabText:        { fontSize: 12, fontWeight: "700", color: palette.gray500 },
  tabTextActive:  { color: "#fff" },
  phaseHero:      { borderRadius: radius.xl, padding: spacing.lg, marginBottom: spacing.md },
  phaseHeroTitle: { fontSize: 17, fontWeight: "800", color: "#fff" },
  featureCard:    { backgroundColor: "#fff", borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.sm, borderWidth: 1, borderColor: palette.gray100, ...cardShadow },
  featureRow:     { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm, marginBottom: spacing.xs },
  featureEmoji:   { fontSize: 20, marginTop: 1 },
  featureInfo:    { flex: 1 },
  featureTitle:   { fontSize: 13, fontWeight: "700", color: palette.gray800, marginBottom: 2 },
  featureDesc:    { fontSize: 11, color: palette.gray500, lineHeight: 16 },
  stars:          { fontSize: 11, color: palette.warning500, letterSpacing: 1 },
});
