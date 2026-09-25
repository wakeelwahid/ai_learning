import React, { useState, useEffect, useRef } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  SafeAreaView, StatusBar, TextInput, ActivityIndicator, Linking, Modal,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import { useRoute, useNavigation } from "@react-navigation/native";
import Toast from "react-native-toast-message";
import { useLanguage } from "@/contexts/LanguageContext";
import { fmt } from "@/i18n/format";
import { contentApi } from "@/api/content";
import { useAppSelector } from "@/store";
import { useStudyHeartbeat } from "@/hooks/useStudyHeartbeat";
import { useStudyTime } from "@/hooks/useStudyTime";
import StudyLimitBanner from "@/components/StudyLimitBanner";
import VideoPlayer from "@/components/VideoPlayer";
import BookmarkButton from "@/components/BookmarkButton";
import { palette, accentSolid, semantic, cardShadow } from "@/theme/colors";
import { EmptyState } from "@/components/ui";

// ── Subject icon/color map (UI decoration only — no content data) ─────────────
// `tint` = solid accent fill (from theme accentSolid) used for the subject's
// icon badge — the design system drops decorative gradients, so every badge
// below renders as a flat solid-color View instead of a LinearGradient.
// `color` is kept as the subject's semantic accent (used for small text/badges).
const SUBJECT_UI: Record<string, { icon: string; color: string; tint: string }> = {
  mathematics:    { icon: "calculator", color: palette.primary600, tint: accentSolid.indigo },
  physics:        { icon: "magnet",     color: "#0891B2", tint: accentSolid.cyan },
  chemistry:      { icon: "flask",      color: semantic.danger.solid, tint: accentSolid.rose },
  biology:        { icon: "leaf",       color: semantic.success.solid, tint: accentSolid.emerald },
  english:        { icon: "book",       color: "#7C3AED", tint: accentSolid.violet },
  history:        { icon: "time",       color: semantic.warning.solid, tint: accentSolid.amber },
  geography:      { icon: "globe",      color: "#0D9488", tint: accentSolid.teal },
  "computer sci.":{ icon: "laptop",     color: "#6366F1", tint: accentSolid.fuchsia },
  "computer science": { icon: "laptop", color: "#6366F1", tint: accentSolid.fuchsia },
};
const DEFAULT_SUBJECT_UI = { icon: "school", color: palette.gray500, tint: accentSolid.indigo };

function getSubjectUI(name: string) {
  const key = name.toLowerCase();
  return (
    SUBJECT_UI[key] ??
    Object.entries(SUBJECT_UI).find(([k]) => key.includes(k))?.[1] ??
    DEFAULT_SUBJECT_UI
  );
}

// Rotates through the shared accent solids for list-row icon badges so a
// long list doesn't repeat the same color on every row.
const ROW_TINTS = [
  accentSolid.indigo, accentSolid.emerald, accentSolid.fuchsia, accentSolid.amber,
  accentSolid.cyan, accentSolid.rose, accentSolid.teal, accentSolid.violet,
] as const;
const rowTint = (i: number) => ROW_TINTS[i % ROW_TINTS.length];

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUUID = (v?: string) => !!v && UUID_RE.test(v);

// Difficulty badge colors — used for Topic.difficulty (topics carry this field in the
// API; Chapter responses do not — see LearnScreen chapter list comment below).
const DIFF_COLORS: Record<string, { bg: string; fg: string }> = {
  easy:   { bg: semantic.success.bg, fg: semantic.success.text },
  medium: { bg: semantic.warning.bg, fg: semantic.warning.text },
  hard:   { bg: semantic.danger.bg, fg: semantic.danger.text },
};
function DifficultyBadge({ level }: { level?: string | null }) {
  if (!level) return null;
  const key = String(level).toLowerCase();
  const c = DIFF_COLORS[key] ?? DIFF_COLORS.medium;
  return (
    <View style={[styles.diffBadge, { backgroundColor: c.bg }]}>
      <Text style={[styles.diffBadgeTxt, { color: c.fg }]}>{key.charAt(0).toUpperCase() + key.slice(1)}</Text>
    </View>
  );
}

// ── Types ─────────────────────────────────────────────────────────────────────
type ChapterStep = "board" | "class" | "subject" | "chapter" | "topics" | "exercises" | "questions" | "question-detail" | "practice-quiz";
type PQMode = "practice" | "quiz";
type PQLevel = "exercise" | "chapter" | "question" | "subject";

