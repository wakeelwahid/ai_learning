import React from "react";
import {
  Modal, View, Text, ScrollView, TouchableOpacity,
  StyleSheet, SafeAreaView, StatusBar,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { palette } from "@/theme/colors";

interface Section { title: string; body: string }

interface Props {
  visible: boolean;
  onClose: () => void;
  title: string;
  subtitle: string;
  sections: Section[];
  accentColor?: string;
}

export default function LegalModal({
  visible, onClose, title, subtitle, sections, accentColor = palette.primary600,
}: Props) {
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <SafeAreaView style={styles.safe}>
        <StatusBar barStyle="light-content" backgroundColor={accentColor} />

        {/* Header */}
        <View style={[styles.header, { backgroundColor: accentColor }]}>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn} activeOpacity={0.8}>
            <Ionicons name="arrow-back" size={20} color="#fff" />
          </TouchableOpacity>
          <View style={styles.headerText}>
            <Text style={styles.headerTitle}>{title}</Text>
            <Text style={styles.headerSub}>{subtitle}</Text>
          </View>
        </View>

        <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {sections.map((s) => (
            <View key={s.title} style={styles.card}>
              <Text style={styles.sectionTitle}>{s.title}</Text>
              <Text style={styles.sectionBody}>{s.body}</Text>
            </View>
          ))}

          <Text style={styles.footer}>© 2026 EduAI. All rights reserved.</Text>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safe:          { flex: 1, backgroundColor: "#F8FAFC" },
  header:        { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 14, gap: 12 },
  closeBtn:      { width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(255,255,255,0.2)", alignItems: "center", justifyContent: "center" },
  headerText:    { flex: 1 },
  headerTitle:   { color: "#fff", fontSize: 17, fontWeight: "800" },
  headerSub:     { color: "rgba(255,255,255,0.75)", fontSize: 11, marginTop: 1 },
  scroll:        { flex: 1 },
  content:       { padding: 16, paddingBottom: 40 },
  card:          { backgroundColor: "#fff", borderRadius: 14, padding: 16, marginBottom: 12, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
  sectionTitle:  { fontSize: 13, fontWeight: "700", color: "#111827", marginBottom: 8 },
  sectionBody:   { fontSize: 12, color: "#6B7280", lineHeight: 19 },
  footer:        { textAlign: "center", color: "#9CA3AF", fontSize: 11, marginTop: 8 },
});
