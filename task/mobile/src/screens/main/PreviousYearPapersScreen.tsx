import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Image, RefreshControl, ActivityIndicator, Modal, SafeAreaView, Linking, Platform,
} from "react-native";

// Native in-app PDF view uses react-native-webview; on react-native-web the
// render tree is ReactDOM, so a plain <iframe> host element works instead.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const NativeWebView: any = Platform.OS === "web" ? null : require("react-native-webview").WebView;
import { Ionicons } from "@expo/vector-icons";
import * as WebBrowser from "expo-web-browser";
import { useQuery } from "@tanstack/react-query";
import Toast from "react-native-toast-message";
import { useLanguage } from "@/contexts/LanguageContext";
import { fmt } from "@/i18n/format";
import { useStudyTime } from "@/hooks/useStudyTime";
import { contentApi } from "@/api/content";
import AITutorScreen from "@/screens/main/AITutorScreen";
import { palette, semantic, accentSolid } from "@/theme/colors";

// Per-subject tag colors — a deliberate multi-hue exception (distinguishing
// ~9 subjects at a glance), all sourced from theme tokens rather than raw
// hex. "Civics" previously used the forbidden brand-violet (#7C3AED); now
// mapped to a non-brand color (rose) so no subject pairs with the primary
// indigo the way a gradient would.
const SUBJECT_COLORS: Record<string, string> = {
  Mathematics: palette.primary600, Science: accentSolid.cyan, "Social Sci.": palette.warning600,
  Economics: palette.success600, Civics: accentSolid.rose, Biology: palette.danger600, English: accentSolid.teal,
  Physics: palette.info600, Chemistry: "#DB2777",
};

function ytThumb(ytId: string) {
  return `https://img.youtube.com/vi/${ytId}/mqdefault.jpg`;
}

