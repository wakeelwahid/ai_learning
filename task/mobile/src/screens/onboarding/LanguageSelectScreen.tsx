import React, { useState } from "react";
import {
  View, Text, TouchableOpacity, StyleSheet, SafeAreaView,
  StatusBar, Dimensions, I18nManager,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LANGUAGES, Lang } from "@/i18n/translations";
import { useLanguage } from "@/contexts/LanguageContext";
import { palette, accentSolid, cardShadow, cardShadowElevated, radius, spacing, typography } from "@/theme/colors";

const { width } = Dimensions.get("window");
const CARD_WIDTH = Math.max(100, Math.min(140, (width - 32) / 2));

// Rotate through the shared accent solids for variety across the grid (was a
// gradient per item — flattened to one solid tint per the no-gradient rule).
const ACCENTS: readonly string[] = [
  accentSolid.indigo,
  accentSolid.amber,
  accentSolid.emerald,
  accentSolid.violet,
  accentSolid.rose,
  accentSolid.cyan,
  accentSolid.fuchsia,
  accentSolid.teal,
];

interface Props {
  onDone: () => void;
}

export default function LanguageSelectScreen({ onDone }: Props) {
  const { setLanguage, t } = useLanguage();
  const [selected, setSelected] = useState<Lang>("en");

  const handleContinue = async () => {
    await setLanguage(selected);
    onDone();
  };

  return (
    <View style={[styles.container, { backgroundColor: palette.primary50 }]}>
      <SafeAreaView style={styles.safe}>
        <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />

        {/* Logo */}
        <View style={styles.logoSection}>
          <View style={[styles.logoBox, { backgroundColor: palette.primary600 }]}>
            <Ionicons name="school" size={32} color="#fff" />
          </View>
          <Text style={styles.appName}>EduAI</Text>
          <Text style={styles.appTagline}>AI-Powered Learning Platform</Text>
        </View>

        {/* Heading */}
        <View style={styles.headingSection}>
          <Text style={styles.heading}>{t("selectLanguage")}</Text>
          <Text style={styles.subheading}>{t("selectLangSub")}</Text>
        </View>

        {/* Language grid */}
        <View style={styles.grid}>
          {LANGUAGES.map((lang, idx) => {
            const isSelected = selected === lang.code;
            return (
              <TouchableOpacity
                key={lang.code}
                onPress={() => setSelected(lang.code as Lang)}
                activeOpacity={0.85}
                style={[styles.card, isSelected && styles.cardSelected]}
              >
                <View style={[styles.scriptBox, { backgroundColor: ACCENTS[idx % ACCENTS.length] }]}>
                  <Text style={styles.scriptText}>{lang.script}</Text>
                </View>
                <Text
                  style={[
                    styles.nativeLabel,
                    lang.dir === "rtl" && styles.rtlText,
                  ]}
                  numberOfLines={1}
                  ellipsizeMode="tail"
                >
                  {lang.nativeLabel}
                </Text>
                <Text style={styles.engLabel} numberOfLines={1} ellipsizeMode="tail">
                  {lang.label}
                </Text>
                {isSelected && (
                  <View style={styles.checkBadge}>
                    <Ionicons name="checkmark" size={12} color="#fff" />
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Continue */}
        <TouchableOpacity
          onPress={handleContinue}
          activeOpacity={0.9}
          style={[styles.continueBtn, { backgroundColor: palette.primary600 }]}
        >
          <Text style={styles.continueTxt}>{t("continueBtn")}</Text>
          <Ionicons name="arrow-forward" size={20} color="#fff" style={{ marginLeft: spacing.sm }} />
        </TouchableOpacity>

        {/* Decorative */}
        <View style={styles.blob1} />
        <View style={styles.blob2} />
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safe:      { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: spacing.xl },
  logoSection:  { alignItems: "center", marginBottom: spacing["3xl"] },
  logoBox:      { width: 72, height: 72, borderRadius: radius.xl, alignItems: "center", justifyContent: "center", marginBottom: spacing.md, elevation: 8, shadowColor: palette.primary600, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8 },
  appName:      { fontSize: 26, fontWeight: "800", color: palette.gray800, letterSpacing: -0.5 },
  appTagline:   { fontSize: 13, color: palette.gray500, marginTop: spacing.xs },
  headingSection: { alignItems: "center", marginBottom: spacing["3xl"] },
  heading:      { ...typography.h1, fontSize: 24, textAlign: "center" },
  subheading:   { fontSize: 14, color: palette.gray500, marginTop: spacing.sm - 2, textAlign: "center" },
  grid:         { flexDirection: "row", flexWrap: "wrap", gap: spacing.md, marginBottom: spacing["3xl"], justifyContent: "center" },
  card:         { width: CARD_WIDTH, backgroundColor: "#fff", borderRadius: radius.xl, padding: spacing.lg, alignItems: "center", borderWidth: 2, borderColor: palette.gray200, ...cardShadow },
  cardSelected: { borderColor: palette.primary600, backgroundColor: palette.primary50, elevation: 6, shadowColor: palette.primary600, shadowOpacity: 0.2 },
  scriptBox:    { width: 52, height: 52, borderRadius: radius.md + 2, alignItems: "center", justifyContent: "center", marginBottom: spacing.sm + 2 },
  scriptText:   { color: "#fff", fontSize: 14, fontWeight: "700", letterSpacing: 1 },
  nativeLabel:  { fontSize: 16, fontWeight: "700", color: palette.gray900, textAlign: "center" },
  rtlText:      { writingDirection: "rtl" },
  engLabel:     { fontSize: 12, color: palette.gray500, marginTop: 2 },
  checkBadge:   { position: "absolute", top: 10, right: 10, width: 20, height: 20, borderRadius: 10, backgroundColor: palette.primary600, alignItems: "center", justifyContent: "center" },
  continueBtn:  { flexDirection: "row", alignItems: "center", justifyContent: "center", minHeight: 44, paddingVertical: spacing.lg, paddingHorizontal: spacing["4xl"] + 8, borderRadius: radius.xl, ...cardShadowElevated, shadowColor: palette.primary600, shadowOpacity: 0.3, elevation: 6 },
  continueTxt:  { color: "#fff", fontSize: 17, fontWeight: "700" },
  // Decorative background blobs — both a same-hue indigo tint at different
  // opacities (previously indigo+violet, which the design system forbids
  // when paired decoratively).
  blob1:        { position: "absolute", top: -80, right: -80, width: 200, height: 200, borderRadius: 100, backgroundColor: "rgba(79,70,229,0.08)" },
  blob2:        { position: "absolute", bottom: -80, left: -80, width: 200, height: 200, borderRadius: 100, backgroundColor: "rgba(79,70,229,0.05)" },
});
