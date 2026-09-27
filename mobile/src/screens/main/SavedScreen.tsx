import React, { useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  SafeAreaView, StatusBar, ActivityIndicator, Image, FlatList,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { contentApi } from "@/api/content";
import { useAppSelector } from "@/store";
import BookmarkButton from "@/components/BookmarkButton";
import { EmptyState } from "@/components/ui";
import { palette, radius, spacing, typography } from "@/theme/colors";

interface BookmarkedVideo {
  bookmark_id: string;
  video_id: string;
  title: string;
  youtube_id: string;
  duration_seconds: number;
  thumbnail_url: string | null;
  chapter_name: string | null;
  subject_name: string | null;
}

interface BookmarkedNote {
  bookmark_id: string;
  note_id: string;
  title: string;
  note_type: string;
  is_premium: boolean;
  chapter_name: string | null;
  subject_name: string | null;
}

function fmtDur(s: number): string {
  const m = Math.floor(s / 60), sec = s % 60;
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}:${String(sec).padStart(2, "0")}`;
}

function VideoRow({ video, onOpen, onToggled }: { video: BookmarkedVideo; onOpen: () => void; onToggled: () => void }) {
  const thumb = video.thumbnail_url || (video.youtube_id ? `https://img.youtube.com/vi/${video.youtube_id}/mqdefault.jpg` : null);
  return (
    <TouchableOpacity style={s.row} onPress={onOpen} activeOpacity={0.8}>
      <View style={s.thumbWrap}>
        {thumb ? (
          <Image source={{ uri: thumb }} style={s.thumb} />
        ) : (
          <View style={[s.thumb, s.thumbFallback]}>
            <Ionicons name="play-circle" size={22} color="#fff" />
          </View>
        )}
        {video.duration_seconds > 0 && (
          <View style={s.durBadge}>
            <Text style={s.durBadgeTxt}>{fmtDur(video.duration_seconds)}</Text>
          </View>
        )}
      </View>
      <View style={s.rowInfo}>
        <Text style={s.rowTitle} numberOfLines={2}>{video.title}</Text>
        <Text style={s.rowSub} numberOfLines={1}>
          {[video.subject_name, video.chapter_name].filter(Boolean).join(" · ")}
        </Text>
      </View>
      <BookmarkButton entityType="video" entityId={video.video_id} initialBookmarked={true} size={20} onToggled={onToggled} />
    </TouchableOpacity>
  );
}

function NoteRow({ note, onToggled }: { note: BookmarkedNote; onToggled: () => void }) {
  return (
    <View style={s.row}>
      <View style={[s.thumbWrap, s.noteIconWrap]}>
        <Ionicons name="document-text" size={22} color={palette.primary600} />
      </View>
      <View style={s.rowInfo}>
        <Text style={s.rowTitle} numberOfLines={2}>{note.title}</Text>
        <Text style={s.rowSub} numberOfLines={1}>
          {[note.subject_name, note.chapter_name].filter(Boolean).join(" · ")}
        </Text>
      </View>
      <BookmarkButton entityType="note" entityId={note.note_id} initialBookmarked={true} size={20} onToggled={onToggled} />
    </View>
  );
}

