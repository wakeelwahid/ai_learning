import React, { useEffect, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  SafeAreaView, Modal, ActivityIndicator, TextInput, Linking,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { palette } from "@/theme/colors";
import { infoPageApi } from "@/api/infopages";

const FOOTER = "© 2026 Your Platform. All rights reserved. Built for the future of learning.";

interface InfoPage {
  slug: string;
  title: string;
  content: string;
  data: any;
}

export default function InfoModal({ slug, onClose }: { slug: string | null; onClose: () => void }) {
  const [page, setPage] = useState<InfoPage | null>(null);
  const [loading, setLoading] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!slug) { setPage(null); return; }
    setLoading(true);
    setPage(null);
    setOpenFaq(0);
    infoPageApi.get(slug)
      .then((r) => {
        setPage(r.data);
        if (slug === "contact-us" && r.data?.data?.predefined_message) {
          setMessage(r.data.data.predefined_message);
        }
      })
      .catch(() => setPage(null))
      .finally(() => setLoading(false));
  }, [slug]);

  const paragraphs = (page?.content || "").split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const isFaq = slug === "faq";
  const isContact = slug === "contact-us";
  const cd = page?.data || {};

  const sendMessage = () => {
    const email = cd.email || "support@edulearn.com";
    const subject = encodeURIComponent(`Support request — ${page?.title ?? ""}`);
    const body = encodeURIComponent(message);
    Linking.openURL(`mailto:${email}?subject=${subject}&body=${body}`);
  };

  return (
    <Modal visible={!!slug} animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <SafeAreaView style={styles.safe}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={22} color={palette.primary600} />
          </TouchableOpacity>
          <Text style={styles.headerTitle} numberOfLines={1}>{page?.title ?? "Loading…"}</Text>
        </View>

        {loading && <ActivityIndicator color={palette.primary600} size="large" style={{ marginTop: 40 }} />}

        {!loading && page && (
          <ScrollView contentContainerStyle={styles.scroll}>
            {/* Intro / content paragraphs */}
            {paragraphs.map((p, i) => (
              <Text key={i} style={styles.paragraph}>{p}</Text>
            ))}

            {/* FAQ accordion */}
            {isFaq && Array.isArray(cd.items) && cd.items.map((it: any, i: number) => (
              <View key={i} style={styles.faqCard}>
                <TouchableOpacity style={styles.faqQRow} onPress={() => setOpenFaq(openFaq === i ? null : i)} activeOpacity={0.7}>
                  <Text style={styles.faqQ}>{it.q}</Text>
                  <Ionicons name={openFaq === i ? "chevron-up" : "chevron-down"} size={18} color="#9CA3AF" />
                </TouchableOpacity>
                {openFaq === i && <Text style={styles.faqA}>{it.a}</Text>}
              </View>
            ))}

            {/* Contact details */}
            {isContact && (
              <>
                <View style={styles.contactCard}>
                  {cd.email && <ContactRow icon="mail-outline" label="Email" value={cd.email} onPress={() => Linking.openURL(`mailto:${cd.email}`)} />}
                  {cd.phone && <ContactRow icon="call-outline" label="Phone" value={cd.phone} onPress={() => Linking.openURL(`tel:${cd.phone}`)} />}
                  {cd.address && <ContactRow icon="location-outline" label="Address" value={cd.address} />}
                  {cd.hours && <ContactRow icon="time-outline" label="Hours" value={cd.hours} noBorder />}
                </View>

                <View style={styles.contactCard}>
                  <Text style={styles.formLabel}>Send us a message</Text>
                  <TextInput
                    style={styles.textArea}
                    value={message}
                    onChangeText={setMessage}
                    placeholder="Type your message…"
                    placeholderTextColor="#9CA3AF"
                    multiline
                    numberOfLines={5}
                  />
                  <TouchableOpacity onPress={sendMessage} disabled={!message.trim()} style={[styles.sendBtn, !message.trim() && { opacity: 0.5 }]} activeOpacity={0.85}>
                    <Ionicons name="send" size={16} color="#fff" />
                    <Text style={styles.sendTxt}>Send Message</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}

            <Text style={styles.footer}>{FOOTER}</Text>
          </ScrollView>
        )}

        {!loading && !page && (
          <View style={styles.empty}>
            <Ionicons name="alert-circle-outline" size={40} color="#D1D5DB" />
            <Text style={styles.emptyTxt}>This page isn't available yet</Text>
          </View>
        )}
      </SafeAreaView>
    </Modal>
  );
}

function ContactRow({ icon, label, value, onPress, noBorder }: { icon: string; label: string; value: string; onPress?: () => void; noBorder?: boolean }) {
  return (
    <TouchableOpacity style={[styles.contactRow, noBorder && { borderBottomWidth: 0 }]} onPress={onPress} activeOpacity={onPress ? 0.65 : 1} disabled={!onPress}>
      <View style={styles.contactIcon}><Ionicons name={icon as any} size={16} color={palette.primary600} /></View>
      <View style={{ flex: 1 }}>
        <Text style={styles.contactLabel}>{label}</Text>
        <Text style={styles.contactValue}>{value}</Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  safe:        { flex: 1, backgroundColor: "#F8FAFC" },
  header:      { flexDirection: "row", alignItems: "center", padding: 16, backgroundColor: "#fff", borderBottomWidth: 1, borderBottomColor: "#F1F5F9" },
  backBtn:     { width: 38, height: 38, borderRadius: 12, backgroundColor: palette.primary50, alignItems: "center", justifyContent: "center", marginRight: 12 },
  headerTitle: { fontSize: 16, fontWeight: "800", color: "#111827", flex: 1 },
  scroll:      { padding: 16, paddingBottom: 40 },
  paragraph:   { fontSize: 14, color: "#374151", lineHeight: 21, marginBottom: 12 },

  faqCard:     { backgroundColor: "#fff", borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: "#F1F5F9" },
  faqQRow:     { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  faqQ:        { flex: 1, fontSize: 14, fontWeight: "700", color: "#111827" },
  faqA:        { fontSize: 13, color: "#6B7280", lineHeight: 19, marginTop: 8 },

  contactCard: { backgroundColor: "#fff", borderRadius: 16, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: "#F1F5F9" },
  contactRow:  { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: "#F1F5F9" },
  contactIcon: { width: 34, height: 34, borderRadius: 10, backgroundColor: palette.primary50, alignItems: "center", justifyContent: "center" },
  contactLabel:{ fontSize: 11, color: "#9CA3AF" },
  contactValue:{ fontSize: 14, fontWeight: "600", color: "#111827" },

  formLabel:   { fontSize: 14, fontWeight: "700", color: "#111827", marginBottom: 10 },
  textArea:    { backgroundColor: "#F9FAFB", borderRadius: 12, borderWidth: 1, borderColor: "#E5E7EB", padding: 12, fontSize: 14, color: "#111827", minHeight: 110, textAlignVertical: "top" },
  sendBtn:     { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: palette.primary600, borderRadius: 12, paddingVertical: 13, marginTop: 12 },
  sendTxt:     { color: "#fff", fontSize: 14, fontWeight: "700" },

  footer:      { fontSize: 11, color: "#9CA3AF", textAlign: "center", marginTop: 20, lineHeight: 16 },
  empty:       { alignItems: "center", padding: 50 },
  emptyTxt:    { color: "#6B7280", marginTop: 12, fontSize: 14 },
});
