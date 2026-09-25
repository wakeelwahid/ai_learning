import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { useNavigation } from "@react-navigation/native";
import { palette } from "@/theme/colors";
import { contentApi } from "@/api/content";

interface AssignmentItem {
  assignment_id: string;
  title: string;
  description: string | null;
  entity_type: "chapter" | "exercise";
  entity_id: string;
  entity_title: string | null;
  subject_name: string | null;
  due_at: string | null;
  is_completed: boolean;
  completed_at: string | null;
  is_overdue: boolean;
}

function fmtDue(iso: string | null): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/**
 * Real, backend-derived assignments for the current student (mirrors the
 * web frontend's AssignmentsCard). Renders nothing when there are none, so
 * it's safe to drop into any screen without a loading flash for students
 * who were never assigned anything.
 */
export default function AssignmentsCard({ studentId }: { studentId?: string }) {
  const navigation = useNavigation<any>();
  const { data } = useQuery({
    queryKey: ["student-assignments", studentId],
    queryFn: () => contentApi.studentAssignments(studentId!).then((r) => r.data),
    enabled: !!studentId,
  });

  const assignments: AssignmentItem[] = data?.assignments ?? [];
  if (assignments.length === 0) return null;

  // The Learn tab doesn't support deep-linking to a specific chapter/exercise
  // today, so this opens the content browser rather than a param nothing reads.
  const goToLearn = () => navigation.navigate("Learn");

  return (
    <View style={s.wrapper}>
    <View style={s.card}>
      <View style={s.header}>
        <View style={s.headerLeft}>
          <Ionicons name="clipboard-outline" size={16} color={palette.primary600} />
          <Text style={s.title}>My Assignments</Text>
        </View>
        <Text style={s.count}>{data.completed}/{data.total} done</Text>
      </View>

      {assignments.slice(0, 6).map((a) => (
        <TouchableOpacity key={a.assignment_id} style={s.row} onPress={goToLearn} activeOpacity={0.7}>
          <Ionicons
            name={a.is_completed ? "checkmark-circle" : a.is_overdue ? "alert-circle" : "ellipse-outline"}
            size={18}
            color={a.is_completed ? "#22C55E" : a.is_overdue ? "#EF4444" : "#D1D5DB"}
            style={{ marginTop: 1 }}
          />
          <View style={s.rowInfo}>
            <Text style={[s.rowTitle, a.is_completed && s.rowTitleDone]} numberOfLines={1}>{a.title}</Text>
            <Text style={s.rowSub} numberOfLines={1}>
              {[a.subject_name, a.entity_title].filter(Boolean).join(" · ")}
              {a.due_at && !a.is_completed && (
                <Text style={a.is_overdue ? s.overdueTxt : undefined}> · Due {fmtDue(a.due_at)}</Text>
              )}
            </Text>
          </View>
        </TouchableOpacity>
      ))}
    </View>
    </View>
  );
}

const s = StyleSheet.create({
  wrapper: { paddingHorizontal: 16, marginBottom: 16 },
  card: { backgroundColor: "#fff", borderRadius: 16, padding: 14, borderWidth: 1, borderColor: "#F3F4F6", gap: 4 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
  headerLeft: { flexDirection: "row", alignItems: "center", gap: 6 },
  title: { fontSize: 14, fontWeight: "700", color: "#111827" },
  count: { fontSize: 12, fontWeight: "600", color: "#9CA3AF" },
  row: { flexDirection: "row", alignItems: "flex-start", gap: 8, paddingVertical: 8, borderTopWidth: 1, borderTopColor: "#F9FAFB" },
  rowInfo: { flex: 1, minWidth: 0 },
  rowTitle: { fontSize: 13, fontWeight: "600", color: "#1F2937" },
  rowTitleDone: { color: "#9CA3AF", textDecorationLine: "line-through" },
  rowSub: { fontSize: 11.5, color: "#9CA3AF", marginTop: 1 },
  overdueTxt: { color: "#EF4444", fontWeight: "700" },
});