export default function LearnScreen() {
  const { t } = useLanguage();
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const userId = useAppSelector((s) => s.auth.user?.id) ?? "";

  const [search, setSearch] = useState("");

  // ── Dynamic Board → Class selection (was hardcoded to CBSE / Class 10) ─────
  const [apiBoards, setApiBoards] = useState<any[]>([]);
  const [boardsLoading, setBoardsLoading] = useState(false);
  const [selectedBoard, setSelectedBoard] = useState<any | null>(null);

  const [apiClasses, setApiClasses] = useState<any[]>([]);
  const [classesLoading, setClassesLoading] = useState(false);
  const [selectedClass, setSelectedClass] = useState<any | null>(null);

  // API-driven subject list (replaces hardcoded SUBJECTS)
  const [apiSubjects, setApiSubjects] = useState<any[]>([]);
  const [subjectsLoading, setSubjectsLoading] = useState(false);
  const [selectedSubject, setSelectedSubject] = useState<any | null>(null); // full subject object from API

  // Flow state
  const [selectedChapter, setSelectedChapter] = useState<{ id: string; title: string } | null>(null);
  const [selectedExercise, setSelectedExercise] = useState<any>(null);
  const [selectedQuestion, setSelectedQuestion] = useState<any>(null);
  // Flow root is SUBJECT — board & class come from the student's profile
  // (mandatory at registration), never from an in-screen picker.
  const [chapterStep, setChapterStep] = useState<ChapterStep>("subject");
  const [myBoardClass, setMyBoardClass] = useState<{ board: string; class_num: number } | null>(null);
  const [profileMissing, setProfileMissing] = useState(false);

  // ── Topics step (video / notes / practice groupings for a chapter) ─────────
  const [apiTopics, setApiTopics] = useState<any[]>([]);
  const [topicsLoading, setTopicsLoading] = useState(false);
  const [topicVideos, setTopicVideos] = useState<Record<string, any[]>>({});
  const [chapterNotes, setChapterNotes] = useState<any[]>([]);

  // ── Embedded video player modal ─────────────────────────────────────────────
  const [playerVideo, setPlayerVideo] = useState<any | null>(null); // full video object being played
  const [playerVisible, setPlayerVisible] = useState(false);
  const [playerProgress, setPlayerProgress] = useState<any | null>(null); // saved progress from API
  const [playerBookmarked, setPlayerBookmarked] = useState(false);
  const [notesUnlocked, setNotesUnlocked] = useState(false);
  const [showInlineNotes, setShowInlineNotes] = useState(false);
  const [chapterAllVideos, setChapterAllVideos] = useState<any[]>([]);

  // Study-time (F2): heartbeat only while the player is open AND the embed is
  // reporting playhead ticks (it only posts "time" while playing).
  const lastPlayTickRef = useRef(0);
  const { blocked: studyBlocked, limitMinutes: studyLimitMinutes } = useStudyTime();
  useStudyHeartbeat(playerVisible, () => Date.now() - lastPlayTickRef.current < 5_000);

  // API data
  const [exercises, setExercises] = useState<any[]>([]);
  const [directQuestions, setDirectQuestions] = useState<any[]>([]);
  const [excQuestions, setExcQuestions] = useState<any[]>([]);
  const [questionVideo, setQuestionVideo] = useState<any>(null);
  const [contentLoading, setContentLoading] = useState(false);

  // Progress / unlock
  const [exerciseUnlocked, setExerciseUnlocked] = useState(false);
  const [exercisePct, setExercisePct] = useState(0);
  const [chapterUnlocked, setChapterUnlocked] = useState(false);
  const [chapterPct, setChapterPct] = useState(0);
  const [subjectUnlocked, setSubjectUnlocked] = useState(false);
  const [subjectPct, setSubjectPct] = useState(0);
  const [videoWatched, setVideoWatched] = useState(false);

  // Practice / Quiz step
  const [pqMode, setPqMode] = useState<PQMode>("practice");
  const [pqLevel, setPqLevel] = useState<PQLevel>("exercise");
  const [pqTitle, setPqTitle] = useState("");
  const [pqEntityId, setPqEntityId] = useState("");
  const [pqItems, setPqItems] = useState<any[]>([]);
  const [pqLoading, setPqLoading] = useState(false);
  const [pqSelected, setPqSelected] = useState<Record<string, string>>({});
  const [pqRevealed, setPqRevealed] = useState<Record<string, boolean>>({});
  const [pqSubmitted, setPqSubmitted] = useState(false);
  const [pqRecorded, setPqRecorded] = useState(false);

  // API chapter data for selected subject
  const [apiChapters, setApiChapters] = useState<any[]>([]);
  const [chaptersLoading, setChaptersLoading] = useState(false);

  // Per-subject completion (chapters/percentage/status) for the subject grid —
  // keyed by subject id, fetched once the subject list itself resolves.
  const [subjectProgress, setSubjectProgress] = useState<Record<string, any>>({});

  // On mount: profile-driven catalog — the backend resolves board & class
  // from the student's profile and returns ONLY their subjects (409 until set).
  useEffect(() => {
    setSubjectsLoading(true);
    contentApi.myCatalog()
      .then(async (r) => {
        const subs: any[] = Array.isArray(r.data?.subjects) ? r.data.subjects : [];
        setApiSubjects(subs);
        setMyBoardClass({ board: r.data?.board, class_num: r.data?.class_num });
        setProfileMissing(false);

        if (userId && subs.length > 0) {
          const entries = await Promise.all(
            subs.map(async (s: any) => {
              try {
                const pr = await contentApi.getSubjectProgress(s.id, userId);
                return [s.id, pr.data] as const;
              } catch {
                return [s.id, null] as const;
              }
            })
          );
          setSubjectProgress(Object.fromEntries(entries));
        }
      })
      .catch((e: any) => {
        if (e?.response?.status === 409) setProfileMissing(true);
        setApiSubjects([]);
      })
      .finally(() => setSubjectsLoading(false));
  }, [userId]);

  // "Continue" = the in-progress subject with the highest completion — the
  // closest signal to "most recently active" without a last-accessed field.
  const continueSubjectId = apiSubjects.reduce((bestId: string | null, s: any) => {
    const p = subjectProgress[s.id];
    if (!p || p.status !== "in_progress") return bestId;
    const bestPct = bestId ? (subjectProgress[bestId]?.completion_percentage ?? 0) : -1;
    return (p.completion_percentage ?? 0) > bestPct ? s.id : bestId;
  }, null as string | null);

  // When board selected, fetch classes from API
  useEffect(() => {
    if (!selectedBoard) { setApiClasses([]); return; }
    setClassesLoading(true);
    contentApi.getClasses(selectedBoard.id)
      .then(r => setApiClasses(Array.isArray(r.data) ? r.data : []))
      .catch(() => setApiClasses([]))
      .finally(() => setClassesLoading(false));
  }, [selectedBoard]);

  // When class selected, fetch subjects from API
  useEffect(() => {
    if (!selectedClass) { setApiSubjects([]); return; }
    setSubjectsLoading(true);
    contentApi.getSubjects(selectedClass.id)
      .then(r => setApiSubjects(Array.isArray(r.data) ? r.data : []))
      .catch(() => setApiSubjects([]))
      .finally(() => setSubjectsLoading(false));
  }, [selectedClass]);

  // When subject selected, fetch chapters from API
  useEffect(() => {
    if (!selectedSubject) { setApiChapters([]); return; }
    setChaptersLoading(true);
    contentApi.getChapters(selectedSubject.id)
      .then(r => setApiChapters(Array.isArray(r.data) ? r.data : []))
      .catch(() => setApiChapters([]))
      .finally(() => setChaptersLoading(false));
  }, [selectedSubject]);

  // Fetch topics (+ their videos) and notes when a chapter is selected — feeds the
  // new "topics" step shown between chapter selection and exercises.
  useEffect(() => {
    if (!selectedChapter) { setApiTopics([]); setTopicVideos({}); setChapterNotes([]); setChapterAllVideos([]); return; }
    setTopicsLoading(true);
    setApiTopics([]);
    setTopicVideos({});
    setChapterNotes([]);

    contentApi.getTopics(selectedChapter.id)
      .then(async (r) => {
        const tps: any[] = Array.isArray(r.data) ? r.data : [];
        setApiTopics(tps);
        if (tps.length > 0) {
          const entries = await Promise.all(
            tps.map(async (tp: any) => {
              try {
                const vr = await contentApi.getVideos(tp.id);
                return [tp.id, Array.isArray(vr.data) ? vr.data : []] as const;
              } catch {
                return [tp.id, []] as const;
              }
            })
          );
          setTopicVideos(Object.fromEntries(entries));
        }
      })
      .catch(() => setApiTopics([]))
      .finally(() => setTopicsLoading(false));

    contentApi.getNotes(selectedChapter.id)
      .then(r => setChapterNotes(Array.isArray(r.data) ? r.data : []))
      .catch(() => setChapterNotes([]));

    // All videos in this chapter (across topics + questions) — used for the
    // embedded player's "playlist" section.
    contentApi.chapterVideos(selectedChapter.id)
      .then(r => setChapterAllVideos(Array.isArray(r.data) ? r.data : []))
      .catch(() => setChapterAllVideos([]));
  }, [selectedChapter]);

  // Fetch exercises (and direct questions if no exercises) when chapter changes
  useEffect(() => {
    if (!selectedChapter) return;
    setChapterStep("topics");
    setContentLoading(true);
    setExercises([]);
    setDirectQuestions([]);
    setSelectedExercise(null);
    setSelectedQuestion(null);
    setChapterUnlocked(false);

    contentApi.getChapterExercises(selectedChapter.id)
      .then(async (r) => {
        const exs: any[] = Array.isArray(r.data) ? r.data : [];
        setExercises(exs);
        if (exs.length === 0) {
          const qr = await contentApi.getChapterDirectQuestions(selectedChapter.id);
          setDirectQuestions(Array.isArray(qr.data) ? qr.data : []);
        }
      })
      .catch(() => {})
      .finally(() => setContentLoading(false));

    // Chapter unlock status
    if (userId && isUUID(selectedChapter.id)) {
      contentApi.getChapterProgress(selectedChapter.id, userId)
        .then(r => { setChapterUnlocked(!!(r.data as any)?.unlocked); setChapterPct((r.data as any)?.completion_percentage ?? 0); })
        .catch(() => {});
    }
  }, [selectedChapter, userId]);

  // Fetch exercise questions + progress when exercise is selected
  useEffect(() => {
    if (!selectedExercise) return;
    setChapterStep("questions");
    setContentLoading(true);
    setExcQuestions([]);
    setExerciseUnlocked(false);
    contentApi.getExerciseQuestions(selectedExercise.id)
      .then(r => setExcQuestions(Array.isArray(r.data) ? r.data : []))
      .catch(() => setExcQuestions([]))
      .finally(() => setContentLoading(false));

    if (userId && isUUID(selectedExercise.id)) {
      contentApi.getExerciseProgress(selectedExercise.id, userId)
        .then(r => { setExerciseUnlocked(!!(r.data as any)?.unlocked); setExercisePct((r.data as any)?.completion_percentage ?? 0); })
        .catch(() => {});
    }
  }, [selectedExercise, userId]);

  // Subject (course) progress when chapters list shows for a subject
  useEffect(() => {
    if (!userId || !selectedSubject?.id) { setSubjectUnlocked(false); setSubjectPct(0); return; }
    contentApi.getSubjectProgress(selectedSubject.id, userId)
      .then(r => { setSubjectUnlocked(!!(r.data as any)?.unlocked); setSubjectPct((r.data as any)?.completion_percentage ?? 0); })
      .catch(() => {});
  }, [selectedSubject, userId]);

  // Fetch video when question is selected
  useEffect(() => {
    if (!selectedQuestion) return;
    setChapterStep("question-detail");
    setQuestionVideo(null);
    setVideoWatched(false);
    contentApi.getQuestionVideo(selectedQuestion.id)
      .then(r => setQuestionVideo(r.data ?? null))
      .catch(() => setQuestionVideo(null));
  }, [selectedQuestion]);

  // Record completion when practice/quiz done
  const pqDone = pqMode === "quiz"
    ? pqSubmitted
    : pqItems.length > 0 && Object.keys(pqRevealed).length === pqItems.length;
  const pqRight = pqItems.filter((q) => pqSelected[q.id] === q.correct_option).length;
  const pqPct = pqItems.length ? Math.round((pqRight / pqItems.length) * 100) : 0;

  const [certNumber, setCertNumber] = useState<string | null>(null);
  const [certLoading, setCertLoading] = useState(false);

  useEffect(() => {
    if (!pqDone || pqRecorded || !userId || !isUUID(pqEntityId)) return;
    setPqRecorded(true);
    if (pqLevel === "exercise")      contentApi.completeExercise(pqEntityId, userId, pqPct).catch(() => {});
    else if (pqLevel === "chapter")  contentApi.completeChapter(pqEntityId, userId, pqPct).catch(() => {});
    else if (pqLevel === "subject")  contentApi.completeSubject(pqEntityId, userId, pqPct).catch(() => {});
  }, [pqDone, pqRecorded, userId, pqEntityId, pqLevel, pqPct]);

  // Auto-issue certificate when chapter/subject quiz completes with 100%
  useEffect(() => {
    if (!pqDone || pqPct < 100 || !userId || !isUUID(pqEntityId)) return;
    if (pqLevel !== "chapter" && pqLevel !== "subject") return;
    if (certNumber || certLoading) return;
    setCertLoading(true);
    const subjectName = selectedSubject?.name ?? "";
    const chapterName = selectedChapter?.title ?? pqTitle;
    contentApi.issueCertificate(userId, pqLevel, pqEntityId, "Student", chapterName, subjectName)
      .then(r => setCertNumber((r.data as any)?.certificate_number ?? null))
      .catch(() => {})
      .finally(() => setCertLoading(false));
  }, [pqDone, pqPct, pqLevel, pqEntityId, userId]);

  // ── Actions ────────────────────────────────────────────────────────────────
  const openPractice = (level: PQLevel, id: string, mode: PQMode, title: string) => {
    setPqLevel(level); setPqEntityId(id); setPqMode(mode); setPqTitle(title);
    setPqItems([]); setPqSelected({}); setPqRevealed({}); setPqSubmitted(false); setPqRecorded(false);
    setPqLoading(true);
    setChapterStep("practice-quiz");
    const fetcher = level === "subject"
      ? contentApi.getSubjectPractice(id)
      : level === "chapter"
        ? contentApi.getChapterPractice(id)
        : level === "question"
          ? contentApi.getQuestionPractice(id)
          : contentApi.getExercisePractice(id);
    fetcher
      .then(r => setPqItems(Array.isArray(r.data) ? r.data : []))
      .catch(() => setPqItems([]))
      .finally(() => setPqLoading(false));
  };

  // Auto-complete: watching a video (or, previously, opening then returning) marks it
  // watched → backend updates DB → exercise practice/quiz unlock automatically.
  // Generalized to accept any video (questionVideo OR a topic/playlist video opened
  // from the new embedded player), defaulting to questionVideo to preserve the
  // original Solution Video flow untouched.
  const markWatched = async (video?: any) => {
    const v = video ?? questionVideo;
    if (videoWatched) return;
    setVideoWatched(true);
    setExerciseUnlocked(true);
    setExercisePct(100);
    if (userId && v?.id) {
      // Layer 3+4+5: mark completed in DB → Redis → PostgreSQL
      await contentApi.updateProgress(v.id, v.duration_seconds ?? 300, true, userId, {
        position_seconds: v.duration_seconds ?? 300,
        status: "completed",
      }).catch(() => {});
      await contentApi.completeVideo(v.id, userId).catch(() => {});
      // Layer 1: persist to AsyncStorage so Dashboard CW refreshes
      try {
        await AsyncStorage.setItem(
          `edulearn_vwatched_${v.id}`,
          JSON.stringify({ ts: Date.now(), title: v.title })
        );
      } catch { /* ignore */ }
    }
  };

  // Opens the embedded VideoPlayer (in-app, full controls) instead of the old
  // WebBrowser.openBrowserAsync external-tab flow.
  const openVideoPlayer = async (video: any) => {
    if (!video?.youtube_id) return;
    if (studyBlocked && !playerVisible) {
      Toast.show({
        type: "info",
        text1: fmt(t("studyLimitReachedTitle"), { limit: studyLimitMinutes ?? 0 }),
        text2: t("studyLimitBlockVideo"),
      });
      return;
    }
    lastPlayTickRef.current = 0;
    setPlayerVideo(video);
    setPlayerProgress(null);
    setNotesUnlocked(false);
    setShowInlineNotes(false);
    setPlayerVisible(true);
    // Reset per-video watched flag; re-derived from saved progress below if this
    // particular video was already completed in a previous session.
    setVideoWatched(false);
    setPlayerBookmarked(false);

    // Real bookmark status for this video (not a guess) — cheap since the
    // list is small per user; refreshed every time a video is opened.
    if (userId && video?.id && isUUID(video.id)) {
      contentApi.myBookmarks(userId)
        .then(({ data }) => {
          setPlayerBookmarked(!!data?.videos?.some((b: any) => b.video_id === video.id));
        })
        .catch(() => {});
    }

    // Mark video as started (in_progress at 10%) — same DB semantics as before.
    if (userId && video?.id) {
      const startedSec = Math.floor((video.duration_seconds ?? 300) * 0.1);
      contentApi.updateProgress(video.id, startedSec, false, userId, {
        position_seconds: 0,
        status: "in_progress",
      }).catch(() => {});
      AsyncStorage.setItem(
        `edulearn_vstarted_${video.id}`,
        JSON.stringify({ ts: Date.now(), ytId: video.youtube_id })
      ).catch(() => {});

      // Existing progress → resume point + notes unlock + already-watched state
      if (isUUID(video.id) && contentApi.videoProgress) {
        contentApi.videoProgress(video.id, userId)
          .then(r => {
            setPlayerProgress(r.data ?? null);
            setNotesUnlocked(!!(r.data as any)?.notes_unlocked);
            if ((r.data as any)?.is_completed) setVideoWatched(true);
          })
          .catch(() => {});
      }
    }
  };

  // Kept for the Solution Video card (question-detail step) — opens the embedded player.
  const watchVideo = async () => {
    if (!questionVideo) return;
    await openVideoPlayer(questionVideo);
  };

  const closeVideoPlayer = () => {
    setPlayerVisible(false);
    setPlayerVideo(null);
    setShowInlineNotes(false);
  };

  // Deep-link into a specific video when navigated here with
  // navigation.navigate("Learn", { openVideo: video }) — used by Dashboard's
  // Continue Watching / Recommended / Trending rows so tapping a video card
  // actually opens that video instead of just landing on the Learn tab.
  useEffect(() => {
    if (route.params?.openVideo) {
      openVideoPlayer(route.params.openVideo);
      navigation.setParams({ openVideo: undefined });
    }
  }, [route.params?.openVideo]);

  const goBack = () => {
    if (chapterStep === "practice-quiz") {
      if (pqLevel === "chapter") setChapterStep("exercises");
      else if (selectedQuestion) setChapterStep("question-detail");
      else setChapterStep("questions");
      return;
    }
    if (chapterStep === "question-detail") {
      setSelectedQuestion(null);
      setChapterStep(selectedExercise ? "questions" : "exercises");
      return;
    }
    if (chapterStep === "questions") {
      setSelectedExercise(null);
      setChapterStep("exercises");
      return;
    }
    if (chapterStep === "exercises") {
      // Keep selectedChapter — going back to the Topics step for the same chapter.
      setChapterStep("topics");
      return;
    }
    if (chapterStep === "topics") {
      setSelectedChapter(null);
      setChapterStep("chapter");
      return;
    }
    if (chapterStep === "chapter") {
      setSelectedSubject(null);
      setChapterStep("subject");
      return;
    }
    // "subject" is the flow root — board & class live in the profile.
  };

  const displayChapters = apiChapters.map((c: any) => ({
    id: c.id,
    title: c.title,
    topics: c.topics_count ?? c.topics ?? 0,
    done: false,
  }));
  const filteredSubjects = apiSubjects.filter(s =>
    s.name.toLowerCase().includes(search.toLowerCase())
  );

  // ── Reusable: completion bar ───────────────────────────────────────────────
  const CompletionBar = ({ pct, label }: { pct: number; label: string }) => {
    const done = pct >= 100;
    return (
      <View style={{ gap: 4 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
          <Text style={styles.barLabel}>{label}</Text>
          <Text style={[styles.barLabel, done && { color: semantic.success.solid, fontWeight: "800" }]}>{pct}%{done ? " · Unlocked" : ""}</Text>
        </View>
        <View style={styles.barTrack}>
          <View style={[styles.barFill, { width: `${Math.min(100, pct)}%`, backgroundColor: done ? semantic.success.solid : palette.primary600 }]} />
        </View>
      </View>
    );
  };

  // ── Reusable: Practice/Quiz unlock buttons ─────────────────────────────────
  const UnlockButtons = ({ level, id, title, unlocked, pct }: { level: PQLevel; id: string; title: string; unlocked: boolean; pct: number }) => (
    <View style={styles.unlockWrap}>
      <View style={styles.unlockHeaderRow}>
        <Text style={styles.unlockHeader}>{level === "subject" ? "Course" : level === "chapter" ? "Chapter" : "Exercise"} Practice & Quiz</Text>
        <View style={styles.optionalBadge}><Text style={styles.optionalBadgeTxt}>Optional</Text></View>
      </View>
      <CompletionBar pct={pct} label={`${level === "subject" ? "Course" : level === "chapter" ? "Chapter" : "Exercise"} completion`} />
      <View style={styles.unlockRow}>
        <TouchableOpacity
          disabled={!unlocked}
          activeOpacity={0.85}
          onPress={() => openPractice(level, id, "practice", title)}
          style={[styles.unlockCard, unlocked ? styles.practiceCard : styles.lockedCard]}
        >
          {unlocked ? (
            <View style={[styles.unlockIcon, { backgroundColor: accentSolid.emerald }]}>
              <Ionicons name="school" size={18} color="#fff" />
            </View>
          ) : (
            <View style={[styles.unlockIcon, { backgroundColor: palette.gray300 }]}>
              <Ionicons name="lock-closed" size={18} color="#fff" />
            </View>
          )}
          <Text style={styles.unlockCardTitle}>Practice</Text>
          <Text style={styles.unlockCardSub}>{unlocked ? "Instant feedback" : "Locked"}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          disabled={!unlocked}
          activeOpacity={0.85}
          onPress={() => openPractice(level, id, "quiz", title)}
          style={[styles.unlockCard, unlocked ? styles.quizCard : styles.lockedCard]}
        >
          {unlocked ? (
            <View style={[styles.unlockIcon, { backgroundColor: accentSolid.indigo }]}>
              <Ionicons name="trophy" size={18} color="#fff" />
            </View>
          ) : (
            <View style={[styles.unlockIcon, { backgroundColor: palette.gray300 }]}>
              <Ionicons name="lock-closed" size={18} color="#fff" />
            </View>
          )}
          <Text style={styles.unlockCardTitle}>Quiz</Text>
          <Text style={styles.unlockCardSub}>{unlocked ? "Graded · scored" : "Locked"}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  // ── Embedded Video Player modal ─────────────────────────────────────────────
  // Replaces the old WebBrowser.openBrowserAsync flow with an in-app player that
  // supports playback speed, EN/HI medium toggle, position tracking, notes unlock
  // at 70%, a playlist of other videos in the chapter, and recommended exercises.
  const VideoPlayerModal = () => {
    if (!playerVideo) return null;

    const initialPos = (playerProgress as any)?.last_position_seconds ?? 0;
    const watchPct = (playerProgress as any)?.completion_percentage ?? 0;
    const playlist = chapterAllVideos.filter((v: any) => v.id !== playerVideo.id).slice(0, 8);
    const recommended = (exercises.length > 0 ? exercises : directQuestions)
      .filter((e: any) => e.id !== selectedExercise?.id)
      .slice(0, 4);

    const handleProgress = (seconds: number, isCompleted: boolean) => {
      lastPlayTickRef.current = Date.now();
      if (isCompleted && !videoWatched) markWatched(playerVideo);
      if (!notesUnlocked && playerVideo.duration_seconds && seconds / playerVideo.duration_seconds >= 0.7) {
        setNotesUnlocked(true);
      }
    };

    const handleProgressSync = (seconds: number, isCompleted: boolean) => {
      if (!userId || !playerVideo?.id) return;
      contentApi.updateProgress(playerVideo.id, seconds, isCompleted, userId, {
        position_seconds: seconds,
        status: isCompleted ? "completed" : "playing",
      }).catch(() => {});
    };

    return (
      <Modal visible={playerVisible} animationType="slide" onRequestClose={closeVideoPlayer}>
        <SafeAreaView style={styles.safe}>
          <StatusBar barStyle="dark-content" />
          <View style={styles.chapterHeader}>
            <TouchableOpacity onPress={closeVideoPlayer} style={styles.backBtn}>
              <Ionicons name="close" size={22} color={palette.primary600} />
            </TouchableOpacity>
            <View style={{ flex: 1 }}>
              <Text style={styles.chapterHeaderTitle} numberOfLines={1}>{playerVideo.title}</Text>
              <Text style={styles.chapterHeaderSub}>
                {videoWatched ? "Watched" : initialPos > 5 ? `Resuming · ${Math.round(watchPct)}% watched` : "In progress"}
              </Text>
            </View>
            {isUUID(playerVideo.id) && (
              <BookmarkButton
                key={playerVideo.id}
                entityType="video"
                entityId={playerVideo.id}
                initialBookmarked={playerBookmarked}
                onToggled={setPlayerBookmarked}
              />
            )}
          </View>

          <ScrollView contentContainerStyle={styles.detailScroll}>
            <StudyLimitBanner style={{ marginBottom: 12 }} />
            <VideoPlayer
              youtubeId={playerVideo.youtube_id}
              youtubeIdHi={playerVideo.youtube_id_hi}
              initialPositionSeconds={initialPos}
              onProgress={handleProgress}
              onProgressSync={handleProgressSync}
            />

            {/* Notes unlock (70% watched) */}
            <View style={styles.sectionCard}>
              <View style={styles.sectionHeader}>
                <Ionicons name={notesUnlocked ? "document-text" : "lock-closed"} size={18} color={notesUnlocked ? semantic.success.solid : palette.gray400} />
                <Text style={styles.sectionTitle}>Notes</Text>
              </View>
              {!playerVideo.notes_url ? (
                <Text style={styles.emptyText}>No notes added for this video</Text>
              ) : !notesUnlocked ? (
                <Text style={styles.hintTxt}>Notes unlock automatically once you've watched 70% of the video.</Text>
              ) : (
                <>
                  <TouchableOpacity
                    style={styles.continueRow}
                    activeOpacity={0.85}
                    onPress={() => setShowInlineNotes(v => !v)}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={styles.continueTitle}>{showInlineNotes ? "Hide notes" : "View notes"}</Text>
                      <Text style={styles.continueSub}>Unlocked · tap to {showInlineNotes ? "collapse" : "expand"}</Text>
                    </View>
                    <Ionicons name={showInlineNotes ? "chevron-up-circle" : "chevron-down-circle"} size={24} color={semantic.success.solid} />
                  </TouchableOpacity>
                  {showInlineNotes && (
                    <TouchableOpacity
                      activeOpacity={0.85}
                      onPress={() => Linking.openURL(playerVideo.notes_url)}
                    >
                      <View style={[styles.notesOpenBtn, { backgroundColor: accentSolid.emerald }]}>
                        <Ionicons name="open-outline" size={16} color="#fff" />
                        <Text style={styles.notesOpenBtnTxt}>Open / Download Notes</Text>
                      </View>
                    </TouchableOpacity>
                  )}
                </>
              )}
            </View>

            {/* Playlist — other videos in this chapter */}
            {playlist.length > 0 && (
              <View style={styles.sectionCard}>
                <View style={styles.sectionHeader}>
                  <Ionicons name="list" size={18} color={palette.primary600} />
                  <Text style={styles.sectionTitle}>Playlist</Text>
                  <View style={styles.countBadge}><Text style={styles.countBadgeTxt}>{playlist.length}</Text></View>
                </View>
                {playlist.map((v: any) => (
                  <TouchableOpacity
                    key={v.id}
                    style={styles.playlistRow}
                    activeOpacity={0.8}
                    onPress={() => openVideoPlayer(v)}
                  >
                    <Ionicons name="play-circle-outline" size={20} color={palette.primary600} />
                    <Text style={styles.playlistTitle} numberOfLines={1}>{v.title}</Text>
                    <Ionicons name="chevron-forward" size={16} color={palette.gray400} />
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {/* Recommended exercises */}
            {recommended.length > 0 && (
              <View style={styles.sectionCard}>
                <View style={styles.sectionHeader}>
                  <Ionicons name="star" size={18} color={semantic.warning.solid} />
                  <Text style={styles.sectionTitle}>Recommended Exercises</Text>
                </View>
                {recommended.map((ex: any) => (
                  <TouchableOpacity
                    key={ex.id}
                    style={styles.playlistRow}
                    activeOpacity={0.8}
                    onPress={() => {
                      closeVideoPlayer();
                      if (ex.name) { setSelectedExercise(ex); setChapterStep("questions"); }
                      else { setSelectedQuestion(ex); setChapterStep("question-detail"); }
                    }}
                  >
                    <Ionicons name="book-outline" size={18} color={semantic.warning.solid} />
                    <Text style={styles.playlistTitle} numberOfLines={1}>{ex.name ?? ex.question_text ?? `Question ${ex.question_number ?? ""}`}</Text>
                    <Ionicons name="chevron-forward" size={16} color={palette.gray400} />
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {videoWatched && (
              <View style={styles.watchedNote}>
                <Ionicons name="checkmark-circle" size={15} color={semantic.success.solid} />
                <Text style={styles.watchedNoteTxt}>Watched — Practice &amp; Quiz unlocked</Text>
              </View>
            )}
          </ScrollView>
        </SafeAreaView>
      </Modal>
    );
  };

  // ── Render: Practice / Quiz ────────────────────────────────────────────────
  if (chapterStep === "practice-quiz") {
    return (
      <SafeAreaView style={styles.safe}>
        <StatusBar barStyle="dark-content" />
        <View style={styles.chapterHeader}>
          <TouchableOpacity onPress={goBack} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={22} color={palette.primary600} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={styles.chapterHeaderTitle} numberOfLines={1}>{pqTitle}</Text>
            <Text style={styles.chapterHeaderSub}>{pqMode === "quiz" ? "Quiz · graded" : "Practice · instant feedback"}</Text>
          </View>
          <View style={[styles.modeBadge, { backgroundColor: pqMode === "quiz" ? palette.primary50 : semantic.success.bg }]}>
            <Ionicons name={pqMode === "quiz" ? "trophy" : "school"} size={14} color={pqMode === "quiz" ? palette.primary600 : semantic.success.solid} />
            <Text style={[styles.modeBadgeTxt, { color: pqMode === "quiz" ? palette.primary600 : semantic.success.solid }]}>{pqItems.length} Q</Text>
          </View>
        </View>

        <ScrollView contentContainerStyle={styles.detailScroll}>
          {pqLoading && <ActivityIndicator color={palette.primary600} size="large" style={{ marginTop: 40 }} />}

          {/* Score banner */}
          {pqDone && (
            <View style={[styles.scoreBanner, { backgroundColor: pqPct >= 60 ? semantic.success.bg : semantic.warning.bg, borderColor: pqPct >= 60 ? semantic.success.border : semantic.warning.border }]}>
              <View
                style={[styles.scoreIcon, { backgroundColor: pqPct >= 60 ? accentSolid.emerald : accentSolid.amber }]}
              >
                <Ionicons name="trophy" size={20} color="#fff" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.scoreTitle}>{pqRight} / {pqItems.length} correct · {pqPct}%</Text>
                <Text style={styles.scoreSub}>{pqPct >= 80 ? "Excellent! 🎉" : pqPct >= 60 ? "Good job!" : "Review the explanations."}</Text>
              </View>
              <TouchableOpacity onPress={() => { setPqSelected({}); setPqRevealed({}); setPqSubmitted(false); setPqRecorded(false); }} style={styles.retryBtn}>
                <Ionicons name="refresh" size={14} color={palette.gray700} />
                <Text style={styles.retryTxt}>Retry</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Certificate banner on 100% chapter/subject completion */}
          {pqDone && pqPct >= 100 && (pqLevel === "chapter" || pqLevel === "subject") && (
            <View style={styles.certBanner}>
              <Text style={styles.certEmoji}>🎓</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.certTitle}>Certificate Earned!</Text>
                <Text style={styles.certSub}>
                  {certLoading ? "Generating certificate…" : certNumber ? `#${certNumber}` : "You completed this chapter with 100%!"}
                </Text>
              </View>
              {certNumber && (
                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={() => {
                    const msg = encodeURIComponent(
                      `🎓 I just completed "${pqTitle}" on EduLearn and earned a Certificate!\n` +
                      `Cert: ${certNumber}\nJoin me: https://edulearn.app`
                    );
                    Linking.openURL(`https://wa.me/?text=${msg}`);
                  }}
                >
                  <View style={[styles.certShareBtn, { backgroundColor: accentSolid.emerald }]}>
                    <Text style={styles.certShareTxt}>Share 🟢</Text>
                  </View>
                </TouchableOpacity>
              )}
            </View>
          )}

          {!pqLoading && pqItems.length === 0 && (
            <EmptyState icon="document-outline" title={`No ${pqMode} questions available yet`} />
          )}

          {!pqLoading && pqItems.map((q: any, idx: number) => {
            const opts = [
              { k: "a", label: q.option_a },
              { k: "b", label: q.option_b },
              ...(q.option_c ? [{ k: "c", label: q.option_c }] : []),
              ...(q.option_d ? [{ k: "d", label: q.option_d }] : []),
            ];
            const userPick = pqSelected[q.id];
            const reveal = pqMode === "quiz" ? pqSubmitted : !!pqRevealed[q.id];
            return (
              <View key={q.id} style={styles.pqCard}>
                <Text style={styles.pqText}>{idx + 1}. {q.text}</Text>
                {opts.map(o => {
                  const isThis = userPick === o.k;
                  const isCorrectOpt = q.correct_option === o.k;
                  const rowStyle = [styles.optRow,
                    !reveal && isThis && styles.optSelected,
                    reveal && isCorrectOpt && styles.optCorrect,
                    reveal && isThis && !isCorrectOpt && styles.optWrong,
                  ];
                  return (
                    <TouchableOpacity
                      key={o.k}
                      activeOpacity={reveal ? 1 : 0.7}
                      disabled={reveal}
                      onPress={() => {
                        if (pqMode === "quiz") {
                          if (!pqSubmitted) setPqSelected(prev => ({ ...prev, [q.id]: o.k }));
                        } else {
                          if (pqRevealed[q.id]) return;
                          setPqSelected(prev => ({ ...prev, [q.id]: o.k }));
                          setPqRevealed(prev => ({ ...prev, [q.id]: true }));
                        }
                      }}
                      style={rowStyle}
                    >
                      <Text style={[styles.optKey,
                        reveal && isCorrectOpt && styles.optKeyCorrect,
                        reveal && isThis && !isCorrectOpt && styles.optKeyWrong,
                        !reveal && isThis && styles.optKeySelected,
                      ]}>{o.k.toUpperCase()}.</Text>
                      <Text style={[styles.optTxt, reveal && isCorrectOpt && styles.optTxtCorrect]} numberOfLines={4}>{o.label}</Text>
                      {reveal && isCorrectOpt && <Ionicons name="checkmark-circle" size={16} color={semantic.success.solid} />}
                      {reveal && isThis && !isCorrectOpt && <Ionicons name="close-circle" size={16} color={semantic.danger.solid} />}
                    </TouchableOpacity>
                  );
                })}
                {reveal && q.explanation ? (
                  <View style={styles.explBox}>
                    <Ionicons name="bulb" size={14} color={semantic.info.solid} />
                    <Text style={styles.explanation}>{q.explanation}</Text>
                  </View>
                ) : null}
              </View>
            );
          })}

          {/* Quiz submit */}
          {pqMode === "quiz" && !pqSubmitted && pqItems.length > 0 && (() => {
            const allAnswered = Object.keys(pqSelected).length === pqItems.length;
            return (
              <TouchableOpacity
                disabled={!allAnswered}
                onPress={() => setPqSubmitted(true)}
                activeOpacity={0.85}
              >
                {allAnswered ? (
                  <View style={[styles.submitBtn, { backgroundColor: palette.primary600 }]}>
                    <Ionicons name="checkmark-done" size={18} color="#fff" />
                    <Text style={styles.submitTxt}>Submit Quiz</Text>
                  </View>
                ) : (
                  <View style={[styles.submitBtn, styles.submitBtnDisabled]}>
                    <Ionicons name="checkmark-done" size={18} color="#fff" />
                    <Text style={styles.submitTxt}>
                      Submit Quiz ({Object.keys(pqSelected).length}/{pqItems.length})
                    </Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          })()}

          {/* Done CTA */}
          {pqDone && selectedChapter && isUUID(selectedChapter.id) && pqLevel !== "chapter" && (
            <TouchableOpacity
              onPress={() => openPractice("chapter", selectedChapter.id, "quiz", selectedChapter.title)}
              activeOpacity={0.85}
            >
              <View style={[styles.quizBtn, { backgroundColor: palette.primary600 }]}>
                <Ionicons name="trophy" size={20} color="#fff" />
                <Text style={styles.quizBtnTxt}>Take Chapter Quiz</Text>
              </View>
            </TouchableOpacity>
          )}
        </ScrollView>
      <VideoPlayerModal />
      </SafeAreaView>
    );
  }

  // ── Render: Question Detail ────────────────────────────────────────────────
  if (selectedQuestion && chapterStep === "question-detail") {
    return (
      <SafeAreaView style={styles.safe}>
        <StatusBar barStyle="dark-content" />
        <View style={styles.chapterHeader}>
          <TouchableOpacity onPress={goBack} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={22} color={palette.primary600} />
          </TouchableOpacity>
          <View style={{ flex: 1, marginRight: 8 }}>
            <Text style={styles.chapterHeaderTitle} numberOfLines={1}>Q{selectedQuestion.question_number}</Text>
            <Text style={styles.chapterHeaderSub} numberOfLines={1}>{selectedQuestion.question_text || "Question"}</Text>
          </View>
        </View>

        <ScrollView contentContainerStyle={styles.detailScroll}>
          {/* Solution Video */}
          <View style={styles.sectionCard}>
            <View style={styles.sectionHeader}>
              <Ionicons name="play-circle" size={18} color={semantic.info.solid} />
              <Text style={styles.sectionTitle}>Solution Video</Text>
            </View>
            {questionVideo ? (
              <>
                <TouchableOpacity
                  style={styles.videoCard}
                  activeOpacity={0.8}
                  onPress={watchVideo}
                >
                  <View style={[styles.videoThumb, { backgroundColor: accentSolid.indigo }]}>
                    <Ionicons name="play" size={24} color="#fff" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.videoTitle} numberOfLines={2}>{questionVideo.title}</Text>
                    <View style={styles.langRow}>
                      {questionVideo.youtube_id     && <Text style={[styles.langBadge, { backgroundColor: semantic.info.bg, color: semantic.info.text }]}>EN</Text>}
                      {questionVideo.youtube_id_hi  && <Text style={[styles.langBadge, { backgroundColor: semantic.success.bg, color: semantic.success.text }]}>HI</Text>}
                      {questionVideo.youtube_id_pa  && <Text style={[styles.langBadge, { backgroundColor: semantic.warning.bg, color: semantic.warning.text }]}>PA</Text>}
                      {questionVideo.youtube_id_bho && <Text style={[styles.langBadge, { backgroundColor: "#EDE9FE", color: "#5B21B6" }]}>BHO</Text>}
                    </View>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={palette.gray400} />
                </TouchableOpacity>
                {videoWatched
                  ? <View style={styles.watchedNote}><Ionicons name="checkmark-circle" size={15} color={semantic.success.solid} /><Text style={styles.watchedNoteTxt}>Watched — Practice &amp; Quiz unlocked</Text></View>
                  : <Text style={styles.hintTxt}>After completing the video you can start the quiz or practice questions — they unlock automatically.</Text>
                }
              </>
            ) : (
              <Text style={styles.emptyText}>No solution video available</Text>
            )}
          </View>

          {/* Exercise Practice & Quiz (optional · auto-unlock after video) */}
          {selectedExercise && isUUID(selectedExercise.id) && (
            <UnlockButtons
              level="exercise"
              id={selectedExercise.id}
              title={selectedExercise.name}
              unlocked={exerciseUnlocked || videoWatched}
              pct={videoWatched ? 100 : exercisePct}
            />
          )}
        </ScrollView>
      <VideoPlayerModal />
      </SafeAreaView>
    );
  }

  // ── Render: Questions List ────────────────────────────────────────────────
  const currentQs = chapterStep === "questions" ? excQuestions : directQuestions;
  const showQsList =
    selectedChapter &&
    (chapterStep === "questions" ||
      (chapterStep === "exercises" && !contentLoading && exercises.length === 0 && directQuestions.length > 0));

  if (showQsList) {
    return (
      <SafeAreaView style={styles.safe}>
        <StatusBar barStyle="dark-content" />
        <View style={styles.chapterHeader}>
          <TouchableOpacity onPress={goBack} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={22} color={palette.primary600} />
          </TouchableOpacity>
          <View>
            <Text style={styles.chapterHeaderTitle}>{selectedExercise?.name ?? selectedChapter?.title}</Text>
            <Text style={styles.chapterHeaderSub}>Questions · Videos</Text>
          </View>
        </View>
        <ScrollView contentContainerStyle={styles.chapterList}>
          {contentLoading && <ActivityIndicator color={palette.primary600} size="large" style={{ marginTop: 40 }} />}
          {!contentLoading && currentQs.map((q: any, idx: number) => (
            <TouchableOpacity
              key={q.id}
              style={styles.chapterCard}
              activeOpacity={0.85}
              onPress={() => setSelectedQuestion(q)}
            >
              <View style={[styles.chNum, { backgroundColor: rowTint(idx) }]}>
                <Text style={[styles.chNumTxt, { color: "#fff" }]}>Q{q.question_number}</Text>
              </View>
              <View style={styles.chInfo}>
                <Text style={styles.chTitle} numberOfLines={2}>{q.question_text || `Question ${q.question_number}`}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={palette.gray400} />
            </TouchableOpacity>
          ))}
          {!contentLoading && currentQs.length === 0 && (
            <EmptyState icon="document-outline" title="No questions available" />
          )}

          {/* Exercise Practice & Quiz (optional · unlock after videos) */}
          {!contentLoading && chapterStep === "questions" && currentQs.length > 0 && selectedExercise && isUUID(selectedExercise.id) && (
            <UnlockButtons
              level="exercise"
              id={selectedExercise.id}
              title={selectedExercise.name}
              unlocked={exerciseUnlocked}
              pct={exercisePct}
            />
          )}
        </ScrollView>
      <VideoPlayerModal />
      </SafeAreaView>
    );
  }

  // ── Render: Exercises List ────────────────────────────────────────────────
  if (selectedChapter && chapterStep === "exercises") {
    return (
      <SafeAreaView style={styles.safe}>
        <StatusBar barStyle="dark-content" />
        <View style={styles.chapterHeader}>
          <TouchableOpacity onPress={goBack} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={22} color={palette.primary600} />
          </TouchableOpacity>
          <View>
            <Text style={styles.chapterHeaderTitle}>{selectedChapter.title}</Text>
            <Text style={styles.chapterHeaderSub}>Select Exercise</Text>
          </View>
        </View>
        <ScrollView contentContainerStyle={styles.chapterList}>
          {contentLoading && <ActivityIndicator color={palette.primary600} size="large" style={{ marginTop: 40 }} />}
          {!contentLoading && exercises.map((ex: any, idx: number) => (
            <TouchableOpacity
              key={ex.id}
              style={styles.chapterCard}
              activeOpacity={0.85}
              onPress={() => setSelectedExercise(ex)}
            >
              <View style={[styles.chNum, { backgroundColor: rowTint(idx) }]}>
                <Text style={[styles.chNumTxt, { color: "#fff" }]}>{ex.number || ex.sequence}</Text>
              </View>
              <View style={styles.chInfo}>
                <Text style={styles.chTitle}>{ex.name}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={palette.gray400} />
            </TouchableOpacity>
          ))}
          {!contentLoading && exercises.length === 0 && directQuestions.length === 0 && (
            <EmptyState icon="library-outline" title="No content available yet" />
          )}

          {/* Chapter Practice & Quiz (optional · unlock after exercises) */}
          {!contentLoading && exercises.length > 0 && selectedChapter && isUUID(selectedChapter.id) && (
            <UnlockButtons
              level="chapter"
              id={selectedChapter.id}
              title={selectedChapter.title}
              unlocked={chapterUnlocked}
              pct={chapterPct}
            />
          )}
        </ScrollView>
      <VideoPlayerModal />
      </SafeAreaView>
    );
  }

  // ── Render: Chapter List ──────────────────────────────────────────────────
  if (selectedSubject && chapterStep === "chapter") {
    const subjectUI = getSubjectUI(selectedSubject.name);
    return (
      <SafeAreaView style={styles.safe}>
        <StatusBar barStyle="dark-content" />
        <View style={styles.chapterHeader}>
          <TouchableOpacity onPress={goBack} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={22} color={palette.primary600} />
          </TouchableOpacity>
          <View>
            <Text style={styles.chapterHeaderTitle}>{selectedSubject.name}</Text>
            <Text style={styles.chapterHeaderSub}>{selectedBoard?.name ?? "Board"} · Class {selectedClass?.number ?? selectedClass?.name ?? ""}</Text>
          </View>
          <View style={[styles.subjectIcon, { backgroundColor: subjectUI.tint }]}>
            <Ionicons name={subjectUI.icon as any} size={22} color="#fff" />
          </View>
        </View>

        <ScrollView contentContainerStyle={styles.chapterList}>
          {chaptersLoading && <ActivityIndicator color={palette.primary600} size="large" style={{ marginTop: 40 }} />}
          {!chaptersLoading && displayChapters.map((ch: any, idx: number) => (
            <TouchableOpacity
              key={ch.id}
              style={styles.chapterCard}
              activeOpacity={0.85}
              onPress={() => { setSelectedChapter({ id: ch.id, title: ch.title }); setChapterStep("topics"); }}
            >
              {ch.done ? (
                <View style={[styles.chNum, { backgroundColor: subjectUI.tint }]}>
                  <Ionicons name="checkmark" size={14} color="#fff" />
                </View>
              ) : (
                <View style={[styles.chNum, { backgroundColor: palette.gray100 }]}>
                  <Text style={[styles.chNumTxt, { color: palette.gray600 }]}>{idx + 1}</Text>
                </View>
              )}
              <View style={styles.chInfo}>
                <Text style={styles.chTitle}>{ch.title}</Text>
                {/* NOTE: the chapters API (ChapterResponse) does not return a `difficulty`
                    field (only Topic rows carry difficulty) — so no chapter-level
                    difficulty badge is rendered here to avoid fabricating data. Topic-level
                    difficulty badges ARE shown in the Topics step below (real API field). */}
                <Text style={styles.chSub}>{ch.topics} topics</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={palette.gray400} />
            </TouchableOpacity>
          ))}
          {!chaptersLoading && displayChapters.length === 0 && (
            <EmptyState icon="book-outline" title="No chapters available" />
          )}

          {/* Course Test & Question Paper (optional · unlock after all chapters) */}
          {!chaptersLoading && displayChapters.length > 0 && selectedSubject.id && (
            <UnlockButtons
              level="subject"
              id={selectedSubject.id}
              title={selectedSubject.name}
              unlocked={subjectUnlocked}
              pct={subjectPct}
            />
          )}
        </ScrollView>
      <VideoPlayerModal />
      </SafeAreaView>
    );
  }

  // ── Render: Topics step (Videos / Notes / Practice·Quiz) ───────────────────
  if (selectedChapter && chapterStep === "topics") {
    const videoSections = apiTopics.map((tp: any) => ({ topic: tp, videos: topicVideos[tp.id] ?? [] }));
    const totalVideos = videoSections.reduce((sum, s) => sum + s.videos.length, 0);
    const practiceCount = exercises.length || directQuestions.length;

    return (
      <SafeAreaView style={styles.safe}>
        <StatusBar barStyle="dark-content" />
        <View style={styles.chapterHeader}>
          <TouchableOpacity onPress={goBack} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={22} color={palette.primary600} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={styles.chapterHeaderTitle} numberOfLines={1}>{selectedChapter.title}</Text>
            <Text style={styles.chapterHeaderSub}>{selectedSubject?.name}</Text>
          </View>
        </View>

        <ScrollView contentContainerStyle={styles.detailScroll}>
          <StudyLimitBanner style={{ marginBottom: 12 }} />
          {(topicsLoading || contentLoading) && <ActivityIndicator color={palette.primary600} size="large" style={{ marginTop: 24 }} />}

          {/* Videos section */}
          {!topicsLoading && totalVideos > 0 && (
            <View style={styles.sectionCard}>
              <View style={styles.sectionHeader}>
                <Ionicons name="videocam" size={18} color={semantic.info.solid} />
                <Text style={styles.sectionTitle}>Videos</Text>
                <View style={styles.countBadge}><Text style={styles.countBadgeTxt}>{totalVideos}</Text></View>
              </View>
              {videoSections.map(({ topic, videos }) =>
                videos.length === 0 ? null : (
                  <View key={topic.id} style={{ marginBottom: 10 }}>
                    <View style={styles.topicRow}>
                      <Text style={styles.topicLabel} numberOfLines={1}>{topic.title}</Text>
                      <DifficultyBadge level={topic.difficulty} />
                    </View>
                    {videos.map((v: any) => (
                      <TouchableOpacity
                        key={v.id}
                        style={styles.videoCard}
                        activeOpacity={0.8}
                        onPress={() => openVideoPlayer(v)}
                      >
                        <View style={[styles.videoThumb, { backgroundColor: accentSolid.indigo }]}>
                          <Ionicons name="play" size={22} color="#fff" />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.videoTitle} numberOfLines={2}>{v.title}</Text>
                          <View style={styles.langRow}>
                            {v.youtube_id    && <Text style={[styles.langBadge, { backgroundColor: semantic.info.bg, color: semantic.info.text }]}>EN</Text>}
                            {v.youtube_id_hi && <Text style={[styles.langBadge, { backgroundColor: semantic.success.bg, color: semantic.success.text }]}>HI</Text>}
                          </View>
                        </View>
                        <Ionicons name="chevron-forward" size={18} color={palette.gray400} />
                      </TouchableOpacity>
                    ))}
                  </View>
                )
              )}
            </View>
          )}

          {/* Notes section */}
          {!topicsLoading && chapterNotes.length > 0 && (
            <View style={styles.sectionCard}>
              <View style={styles.sectionHeader}>
                <Ionicons name="document-text" size={18} color={semantic.success.solid} />
                <Text style={styles.sectionTitle}>Notes</Text>
                <View style={styles.countBadge}><Text style={styles.countBadgeTxt}>{chapterNotes.length}</Text></View>
              </View>
              {chapterNotes.map((n: any) => (
                <TouchableOpacity
                  key={n.id}
                  style={styles.noteRow}
                  activeOpacity={0.8}
                  onPress={() => n.download_url && Linking.openURL(n.download_url)}
                  disabled={!n.download_url}
                >
                  <View style={[styles.noteIcon, { backgroundColor: accentSolid.emerald }]}>
                    <Ionicons name="document" size={16} color="#fff" />
                  </View>
                  <Text style={styles.noteTitle} numberOfLines={1}>{n.title}</Text>
                  {n.download_url
                    ? <Ionicons name="download-outline" size={16} color={palette.gray400} />
                    : <Text style={styles.hintTxt}>Unavailable</Text>}
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* Practice / Quiz section — routes into the existing (unmodified) exercises flow */}
          <View style={styles.sectionCard}>
            <View style={styles.sectionHeader}>
              <Ionicons name="school" size={18} color={semantic.warning.solid} />
              <Text style={styles.sectionTitle}>Practice &amp; Quiz</Text>
              {practiceCount > 0 && <View style={styles.countBadge}><Text style={styles.countBadgeTxt}>{practiceCount}</Text></View>}
            </View>
            {contentLoading ? (
              <ActivityIndicator color={palette.primary600} style={{ marginVertical: 8 }} />
            ) : (
              <TouchableOpacity
                style={styles.continueRow}
                activeOpacity={0.85}
                onPress={() => setChapterStep("exercises")}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.continueTitle}>
                    {exercises.length > 0 ? `${exercises.length} exercises` : directQuestions.length > 0 ? `${directQuestions.length} questions` : "Exercises & Questions"}
                  </Text>
                  <Text style={styles.continueSub}>Instant-feedback practice · graded quizzes</Text>
                </View>
                <Ionicons name="arrow-forward-circle" size={26} color={palette.primary600} />
              </TouchableOpacity>
            )}
          </View>

          {/* Empty state — nothing to show at all, fall through to exercises directly */}
          {!topicsLoading && !contentLoading && totalVideos === 0 && chapterNotes.length === 0 && practiceCount === 0 && (
            <EmptyState icon="library-outline" title="No content available yet" />
          )}
        </ScrollView>
      <VideoPlayerModal />
      </SafeAreaView>
    );
  }

  // ── Render: Class selection ─────────────────────────────────────────────────
  if (selectedBoard && chapterStep === "class") {
    return (
      <SafeAreaView style={styles.safe}>
        <StatusBar barStyle="dark-content" />
        <View style={[styles.topBar, { backgroundColor: palette.primary600 }]}>
          <TouchableOpacity onPress={goBack} style={styles.backBtnLight}>
            <Ionicons name="arrow-back" size={20} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.topBarTitle}>{selectedBoard.name}</Text>
          <Text style={styles.topBarSub}>Choose your class</Text>
        </View>
        <View style={styles.body}>
          {classesLoading && <ActivityIndicator color={palette.primary600} size="large" style={{ marginTop: 40 }} />}
          {!classesLoading && apiClasses.length === 0 && (
            <EmptyState icon="school-outline" title="No classes available for this board" />
          )}
          <ScrollView showsVerticalScrollIndicator={false}>
            <View style={styles.classGrid}>
              {apiClasses.map((c: any, idx: number) => (
                <TouchableOpacity
                  key={c.id}
                  style={styles.classCard}
                  activeOpacity={0.85}
                  onPress={() => { setSelectedClass(c); setChapterStep("subject"); }}
                >
                  <View style={[styles.classIconWrap, { backgroundColor: rowTint(idx) }]}>
                    <Ionicons name="school" size={20} color="#fff" />
                  </View>
                  <Text style={styles.classNum} numberOfLines={1} ellipsizeMode="tail">{c.number ?? c.name}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
        </View>
      <VideoPlayerModal />
      </SafeAreaView>
    );
  }

  // ── Render: Subject Grid ──────────────────────────────────────────────────
  if (chapterStep === "subject") {
    return (
      <SafeAreaView style={styles.safe}>
        <StatusBar barStyle="dark-content" />
        <View style={[styles.topBar, { backgroundColor: palette.primary600 }]}>
          <Text style={styles.topBarTitle}>{t("learn")}</Text>
          <Text style={styles.topBarSub}>
            {myBoardClass ? `${myBoardClass.board} · Class ${myBoardClass.class_num}` : "Your curriculum"}
          </Text>
        </View>

        <View style={styles.body}>
          <View style={styles.searchRow}>
            <Ionicons name="search-outline" size={18} color={palette.gray400} style={{ marginRight: 8 }} />
            <TextInput
              style={styles.searchInput}
              placeholder={t("search")}
              placeholderTextColor={palette.gray400}
              value={search}
              onChangeText={setSearch}
            />
          </View>

          {subjectsLoading && <ActivityIndicator color={palette.primary600} size="large" style={{ marginTop: 40 }} />}

          {profileMissing && (
            <View style={styles.emptyState}>
              <Ionicons name="alert-circle-outline" size={40} color={semantic.warning.solid} />
              <Text style={styles.emptyStateTxt}>Set your Board and Class in Profile</Text>
              <Text style={styles.emptyStateHint}>
                All subjects, chapters and quizzes are matched to your curriculum.
              </Text>
            </View>
          )}

          {!subjectsLoading && !profileMissing && filteredSubjects.length === 0 && (
            <EmptyState icon="school-outline" title="No subjects available for your class yet" />
          )}

          <ScrollView showsVerticalScrollIndicator={false}>
            <View style={styles.subjectGrid}>
              {filteredSubjects.map(s => {
                const ui = getSubjectUI(s.name);
                const progress = subjectProgress[s.id];
                const pct = progress?.completion_percentage ?? 0;
                const status: "not_started" | "in_progress" | "completed" = progress?.status ?? "not_started";
                const chaptersTotal = progress?.chapters_total ?? s.chapters_count ?? s.chapters ?? 0;
                const isContinue = s.id === continueSubjectId;
                const barColor = status === "completed" ? semantic.success.solid : ui.color;
                return (
                  <TouchableOpacity
                    key={s.id}
                    onPress={() => { setSelectedSubject(s); setChapterStep("chapter"); }}
                    style={[styles.subjectCard, isContinue && styles.subjectCardContinue]}
                    activeOpacity={0.85}
                  >
                    {isContinue && (
                      <View style={styles.continueBadge}>
                        <Text style={styles.continueBadgeTxt}>Continue</Text>
                      </View>
                    )}
                    <View style={[styles.subjectGrad, { backgroundColor: ui.tint }]}>
                      <Ionicons name={ui.icon as any} size={28} color="#fff" />
                    </View>
                    <Text style={styles.subjectName} numberOfLines={2} ellipsizeMode="tail">{s.name}</Text>
                    <Text style={styles.subjectChapters} numberOfLines={1} ellipsizeMode="tail">{chaptersTotal} chapters</Text>
                    <View style={styles.subjectBarTrack}>
                      <View style={[styles.subjectBarFill, { width: `${Math.min(100, pct)}%`, backgroundColor: barColor }]} />
                    </View>
                    <Text style={[
                      styles.subjectPct,
                      status === "completed" && styles.subjectPctDone,
                      status === "in_progress" && { color: ui.color },
                    ]}>
                      {status === "not_started" ? "Not started" : `${pct}% complete`}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </ScrollView>
        </View>
      <VideoPlayerModal />
      </SafeAreaView>
    );
  }

  // ── Render: Board selection (entry step — replaces hardcoded CBSE) ─────────
  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="dark-content" />
      <View style={[styles.topBar, { backgroundColor: palette.primary600 }]}>
        <Text style={styles.topBarTitle}>{t("learn")}</Text>
        <Text style={styles.topBarSub}>Choose your board</Text>
      </View>

      <View style={styles.body}>
        <View style={styles.searchRow}>
          <Ionicons name="search-outline" size={18} color={palette.gray400} style={{ marginRight: 8 }} />
          <TextInput
            style={styles.searchInput}
            placeholder={t("search")}
            placeholderTextColor={palette.gray400}
            value={search}
            onChangeText={setSearch}
          />
        </View>

        {boardsLoading && <ActivityIndicator color={palette.primary600} size="large" style={{ marginTop: 40 }} />}

        {!boardsLoading && apiBoards.length === 0 && (
          <EmptyState icon="library-outline" title="No boards available" />
        )}

        <ScrollView contentContainerStyle={styles.chapterList} showsVerticalScrollIndicator={false}>
          {apiBoards
            .filter((b: any) => b.name.toLowerCase().includes(search.toLowerCase()))
            .map((b: any, idx: number) => (
              <TouchableOpacity
                key={b.id}
                style={styles.chapterCard}
                activeOpacity={0.85}
                onPress={() => { setSelectedBoard(b); setChapterStep("class"); }}
              >
                <View style={[styles.chNum, { backgroundColor: rowTint(idx) }]}>
                  <Ionicons name="library" size={18} color="#fff" />
                </View>
                <View style={styles.chInfo}>
                  <Text style={styles.chTitle}>{b.name}</Text>
                  {b.code ? <Text style={styles.chSub}>{b.code}</Text> : null}
                </View>
                <Ionicons name="chevron-forward" size={18} color={palette.gray400} />
              </TouchableOpacity>
            ))}
        </ScrollView>
      </View>

      {/* Embedded video player modal */}
      <VideoPlayerModal />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:          { flex: 1, backgroundColor: palette.gray50 },
  topBar:        { paddingTop: 16, paddingHorizontal: 20, paddingBottom: 28 },
  topBarTitle:   { color: "#fff", fontSize: 18, fontWeight: "800" },
  topBarSub:     { color: "rgba(255,255,255,0.7)", fontSize: 12, marginTop: 2 },
  body:          { flex: 1, marginTop: -14, borderTopLeftRadius: 20, borderTopRightRadius: 20, backgroundColor: palette.gray50, paddingTop: 16 },
  searchRow:     { flexDirection: "row", alignItems: "center", backgroundColor: "#fff", marginHorizontal: 16, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10, marginBottom: 16, elevation: 2, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4 },
  searchInput:   { flex: 1, fontSize: 14, color: palette.gray900 },
  subjectGrid:   { flexDirection: "row", flexWrap: "wrap", paddingHorizontal: 12, gap: 10, paddingBottom: 32 },
  subjectCard:   { flexGrow: 1, flexBasis: "47%", minWidth: 130, backgroundColor: "#fff", borderRadius: 20, padding: 16, alignItems: "center", borderWidth: 1, borderColor: palette.gray100, position: "relative", ...cardShadow },
  subjectCardContinue: { borderColor: palette.primary500, borderWidth: 1.5 },
  continueBadge: { position: "absolute", top: 10, right: 10, backgroundColor: palette.primary600, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 },
  continueBadgeTxt: { fontSize: 9, fontWeight: "800", color: "#fff" },
  subjectGrad:   { width: 56, height: 56, borderRadius: 16, alignItems: "center", justifyContent: "center", marginBottom: 10 },
  subjectName:   { fontSize: 13, fontWeight: "700", color: palette.gray900, textAlign: "center" },
  subjectChapters: { fontSize: 10, color: palette.gray500, marginTop: 2 },
  subjectBarTrack: { width: "100%", height: 5, borderRadius: 3, backgroundColor: palette.gray100, marginTop: 10, overflow: "hidden" },
  subjectBarFill:  { height: "100%", borderRadius: 3 },
  subjectPct:      { fontSize: 10.5, fontWeight: "700", color: palette.gray400, marginTop: 5 },
  subjectPctDone:  { color: semantic.success.solid },

  // Chapter / Exercise / Question list
  chapterHeader: { flexDirection: "row", alignItems: "center", padding: 16, backgroundColor: "#fff", elevation: 2, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4 },
  backBtn:       { width: 38, height: 38, borderRadius: 12, backgroundColor: palette.primary50, alignItems: "center", justifyContent: "center", marginRight: 12 },
  chapterHeaderTitle: { fontSize: 15, fontWeight: "800", color: palette.gray900 },
  chapterHeaderSub:   { fontSize: 11, color: palette.gray500 },
  subjectIcon:   { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center", marginLeft: "auto" },
  chapterList:   { padding: 16, gap: 10 },
  chapterCard:   { flexDirection: "row", alignItems: "center", backgroundColor: "#fff", borderRadius: 16, padding: 14, borderWidth: 1, borderColor: palette.gray100, ...cardShadow },
  chNum:         { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center", marginRight: 12 },
  chNumTxt:      { fontSize: 12, fontWeight: "700" },
  chInfo:        { flex: 1 },
  chTitle:       { fontSize: 13, fontWeight: "600", color: palette.gray900 },
  chSub:         { fontSize: 11, color: palette.gray500, marginTop: 2 },

  // Certificate banner
  certBanner: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: "#FEF9C3", borderRadius: 16, borderWidth: 1, borderColor: "#FDE047", padding: 14, marginBottom: 8 },
  certEmoji: { fontSize: 32 },
  certTitle: { fontSize: 14, fontWeight: "800", color: "#713F12" },
  certSub: { fontSize: 11, color: semantic.warning.text, marginTop: 2 },
  certShareBtn: { borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  certShareTxt: { color: "#fff", fontSize: 12, fontWeight: "700" },

  // Empty states
  emptyState:    { alignItems: "center", padding: 40 },
  emptyStateTxt: { color: palette.gray500, marginTop: 12, textAlign: "center", fontSize: 14 },
  emptyStateHint:{ fontSize: 12, color: palette.gray400, textAlign: "center", marginTop: 4 },

  // Question detail
  detailScroll:  { padding: 16, gap: 16, paddingBottom: 40 },
  sectionCard:   { backgroundColor: "#fff", borderRadius: 20, padding: 16, borderWidth: 1, borderColor: palette.gray100, ...cardShadow },
  sectionHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 },
  sectionTitle:  { fontSize: 13, fontWeight: "700", color: palette.gray700, flex: 1 },
  countBadge:    { backgroundColor: palette.gray100, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 },
  countBadgeTxt: { fontSize: 11, fontWeight: "700", color: palette.gray500 },
  emptyText:     { fontSize: 13, color: palette.gray400, textAlign: "center", paddingVertical: 12 },

  // Video card
  videoCard:     { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: palette.gray50, borderRadius: 14, padding: 12 },
  videoThumb:    { width: 72, height: 48, borderRadius: 10, backgroundColor: palette.primary600, alignItems: "center", justifyContent: "center" },
  videoTitle:    { fontSize: 13, fontWeight: "600", color: palette.gray900, marginBottom: 4 },
  langRow:       { flexDirection: "row", gap: 4 },
  langBadge:     { fontSize: 9, fontWeight: "700", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },

  // Watched note (auto-complete)
  watchedNote:   { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: semantic.success.bg, borderWidth: 1, borderColor: semantic.success.border, borderRadius: 12, paddingVertical: 10, marginTop: 12 },
  watchedNoteTxt:{ color: semantic.success.solid, fontSize: 12, fontWeight: "700" },
  hintTxt:       { fontSize: 11, color: palette.gray400, textAlign: "center", marginTop: 10, lineHeight: 15 },

  // Completion bar
  barLabel:      { fontSize: 11, fontWeight: "600", color: palette.gray500 },
  barTrack:      { height: 6, backgroundColor: palette.gray200, borderRadius: 999, overflow: "hidden" },
  barFill:       { height: 6, borderRadius: 999 },

  // Unlock buttons (Practice / Quiz)
  unlockWrap:    { gap: 10 },
  unlockHeaderRow: { flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" },
  unlockHeader:  { fontSize: 11, fontWeight: "800", color: palette.gray400, textTransform: "uppercase", letterSpacing: 0.5 },
  optionalBadge: { backgroundColor: semantic.warning.bg, borderRadius: 8, paddingHorizontal: 6, paddingVertical: 1 },
  optionalBadgeTxt: { fontSize: 9, fontWeight: "800", color: semantic.warning.text },
  unlockedBadge: { flexDirection: "row", alignItems: "center", gap: 2, backgroundColor: semantic.success.bg, borderRadius: 8, paddingHorizontal: 6, paddingVertical: 1 },
  unlockedTxt:   { fontSize: 9, fontWeight: "800", color: semantic.success.solid },
  lockedBadge:   { flexDirection: "row", alignItems: "center", gap: 2, backgroundColor: palette.gray100, borderRadius: 8, paddingHorizontal: 6, paddingVertical: 1 },
  lockedTxt:     { fontSize: 9, fontWeight: "700", color: palette.gray400 },
  unlockRow:     { flexDirection: "row", gap: 10 },
  unlockCard:    { flex: 1, borderRadius: 16, padding: 14, borderWidth: 2 },
  practiceCard:  { backgroundColor: semantic.success.bg, borderColor: semantic.success.border },
  quizCard:      { backgroundColor: palette.primary50, borderColor: palette.primary200 },
  lockedCard:    { backgroundColor: palette.gray50, borderColor: palette.gray200, opacity: 0.7 },
  unlockIcon:    { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center", marginBottom: 8 },
  unlockCardTitle: { fontSize: 14, fontWeight: "800", color: palette.gray900 },
  unlockCardSub: { fontSize: 10, color: palette.gray500, marginTop: 2 },

  // Practice / quiz question card
  pqCard:        { backgroundColor: "#fff", borderWidth: 1, borderColor: palette.gray100, borderRadius: 16, padding: 16, marginBottom: 12, ...cardShadow },
  pqText:        { fontSize: 14, fontWeight: "700", color: palette.gray900, marginBottom: 12, lineHeight: 19 },
  optRow:        { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, paddingVertical: 11, borderRadius: 12, backgroundColor: palette.gray50, marginBottom: 8, borderWidth: 1, borderColor: "transparent" },
  optSelected:   { backgroundColor: palette.primary50, borderColor: palette.primary400 },
  optCorrect:    { backgroundColor: semantic.success.bg, borderColor: semantic.success.border },
  optWrong:      { backgroundColor: semantic.danger.bg, borderColor: semantic.danger.border },
  optKey:        { fontSize: 12, fontWeight: "800", color: palette.gray500, width: 20 },
  optKeyCorrect: { color: semantic.success.solid },
  optKeyWrong:   { color: semantic.danger.solid },
  optKeySelected:{ color: palette.primary600 },
  optTxt:        { flex: 1, fontSize: 13, color: palette.gray700, lineHeight: 18 },
  optTxtCorrect: { color: semantic.success.text, fontWeight: "600" },
  explBox:       { flexDirection: "row", gap: 6, backgroundColor: semantic.info.bg, borderRadius: 10, padding: 10, marginTop: 4 },
  explanation:   { flex: 1, fontSize: 12, color: semantic.info.text, lineHeight: 17 },

  // Score banner
  scoreBanner:   { flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 16, borderWidth: 2, padding: 14, marginBottom: 8 },
  scoreIcon:     { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  scoreTitle:    { fontSize: 15, fontWeight: "800", color: palette.gray900 },
  scoreSub:      { fontSize: 12, color: palette.gray500, marginTop: 2 },
  retryBtn:      { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "#fff", borderWidth: 1, borderColor: palette.gray200, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  retryTxt:      { fontSize: 12, fontWeight: "700", color: palette.gray700 },

  // Mode badge
  modeBadge:     { flexDirection: "row", alignItems: "center", gap: 4, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6, marginLeft: "auto" },
  modeBadgeTxt:  { fontSize: 12, fontWeight: "800" },

  // Submit
  submitBtn:     { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 16, paddingVertical: 16, marginTop: 4 },
  submitBtnDisabled: { backgroundColor: palette.primary200 },
  submitTxt:     { color: "#fff", fontSize: 15, fontWeight: "800" },

  // Quiz button
  quizBtn:       { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, borderRadius: 18, paddingVertical: 16 },
  quizBtnTxt:    { color: "#fff", fontSize: 15, fontWeight: "700" },

  // Difficulty badge (Topic.difficulty — real API field; NOT fabricated for Chapter)
  diffBadge:     { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2, alignSelf: "flex-start" },
  diffBadgeTxt:  { fontSize: 10, fontWeight: "800" },

  // Board/Class selection screens
  backBtnLight:  { alignSelf: "flex-start", width: 34, height: 34, borderRadius: 10, backgroundColor: "rgba(255,255,255,0.18)", alignItems: "center", justifyContent: "center", marginBottom: 10 },
  classGrid:     { flexDirection: "row", flexWrap: "wrap", paddingHorizontal: 16, gap: 10, paddingBottom: 32, paddingTop: 4 },
  classCard:     { flexGrow: 1, flexBasis: "30%", minWidth: 88, backgroundColor: "#fff", borderRadius: 16, paddingVertical: 18, paddingHorizontal: 8, alignItems: "center", borderWidth: 1, borderColor: palette.gray100, ...cardShadow },
  classIconWrap: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center", marginBottom: 8 },
  classNum:      { fontSize: 15, fontWeight: "800", color: palette.gray900 },

  // Topics step
  topicRow:      { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 6, paddingHorizontal: 2 },
  topicLabel:    { fontSize: 12, fontWeight: "700", color: palette.gray500, flex: 1, marginRight: 8 },
  noteRow:       { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: palette.gray100 },
  noteIcon:      { width: 30, height: 30, borderRadius: 9, backgroundColor: semantic.success.bg, alignItems: "center", justifyContent: "center" },
  noteTitle:     { flex: 1, fontSize: 13, fontWeight: "600", color: palette.gray900 },
  continueRow:   { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: palette.gray50, borderRadius: 14, padding: 14 },
  continueTitle: { fontSize: 13, fontWeight: "700", color: palette.gray900 },
  continueSub:   { fontSize: 11, color: palette.gray500, marginTop: 2 },

  // Video player modal — notes / playlist / recommended
  notesOpenBtn:    { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 12, paddingVertical: 12, marginTop: 10 },
  notesOpenBtnTxt: { color: "#fff", fontSize: 13, fontWeight: "700" },
  playlistRow:     { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: palette.gray100 },
  playlistTitle:   { flex: 1, fontSize: 13, fontWeight: "600", color: palette.gray900 },
});
