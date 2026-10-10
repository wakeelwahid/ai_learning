import React, { useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  SafeAreaView, StatusBar, Linking,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation, useRoute } from "@react-navigation/native";
import { useQuery } from "@tanstack/react-query";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useAppSelector } from "@/store";
import { useLanguage } from "@/contexts/LanguageContext";
import { fmt } from "@/i18n/format";
import { useStudyTime } from "@/hooks/useStudyTime";
import { contentApi } from "@/api/content";
import VideoPlayer from "@/components/VideoPlayer";
import UpgradePrompt from "@/components/ui/UpgradePrompt";
import { palette, semantic } from "@/theme/colors";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUUID = (v?: string) => !!v && UUID_RE.test(v);

// Standalone, deep-linkable version of what used to be DashboardScreen's
// inline video-player Modal — same player, notes-unlock, and playlist
// behavior, but reachable as a real Stack.Screen (route params: either a
// full `video` object, matching every existing call site's `{video}` param
// shape, or just a `videoId`, resolved here via contentApi.getVideoById for
// deep-link entry points that only have an id).
export default function VideoPlayerScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { t } = useLanguage();
  const user = useAppSelector((s) => s.auth.user);
  const userId = user?.id ?? (user as any)?.user_id ?? "";
  const { blocked: studyBlocked, limitMinutes: studyLimitMinutes } = useStudyTime();

  const { video: initialVideo, videoId } = route.params ?? {};

  const [video, setVideo] = useState<any>(initialVideo ?? null);
  const [progress, setProgress] = useState<any>(null);
  const [watched, setWatched] = useState(false);
  const [notesUnlocked, setNotesUnlocked] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [quotaMessage, setQuotaMessage] = useState<string | null>(null);

  // Deep-link entry with only an id — fetch the full video record before rendering.
  React.useEffect(() => {
    if (initialVideo || !videoId) return;
    contentApi.getVideoById(videoId).then((r) => setVideo(r.data)).catch((err: any) => {
      // 402 = premium video, no active subscription — show the upgrade prompt
      // instead of silently bouncing the user back.
      if (err?.response?.status === 402) {
        setQuotaMessage(err.response.data?.detail ?? "This video is part of a premium plan. Subscribe to watch.");
      } else {
        navigation.goBack();
      }
    });
  }, [videoId, initialVideo, navigation]);

  React.useEffect(() => {
    if (!video?.youtube_id) return;
    if (studyBlocked) {
      setBlocked(true);
      return;
    }
    if (!userId || !video?.id) return;

    const startedSec = Math.floor((video.duration_seconds ?? 300) * 0.1);
    contentApi.updateProgress(video.id, startedSec, false, userId, {
      position_seconds: 0,
      status: "in_progress",
    }).catch(() => {});
    AsyncStorage.setItem(
      `edulearn_vstarted_${video.id}`,
      JSON.stringify({ ts: Date.now(), ytId: video.youtube_id })
    ).catch(() => {});

    if (isUUID(video.id) && contentApi.videoProgress) {
      contentApi.videoProgress(video.id, userId)
        .then((r) => {
          setProgress(r.data ?? null);
          if ((r.data as any)?.is_completed) setWatched(true);
          if ((r.data as any)?.is_completed || (r.data as any)?.notes_unlocked) setNotesUnlocked(true);
        })
        .catch((err: any) => {
          if (err?.response?.status === 429 && err.response.data?.detail) {
            setQuotaMessage(err.response.data.detail);
          }
        });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [video?.id]);

  const handleProgress = (seconds: number, isCompleted: boolean) => {
    if (isCompleted && !watched) setWatched(true);
    if (!notesUnlocked && (isCompleted || (video?.duration_seconds && seconds / video.duration_seconds >= 0.7))) {
      setNotesUnlocked(true);
    }
  };

  const handleProgressSync = (seconds: number, isCompleted: boolean) => {
    if (!userId || !video?.id) return;
    contentApi.updateProgress(video.id, seconds, isCompleted, userId, {
      position_seconds: seconds,
      status: isCompleted ? "completed" : "playing",
    }).catch(() => {});
  };

  const chapterId: string | null = video?.chapter_id ?? null;
  const { data: chapterVidsData } = useQuery({
    queryKey: ["player-chapter-videos", chapterId],
    queryFn: () => contentApi.chapterVideos(chapterId!).then((r) => r.data),
    enabled: !!chapterId,
    staleTime: 5 * 60_000,
  });
  const { data: trendingData } = useQuery({
    queryKey: ["trending-videos"],
    queryFn: () => contentApi.popularVideos().then((r) => r.data),
    staleTime: 5 * 60_000,
    enabled: !chapterId,
  });

  const playlist: any[] = (Array.isArray(chapterVidsData) ? chapterVidsData : (chapterVidsData as any)?.videos ?? [])
    .filter((v: any) => v.id !== video?.id)
    .slice(0, 8);
  const moreVideos: any[] = (trendingData?.videos ?? [])
    .filter((v: any) => v.id !== video?.id && v.youtube_id)
    .slice(0, 8);

  const openSibling = (v: any) => {
    setVideo({
      ...v,
      chapter_id: video?.chapter_id,
      subject: v.subject ?? video?.subject,
      chapter: v.chapter ?? video?.chapter,
    });
    setProgress(null);
    setWatched(false);
    setNotesUnlocked(false);
    setShowNotes(false);
  };

  if (blocked) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: "#fff" }}>
        <View style={styles.modalHeader}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={{ marginRight: 12 }}>
            <Ionicons name="arrow-back" size={24} color={palette.gray700} />
          </TouchableOpacity>
          <Text style={styles.modalHeaderTxt}>Study limit reached</Text>
        </View>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24 }}>
          <Text style={{ textAlign: "center", color: palette.gray500 }}>
            {fmt(t("studyLimitReachedTitle"), { limit: studyLimitMinutes ?? 0 })}
            {"\n"}
            {t("studyLimitBlockVideo")}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  if (quotaMessage) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: "#fff" }}>
        <View style={styles.modalHeader}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={{ marginRight: 12 }}>
            <Ionicons name="arrow-back" size={24} color={palette.gray700} />
          </TouchableOpacity>
          <Text style={styles.modalHeaderTxt}>Today's videos</Text>
        </View>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24 }}>
          <UpgradePrompt message={quotaMessage} />
        </View>
      </SafeAreaView>
    );
  }

  if (!video) return null;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#fff" }}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.modalHeader}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={{ marginRight: 12 }}>
          <Ionicons name="arrow-back" size={24} color={palette.gray700} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.modalHeaderTxt} numberOfLines={1}>{video.title}</Text>
          <Text style={{ fontSize: 12, color: palette.gray500, marginTop: 1 }}>
            {watched
              ? "Completed"
              : (progress?.last_position_seconds ?? 0) > 5
              ? `Resuming · ${Math.round(progress?.completion_percentage ?? 0)}% watched`
              : "In progress"}
          </Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 32 }}>
        <VideoPlayer
          youtubeId={video.youtube_id}
          youtubeIdHi={video.youtube_id_hi}
          initialPositionSeconds={progress?.last_position_seconds ?? 0}
          onProgress={handleProgress}
          onProgressSync={handleProgressSync}
        />

        {video.chapter_id ? (
          <>
            <View style={styles.pvCard}>
              <View style={styles.pvHeader}>
                <Ionicons
                  name={!video.notes_url ? "document-text-outline" : notesUnlocked ? "document-text" : "lock-closed"}
                  size={18}
                  color={notesUnlocked ? semantic.success.solid : palette.gray400}
                />
                <Text style={styles.pvTitle}>Notes</Text>
              </View>
              {!video.notes_url ? (
                <Text style={styles.pvEmpty}>No notes added for this video</Text>
              ) : !notesUnlocked ? (
                <Text style={styles.pvHint}>Notes unlock automatically once you've watched 70% of the video.</Text>
              ) : (
                <>
                  <TouchableOpacity style={styles.pvNotesRow} activeOpacity={0.85} onPress={() => setShowNotes((v) => !v)}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.pvNotesTitle}>{showNotes ? "Hide notes" : "View notes"}</Text>
                      <Text style={styles.pvNotesSub}>Unlocked · tap to {showNotes ? "collapse" : "expand"}</Text>
                    </View>
                    <Ionicons name={showNotes ? "chevron-up-circle" : "chevron-down-circle"} size={24} color={semantic.success.solid} />
                  </TouchableOpacity>
                  {showNotes && (
                    <TouchableOpacity activeOpacity={0.85} onPress={() => Linking.openURL(video.notes_url)}>
                      <View style={[styles.pvNotesBtn, { backgroundColor: semantic.success.solid }]}>
                        <Ionicons name="open-outline" size={16} color="#fff" />
                        <Text style={styles.pvNotesBtnTxt}>Open / Download Notes</Text>
                      </View>
                    </TouchableOpacity>
                  )}
                </>
              )}
            </View>

            {playlist.length > 0 && (
              <View style={styles.pvCard}>
                <View style={styles.pvHeader}>
                  <Ionicons name="list" size={18} color={palette.primary600} />
                  <Text style={styles.pvTitle}>Playlist</Text>
                  <View style={styles.pvCount}><Text style={styles.pvCountTxt}>{playlist.length}</Text></View>
                </View>
                {playlist.map((v: any) => (
                  <TouchableOpacity key={v.id} style={styles.pvRow} activeOpacity={0.8} onPress={() => openSibling(v)}>
                    <Ionicons name="play-circle-outline" size={20} color={palette.primary600} />
                    <Text style={styles.pvRowTitle} numberOfLines={1}>{v.title}</Text>
                    <Ionicons name="chevron-forward" size={16} color={palette.gray400} />
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </>
        ) : (
          moreVideos.length > 0 && (
            <View style={styles.pvCard}>
              <View style={styles.pvHeader}>
                <Ionicons name="flame" size={18} color={semantic.warning.solid} />
                <Text style={styles.pvTitle}>More Videos</Text>
                <View style={styles.pvCount}><Text style={styles.pvCountTxt}>{moreVideos.length}</Text></View>
              </View>
              {moreVideos.map((v: any) => (
                <TouchableOpacity key={v.id} style={styles.pvRow} activeOpacity={0.8} onPress={() => openSibling(v)}>
                  <Ionicons name="play-circle-outline" size={20} color={semantic.warning.solid} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.pvRowTitle} numberOfLines={1}>{v.title}</Text>
                    {!!v.subject && (
                      <Text style={styles.pvRowSub} numberOfLines={1}>
                        {v.subject}{v.chapter ? ` · ${v.chapter}` : ""}
                      </Text>
                    )}
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={palette.gray400} />
                </TouchableOpacity>
              ))}
            </View>
          )
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  modalHeader:    { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: palette.gray100, backgroundColor: "#fff" },
  modalHeaderTxt: { fontSize: 16, fontWeight: "700", color: palette.gray800 },
  pvCard:        { backgroundColor: "#fff", borderRadius: 20, padding: 16, borderWidth: 1, borderColor: palette.gray100, shadowColor: "#0F172A", shadowOpacity: 0.05, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  pvHeader:      { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 },
  pvTitle:       { fontSize: 13, fontWeight: "700", color: palette.gray700, flex: 1 },
  pvCount:       { backgroundColor: palette.gray100, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 },
  pvCountTxt:    { fontSize: 11, fontWeight: "700", color: palette.gray500 },
  pvEmpty:       { fontSize: 13, color: palette.gray400, textAlign: "center", paddingVertical: 12 },
  pvHint:        { fontSize: 11, color: palette.gray400, textAlign: "center", marginTop: 10, lineHeight: 15 },
  pvNotesRow:    { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: palette.gray50, borderRadius: 14, padding: 14 },
  pvNotesTitle:  { fontSize: 13, fontWeight: "700", color: palette.gray900 },
  pvNotesSub:    { fontSize: 11, color: palette.gray500, marginTop: 2 },
  pvNotesBtn:    { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 12, paddingVertical: 12, marginTop: 10 },
  pvNotesBtnTxt: { color: "#fff", fontSize: 13, fontWeight: "700" },
  pvRow:         { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: palette.gray100 },
  pvRowTitle:    { flex: 1, fontSize: 13, fontWeight: "600", color: palette.gray900 },
  pvRowSub:      { fontSize: 11, color: palette.gray500, marginTop: 1 },
});
