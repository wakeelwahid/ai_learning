import React, { useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  SafeAreaView, StatusBar, TextInput, ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { useMutation } from "@tanstack/react-query";
import Toast from "react-native-toast-message";
import { notificationApi } from "@/api/notification";
import { useAppSelector } from "@/store";
import { palette, semantic } from "@/theme/colors";

// Mirrors frontend/src/pages/feedback/FeedbackPage.tsx + components/FeedbackSection.tsx

const CATEGORIES = ["Bug Report", "Feature Request", "Content Issue", "Other"] as const;

const TIPS = [
  "Be specific — mention the feature or page",
  "Include steps to reproduce any bugs",
  "Suggest an improvement, not just a problem",
  "One topic per feedback for faster resolution",
];

export default function FeedbackScreen() {
  const navigation = useNavigation<any>();
  const userId: string = useAppSelector((s) => s.auth.user?.id ?? "");

  const [rating, setRating]     = useState(0);
  const [hovered, setHovered]   = useState(0);
  const [category, setCategory] = useState<typeof CATEGORIES[number] | null>(null);
  const [message, setMessage]   = useState("");
  const [submitted, setSubmitted] = useState(false);

  const submitMutation = useMutation({
    mutationFn: () => notificationApi.submitFeedback(userId, rating, category as string, message),
    onSuccess: () => {
      setSubmitted(true);
      setTimeout(() => {
        setSubmitted(false);
        setRating(0);
        setCategory(null);
        setMessage("");
      }, 3000);
    },
    onError: () => Toast.show({ type: "error", text1: "Failed to send feedback", text2: "Please try again." }),
  });

  const handleSubmit = () => {
    if (!rating)   { Toast.show({ type: "error", text1: "Please select a star rating" }); return; }
    if (!category) { Toast.show({ type: "error", text1: "Please select a category" }); return; }
    if (!message.trim()) { Toast.show({ type: "error", text1: "Please enter a message" }); return; }
    submitMutation.mutate();
  };

  return (
    <SafeAreaView style={s.safe}>
      <StatusBar barStyle="light-content" />

      <View style={[s.header, { backgroundColor: palette.primary600 }]}>
        <View style={s.headerTopRow}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
            <Ionicons name="arrow-back-outline" size={20} color="rgba(255,255,255,0.9)" />
          </TouchableOpacity>
          <Text style={s.headerTitle}>Send Feedback</Text>
          <View style={{ width: 36 }} />
        </View>
        <Text style={s.headerSub}>Help us improve EduLearn</Text>
      </View>

      <ScrollView
        style={s.container}
        contentContainerStyle={{ padding: 16, paddingBottom: 32, gap: 14 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={s.card}>
          {submitted ? (
            <View style={s.successBox}>
              <View style={s.successIcon}>
                <Ionicons name="checkmark-circle" size={24} color={semantic.success.solid} />
              </View>
              <Text style={s.successTitle}>Thank you for your feedback!</Text>
              <Text style={s.successSub}>We appreciate your input on EduLearn.</Text>
            </View>
          ) : (
            <>
              {/* Star rating */}
              <Text style={s.label}>Rating</Text>
              <View style={s.starRow}>
                {[1, 2, 3, 4, 5].map((star) => (
                  <TouchableOpacity
                    key={star}
                    onPress={() => setRating(star)}
                    onPressIn={() => setHovered(star)}
                    onPressOut={() => setHovered(0)}
                    hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
                  >
                    <Ionicons
                      name={star <= (hovered || rating) ? "star" : "star-outline"}
                      size={30}
                      color={star <= (hovered || rating) ? palette.warning500 : palette.gray300}
                    />
                  </TouchableOpacity>
                ))}
              </View>

              {/* Category pills */}
              <Text style={[s.label, { marginTop: 16 }]}>Category</Text>
              <View style={s.pillRow}>
                {CATEGORIES.map((cat) => (
                  <TouchableOpacity
                    key={cat}
                    onPress={() => setCategory(cat)}
                    style={[s.pill, category === cat && s.pillActive]}
                  >
                    <Text style={[s.pillTxt, category === cat && s.pillTxtActive]}>{cat}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Message */}
              <Text style={[s.label, { marginTop: 16 }]}>Message</Text>
              <TextInput
                style={s.textarea}
                value={message}
                onChangeText={setMessage}
                placeholder="Tell us what you think about EduLearn..."
                placeholderTextColor={palette.gray400}
                multiline
                numberOfLines={4}
                textAlignVertical="top"
              />

              {/* Submit */}
              <TouchableOpacity
                style={[s.submitBtn, submitMutation.isPending && { opacity: 0.7 }]}
                onPress={handleSubmit}
                disabled={submitMutation.isPending}
                activeOpacity={0.85}
              >
                {submitMutation.isPending ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={s.submitBtnTxt}>Submit Feedback</Text>
                )}
              </TouchableOpacity>
            </>
          )}
        </View>

        {/* Tips */}
        <View style={s.card}>
          <Text style={s.cardTitle}>Tips for good feedback</Text>
          <View style={{ marginTop: 10, gap: 8 }}>
            {TIPS.map((tip) => (
              <View key={tip} style={s.tipRow}>
                <View style={s.tipDot} />
                <Text style={s.tipTxt}>{tip}</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={[s.card, { alignItems: "center" }]}>
          <Text style={{ fontSize: 24 }}>💬</Text>
          <Text style={s.readTitle}>We read every submission</Text>
          <Text style={s.readSub}>Your feedback shapes the product. Average response time: 48h</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:         { flex: 1, backgroundColor: palette.gray50 },
  container:    { flex: 1 },

  header:       { paddingTop: 8, paddingBottom: 18, paddingHorizontal: 20 },
  headerTopRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  backBtn:      { width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(255,255,255,0.15)", alignItems: "center", justifyContent: "center" },
  headerTitle:  { color: "#fff", fontSize: 17, fontWeight: "800", letterSpacing: -0.3 },
  headerSub:    { color: "rgba(255,255,255,0.7)", fontSize: 13, marginTop: 6, textAlign: "center" },

  card:         { backgroundColor: "#fff", borderRadius: 16, padding: 16, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2 },
  cardTitle:    { fontSize: 14, fontWeight: "800", color: palette.gray800 },

  label:        { fontSize: 12, fontWeight: "600", color: palette.gray500, marginBottom: 8 },
  starRow:      { flexDirection: "row", gap: 6 },

  pillRow:      { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  pill:         { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999, borderWidth: 1, borderColor: palette.gray200 },
  pillActive:   { backgroundColor: palette.primary600, borderColor: palette.primary600 },
  pillTxt:      { fontSize: 12, fontWeight: "600", color: palette.gray600 },
  pillTxtActive:{ color: "#fff" },

  textarea:     { borderWidth: 1, borderColor: palette.gray200, borderRadius: 12, padding: 12, fontSize: 14, color: palette.gray900, minHeight: 90 },

  submitBtn:    { marginTop: 18, backgroundColor: palette.primary600, borderRadius: 12, paddingVertical: 13, alignItems: "center", justifyContent: "center" },
  submitBtnTxt: { color: "#fff", fontSize: 14, fontWeight: "700" },

  successBox:   { alignItems: "center", paddingVertical: 20, gap: 6 },
  successIcon:  { width: 44, height: 44, borderRadius: 22, backgroundColor: semantic.success.bg, alignItems: "center", justifyContent: "center" },
  successTitle: { fontSize: 14, fontWeight: "700", color: semantic.success.text },
  successSub:   { fontSize: 12, color: palette.gray500 },

  tipRow:       { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  tipDot:       { width: 5, height: 5, borderRadius: 2.5, backgroundColor: semantic.success.solid, marginTop: 6 },
  tipTxt:       { flex: 1, fontSize: 12, color: palette.gray500, lineHeight: 17 },

  readTitle:    { fontSize: 13, fontWeight: "700", color: palette.gray800, marginTop: 4 },
  readSub:      { fontSize: 11, color: palette.gray400, textAlign: "center", marginTop: 2 },
});
