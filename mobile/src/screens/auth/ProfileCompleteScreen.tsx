import React, { useEffect, useState } from "react";
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator,
  SafeAreaView, StatusBar, Modal,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Toast from "react-native-toast-message";
import { contentApi } from "@/api/content";
import { authApi } from "@/api/auth";
import { userApi } from "@/api/user";
import { setProfileComplete, updateUser } from "@/store/authSlice";
import { useAppDispatch, useAppSelector } from "@/store";
import { palette, radius, spacing, typography, cardShadowElevated } from "@/theme/colors";

interface Props {
  onDone: () => void;
}

// Mandatory profile-completion screen for a phone-OTP account with no
// profile row yet — the board/class picker here matches the server-side
// requirement (CreateProfileRequest, and check_profile_complete's
// student-only board+class rule).
export default function ProfileCompleteScreen({ onDone }: Props) {
  const dispatch = useAppDispatch();
  const user = useAppSelector(s => s.auth.user);
  const isStudent = (user?.role ?? "student") === "student";

  const [fullName,   setFullName]   = useState("");
  const [schoolName, setSchoolName] = useState("");
  const [board,      setBoard]      = useState("");
  const [classNum,   setClassNum]   = useState<number | null>(null);
  const [boards,     setBoards]     = useState<any[]>([]);
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState<string | null>(null);

  useEffect(() => {
    contentApi.getBoards()
      .then((r: any) => {
        const list: any[] = Array.isArray(r.data) ? r.data : [];
        const seen = new Set<string>();
        setBoards(list.filter((b) => {
          const k = (b.name ?? "").toLowerCase();
          if (seen.has(k)) return false;
          seen.add(k);
          return true;
        }));
      })
      .catch(() => setBoards([{ id: "cbse", name: "CBSE" }, { id: "icse", name: "ICSE" }, { id: "state", name: "State Board" }]));
  }, []);

  // Classes come from the selected board (what the admin created), not a
  // static 1–12 list — one entry per class number, sorted.
  const [classes,        setClasses]        = useState<number[]>([]);
  const [classesLoading, setClassesLoading] = useState(false);
  const selectedBoardId = boards.find((b: any) => b.name === board)?.id;
  useEffect(() => {
    setClassNum(null);
    setClasses([]);
    if (!selectedBoardId) return;
    setClassesLoading(true);
    contentApi.getClasses(String(selectedBoardId))
      .then((r: any) => {
        const rows: any[] = Array.isArray(r.data) ? r.data : [];
        setClasses([...new Set(rows.map((c) => Number(c.number)))].sort((a, b) => a - b));
      })
      // Same graceful fallback as the boards list: keep the old static list
      // if the content service can't be reached.
      .catch(() => setClasses(Array.from({ length: 12 }, (_, i) => i + 1)))
      .finally(() => setClassesLoading(false));
  }, [selectedBoardId]);

  const handleSubmit = async () => {
    if (!fullName.trim()) {
      setError("Full name is required.");
      return;
    }
    if (isStudent && (!board || !classNum)) {
      setError("Please select your Board and Class.");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      await userApi.createProfile({
        user_id: user!.id,
        full_name: fullName.trim(),
        school_name: schoolName.trim() || undefined,
        board: isStudent ? board : undefined,
        class_number: isStudent ? classNum! : undefined,
      });
      await authApi.updateProfile({
        full_name: fullName.trim(),
        school_name: schoolName.trim() || undefined,
      });
      const updated = { full_name: fullName.trim(), school_name: schoolName.trim() || null };
      dispatch(updateUser(updated));
      if (user) await AsyncStorage.setItem("auth_user", JSON.stringify({ ...user, ...updated }));
      dispatch(setProfileComplete(true));
      Toast.show({ type: "success", text1: "Profile complete!", text2: "Welcome to EduAI." });
      onDone();
    } catch (err: any) {
      setError(err?.response?.data?.detail || "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" />
      <View style={styles.topGrad}>
        <Text style={styles.headText}>Complete your profile</Text>
        <Text style={styles.subText}>Just a few details before you get started</Text>
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.formWrapper}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.card}>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Full Name *</Text>
              <View style={styles.inputRow}>
                <TextInput
                  style={styles.input}
                  placeholder="Your full name"
                  placeholderTextColor={palette.gray400}
                  value={fullName}
                  onChangeText={(v) => { setFullName(v); setError(null); }}
                  autoFocus
                />
              </View>
            </View>

            {isStudent && (
              <>
                <View style={styles.inputGroup}>
                  <Text style={styles.label}>School Name (optional)</Text>
                  <View style={styles.inputRow}>
                    <TextInput
                      style={styles.input}
                      placeholder="e.g. Delhi Public School"
                      placeholderTextColor={palette.gray400}
                      value={schoolName}
                      onChangeText={setSchoolName}
                    />
                  </View>
                </View>

                <DropdownField
                  label="Board *"
                  value={board || null}
                  placeholder="Select your board"
                  options={boards.map((b: any) => ({ key: String(b.id), label: b.name }))}
                  onSelect={(label) => setBoard(label)}
                />
                <DropdownField
                  label="Class *"
                  value={classNum ? `Class ${classNum}` : null}
                  placeholder={!board ? "Select board first" : classesLoading ? "Loading classes…" : classes.length === 0 ? "No classes available for this board" : "Select your class"}
                  options={classes.map((n) => ({ key: String(n), label: `Class ${n}` }))}
                  onSelect={(_, key) => setClassNum(Number(key))}
                />
              </>
            )}

            {error && (
              <View style={styles.errorBox}>
                <Ionicons name="alert-circle-outline" size={14} color={palette.danger600} />
                <Text style={styles.errorTxt}>{error}</Text>
              </View>
            )}

            <TouchableOpacity
              onPress={handleSubmit}
              disabled={loading}
              activeOpacity={0.85}
              style={[styles.btn, loading && styles.btnDisabled]}
            >
              {loading
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={styles.btnTxt}>Continue</Text>
              }
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function DropdownField({ label, value, placeholder, options, onSelect }: {
  label: string;
  value: string | null;
  placeholder: string;
  options: { key: string; label: string }[];
  onSelect: (label: string, key: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <View>
      <Text style={pickerStyles.label}>{label}</Text>
      <TouchableOpacity style={pickerStyles.select} onPress={() => setOpen(true)} activeOpacity={0.8}>
        <Text style={[pickerStyles.selectTxt, !value && { color: palette.gray400 }]}>{value ?? placeholder}</Text>
        <Ionicons name="chevron-down" size={16} color={palette.gray500} />
      </TouchableOpacity>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <TouchableOpacity style={pickerStyles.overlay} activeOpacity={1} onPress={() => setOpen(false)}>
          <View style={pickerStyles.sheet}>
            <Text style={pickerStyles.sheetTitle}>{label.replace(" *", "")}</Text>
            <ScrollView style={{ maxHeight: 340 }}>
              {options.map((o) => (
                <TouchableOpacity
                  key={o.key}
                  style={[pickerStyles.option, value === o.label && pickerStyles.optionOn]}
                  onPress={() => { onSelect(o.label, o.key); setOpen(false); }}
                >
                  <Text style={[pickerStyles.optionTxt, value === o.label && pickerStyles.optionTxtOn]}>{o.label}</Text>
                  {value === o.label && <Ionicons name="checkmark" size={16} color={palette.primary600} />}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  safe:        { flex: 1, backgroundColor: "#fff" },
  topGrad:     { backgroundColor: palette.primary600, paddingTop: spacing["2xl"], paddingBottom: spacing["4xl"], paddingHorizontal: spacing["2xl"] },
  headText:    { color: "#fff", ...typography.h1, marginBottom: spacing.xs },
  subText:     { color: "rgba(255,255,255,0.75)", ...typography.body },
  formWrapper: { flex: 1, marginTop: -28 },
  scroll:      { padding: spacing.lg },
  card:        { backgroundColor: "#fff", borderRadius: radius.xl, padding: spacing["2xl"], borderWidth: 1, borderColor: palette.gray100, ...cardShadowElevated },
  inputGroup:  { marginBottom: spacing.lg },
  label:       { ...typography.bodyMedium, color: palette.gray700, marginBottom: spacing.xs + 2 },
  inputRow:    { flexDirection: "row", alignItems: "center", backgroundColor: palette.gray50, borderWidth: 1.5, borderColor: palette.gray200, borderRadius: radius.md, paddingHorizontal: spacing.md },
  input:       { flex: 1, height: 48, fontSize: typography.bodyLg.fontSize, color: palette.gray900 },
  errorBox:    { flexDirection: "row", alignItems: "center", gap: spacing.sm, backgroundColor: palette.danger50, borderWidth: 1, borderColor: "#FCA5A5", borderRadius: radius.sm + 2, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, marginBottom: spacing.md + 2 },
  errorTxt:    { ...typography.bodySm, color: palette.danger600, flex: 1 },
  btn:         { borderRadius: radius.lg, paddingVertical: spacing.lg, alignItems: "center", marginTop: spacing.sm, backgroundColor: palette.primary600, minHeight: 48 },
  btnDisabled: { backgroundColor: palette.primary300 },
  btnTxt:      { color: "#fff", ...typography.bodyLg, fontWeight: "700" },
});

const pickerStyles = StyleSheet.create({
  label: { ...typography.bodyMedium, fontWeight: "700", color: palette.gray700, marginTop: spacing.xs, marginBottom: spacing.sm },
  select: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderWidth: 1.5, borderColor: palette.gray200, borderRadius: radius.md, paddingHorizontal: spacing.md + 2, paddingVertical: spacing.md, backgroundColor: "#fff", marginBottom: spacing.lg, minHeight: 48 },
  selectTxt: { ...typography.bodyMedium, color: palette.gray900, fontWeight: "600" },
  overlay: { flex: 1, backgroundColor: "rgba(17,24,39,0.5)", alignItems: "center", justifyContent: "center", padding: spacing["3xl"] - 4 },
  sheet: { width: "100%", maxWidth: 360, backgroundColor: "#fff", borderRadius: radius.lg, padding: spacing.lg },
  sheetTitle: { ...typography.h4, color: palette.gray900, marginBottom: spacing.sm + 2 },
  option: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: spacing.md, paddingHorizontal: spacing.sm + 2, borderRadius: radius.sm + 2, minHeight: 44 },
  optionOn: { backgroundColor: palette.primary50 },
  optionTxt: { ...typography.bodyMedium, color: palette.gray700, fontWeight: "600" },
  optionTxtOn: { color: palette.primary600, fontWeight: "800" },
});