export default function SavedScreen() {
  const navigation = useNavigation<any>();
  const queryClient = useQueryClient();
  const userId = useAppSelector((s) => s.auth.user?.id) ?? "";
  const [tab, setTab] = useState<"videos" | "notes">("videos");

  const { data, isLoading } = useQuery({
    queryKey: ["myBookmarks", userId],
    queryFn: () => contentApi.myBookmarks(userId).then((r) => r.data),
    enabled: !!userId,
  });

  const videos: BookmarkedVideo[] = data?.videos ?? [];
  const notes: BookmarkedNote[] = data?.notes ?? [];
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["myBookmarks", userId] });

  const openVideo = (video: BookmarkedVideo) => {
    navigation.navigate("Learn" as never, { openVideo: video } as never);
  };

  return (
    <SafeAreaView style={s.safe}>
      <StatusBar barStyle="light-content" />
      <View style={[s.header, { backgroundColor: palette.primary600 }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
          <Ionicons name="arrow-back" size={20} color="#fff" />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Saved for Later</Text>
        <View style={{ width: 36 }} />
      </View>

      <View style={s.tabRow}>
        {([
          { key: "videos", label: "Videos", count: videos.length },
          { key: "notes", label: "Notes", count: notes.length },
        ] as const).map((t) => (
          <TouchableOpacity
            key={t.key}
            onPress={() => setTab(t.key)}
            style={[s.tabBtn, tab === t.key && s.tabBtnActive]}
          >
            <Text style={[s.tabTxt, tab === t.key && s.tabTxtActive]}>{t.label} ({t.count})</Text>
          </TouchableOpacity>
        ))}
      </View>

      {isLoading ? (
        <View style={s.loading}>
          <ActivityIndicator color={palette.primary600} />
        </View>
      ) : tab === "videos" ? (
        videos.length === 0 ? (
          <EmptyState icon="bookmark-outline" title="No saved videos yet" description="Tap the bookmark icon on any video to save it here." />
        ) : (
          <FlatList
            data={videos}
            keyExtractor={(v) => v.bookmark_id}
            contentContainerStyle={s.list}
            renderItem={({ item }) => <VideoRow video={item} onOpen={() => openVideo(item)} onToggled={invalidate} />}
          />
        )
      ) : notes.length === 0 ? (
        <EmptyState icon="document-text-outline" title="No saved notes yet" description="Tap the bookmark icon on any chapter note to save it here." />
      ) : (
        <FlatList
          data={notes}
          keyExtractor={(n) => n.bookmark_id}
          contentContainerStyle={s.list}
          renderItem={({ item }) => <NoteRow note={item} onToggled={invalidate} />}
        />
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: palette.gray50 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingTop: spacing.md, paddingBottom: spacing.lg, paddingHorizontal: spacing.lg },
  backBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(255,255,255,0.15)", alignItems: "center", justifyContent: "center" },
  headerTitle: { color: "#fff", ...typography.h4 },

  tabRow: { flexDirection: "row", paddingHorizontal: spacing.lg, paddingTop: spacing.md, gap: spacing.sm },
  tabBtn: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.sm, backgroundColor: "#fff", borderWidth: 1, borderColor: palette.gray200, minHeight: 40 },
  tabBtnActive: { backgroundColor: palette.primary600, borderColor: palette.primary600 },
  tabTxt: { fontSize: 13, fontWeight: "700", color: palette.gray500 },
  tabTxtActive: { color: "#fff" },

  loading: { flex: 1, alignItems: "center", justifyContent: "center" },
  list: { padding: spacing.lg, gap: spacing.sm },

  row: { flexDirection: "row", alignItems: "center", backgroundColor: "#fff", borderRadius: radius.lg, padding: spacing.sm, gap: spacing.sm, borderWidth: 1, borderColor: palette.gray100, minHeight: 44 },
  thumbWrap: { width: 72, height: 48, borderRadius: radius.sm, overflow: "hidden", backgroundColor: palette.gray200 },
  thumb: { width: "100%", height: "100%" },
  thumbFallback: { alignItems: "center", justifyContent: "center", backgroundColor: palette.primary600 },
  noteIconWrap: { alignItems: "center", justifyContent: "center", backgroundColor: palette.primary50 },
  durBadge: { position: "absolute", bottom: 3, right: 3, backgroundColor: "rgba(0,0,0,0.75)", paddingHorizontal: 4, paddingVertical: 1, borderRadius: 4 },
  durBadgeTxt: { color: "#fff", fontSize: 9, fontWeight: "700" },
  rowInfo: { flex: 1, minWidth: 0 },
  rowTitle: { fontSize: 13.5, fontWeight: "700", color: palette.gray900, lineHeight: 18 },
  rowSub: { fontSize: 11.5, color: palette.gray400, marginTop: 2 },
});