function fmtDuration(totalSeconds?: number) {
  if (!totalSeconds && totalSeconds !== 0) return "";
  const m = Math.floor(totalSeconds / 60);
  const s = Math.floor(totalSeconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

// ── API response shapes (see content_service /previous-year-papers & /pyp-practice-questions) ──
interface PypVideo {
  youtube_id: string;
  title: string;
  duration_seconds?: number;
  topic: string;
}

interface Paper {
  id: string;
  board: string;
  class_num: number;
  subject: string;
  year: number;
  exam_type: string;
  title: string;
  description?: string;
  file_url?: string | null;
  thumbnail_url?: string | null;
  difficulty?: string;
  tags?: { topics?: string[] } | null;
  videos: PypVideo[];
}

interface PracticeQuestion {
  id: string;
  topic_name: string;
  text: string;
  options: Record<string, string>;
  correct_option: string;
  explanation?: string | null;
  difficulty: string;
}

interface Props {
  onOpenAITutor?: () => void;
  onPractice?: (paper: Paper, topic: string) => void;
  onQuiz?: (paper: Paper) => void;
}

const ALL = "All";

export default function PreviousYearPapersScreen({ onOpenAITutor, onPractice, onQuiz }: Props = {}) {
  const { t } = useLanguage();
  const { blocked: studyBlocked, limitMinutes: studyLimitMinutes } = useStudyTime();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"videos" | "analysis">("videos");
  const [localAITutor, setLocalAITutor] = useState(false);
  const [practiceFor, setPracticeFor] = useState<{ paper: Paper; topic: string } | null>(null);
  const [quizFor, setQuizFor] = useState<{ paper: Paper; topic: string } | null>(null);
  // Tracks the specific video the user actually opened within the currently
  // expanded paper, mirroring web's `activeVideo` — so Practice can be scoped
  // to that video's topic (see PreviousYearPapersPage.tsx openVideo/openPQ).
  const [selectedVideo, setSelectedVideo] = useState<PypVideo | null>(null);

  // ── Filters ────────────────────────────────────────────────────────────────
  const [board, setBoard] = useState(ALL);
  const [year, setYear] = useState(ALL);
  const [subject, setSubject] = useState(ALL);
  const [filterSheet, setFilterSheet] = useState<"board" | "year" | "subject" | null>(null);

  const filtersActive = board !== ALL || year !== ALL || subject !== ALL;

  const apiFilters = {
    class_num: 10,
    ...(board !== ALL ? { board } : {}),
    ...(year !== ALL ? { year: Number(year) } : {}),
    ...(subject !== ALL ? { subject } : {}),
  };

  const {
    data,
    isLoading,
    isRefetching,
    refetch,
  } = useQuery({
    queryKey: ["previous-year-papers", apiFilters],
    queryFn: () => contentApi.getPreviousYearPapers(apiFilters).then(r => r.data),
    staleTime: 60_000,
  });

  const papers: Paper[] = data?.papers ?? [];
  const totalVideos = papers.reduce((s, p) => s + (p.videos?.length ?? 0), 0);

  // Unfiltered set — used only to derive the available filter option lists,
  // mirroring frontend/src/pages/content/PreviousYearPapersPage.tsx.
  const { data: allData } = useQuery({
    queryKey: ["previous-year-papers", { class_num: 10 }],
    queryFn: () => contentApi.getPreviousYearPapers({ class_num: 10 }).then(r => r.data),
    staleTime: 60_000,
  });
  const allPapers: Paper[] = allData?.papers ?? [];

  const BOARDS = useMemo(
    () => [ALL, ...Array.from(new Set(allPapers.map(p => p.board).filter(Boolean))).sort()],
    [allPapers],
  );
  const YEARS = useMemo(
    () => [ALL, ...Array.from(new Set(allPapers.map(p => String(p.year)).filter(Boolean))).sort((a, b) => Number(b) - Number(a))],
    [allPapers],
  );
  const SUBJECTS = useMemo(
    () => [ALL, ...Array.from(new Set(allPapers.map(p => p.subject).filter(Boolean))).sort()],
    [allPapers],
  );

  const clearFilters = () => {
    setBoard(ALL);
    setYear(ALL);
    setSubject(ALL);
  };

  const onRefresh = async () => {
    await refetch();
  };

  const togglePaper = (id: string) => {
    setExpanded(prev => (prev === id ? null : id));
    setActiveTab("videos");
    setSelectedVideo(null); // reset video focus when switching papers
  };

  const openVideo = (v: PypVideo) => {
    if (studyBlocked) {
      Toast.show({
        type: "info",
        text1: fmt(t("studyLimitReachedTitle"), { limit: studyLimitMinutes ?? 0 }),
        text2: t("studyLimitBlockVideo"),
      });
      return;
    }
    setSelectedVideo(v);
    WebBrowser.openBrowserAsync(`https://www.youtube.com/watch?v=${v.youtube_id}`);
  };

  const openDownload = (fileUrl: string) => {
    Linking.openURL(fileUrl);
  };

  // Read the paper ON the platform (full-screen in-app viewer) — download stays optional
  const [viewingPaper, setViewingPaper] = useState<{ title: string; url: string } | null>(null);

  const handleAITutor = () => {
    if (onOpenAITutor) onOpenAITutor();
    else setLocalAITutor(true);
  };

  const handlePractice = (paper: Paper, topic: string) => {
    if (onPractice) onPractice(paper, topic);
    else setPracticeFor({ paper, topic });
  };

  // Mirrors web's per-video "Take Quiz" (openPQ mode="quiz"), which builds an
  // inline quiz from that specific paper/video's topic questions via
  // pypQsMap[video.topic] (contentApi.pypPracticeQuestions()) — NOT a generic
  // gamified quiz-service lookup by paper id. `onQuiz` is intentionally not
  // used to navigate here: the DashboardScreen wiring for it opens a quizId
  // that doesn't correspond to any real quiz-service resource for a PYP paper.
  const handleQuiz = (paper: Paper, topic: string) => {
    setQuizFor({ paper, topic });
  };

  return (
    <>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={onRefresh} colors={[palette.primary600]} />}
      >

        {/* Hero */}
        <View style={styles.hero}>
          <View style={styles.heroBadge}>
            <Text style={styles.heroBadgeTxt}>CBSE Class 10</Text>
          </View>
          <Text style={styles.heroTitle}>Previous Year Papers</Text>
          <Text style={styles.heroSub}>Video solutions for all questions</Text>
          <View style={styles.heroStats}>
            {[
              { v: String(papers.length), l: "Papers" },
              { v: String(totalVideos), l: "Videos" },
              { v: papers.length ? `${Math.min(...papers.map(p => p.year))}–${Math.max(...papers.map(p => p.year))}` : "—", l: "Coverage" },
            ].map((s, i) => (
              <View key={i} style={styles.heroStat}>
                <Text style={styles.heroStatV}>{s.v}</Text>
                <Text style={styles.heroStatL}>{s.l}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Filter bar */}
        <View style={styles.filterBar}>
          <View style={styles.filterBarTop}>
            <View style={styles.filterBarLabel}>
              <Ionicons name="filter-outline" size={14} color={palette.gray500} />
              <Text style={styles.filterBarLabelTxt}>Filters</Text>
            </View>
            {filtersActive && (
              <TouchableOpacity onPress={clearFilters} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                <Text style={styles.clearFiltersTxt}>Clear filters</Text>
              </TouchableOpacity>
            )}
          </View>
          <View style={styles.filterChipsRow}>
            {([
              { key: "board" as const, label: "Board", value: board },
              { key: "year" as const, label: "Year", value: year },
              { key: "subject" as const, label: "Subject", value: subject },
            ]).map(f => (
              <TouchableOpacity
                key={f.key}
                style={[styles.filterChip, f.value !== ALL && styles.filterChipActive]}
                onPress={() => setFilterSheet(f.key)}
                activeOpacity={0.8}
              >
                <Text style={[styles.filterChipTxt, f.value !== ALL && styles.filterChipTxtActive]} numberOfLines={1}>
                  {f.value === ALL ? f.label : f.value}
                </Text>
                <Ionicons name="chevron-down" size={13} color={f.value !== ALL ? palette.primary600 : palette.gray400} />
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {isLoading && (
          <ActivityIndicator color={palette.primary600} style={{ marginTop: 32 }} />
        )}

        {!isLoading && papers.length === 0 && filtersActive && (
          <View style={styles.empty}>
            <Ionicons name="search-outline" size={44} color={palette.gray300} />
            <Text style={styles.emptyTxt}>No papers match your filters</Text>
            <Text style={styles.emptySub}>Try a different board, year or subject</Text>
            <TouchableOpacity style={styles.clearFiltersBtn} onPress={clearFilters}>
              <Text style={styles.clearFiltersBtnTxt}>Clear filters</Text>
            </TouchableOpacity>
          </View>
        )}

        {!isLoading && papers.length === 0 && !filtersActive && (
          <View style={styles.empty}>
            <Ionicons name="document-text-outline" size={44} color={palette.gray300} />
            <Text style={styles.emptyTxt}>No papers available yet</Text>
            <Text style={styles.emptySub}>Check back soon for previous year papers</Text>
          </View>
        )}

        {/* Paper Cards */}
        {!isLoading && papers.length > 0 && (
          <View style={styles.papersSection}>
            {papers.map(paper => {
              const videos = paper.videos ?? [];
              const isOpen = expanded === paper.id;
              const color  = SUBJECT_COLORS[paper.subject] ?? palette.primary600;
              const term   = paper.exam_type === "board_exam" ? "Board Exam" : paper.exam_type === "sample" ? "Sample Paper" : "Mock Test";
              const code   = `${paper.board}/${paper.year}/${paper.subject.slice(0, 3).toUpperCase()}`;
              const fileUrl = paper.file_url;

              return (
                <View key={paper.id} style={[styles.paperCard, isOpen && styles.paperCardOpen]}>
                  {/* Paper header */}
                  <TouchableOpacity
                    style={styles.paperHeader}
                    activeOpacity={0.85}
                    onPress={() => togglePaper(paper.id)}
                  >
                    <View style={[styles.yearBadge, { backgroundColor: color + "18" }]}>
                      <Text style={[styles.yearBadgeTxt, { color }]}>{paper.year}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.paperSubject}>{paper.subject} — {term}</Text>
                      <Text style={styles.paperCode}>{code}</Text>
                    </View>
                    <View style={styles.paperRight}>
                      <View style={[styles.solvedBadge, { backgroundColor: color + "18" }]}>
                        <Ionicons name="play-circle" size={12} color={color} />
                        <Text style={[styles.solvedTxt, { color }]}>{videos.length} videos</Text>
                      </View>
                      <Ionicons name={isOpen ? "chevron-up" : "chevron-down"} size={18} color={palette.gray400} />
                    </View>
                  </TouchableOpacity>

                  {!!fileUrl && (
                    <View style={styles.paperActionsRow}>
                      <TouchableOpacity
                        style={styles.viewRow}
                        activeOpacity={0.8}
                        onPress={() => setViewingPaper({ title: paper.title ?? `${paper.subject} ${paper.year}`, url: fileUrl })}
                      >
                        <Ionicons name="eye-outline" size={13} color={palette.primary600} />
                        <Text style={styles.viewRowTxt}>View paper</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.downloadRow2}
                        activeOpacity={0.8}
                        onPress={() => openDownload(fileUrl)}
                      >
                        <Ionicons name="download-outline" size={13} color={semantic.success.solid} />
                        <Text style={styles.downloadRowTxt}>Download</Text>
                      </TouchableOpacity>
                    </View>
                  )}

                  {/* Expanded content */}
                  {isOpen && (
                    <View style={styles.paperBody}>
                      {/* Tabs */}
                      <View style={styles.tabs}>
                        {(["videos", "analysis"] as const).map(tab => (
                          <TouchableOpacity
                            key={tab}
                            style={[styles.tab, activeTab === tab && { borderBottomColor: color, borderBottomWidth: 2 }]}
                            onPress={() => setActiveTab(tab)}
                          >
                            <Text style={[styles.tabTxt, activeTab === tab && { color, fontWeight: "700" }]}>
                              {tab === "videos" ? `Video Solutions (${videos.length})` : "AI Topic Analysis"}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>

                      {/* Video Solutions Tab */}
                      {activeTab === "videos" && (
                        <View style={styles.videoList}>
                          {videos.length === 0 && (
                            <Text style={styles.noVideosTxt}>No video solutions uploaded for this paper yet.</Text>
                          )}
                          {videos.map((v, i) => (
                            <TouchableOpacity
                              key={i}
                              style={styles.videoRow}
                              activeOpacity={0.85}
                              onPress={() => openVideo(v)}
                            >
                              <Image
                                source={{ uri: ytThumb(v.youtube_id) }}
                                style={styles.videoThumb}
                                resizeMode="cover"
                              />
                              <View style={{ flex: 1 }}>
                                <Text style={styles.videoTitle} numberOfLines={2}>{v.title}</Text>
                                <View style={styles.videoMeta}>
                                  <View style={[styles.topicBadge, { backgroundColor: color + "15" }]}>
                                    <Text style={[styles.topicTxt, { color }]}>{v.topic}</Text>
                                  </View>
                                  {!!v.duration_seconds && (
                                    <View style={styles.durBadge}>
                                      <Ionicons name="time-outline" size={10} color={palette.gray400} />
                                      <Text style={styles.durTxt}>{fmtDuration(v.duration_seconds)}</Text>
                                    </View>
                                  )}
                                </View>
                              </View>
                              <View style={styles.playIcon}>
                                <Ionicons name="play-circle" size={22} color={color} />
                              </View>
                            </TouchableOpacity>
                          ))}

                          {/* Practice / Quiz / AI Tutor buttons */}
                          <View style={styles.actionRow}>
                            <TouchableOpacity
                              style={[styles.actionBtn, { backgroundColor: semantic.success.bg, borderColor: palette.success100 }]}
                              onPress={() => handlePractice(paper, selectedVideo?.topic ?? videos[0]?.topic ?? paper.subject)}
                            >
                              <Ionicons name="school-outline" size={16} color={semantic.success.solid} />
                              <Text style={[styles.actionBtnTxt, { color: semantic.success.solid }]}>Practice</Text>
                            </TouchableOpacity>
                            {onQuiz && (
                              <TouchableOpacity
                                style={[styles.actionBtn, { backgroundColor: palette.primary50, borderColor: palette.primary200 }]}
                                onPress={() => handleQuiz(paper, selectedVideo?.topic ?? videos[0]?.topic ?? paper.subject)}
                              >
                                <Ionicons name="trophy-outline" size={16} color={palette.primary600} />
                                <Text style={[styles.actionBtnTxt, { color: palette.primary600 }]}>Quiz</Text>
                              </TouchableOpacity>
                            )}
                            <TouchableOpacity
                              style={[styles.actionBtn, { backgroundColor: palette.primary50, borderColor: palette.primary200 }]}
                              onPress={handleAITutor}
                            >
                              <Ionicons name="sparkles-outline" size={16} color={palette.primary600} />
                              <Text style={[styles.actionBtnTxt, { color: palette.primary600 }]}>AI Tutor</Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                      )}

                      {/* AI Topic Analysis Tab */}
                      {activeTab === "analysis" && (
                        <View style={styles.analysisSection}>
                          <Text style={styles.analysisTitle}>Topic Breakdown</Text>
                          {(videos.length > 0 ? videos : (paper.tags?.topics ?? []).map(t => ({ topic: t }))).map((v, i) => (
                            <View key={i} style={styles.analysisRow}>
                              <View style={[styles.analysisDot, { backgroundColor: color }]} />
                              <View style={{ flex: 1 }}>
                                <Text style={styles.analysisTopic}>{v.topic}</Text>
                              </View>
                              <View style={styles.analysisBarWrap}>
                                <View style={[styles.analysisBar, { width: `${60 + (i * 7) % 40}%` as any, backgroundColor: color + "60" }]} />
                              </View>
                            </View>
                          ))}
                          {videos.length === 0 && !(paper.tags?.topics?.length) && (
                            <Text style={styles.noVideosTxt}>No topic data available for this paper yet.</Text>
                          )}
                          <TouchableOpacity style={[styles.aiTutorBtn, { borderColor: color + "50" }]} onPress={handleAITutor}>
                            <Ionicons name="sparkles" size={16} color={color} />
                            <Text style={[styles.aiTutorTxt, { color }]}>Ask AI Tutor about {paper.subject}</Text>
                          </TouchableOpacity>
                        </View>
                      )}
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>

      {/* Local AI Tutor fallback modal (used when no onOpenAITutor callback provided) */}
      <Modal visible={localAITutor} animationType="slide" statusBarTranslucent onRequestClose={() => setLocalAITutor(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: palette.gray50 }}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setLocalAITutor(false)} style={{ marginRight: 12 }}>
              <Ionicons name="arrow-back" size={24} color={palette.gray700} />
            </TouchableOpacity>
            <Text style={styles.modalHeaderTxt}>✨ AI Tutor</Text>
          </View>
          <AITutorScreen />
        </SafeAreaView>
      </Modal>

      {/* Local Practice fallback modal — inline immediate-feedback question list */}
      <Modal visible={!!practiceFor} animationType="slide" statusBarTranslucent onRequestClose={() => setPracticeFor(null)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: palette.gray50 }}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setPracticeFor(null)} style={{ marginRight: 12 }}>
              <Ionicons name="arrow-back" size={24} color={palette.gray700} />
            </TouchableOpacity>
            <Text style={styles.modalHeaderTxt}>🎯 Practice — {practiceFor?.topic}</Text>
          </View>
          {practiceFor && <PracticeList paper={practiceFor.paper} topic={practiceFor.topic} />}
        </SafeAreaView>
      </Modal>

      {/* Local Quiz modal — inline lock-until-submit quiz built from this paper's
          topic questions (contentApi.pypPracticeQuestions), mirroring web's
          openPQ(video, "quiz") instead of the unrelated gamified quiz-service. */}
      <Modal visible={!!quizFor} animationType="slide" statusBarTranslucent onRequestClose={() => setQuizFor(null)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: palette.gray50 }}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setQuizFor(null)} style={{ marginRight: 12 }}>
              <Ionicons name="arrow-back" size={24} color={palette.gray700} />
            </TouchableOpacity>
            <Text style={styles.modalHeaderTxt}>🏆 Quiz — {quizFor?.topic}</Text>
          </View>
          {quizFor && <QuizList paper={quizFor.paper} topic={quizFor.topic} />}
        
      {/* ── In-app PYP reader — students read the paper without leaving the app ── */}
      <Modal visible={!!viewingPaper} animationType="slide" onRequestClose={() => setViewingPaper(null)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: "#fff" }}>
          <View style={styles.pdfHeader}>
            <TouchableOpacity onPress={() => setViewingPaper(null)} style={{ padding: 4 }}>
              <Ionicons name="arrow-back" size={22} color={palette.gray700} />
            </TouchableOpacity>
            <Text style={styles.pdfTitle} numberOfLines={1}>{viewingPaper?.title}</Text>
            <TouchableOpacity onPress={() => viewingPaper && openDownload(viewingPaper.url)} style={styles.pdfDownloadBtn}>
              <Ionicons name="download-outline" size={15} color={semantic.success.solid} />
              <Text style={styles.pdfDownloadTxt}>Download</Text>
            </TouchableOpacity>
          </View>
          {viewingPaper && (
            Platform.OS === "web"
              ? React.createElement("iframe", {
                  src: viewingPaper.url,
                  title: viewingPaper.title,
                  style: { flex: 1, width: "100%", height: "100%", border: "0" },
                })
              : <NativeWebView source={{ uri: viewingPaper.url }} style={{ flex: 1 }} startInLoadingState />
          )}
        </SafeAreaView>
      </Modal>
</SafeAreaView>
      </Modal>

      {/* Filter option picker — bottom sheet */}
      <Modal visible={!!filterSheet} transparent animationType="fade" onRequestClose={() => setFilterSheet(null)}>
        <TouchableOpacity style={styles.sheetOverlay} activeOpacity={1} onPress={() => setFilterSheet(null)}>
          <TouchableOpacity style={styles.sheetCard} activeOpacity={1} onPress={() => {}}>
            <Text style={styles.sheetTitle}>
              {filterSheet === "board" ? "Board" : filterSheet === "year" ? "Year" : "Subject"}
            </Text>
            <ScrollView style={{ maxHeight: 340 }} showsVerticalScrollIndicator={false}>
              {(filterSheet === "board" ? BOARDS : filterSheet === "year" ? YEARS : SUBJECTS).map(opt => {
                const current = filterSheet === "board" ? board : filterSheet === "year" ? year : subject;
                const isSelected = opt === current;
                return (
                  <TouchableOpacity
                    key={opt}
                    style={styles.sheetOption}
                    activeOpacity={0.7}
                    onPress={() => {
                      if (filterSheet === "board") setBoard(opt);
                      else if (filterSheet === "year") setYear(opt);
                      else if (filterSheet === "subject") setSubject(opt);
                      setFilterSheet(null);
                    }}
                  >
                    <Text style={[styles.sheetOptionTxt, isSelected && styles.sheetOptionTxtActive]}>
                      {opt === ALL ? `All ${filterSheet === "board" ? "Boards" : filterSheet === "year" ? "Years" : "Subjects"}` : opt}
                    </Text>
                    {isSelected && <Ionicons name="checkmark" size={18} color={palette.primary600} />}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </>
  );
}

// ── Inline practice question list with immediate feedback ─────────────────────
function PracticeList({ paper, topic }: { paper: Paper; topic: string }) {
  const [answers, setAnswers] = useState<Record<string, string>>({});

  const { data, isLoading } = useQuery({
    queryKey: ["pyp-practice-questions", topic],
    queryFn: () => contentApi.pypPracticeQuestions(topic).then(r => r.data),
    enabled: !!topic,
    staleTime: 60_000,
  });

  const questions: PracticeQuestion[] = data ?? [];
  const color = SUBJECT_COLORS[paper.subject] ?? palette.primary600;

  const selectAnswer = (qId: string, opt: string) => {
    setAnswers(prev => (prev[qId] ? prev : { ...prev, [qId]: opt }));
  };

  if (isLoading) {
    return <ActivityIndicator color={palette.primary600} style={{ marginTop: 32 }} />;
  }

  if (questions.length === 0) {
    return (
      <View style={styles.empty}>
        <Ionicons name="school-outline" size={44} color={palette.gray300} />
        <Text style={styles.emptyTxt}>No practice questions yet</Text>
        <Text style={styles.emptySub}>Practice questions for "{topic}" will appear here once added</Text>
      </View>
    );
  }

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, gap: 14 }}>
      {questions.map((q, qi) => {
        const picked = answers[q.id];
        return (
          <View key={q.id} style={styles.pqCard}>
            <Text style={styles.pqText}>{qi + 1}. {q.text}</Text>
            {Object.entries(q.options).map(([key, val]) => {
              const isPicked  = picked === key;
              const isCorrect = key === q.correct_option;
              const showState = !!picked && (isPicked || isCorrect);
              return (
                <TouchableOpacity
                  key={key}
                  disabled={!!picked}
                  activeOpacity={0.8}
                  onPress={() => selectAnswer(q.id, key)}
                  style={[
                    styles.pqOption,
                    showState && isCorrect && styles.pqOptionCorrect,
                    showState && isPicked && !isCorrect && styles.pqOptionWrong,
                  ]}
                >
                  <Text style={styles.pqOptionKey}>{key}</Text>
                  <Text style={styles.pqOptionTxt}>{val}</Text>
                  {showState && isCorrect && <Ionicons name="checkmark-circle" size={18} color={semantic.success.solid} />}
                  {showState && isPicked && !isCorrect && <Ionicons name="close-circle" size={18} color={palette.danger600} />}
                </TouchableOpacity>
              );
            })}
            {picked && q.explanation && (
              <View style={[styles.pqExplain, { borderColor: color + "40" }]}>
                <Ionicons name="bulb-outline" size={14} color={color} />
                <Text style={[styles.pqExplainTxt, { color }]}>{q.explanation}</Text>
              </View>
            )}
          </View>
        );
      })}
    </ScrollView>
  );
}

// ── Inline quiz — answers are locked until Submit, then all reveal at once with
// a score banner (mirrors web's openPQ mode="quiz" in PreviousYearPapersPage.tsx) ──
function QuizList({ paper, topic }: { paper: Paper; topic: string }) {
  const [selected, setSelected] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);

  // Attempt tracking. Best-effort telemetry: every call is swallowed on failure
  // so a network error can never block the student. The ref guard keeps a
  // re-render from double-POSTing an open attempt.
  const attemptRef = useRef<{ id: string; startedAt: number } | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["pyp-practice-questions", topic],
    queryFn: () => contentApi.pypPracticeQuestions(topic).then(r => r.data),
    enabled: !!topic,
    staleTime: 60_000,
  });

  const questions: PracticeQuestion[] = data ?? [];
  const color = SUBJECT_COLORS[paper.subject] ?? palette.primary600;
  const answeredCount = Object.keys(selected).length;
  const allAnswered = questions.length > 0 && answeredCount === questions.length;
  const correctCount = submitted
    ? questions.filter(q => selected[q.id] === q.correct_option).length
    : 0;
  const pct = questions.length ? Math.round((correctCount / questions.length) * 100) : 0;

  const startAttempt = () => {
    if (attemptRef.current) return;
    contentApi.startPypAttempt(paper.id)
      // content_service returns `attempt_id` (not `id`) on this route.
      .then(r => { attemptRef.current = { id: r.data.attempt_id, startedAt: Date.now() }; })
      .catch(() => {});
  };

  // The quiz only exists once there are questions to answer.
  useEffect(() => { if (questions.length > 0) startAttempt(); }, [questions.length]);

  const selectAnswer = (qId: string, opt: string) => {
    if (submitted) return;
    setSelected(prev => ({ ...prev, [qId]: opt }));
  };

  // Grade server-side: send question_id → chosen option letter, never a score.
  // `selected` already holds the option key ("A".."D"), which is what the
  // backend compares against correct_option.
  const submit = () => {
    setSubmitted(true);
    const attempt = attemptRef.current;
    if (!attempt) return;
    attemptRef.current = null;
    const seconds = Math.round((Date.now() - attempt.startedAt) / 1000);
    contentApi.submitPypAttempt(attempt.id, selected, seconds).catch(() => {});
  };

  const retry = () => {
    setSelected({});
    setSubmitted(false);
    startAttempt(); // a retry is a new attempt
  };

  if (isLoading) {
    return <ActivityIndicator color={palette.primary600} style={{ marginTop: 32 }} />;
  }

  if (questions.length === 0) {
    return (
      <View style={styles.empty}>
        <Ionicons name="trophy-outline" size={44} color={palette.gray300} />
        <Text style={styles.emptyTxt}>No quiz questions yet</Text>
        <Text style={styles.emptySub}>Quiz questions for "{topic}" will appear here once added</Text>
      </View>
    );
  }

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, gap: 14 }}>
      {submitted && (
        <View style={[styles.quizScoreBanner, { borderColor: color + "40" }]}>
          <Ionicons name="trophy" size={20} color={color} />
          <View style={{ flex: 1 }}>
            <Text style={styles.quizScoreTxt}>{correctCount}/{questions.length} correct · {pct}%</Text>
            <TouchableOpacity onPress={retry} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
              <Text style={[styles.quizRetryTxt, { color }]}>Retry quiz</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
      {questions.map((q, qi) => {
        const picked = selected[q.id];
        return (
          <View key={q.id} style={styles.pqCard}>
            <Text style={styles.pqText}>{qi + 1}. {q.text}</Text>
            {Object.entries(q.options).map(([key, val]) => {
              const isPicked  = picked === key;
              const isCorrect = key === q.correct_option;
              const showState = submitted && (isPicked || isCorrect);
              return (
                <TouchableOpacity
                  key={key}
                  disabled={submitted}
                  activeOpacity={0.8}
                  onPress={() => selectAnswer(q.id, key)}
                  style={[
                    styles.pqOption,
                    isPicked && !submitted && styles.pqOptionSelected,
                    showState && isCorrect && styles.pqOptionCorrect,
                    showState && isPicked && !isCorrect && styles.pqOptionWrong,
                  ]}
                >
                  <Text style={styles.pqOptionKey}>{key}</Text>
                  <Text style={styles.pqOptionTxt}>{val}</Text>
                  {showState && isCorrect && <Ionicons name="checkmark-circle" size={18} color={semantic.success.solid} />}
                  {showState && isPicked && !isCorrect && <Ionicons name="close-circle" size={18} color={palette.danger600} />}
                </TouchableOpacity>
              );
            })}
            {submitted && q.explanation && (
              <View style={[styles.pqExplain, { borderColor: color + "40" }]}>
                <Ionicons name="bulb-outline" size={14} color={color} />
                <Text style={[styles.pqExplainTxt, { color }]}>{q.explanation}</Text>
              </View>
            )}
          </View>
        );
      })}
      {!submitted && (
        <TouchableOpacity
          disabled={!allAnswered}
          activeOpacity={0.85}
          onPress={submit}
          style={[styles.quizSubmitBtn, { backgroundColor: color }, !allAnswered && styles.quizSubmitBtnDisabled]}
        >
          <Ionicons name="trophy-outline" size={16} color="#fff" />
          <Text style={styles.quizSubmitTxt}>
            Submit Quiz{!allAnswered ? ` (${answeredCount}/${questions.length})` : ""}
          </Text>
        </TouchableOpacity>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll:         { flex: 1, backgroundColor: palette.gray50 },
  content:        { paddingBottom: 40 },

  hero:           { padding: 24, paddingTop: 28 },
  heroBadge:      { backgroundColor: "rgba(255,255,255,0.2)", alignSelf: "flex-start", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4, marginBottom: 10 },
  heroBadgeTxt:   { color: "#fff", fontSize: 11, fontWeight: "700" },
  heroTitle:      { color: "#fff", fontSize: 22, fontWeight: "900", marginBottom: 4 },
  heroSub:        { color: "rgba(255,255,255,0.8)", fontSize: 13, marginBottom: 20 },
  heroStats:      { flexDirection: "row", gap: 24 },
  heroStat:       { alignItems: "center" },
  heroStatV:      { color: "#fff", fontSize: 20, fontWeight: "900" },
  heroStatL:      { color: "rgba(255,255,255,0.7)", fontSize: 11 },

  empty:          { alignItems: "center", paddingVertical: 40, paddingHorizontal: 24 },
  emptyTxt:       { fontSize: 14, fontWeight: "600", color: palette.gray500, marginTop: 12 },
  emptySub:       { fontSize: 12, color: palette.gray400, marginTop: 4, textAlign: "center" },
  clearFiltersBtn:    { marginTop: 14, backgroundColor: palette.primary50, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 12 },
  clearFiltersBtnTxt: { fontSize: 13, fontWeight: "700", color: palette.primary600 },

  // Filter bar
  filterBar:          { marginHorizontal: 16, marginTop: 14, backgroundColor: "#fff", borderRadius: 16, padding: 12, elevation: 2, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4 },
  filterBarTop:        { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  filterBarLabel:      { flexDirection: "row", alignItems: "center", gap: 6 },
  filterBarLabelTxt:   { fontSize: 12, fontWeight: "700", color: palette.gray500 },
  clearFiltersTxt:     { fontSize: 12, fontWeight: "700", color: palette.primary600 },
  filterChipsRow:      { flexDirection: "row", gap: 8 },
  filterChip:          { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 4, backgroundColor: palette.gray50, borderWidth: 1, borderColor: palette.gray200, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8 },
  filterChipActive:    { backgroundColor: palette.primary50, borderColor: palette.primary200 },
  filterChipTxt:       { flex: 1, fontSize: 11, fontWeight: "600", color: palette.gray500 },
  filterChipTxtActive: { color: palette.primary600 },

  papersSection:  { padding: 16, gap: 12 },

  paperCard:      { backgroundColor: "#fff", borderRadius: 18, overflow: "hidden", elevation: 2, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4 },
  paperCardOpen:  { elevation: 4, shadowOpacity: 0.1 },
  paperHeader:    { flexDirection: "row", alignItems: "center", padding: 14, gap: 12 },
  yearBadge:      { width: 46, height: 46, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  yearBadgeTxt:   { fontSize: 13, fontWeight: "900" },
  paperSubject:   { fontSize: 13, fontWeight: "700", color: palette.gray900 },
  paperCode:      { fontSize: 10, color: palette.gray400, marginTop: 2 },
  paperRight:     { flexDirection: "row", alignItems: "center", gap: 8 },
  solvedBadge:    { flexDirection: "row", alignItems: "center", gap: 4, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  solvedTxt:      { fontSize: 10, fontWeight: "700" },

  downloadRow:    { flexDirection: "row", alignItems: "center", gap: 5, alignSelf: "flex-start", backgroundColor: semantic.success.bg, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5, marginLeft: 14, marginBottom: 12 },
  paperActionsRow:{ flexDirection: "row", gap: 8, marginLeft: 14, marginBottom: 12 },
  viewRow:        { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: palette.primary50, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
  viewRowTxt:     { fontSize: 12, fontWeight: "700", color: palette.primary600 },
  downloadRow2:   { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: semantic.success.bg, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
  pdfHeader:      { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: palette.gray100 },
  pdfTitle:       { flex: 1, fontSize: 15, fontWeight: "700", color: palette.gray900 },
  pdfDownloadBtn: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: semantic.success.bg, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  pdfDownloadTxt: { fontSize: 12, fontWeight: "700", color: semantic.success.solid },
  downloadRowTxt: { fontSize: 11, fontWeight: "700", color: semantic.success.solid },

  paperBody:      { borderTopWidth: 1, borderTopColor: palette.gray100 },

  // Tabs
  tabs:           { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: palette.gray100 },
  tab:            { flex: 1, paddingVertical: 10, alignItems: "center", borderBottomWidth: 2, borderBottomColor: "transparent" },
  tabTxt:         { fontSize: 12, color: palette.gray500 },

  // Video list
  videoList:      { padding: 12, gap: 10 },
  noVideosTxt:    { fontSize: 12, color: palette.gray400, textAlign: "center", paddingVertical: 12 },
  videoRow:       { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: palette.gray50, borderRadius: 12, padding: 10 },
  videoThumb:     { width: 80, height: 50, borderRadius: 8 },
  videoTitle:     { fontSize: 12, fontWeight: "600", color: palette.gray900, marginBottom: 4, lineHeight: 16 },
  videoMeta:      { flexDirection: "row", alignItems: "center", gap: 6 },
  topicBadge:     { borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  topicTxt:       { fontSize: 9, fontWeight: "700" },
  durBadge:       { flexDirection: "row", alignItems: "center", gap: 3 },
  durTxt:         { fontSize: 9, color: palette.gray400 },
  playIcon:       { paddingLeft: 4 },

  actionRow:      { flexDirection: "row", gap: 8, marginTop: 4 },
  actionBtn:      { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderWidth: 1.5, borderRadius: 12, paddingVertical: 10 },
  actionBtnTxt:   { fontSize: 12, fontWeight: "700" },

  // Analysis
  analysisSection:{ padding: 14, gap: 10 },
  analysisTitle:  { fontSize: 12, fontWeight: "800", color: palette.gray700, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 },
  analysisRow:    { flexDirection: "row", alignItems: "center", gap: 10 },
  analysisDot:    { width: 8, height: 8, borderRadius: 4, flexShrink: 0 },
  analysisTopic:  { fontSize: 12, color: palette.gray700, fontWeight: "500" },
  analysisBarWrap:{ flex: 1, height: 6, backgroundColor: palette.gray100, borderRadius: 3, overflow: "hidden" },
  analysisBar:    { height: "100%", borderRadius: 3 },
  aiTutorBtn:     { flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1.5, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 16, marginTop: 8, justifyContent: "center" },
  aiTutorTxt:     { fontSize: 13, fontWeight: "700" },

  // Modal header (matches DashboardScreen's modal pattern)
  modalHeader:    { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: palette.gray100, backgroundColor: "#fff" },
  modalHeaderTxt: { fontSize: 16, fontWeight: "700", color: palette.gray800 },

  // Practice question list (local fallback)
  pqCard:         { backgroundColor: "#fff", borderRadius: 14, padding: 14, gap: 8, elevation: 1, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3 },
  pqText:         { fontSize: 13, fontWeight: "700", color: palette.gray900, marginBottom: 4, lineHeight: 18 },
  pqOption:       { flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderColor: palette.gray200, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 12 },
  pqOptionSelected:{ borderColor: palette.primary200, backgroundColor: palette.primary50 },
  pqOptionCorrect:{ borderColor: palette.success100, backgroundColor: semantic.success.bg },
  pqOptionWrong:  { borderColor: palette.danger100, backgroundColor: semantic.danger.bg },
  pqOptionKey:    { fontSize: 12, fontWeight: "800", color: palette.gray500, width: 16 },
  pqOptionTxt:    { flex: 1, fontSize: 12, color: palette.gray700 },
  pqExplain:      { flexDirection: "row", alignItems: "flex-start", gap: 6, borderWidth: 1, borderRadius: 10, padding: 10, marginTop: 2 },
  pqExplainTxt:   { flex: 1, fontSize: 11, lineHeight: 15 },

  // Quiz score banner + submit button (local Quiz fallback)
  quizScoreBanner:    { flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1.5, borderRadius: 14, padding: 12, backgroundColor: "#fff" },
  quizScoreTxt:       { fontSize: 13, fontWeight: "800", color: palette.gray900 },
  quizRetryTxt:       { fontSize: 11, fontWeight: "700", marginTop: 2 },
  quizSubmitBtn:      { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 14, paddingVertical: 13 },
  quizSubmitBtnDisabled: { opacity: 0.4 },
  quizSubmitTxt:      { fontSize: 13, fontWeight: "800", color: "#fff" },

  // Filter option picker (bottom sheet)
  sheetOverlay:      { flex: 1, backgroundColor: "rgba(17,24,39,0.4)", justifyContent: "flex-end" },
  sheetCard:          { backgroundColor: "#fff", borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: 16, paddingTop: 16, paddingBottom: 28 },
  sheetTitle:         { fontSize: 15, fontWeight: "800", color: palette.gray900, marginBottom: 8 },
  sheetOption:        { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: palette.gray100 },
  sheetOptionTxt:     { fontSize: 14, color: palette.gray700 },
  sheetOptionTxtActive: { color: palette.primary600, fontWeight: "700" },
});
