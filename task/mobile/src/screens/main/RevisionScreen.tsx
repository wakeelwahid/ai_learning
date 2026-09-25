import React, { useRef, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Image, ActivityIndicator, Dimensions, Modal, SafeAreaView, Share,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigation } from "@react-navigation/native";
import * as WebBrowser from "expo-web-browser";
import Toast from "react-native-toast-message";
import { useLanguage } from "@/contexts/LanguageContext";
import { fmt } from "@/i18n/format";
import { useStudyTime } from "@/hooks/useStudyTime";
import { contentApi } from "@/api/content";
import { analyticsApi } from "@/api/analytics";
import { revisionApi } from "@/api/revision";
import { aiApi } from "@/api/ai";
import AITutorScreen from "@/screens/main/AITutorScreen";
import UpgradePrompt from "@/components/ui/UpgradePrompt";
import { palette, semantic, radius, spacing, typography, cardShadow } from "@/theme/colors";

const { width } = Dimensions.get("window");
const COLS = 2;
const CARD_W = (width - 48) / COLS;
const DUMMY_PCT = [32, 48, 65, 52, 38, 56, 43, 70];

function ytThumb(ytId: string) {
  return `https://img.youtube.com/vi/${ytId}/mqdefault.jpg`;
}

// Tool tint colors — one distinct semantic-family accent per tool so the
// grid stays scannable; no indigo/violet pairing, no gradients.
const AI_TOOLS = [
  { icon: "bulb",        color: palette.primary600, bg: palette.primary50,  title: "AI Doubt Solver",    desc: "Ask any concept question" },
  { icon: "document",   color: palette.info600,     bg: palette.info50,     title: "Smart Notes",          desc: "AI-generated summaries" },
  { icon: "analytics",  color: palette.success600,  bg: palette.success50,  title: "Weak Topic Finder",    desc: "Know what to revise" },
  { icon: "mic",        color: palette.primary700,  bg: palette.primary50,  title: "Voice Explainer",      desc: "Hear complex concepts" },
];

// ── AI Generation Workflow: 6 category tabs ───────────────────────────────────
type GenTabKey = "questions" | "quiz" | "paper" | "custom" | "flashcards" | "plan";

interface GenTabDef {
  key: GenTabKey;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  blurb: string;
  color: string;
  bg: string;
  types?: string[];
  buttonLabel: string;
}

const GEN_TABS: GenTabDef[] = [
  { key: "questions", label: "AI Questions", icon: "sparkles",       blurb: "Generate practice questions", color: palette.primary600, bg: palette.primary50, buttonLabel: "AI Question Generate" },
  { key: "quiz",      label: "AI Quiz",      icon: "flash",          blurb: "Auto-generated quizzes",      color: palette.info600, bg: palette.info50, types: ["quiz_paper"], buttonLabel: "Generate Quiz" },
  { key: "paper",     label: "AI Paper",     icon: "document-text",  blurb: "Practice & mock papers",      color: palette.warning700, bg: palette.warning100, types: ["practice_paper", "mock_test", "revision_paper"], buttonLabel: "Find Papers" },
  { key: "custom",    label: "AI Custom",    icon: "color-wand",     blurb: "Custom-built papers",         color: palette.primary700, bg: palette.primary100, types: ["custom"], buttonLabel: "Generate Custom" },
  { key: "flashcards", label: "Flashcards",  icon: "albums",         blurb: "Flip cards to memorize fast", color: palette.primary600, bg: palette.primary50, buttonLabel: "Generate Flashcards" },
  { key: "plan",       label: "Revision Plan", icon: "calendar",     blurb: "Day-wise plan for weak topics", color: palette.info600, bg: palette.info50, buttonLabel: "Build My Plan" },
];

const PAPER_TYPE_OPTIONS: Record<string, { value: string; label: string }[]> = {
  quiz:   [{ value: "quiz_paper", label: "Quiz Paper" }],
  paper:  [
    { value: "practice_paper", label: "Practice Paper" },
    { value: "mock_test",      label: "Mock Test" },
    { value: "revision_paper", label: "Revision Paper" },
  ],
  custom: [{ value: "custom", label: "Custom Paper" }],
};

const COUNT_CHOICES = [5, 10, 15, 20, 25, 30];

interface GenQuestion {
  q_no?: number;
  question: string;
  options?: string[];
  correct_option?: string;
  answer?: string;
  explanation?: string;
}

interface GenPaper {
  id: string;
  title?: string;
  board?: string;
  class_num?: number;
  subject?: string;
  chapter?: string;
  paper_type?: string;
  difficulty?: string;
  total_marks?: number;
  duration_min?: number;
  content?: { sections?: { section_name?: string; questions?: GenQuestion[] }[] };
}

// ── Horizontal filter-chip row (cascading Board → Class → Subject → Chapter) ──
function ChipRow({ label, value, options, onSelect }: {
  label: string;
  value: string;
  options: (string | number)[];
  onSelect: (v: string) => void;
}) {
  if (options.length === 0) return null;
  return (
    <View style={g.chipBlock}>
      <Text style={g.chipLabel}>{label}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={g.chipRow}>
        {options.map((o) => {
          const val = String(o);
          const active = value === val;
          return (
            <TouchableOpacity
              key={val}
              style={[g.chip, active && g.chipActive]}
              activeOpacity={0.8}
              onPress={() => onSelect(active ? "" : val)}
            >
              <Text style={[g.chipTxt, active && g.chipTxtActive]}>{val}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

// ── Inline question card (AI Questions / AI Quiz): reveal answer ─────────────
function GenQuestionCard({ q, index }: { q: GenQuestion; index: number }) {
  const [shown, setShown] = useState(false);
  return (
    <View style={g.qCard}>
      <Text style={g.qText}>{index + 1}. {q.question}</Text>
      <View style={{ gap: 6, marginTop: 8 }}>
        {(q.options ?? []).map((o, j) => {
          const letter = String.fromCharCode(97 + j);
          const correct = shown && q.correct_option === letter;
          return (
            <View key={j} style={[g.optRow, correct && g.optRowCorrect]}>
              <Text style={[g.optLetter, correct && g.optLetterCorrect]}>{letter}.</Text>
              <Text style={[g.optTxt, correct && g.optTxtCorrect]}>{o}</Text>
              {correct && <Ionicons name="checkmark-circle" size={16} color={semantic.success.text} />}
            </View>
          );
        })}
      </View>
      <View style={g.qFooter}>
        <TouchableOpacity style={g.revealBtn} onPress={() => setShown(s => !s)} activeOpacity={0.8}>
          <Ionicons name={shown ? "eye-off-outline" : "eye-outline"} size={14} color={palette.primary600} />
          <Text style={g.revealTxt}>{shown ? "Hide Answer" : "Show Answer"}</Text>
        </TouchableOpacity>
        {shown && !!q.explanation && (
          <Text style={g.explainTxt} numberOfLines={4}>{q.explanation}</Text>
        )}
      </View>
    </View>
  );
}

// ── Download-as-text: builds plain-text content and opens the native share sheet ──
function shareTextFile(title: string, body: string) {
  Share.share({ title, message: body }).catch(() => {
    Toast.show({ type: "error", text1: "Could not share content" });
  });
}

function buildQuestionsText(subjectLabel: string, items: GenQuestion[]) {
  const lines = [`AI Questions — ${subjectLabel}`, ""];
  items.forEach((q, i) => {
    lines.push(`Q${i + 1}. ${q.question}`);
    (q.options ?? []).forEach((o, j) => lines.push(`   ${String.fromCharCode(97 + j)}) ${o}`));
    lines.push(`   Answer: ${q.correct_option?.toUpperCase() ?? q.answer ?? "-"}`);
    if (q.explanation) lines.push(`   Explanation: ${q.explanation}`);
    lines.push("");
  });
  return lines.join("\n");
}

function buildPaperText(p: GenPaper) {
  const lines: string[] = [
    p.title ?? "Untitled",
    `${p.board ?? ""} · Class ${p.class_num ?? ""} · ${p.subject ?? ""} · ${p.chapter ?? ""}`,
    `Type: ${p.paper_type?.replace(/_/g, " ") ?? ""} · ${p.difficulty ?? ""} · ${p.total_marks ?? 0} marks · ${p.duration_min ?? 0} min`,
    "",
  ];
  (p.content?.sections ?? []).forEach((sec) => {
    lines.push(`=== ${sec.section_name ?? "Section"} ===`);
    (sec.questions ?? []).forEach((q) => {
      lines.push(`Q${q.q_no ?? ""}. ${q.question}`);
      (q.options ?? []).forEach((o) => lines.push(`   ${o}`));
      const ans = q.answer ?? q.correct_option;
      if (ans) lines.push(`Answer: ${ans}`);
      if (q.explanation) lines.push(`Explanation: ${q.explanation}`);
      lines.push("");
    });
  });
  return lines.join("\n");
}

// ── A single fetched/generated paper card — Preview toggle + Download ─────────
function GenPaperCard({ p }: { p: GenPaper }) {
  const [open, setOpen] = useState(false);
  const [reveal, setReveal] = useState<Record<number, boolean>>({});
  const questions: GenQuestion[] = (p.content?.sections ?? []).flatMap(s => s.questions ?? []);

  // This card only reveals the answer key — the student never submits answers,
  // so we record that the paper was opened and leave it in_progress rather than
  // inventing a score. Best-effort: a failure must not break the preview.
  const openedRef = useRef(false);
  const openPreview = () => {
    setOpen(o => !o);
    if (openedRef.current) return;
    openedRef.current = true;
    aiApi.startPaperAttempt(p.id).catch(() => {});
  };

  const tone =
    p.paper_type === "quiz_paper"      ? { bg: palette.info100, fg: palette.info700 }
    : p.paper_type === "custom"        ? { bg: palette.primary100, fg: palette.primary700 }
    : p.paper_type === "revision_paper"? { bg: palette.success100, fg: palette.success700 }
    : p.paper_type === "practice_paper"? { bg: palette.warning100, fg: palette.warning700 }
    : { bg: palette.danger100, fg: palette.danger700 };

  const diffTone =
    p.difficulty === "easy" ? { bg: palette.success100, fg: palette.success700 }
    : p.difficulty === "hard" ? { bg: palette.danger100, fg: palette.danger700 }
    : { bg: palette.warning100, fg: palette.warning700 };

  return (
    <View style={g.paperCard}>
      <View style={g.paperRow}>
        <View style={[g.paperIcon, { backgroundColor: tone.bg }]}>
          <Ionicons name="document-text" size={20} color={tone.fg} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={g.paperTitle} numberOfLines={1}>{p.title ?? "Untitled"}</Text>
          <View style={g.paperMetaRow}>
            <Text style={g.paperMetaTxt}>{p.paper_type?.replace(/_/g, " ")}</Text>
            {!!p.subject && <Text style={g.paperMetaTxt}>· {[p.subject, p.chapter].filter(Boolean).join(" · ")}</Text>}
          </View>
          <View style={g.paperBadgeRow}>
            {!!p.difficulty && (
              <View style={[g.diffBadge, { backgroundColor: diffTone.bg }]}>
                <Text style={[g.diffBadgeTxt, { color: diffTone.fg }]}>{p.difficulty}</Text>
              </View>
            )}
            <Text style={g.paperMetaTxt}>{p.total_marks ?? questions.length} marks · {p.duration_min ?? "—"} min</Text>
          </View>
        </View>
      </View>

      <View style={g.paperActions}>
        {questions.length > 0 && (
          <TouchableOpacity style={g.paperActionBtn} onPress={openPreview} activeOpacity={0.8}>
            <Ionicons name={open ? "eye-off-outline" : "eye-outline"} size={14} color={palette.primary700} />
            <Text style={g.paperActionTxt}>{open ? "Hide" : "Preview"}</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={[g.paperActionBtn, { backgroundColor: palette.primary50 }]}
          onPress={() => shareTextFile(p.title ?? "Paper", buildPaperText(p))}
          activeOpacity={0.8}
        >
          <Ionicons name="download-outline" size={14} color={palette.primary700} />
          <Text style={[g.paperActionTxt, { color: palette.primary700 }]}>Download</Text>
        </TouchableOpacity>
      </View>

      {open && (
        <View style={g.paperPreview}>
          {questions.map((q, i) => {
            const shown = reveal[i];
            const ans = q.answer ?? q.correct_option;
            return (
              <View key={i} style={g.previewQ}>
                <Text style={g.previewQTxt}>{q.q_no ?? i + 1}. {q.question}</Text>
                {(q.options ?? []).length > 0 && (
                  <View style={{ gap: 5, marginTop: 6 }}>
                    {(q.options ?? []).map((o, j) => {
                      const letter = String.fromCharCode(97 + j);
                      const correct = shown && q.correct_option === letter;
                      return (
                        <View key={j} style={[g.optRowSm, correct && g.optRowCorrect]}>
                          <Text style={[g.optLetter, correct && g.optLetterCorrect]}>{letter}.</Text>
                          <Text style={[g.optTxtSm, correct && g.optTxtCorrect]}>{o}</Text>
                          {correct && <Ionicons name="checkmark-circle" size={14} color={semantic.success.text} />}
                        </View>
                      );
                    })}
                  </View>
                )}
                {!!ans && (
                  <View style={g.qFooter}>
                    <TouchableOpacity style={g.revealBtn} onPress={() => setReveal(r => ({ ...r, [i]: !r[i] }))} activeOpacity={0.8}>
                      <Ionicons name={shown ? "eye-off-outline" : "eye-outline"} size={12} color={palette.primary600} />
                      <Text style={g.revealTxt}>{shown ? "Hide Answer" : "Show Answer"}</Text>
                    </TouchableOpacity>
                    {shown && !!q.explanation && <Text style={g.explainTxt} numberOfLines={3}>{q.explanation}</Text>}
                  </View>
                )}
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

// ── Flashcards tab — topic → flip cards (front/back/hint) ─────────────────────
function FlashcardsPanel() {
  const [board, setBoard] = useState("");
  const [cls, setCls] = useState("");
  const [subject, setSubject] = useState("");
  const [chapter, setChapter] = useState("");
  const [topic, setTopic] = useState("");
  const [count, setCount] = useState(8);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [limitReached, setLimitReached] = useState(false);
  const [cards, setCards] = useState<{ front: string; back: string; hint?: string }[] | null>(null);
  const [flipped, setFlipped] = useState<Record<number, boolean>>({});

  const { data: boards = [] } = useQuery({
    queryKey: ["gen-boards"],
    queryFn: () => contentApi.getBoards().then(r => r.data),
    staleTime: 300_000,
  });
  const boardList: any[] = boards ?? [];
  const boardObj = boardList.find(b => b.name === board || b.code === board);
  const { data: classes = [] } = useQuery({
    queryKey: ["gen-classes", boardObj?.id],
    queryFn: () => contentApi.getClasses(boardObj.id).then(r => r.data),
    enabled: !!boardObj?.id,
  });
  const classList: any[] = classes ?? [];
  const classObj = classList.find(c => String(c.number) === cls);
  const { data: subjects = [] } = useQuery({
    queryKey: ["gen-subjects", classObj?.id],
    queryFn: () => contentApi.getSubjects(classObj.id).then(r => r.data),
    enabled: !!classObj?.id,
  });
  const subjectList: any[] = subjects ?? [];
  const subjectObj = subjectList.find(s => s.name === subject);
  const { data: chapters = [] } = useQuery({
    queryKey: ["gen-chapters", subjectObj?.id],
    queryFn: () => contentApi.getChapters(subjectObj.id).then(r => r.data),
    enabled: !!subjectObj?.id,
  });
  const chapterList: any[] = chapters ?? [];

  const handleGenerate = async () => {
    setLoading(true); setError(null); setLimitReached(false); setCards(null); setFlipped({});
    try {
      const { data } = await aiApi.flashcards({
        topic: topic || chapter || subject,
        subject: subject || undefined,
        chapter: chapter || undefined,
        board: board || undefined,
        class_num: cls ? Number(cls) : undefined,
        count,
      });
      setCards(data.flashcards ?? []);
    } catch (err: any) {
      const detail: string | undefined = err?.response?.data?.detail;
      if (err?.response?.status === 429) setLimitReached(true);
      setError(detail ?? "Couldn't generate flashcards. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={{ gap: spacing.sm }}>
      <View style={g.filterCard}>
        <Text style={g.filterEyebrow}>Build Flashcards</Text>
        <ChipRow label="Board" value={board} options={boardList.map(b => b.name)} onSelect={(v) => { setBoard(v); setCls(""); setSubject(""); setChapter(""); }} />
        <ChipRow label="Class" value={cls} options={classList.map(c => c.number)} onSelect={(v) => { setCls(v); setSubject(""); setChapter(""); }} />
        <ChipRow label="Subject" value={subject} options={subjectList.map(s => s.name)} onSelect={(v) => { setSubject(v); setChapter(""); }} />
        <ChipRow label="Chapter" value={chapter} options={chapterList.map(c => c.title)} onSelect={setChapter} />

        <View style={g.chipBlock}>
          <Text style={g.chipLabel}>Cards: <Text style={{ color: palette.primary600, fontWeight: "800" }}>{count}</Text></Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={g.chipRow}>
            {[5, 8, 10, 15, 20].map(c => {
              const active = count === c;
              return (
                <TouchableOpacity key={c} style={[g.chip, active && g.chipActive]} activeOpacity={0.8} onPress={() => setCount(c)}>
                  <Text style={[g.chipTxt, active && g.chipTxtActive]}>{c}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        <TouchableOpacity
          style={[g.generateBtn, (loading || (!topic && !chapter && !subject)) && g.generateBtnDisabled]}
          onPress={handleGenerate}
          disabled={loading || (!topic && !chapter && !subject)}
          activeOpacity={0.85}
        >
          {loading ? <ActivityIndicator color="#fff" size="small" /> : <Ionicons name="albums" size={16} color="#fff" />}
          <Text style={g.generateBtnTxt}>{loading ? "Generating…" : "Generate Flashcards"}</Text>
        </TouchableOpacity>

        {!!error && limitReached && <UpgradePrompt message={error} variant="compact" />}
        {!!error && !limitReached && (
          <View style={g.errorBox}>
            <Ionicons name="alert-circle-outline" size={16} color={semantic.danger.solid} />
            <Text style={g.errorTxt}>{error}</Text>
          </View>
        )}
      </View>

      {!!cards?.length && (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
          {cards.map((c, i) => {
            const isFlipped = !!flipped[i];
            return (
              <TouchableOpacity
                key={i}
                activeOpacity={0.85}
                onPress={() => setFlipped(f => ({ ...f, [i]: !f[i] }))}
                style={[
                  g.flashcard,
                  { backgroundColor: isFlipped ? palette.success50 : palette.primary50,
                    borderColor: isFlipped ? palette.success100 : palette.primary100 },
                ]}
              >
                <Text style={[g.flashcardLabel, { color: isFlipped ? palette.success700 : palette.primary600 }]}>
                  {isFlipped ? "ANSWER" : "QUESTION"}
                </Text>
                <Text style={g.flashcardTxt}>{isFlipped ? c.back : c.front}</Text>
                {isFlipped && c.hint ? (
                  <Text style={g.flashcardHint}>💡 {c.hint}</Text>
                ) : (
                  <Text style={g.flashcardHint}>Tap to flip</Text>
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      )}
    </View>
  );
}

// ── Revision Plan tab — weak topics → day-wise AI plan ────────────────────────
function RevisionPlanPanel({ userId }: { userId: string }) {
  const [days, setDays] = useState(7);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [limitReached, setLimitReached] = useState(false);
  const [result, setResult] = useState<{ plan: any[]; summary: string } | null>(null);

  const { data: weakData } = useQuery({
    queryKey: ["weak-topics-plan", userId],
    queryFn: () => analyticsApi.weakTopics(userId).then(r => r.data),
    enabled: !!userId,
  });
  const weakTopics: { topic_id: string; accuracy: number; attempts: number }[] = weakData?.weak_topics ?? [];

  const handleGenerate = async () => {
    setLoading(true); setError(null); setLimitReached(false); setResult(null);
    try {
      const { data } = await aiApi.revisionPlan({
        weak_topics: weakTopics.map(t => t.topic_id),
        days,
      });
      setResult(data);
    } catch (err: any) {
      const detail: string | undefined = err?.response?.data?.detail;
      if (err?.response?.status === 429) setLimitReached(true);
      setError(detail ?? "Couldn't build a revision plan. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={{ gap: spacing.sm }}>
      <View style={g.filterCard}>
        <Text style={g.filterEyebrow}>Build Your Revision Plan</Text>
        {weakTopics.length === 0 ? (
          <Text style={g.tabBlurb}>No weak topics detected yet — attempt a few quizzes first.</Text>
        ) : (
          <Text style={g.tabBlurb}>Based on {weakTopics.length} topic(s) you're weak in.</Text>
        )}
        <View style={g.chipBlock}>
          <Text style={g.chipLabel}>Days: <Text style={{ color: palette.primary600, fontWeight: "800" }}>{days}</Text></Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={g.chipRow}>
            {[3, 5, 7, 10, 14].map(d => {
              const active = days === d;
              return (
                <TouchableOpacity key={d} style={[g.chip, active && g.chipActive]} activeOpacity={0.8} onPress={() => setDays(d)}>
                  <Text style={[g.chipTxt, active && g.chipTxtActive]}>{d}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
        <TouchableOpacity
          style={[g.generateBtn, (loading || weakTopics.length === 0) && g.generateBtnDisabled]}
          onPress={handleGenerate}
          disabled={loading || weakTopics.length === 0}
          activeOpacity={0.85}
        >
          {loading ? <ActivityIndicator color="#fff" size="small" /> : <Ionicons name="calendar" size={16} color="#fff" />}
          <Text style={g.generateBtnTxt}>{loading ? "Building…" : "Build My Plan"}</Text>
        </TouchableOpacity>
        {!!error && limitReached && <UpgradePrompt message={error} variant="compact" />}
        {!!error && !limitReached && (
          <View style={g.errorBox}>
            <Ionicons name="alert-circle-outline" size={16} color={semantic.danger.solid} />
            <Text style={g.errorTxt}>{error}</Text>
          </View>
        )}
      </View>

      {!!result?.plan?.length && (
        <View style={{ gap: spacing.sm }}>
          <Text style={g.tabBlurb}>{result.summary}</Text>
          {result.plan.map((d: any, i: number) => (
            <View key={i} style={g.planDayCard}>
              <View style={g.planDayHeader}>
                <View style={g.planDayBadge}>
                  <Text style={g.planDayBadgeTxt}>{d.day ?? i + 1}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={g.planDayTitle}>{d.date_label ?? `Day ${d.day ?? i + 1}`}</Text>
                  {!!d.focus && <Text style={g.planDayFocus}>{d.focus}</Text>}
                </View>
              </View>
              {Array.isArray(d.topics) && d.topics.length > 0 && (
                <Text style={g.planDayTopics}>Topics: {d.topics.join(", ")}</Text>
              )}
              {Array.isArray(d.actions) && d.actions.map((a: string, j: number) => (
                <Text key={j} style={g.planDayAction}>• {a}</Text>
              ))}
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

// ── The AI generation workflow card: cascading filters + fetch + results ──────
function AIGenerationWorkflow({ userId }: { userId: string }) {
  const [tab, setTab] = useState<GenTabKey>("questions");

  const [board, setBoard]     = useState("");
  const [cls, setCls]         = useState("");
  const [subject, setSubject] = useState("");
  const [chapter, setChapter] = useState("");
  const [paperType, setPaperType] = useState(PAPER_TYPE_OPTIONS.paper[0].value);
  const [count, setCount]     = useState(10);

  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const [limitReached, setLimitReached] = useState(false);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [source, setSource]       = useState<"cache" | "db" | "">("");
  const [showResults, setShowResults] = useState(false);

  // Questions / Quiz results
  const [questions, setQuestions] = useState<GenQuestion[] | null>(null);
  // Paper / Custom results
  const [papers, setPapers] = useState<GenPaper[] | null>(null);

  const activeTab = GEN_TABS.find(t => t.key === tab)!;
  const isInlineQuestions = tab === "questions" || tab === "quiz";
  const isPaperMode = tab === "paper" || tab === "custom";
  const isStandaloneTab = tab === "flashcards" || tab === "plan";

  // Curriculum cascade
  const { data: boards = [] } = useQuery({
    queryKey: ["gen-boards"],
    queryFn: () => contentApi.getBoards().then(r => r.data),
    staleTime: 300_000,
  });
  const boardList: any[] = boards ?? [];
  const boardObj = boardList.find(b => b.name === board || b.code === board);

  const { data: classes = [] } = useQuery({
    queryKey: ["gen-classes", boardObj?.id],
    queryFn: () => contentApi.getClasses(boardObj.id).then(r => r.data),
    enabled: !!boardObj?.id,
  });
  const classList: any[] = classes ?? [];
  const classObj = classList.find(c => String(c.number) === cls);

  const { data: subjects = [] } = useQuery({
    queryKey: ["gen-subjects", classObj?.id],
    queryFn: () => contentApi.getSubjects(classObj.id).then(r => r.data),
    enabled: !!classObj?.id,
  });
  const subjectList: any[] = subjects ?? [];
  const subjectObj = subjectList.find(s => s.name === subject);

  const { data: chapters = [] } = useQuery({
    queryKey: ["gen-chapters", subjectObj?.id],
    queryFn: () => contentApi.getChapters(subjectObj.id).then(r => r.data),
    enabled: !!subjectObj?.id,
  });
  const chapterList: any[] = chapters ?? [];

  // Count badges — powered by a lightweight all-papers fetch (mirrors web's countFor)
  const { data: allPapersData, isLoading: countsLoading, refetch: refetchCounts } = useQuery({
    queryKey: ["ai-papers-all-mobile"],
    queryFn: () => aiApi.getPapers({ limit: 100 }).then(r => r.data),
    staleTime: 60_000,
    retry: 2,
    retryDelay: 5000,
  });
  const allPapers: GenPaper[] = allPapersData?.papers ?? [];
  const countFor = (types?: string[]) => (!types ? null : allPapers.filter(p => types.includes(p.paper_type ?? "")).length);

  const selectTab = (key: GenTabKey) => {
    setTab(key);
    setError(null);
    setLimitReached(false);
    setQuestions(null);
    setPapers(null);
    setShowResults(false);
    setRemaining(null);
    if (key === "paper") setPaperType(PAPER_TYPE_OPTIONS.paper[0].value);
    else if (key === "quiz") setPaperType(PAPER_TYPE_OPTIONS.quiz[0].value);
    else if (key === "custom") setPaperType(PAPER_TYPE_OPTIONS.custom[0].value);
  };

  const handleBoard = (v: string) => { setBoard(v); setCls(""); setSubject(""); setChapter(""); };
  const handleClass = (v: string) => { setCls(v); setSubject(""); setChapter(""); };
  const handleSubject = (v: string) => { setSubject(v); setChapter(""); };

  const handleGenerate = async () => {
    setLoading(true); setError(null); setLimitReached(false); setSource("");
    setQuestions(null); setPapers(null);
    try {
      if (tab === "questions" || tab === "quiz") {
        const { data } = await aiApi.questions({
          board: board || undefined,
          class_num: cls ? Number(cls) : undefined,
          subject: subject || undefined,
          chapter: chapter || undefined,
          count,
          feature: tab === "quiz" ? "quiz" : "questions",
        });
        const qs: GenQuestion[] = Array.isArray(data.questions) ? data.questions : [];
        setSource(data.source === "cache" ? "cache" : "db");
        setQuestions(qs);
        setShowResults(qs.length > 0);
        if (data.remaining_uses !== undefined && data.remaining_uses !== null) {
          setRemaining(data.remaining_uses as number);
        }
      } else {
        const { data } = await aiApi.getPapers({
          paper_type: paperType || undefined,
          board: board || undefined,
          class_num: cls ? Number(cls) : undefined,
          subject: subject || undefined,
          chapter: chapter || undefined,
          limit: tab === "custom" ? count : 50,
        });
        const ps: GenPaper[] = data.papers ?? [];
        setSource(data.source === "cache" ? "cache" : "db");
        setPapers(ps);
        setShowResults(ps.length > 0);
        if (data.remaining_uses !== undefined && data.remaining_uses !== null) {
          setRemaining(data.remaining_uses as number);
        }
        refetchCounts();
      }
    } catch (err: any) {
      const status: number | undefined = err?.response?.status;
      const detail: string | undefined = err?.response?.data?.detail ?? err?.response?.data?.message;
      if (status === 429) {
        setError(detail ?? "");
        setLimitReached(true);
        setRemaining(0);
      } else if (status === 403) {
        setError("Access denied — the AI service is still starting up. Wait 30 seconds and try again.");
      } else if (status === 503 || status === 502) {
        setError("AI service is temporarily unavailable. Please try again in a moment.");
      } else if (detail) {
        setError(detail);
      } else {
        setError("Failed to load content. Please check your connection and try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = () => {
    if (isInlineQuestions && questions?.length) {
      shareTextFile(`AI Questions — ${subject || "Bank"}`, buildQuestionsText(`${subject || ""} ${chapter || ""}`.trim() || "Question Bank", questions));
    }
  };

  const resultCount = isInlineQuestions ? (questions?.length ?? 0) : (papers?.length ?? 0);
  const hasResults = resultCount > 0;

  return (
    <View style={g.wrap}>
      {/* Category switcher */}
      <View style={g.tabGrid}>
        {GEN_TABS.map((t) => {
          const active = tab === t.key;
          const count = countFor(t.types);
          return (
            <TouchableOpacity
              key={t.key}
              style={[g.tabCard, active && g.tabCardActive]}
              activeOpacity={0.85}
              onPress={() => selectTab(t.key)}
            >
              <View style={[g.tabIcon, { backgroundColor: t.bg }]}>
                <Ionicons name={t.icon} size={18} color={t.color} />
              </View>
              <View style={g.tabHeaderRow}>
                <Text style={g.tabLabel} numberOfLines={1}>{t.label}</Text>
                {count !== null && (
                  <View style={[g.countBadge, { backgroundColor: t.bg }]}>
                    <Text style={[g.countBadgeTxt, { color: t.color }]}>{count}</Text>
                  </View>
                )}
              </View>
              <Text style={g.tabBlurb} numberOfLines={1}>{t.blurb}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {isStandaloneTab ? (
        tab === "flashcards" ? <FlashcardsPanel /> : <RevisionPlanPanel userId={userId} />
      ) : (
      <>
      {/* Filters */}
      <View style={g.filterCard}>
        <Text style={g.filterEyebrow}>Find Content</Text>
        <ChipRow label="Board"   value={board}   options={boardList.map(b => b.name)}   onSelect={handleBoard} />
        <ChipRow label="Class"   value={cls}     options={classList.map(c => c.number)} onSelect={handleClass} />
        <ChipRow label="Subject" value={subject} options={subjectList.map(s => s.name)} onSelect={handleSubject} />
        <ChipRow label="Chapter" value={chapter} options={chapterList.map(c => c.title)} onSelect={setChapter} />

        {tab === "paper" && (
          <View style={g.chipBlock}>
            <Text style={g.chipLabel}>Type</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={g.chipRow}>
              {PAPER_TYPE_OPTIONS.paper.map(pt => {
                const active = paperType === pt.value;
                return (
                  <TouchableOpacity
                    key={pt.value}
                    style={[g.chip, active && g.chipActive]}
                    activeOpacity={0.8}
                    onPress={() => setPaperType(pt.value)}
                  >
                    <Text style={[g.chipTxt, active && g.chipTxtActive]}>{pt.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        )}

        {(tab === "questions" || tab === "quiz" || tab === "custom") && (
          <View style={g.chipBlock}>
            <Text style={g.chipLabel}>Count: <Text style={{ color: palette.primary600, fontWeight: "800" }}>{count}</Text> (max 30)</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={g.chipRow}>
              {COUNT_CHOICES.map(c => {
                const active = count === c;
                return (
                  <TouchableOpacity
                    key={c}
                    style={[g.chip, active && g.chipActive]}
                    activeOpacity={0.8}
                    onPress={() => setCount(c)}
                  >
                    <Text style={[g.chipTxt, active && g.chipTxtActive]}>{c}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        )}

        <TouchableOpacity
          style={[g.generateBtn, (loading || !subject || remaining === 0) && g.generateBtnDisabled]}
          onPress={handleGenerate}
          disabled={loading || !subject || remaining === 0}
          activeOpacity={0.85}
        >
          {loading ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Ionicons name={activeTab.icon} size={16} color="#fff" />
          )}
          <Text style={g.generateBtnTxt}>{loading ? "Loading…" : activeTab.buttonLabel}</Text>
        </TouchableOpacity>
        {remaining !== null && remaining > 0 && (
          <Text style={[g.remainingTxt, remaining === 1 ? { color: semantic.warning.solid } : null]}>
            {remaining} use{remaining === 1 ? "" : "s"} left today
          </Text>
        )}

        {!!source && !error && (
          <View style={g.sourceRow}>
            <Ionicons name={source === "cache" ? "flash" : "search"} size={11} color={source === "cache" ? semantic.warning.solid : palette.gray400} />
            <Text style={g.sourceTxt}>{source === "cache" ? "From cache" : "From database"}</Text>
          </View>
        )}

        {!!error && limitReached && <UpgradePrompt message={error} variant="compact" />}
        {!!error && !limitReached && (
          <View style={g.errorBox}>
            <Ionicons name="alert-circle-outline" size={16} color={semantic.danger.solid} />
            <Text style={g.errorTxt}>{error}</Text>
          </View>
        )}
      </View>

      {/* View Results / Hide Results + Refresh */}
      {hasResults && (
        <View style={g.resultsHeaderRow}>
          <TouchableOpacity
            style={[g.toggleResultsBtn, showResults && g.toggleResultsBtnActive]}
            onPress={() => setShowResults(s => !s)}
            activeOpacity={0.8}
          >
            <Ionicons name={showResults ? "eye-off-outline" : "eye-outline"} size={14} color={showResults ? palette.gray700 : palette.primary700} />
            <Text style={[g.toggleResultsTxt, showResults && { color: palette.gray700 }]}>
              {showResults ? `Hide Results (${resultCount})` : `View Results (${resultCount})`}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity style={g.refreshBtn} onPress={() => refetchCounts()} activeOpacity={0.7}>
            <Ionicons name="refresh-outline" size={13} color={palette.gray500} />
            <Text style={g.refreshTxt}>Refresh counts</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Empty state (fetched, zero results) */}
      {!loading && !error && (isInlineQuestions ? questions !== null && questions.length === 0 : papers !== null && papers.length === 0) && (
        <View style={g.emptyResults}>
          <Ionicons name="document-text-outline" size={32} color={palette.gray300} />
          <Text style={g.emptyResultsTxt}>No content available for this selection yet</Text>
          <Text style={g.emptyResultsSub}>New content appears here automatically once generated.</Text>
        </View>
      )}

      {/* Results — inline questions (Questions / Quiz) */}
      {showResults && isInlineQuestions && !!questions?.length && (
        <View style={{ gap: spacing.sm }}>
          <View style={g.resultsMetaRow}>
            <Text style={g.resultsMetaTxt}>{questions.length} questions · {source === "cache" ? "from cache" : "from database"}</Text>
            <TouchableOpacity style={g.downloadChip} onPress={handleDownload} activeOpacity={0.8}>
              <Ionicons name="download-outline" size={13} color={palette.primary700} />
              <Text style={g.downloadChipTxt}>Download</Text>
            </TouchableOpacity>
          </View>
          {questions.map((q, i) => <GenQuestionCard key={i} q={q} index={i} />)}
        </View>
      )}

      {/* Results — papers (Paper / Custom) */}
      {showResults && isPaperMode && !!papers?.length && (
        <View style={{ gap: spacing.sm }}>
          {countsLoading && <ActivityIndicator color={palette.primary600} style={{ marginBottom: 4 }} />}
          {papers.map(p => <GenPaperCard key={p.id} p={p} />)}
        </View>
      )}
      </>
      )}
    </View>
  );
}

interface Props {
  userId: string;
  /** Optional: let the host (Dashboard) open its own AI Tutor modal instead of a local one. */
  onOpenAITutor?: () => void;
}

export default function RevisionScreen({ userId, onOpenAITutor }: Props) {
  const queryClient = useQueryClient();
  const navigation = useNavigation<any>();
  const { t } = useLanguage();
  const { blocked: studyBlocked, limitMinutes: studyLimitMinutes } = useStudyTime();
  const seededRef = useRef(false);

  const [showAITutorLocal, setShowAITutorLocal] = useState(false);
  const [showWeakTopics, setShowWeakTopics] = useState(false);
  const [showAITools, setShowAITools] = useState(false);

  const { data: weakData, isLoading: weakLoading, isFetching: weakFetching } = useQuery({
    queryKey: ["weak-topics", userId],
    queryFn: () => analyticsApi.weakTopics(userId).then(r => r.data),
    enabled: !!userId && showWeakTopics,
    staleTime: 30_000,
  });

  const weakTopics: any[] = weakData?.weak_topics ?? [];

  // Revision session: opens when the weak-topics panel opens, closes with the
  // elapsed seconds when it closes or the screen unmounts. Fire-and-forget,
  // like the study-time heartbeat — never block or fail the UI on it.
  const sessionRef = useRef<{ id: string; startedAt: number } | null>(null);
  React.useEffect(() => {
    if (!showWeakTopics || !userId) return;
    let cancelled = false;
    revisionApi.startSession({ source: "weak_topics" })
      .then(r => {
        if (cancelled) return;
        sessionRef.current = { id: r.data.id, startedAt: Date.now() };
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      const s = sessionRef.current;
      if (!s) return;
      sessionRef.current = null;
      const seconds = Math.round((Date.now() - s.startedAt) / 1000);
      revisionApi.endSession(s.id, seconds, true).catch(() => {});
    };
  }, [showWeakTopics, userId]);

  const { data: cwData, isLoading } = useQuery({
    queryKey: ["continue-watching", userId],
    queryFn: () => contentApi.continueWatching(userId, 30).then(r => r.data),
    enabled: !!userId,
    staleTime: 30_000,
  });

  const videos: any[] = cwData?.videos ?? [];

  // Auto-seed if empty
  React.useEffect(() => {
    if (!userId || seededRef.current || isLoading) return;
    if (cwData && videos.length === 0) {
      seededRef.current = true;
      contentApi.seedDemo(userId)
        .then(() => queryClient.invalidateQueries({ queryKey: ["continue-watching", userId] }))
        .catch(() => {});
    }
  }, [cwData, userId, isLoading]);

  const openVideo = (ytId: string) => {
    if (!ytId) return;
    if (studyBlocked) {
      Toast.show({
        type: "info",
        text1: fmt(t("studyLimitReachedTitle"), { limit: studyLimitMinutes ?? 0 }),
        text2: t("studyLimitBlockVideo"),
      });
      return;
    }
    WebBrowser.openBrowserAsync(`https://www.youtube.com/watch?v=${ytId}`);
  };

  const handleToolPress = (title: string) => {
    if (title === "AI Doubt Solver") {
      if (onOpenAITutor) onOpenAITutor();
      else setShowAITutorLocal(true);
    } else if (title === "Weak Topic Finder") {
      setShowWeakTopics(true);
    } else if (title === "Smart Notes") {
      Toast.show({
        type: "info",
        text1: "Select a chapter to view notes",
        text2: "Open Learn, pick a subject & chapter, then tap Smart Notes there.",
      });
      navigation.navigate?.("Learn");
    } else if (title === "Voice Explainer") {
      Toast.show({ type: "info", text1: "Coming soon", text2: "Voice Explainer isn't available yet." });
    }
  };

  return (
    <>
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

      {/* AI Revision Center — hero */}
      <View style={styles.section}>
        <View style={[g.hero, { backgroundColor: palette.primary600 }]}>
          <View style={g.heroIconWrap}>
            <Ionicons name="sparkles" size={26} color="#fff" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={g.heroTitle}>AI Revision Center</Text>
            <Text style={g.heroSub}>Generate questions and explore AI quizzes, papers and custom sets</Text>
          </View>
        </View>

        <AIGenerationWorkflow userId={userId} />
      </View>

      {/* In-Progress Videos Grid */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>In Progress Videos</Text>
        <Text style={styles.sectionSub}>Tap to resume watching</Text>

        {isLoading && <ActivityIndicator color={palette.primary600} style={{ marginTop: spacing.lg }} />}

        {!isLoading && videos.length === 0 && (
          <View style={styles.empty}>
            <Ionicons name="play-circle-outline" size={44} color={palette.gray300} />
            <Text style={styles.emptyTxt}>No in-progress videos yet</Text>
            <Text style={styles.emptySub}>Start watching a video to see it here</Text>
          </View>
        )}

        {!isLoading && videos.length > 0 && (
          <View style={styles.grid}>
            {videos.map((v: any, i: number) => {
              const pct = v.progress ?? DUMMY_PCT[i % DUMMY_PCT.length];
              const ytId = v.youtube_id ?? "d_S4LiGALwk";
              return (
                <TouchableOpacity
                  key={v.id ?? v.video_id ?? i}
                  style={styles.card}
                  activeOpacity={0.85}
                  onPress={() => openVideo(ytId)}
                >
                  <View style={styles.thumbWrap}>
                    <Image source={{ uri: ytThumb(ytId) }} style={styles.thumb} resizeMode="cover" />
                    <View style={styles.playBtn}>
                      <Ionicons name="play" size={14} color="#fff" />
                    </View>
                    {/* Red progress bar */}
                    <View style={styles.barTrack}>
                      <View style={[styles.barFill, { width: `${pct}%` as any }]} />
                    </View>
                    <View style={styles.pctBadge}>
                      <Text style={styles.pctTxt}>{Math.round(pct)}%</Text>
                    </View>
                  </View>
                  <Text style={styles.cardTitle} numberOfLines={2}>{v.title}</Text>
                  <Text style={styles.cardSub} numberOfLines={1}>{v.subject_name ?? "Video"}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </View>

      {/* AI Tools — secondary section, collapsed behind a toggle */}
      <View style={styles.section}>
        <TouchableOpacity style={styles.aiToolsToggle} activeOpacity={0.8} onPress={() => setShowAITools(s => !s)}>
          <View style={styles.aiToolsToggleLeft}>
            <Ionicons name="construct-outline" size={16} color={palette.primary600} />
            <Text style={styles.aiToolsToggleTxt}>More AI Tools</Text>
          </View>
          <Ionicons name={showAITools ? "chevron-up" : "chevron-down"} size={18} color={palette.gray400} />
        </TouchableOpacity>

        {showAITools && (
          <>
            <View style={[styles.aiHero, { backgroundColor: palette.primary600 }]}>
              <Ionicons name="sparkles" size={28} color="#fff" style={{ marginBottom: spacing.sm }} />
              <Text style={styles.aiHeroTitle}>AI Revision Tools</Text>
              <Text style={styles.aiHeroSub}>Smart tools to make revision faster and more effective</Text>
            </View>

            <View style={styles.aiGrid}>
              {AI_TOOLS.map((tool, i) => (
                <TouchableOpacity
                  key={i}
                  style={[styles.aiCard, { backgroundColor: tool.bg }]}
                  activeOpacity={0.85}
                  onPress={() => handleToolPress(tool.title)}
                >
                  <View style={[styles.aiIcon, { backgroundColor: tool.color + "20" }]}>
                    <Ionicons name={tool.icon as any} size={22} color={tool.color} />
                  </View>
                  <Text style={styles.aiCardTitle}>{tool.title}</Text>
                  <Text style={styles.aiCardDesc}>{tool.desc}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </>
        )}
      </View>

      {/* Quick Revision Tips */}
      <View style={[styles.section, { marginBottom: 32 }]}>
        <Text style={styles.sectionTitle}>Revision Tips</Text>
        {[
          "Review your weakest topics first for maximum impact",
          "Space your revision sessions — 3×20 min beats 1×60 min",
          "After watching a video, immediately attempt a quiz",
          "Use the AI Doubt Solver whenever you get stuck",
        ].map((tip, i) => (
          <View key={i} style={styles.tipRow}>
            <View style={styles.tipDot} />
            <Text style={styles.tipTxt}>{tip}</Text>
          </View>
        ))}
      </View>

    </ScrollView>

    {/* AI Doubt Solver — local fallback modal (only used when no onOpenAITutor callback is supplied) */}
    {!onOpenAITutor && (
      <Modal visible={showAITutorLocal} animationType="slide" statusBarTranslucent onRequestClose={() => setShowAITutorLocal(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: palette.gray50 }}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setShowAITutorLocal(false)} style={{ marginRight: spacing.md }}>
              <Ionicons name="arrow-back" size={24} color={palette.gray700} />
            </TouchableOpacity>
            <Text style={styles.modalHeaderTxt}>✨ AI Tutor</Text>
          </View>
          <AITutorScreen />
        </SafeAreaView>
      </Modal>
    )}

    {/* Weak Topic Finder — inline lightweight modal */}
    <Modal visible={showWeakTopics} animationType="slide" transparent statusBarTranslucent onRequestClose={() => setShowWeakTopics(false)}>
      <View style={styles.wtOverlay}>
        <View style={styles.wtSheet}>
          <View style={styles.wtHeader}>
            <View style={styles.wtHeaderLeft}>
              <View style={[styles.aiIcon, { backgroundColor: palette.success600 + "20", marginBottom: 0 }]}>
                <Ionicons name="analytics" size={20} color={palette.success600} />
              </View>
              <View>
                <Text style={styles.wtTitle}>Weak Topic Finder</Text>
                <Text style={styles.wtSub}>Topics that need more revision</Text>
              </View>
            </View>
            <TouchableOpacity onPress={() => setShowWeakTopics(false)} style={styles.wtCloseBtn}>
              <Ionicons name="close" size={20} color={palette.gray500} />
            </TouchableOpacity>
          </View>

          <ScrollView style={{ maxHeight: 360 }} contentContainerStyle={{ padding: spacing.lg }}>
            {(weakLoading || weakFetching) && (
              <ActivityIndicator color={palette.success600} style={{ marginVertical: spacing.xl }} />
            )}

            {!weakLoading && !weakFetching && weakTopics.length === 0 && (
              <View style={styles.empty}>
                <Ionicons name="checkmark-done-circle-outline" size={40} color={palette.success100} />
                <Text style={styles.emptyTxt}>No weak topics found</Text>
                <Text style={styles.emptySub}>Keep practicing quizzes to build up your topic history</Text>
              </View>
            )}

            {!weakLoading && !weakFetching && weakTopics.map((topic: any, i: number) => {
              const label = topic.topic_name ?? topic.name ?? topic.topic ?? `Topic ${String(topic.topic_id ?? i + 1).slice(0, 8)}`;
              const accuracy = typeof topic.accuracy === "number" ? Math.round(topic.accuracy) : null;
              return (
                <View key={topic.topic_id ?? i} style={styles.wtRow}>
                  <View style={styles.wtDot} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.wtTopicLabel}>{label}</Text>
                    {topic.attempts != null && (
                      <Text style={styles.wtTopicMeta}>{topic.attempts} attempt{topic.attempts === 1 ? "" : "s"}</Text>
                    )}
                  </View>
                  {accuracy != null && (
                    <View style={styles.wtAccBadge}>
                      <Text style={styles.wtAccTxt}>{accuracy}%</Text>
                    </View>
                  )}
                </View>
              );
            })}
          </ScrollView>
        </View>
      </View>
    </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  scroll:       { flex: 1, backgroundColor: palette.gray50 },
  content:      { paddingBottom: spacing["4xl"] },
  section:      { paddingHorizontal: spacing.lg, marginTop: spacing["2xl"] },
  sectionTitle: { fontSize: 15, fontWeight: "800", color: palette.gray900, marginBottom: 2 },
  sectionSub:   { fontSize: 12, color: palette.gray500, marginBottom: spacing.md },

  // Videos grid
  grid:         { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
  card:         { width: CARD_W, backgroundColor: "#fff", borderRadius: radius.lg, overflow: "hidden", borderWidth: 1, borderColor: palette.gray100, ...cardShadow },
  thumbWrap:    { width: "100%", aspectRatio: 16 / 9, position: "relative" },
  thumb:        { width: "100%", height: "100%" },
  playBtn:      { position: "absolute", bottom: 8, right: 8, width: 26, height: 26, borderRadius: 13, backgroundColor: "rgba(0,0,0,0.6)", alignItems: "center", justifyContent: "center" },
  barTrack:     { position: "absolute", bottom: 0, left: 0, right: 0, height: 3, backgroundColor: "rgba(255,255,255,0.25)" },
  barFill:      { height: "100%", backgroundColor: palette.danger500 },
  pctBadge:     { position: "absolute", top: 6, left: 6, backgroundColor: "rgba(0,0,0,0.55)", borderRadius: 6, paddingHorizontal: 5, paddingVertical: 2 },
  pctTxt:       { color: "#fff", fontSize: 9, fontWeight: "800" },
  cardTitle:    { fontSize: 11, fontWeight: "600", color: palette.gray900, padding: spacing.sm, paddingBottom: 2, lineHeight: 15 },
  cardSub:      { fontSize: 10, color: palette.gray500, paddingHorizontal: spacing.sm, paddingBottom: spacing.sm },

  // Empty state
  empty:        { alignItems: "center", paddingVertical: spacing["4xl"] },
  emptyTxt:     { fontSize: 14, fontWeight: "600", color: palette.gray500, marginTop: spacing.md },
  emptySub:     { fontSize: 12, color: palette.gray400, marginTop: spacing.xs, textAlign: "center" },

  // AI Tools toggle
  aiToolsToggle:     { flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: "#fff", borderRadius: radius.lg, paddingHorizontal: spacing.lg, paddingVertical: 13, borderWidth: 1, borderColor: palette.gray100, ...cardShadow, marginBottom: spacing.md, minHeight: 44 },
  aiToolsToggleLeft: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  aiToolsToggleTxt:  { fontSize: 13, fontWeight: "700", color: palette.gray900 },

  // AI Hero
  aiHero:       { borderRadius: radius.xl, padding: spacing.xl, marginBottom: spacing.md },
  aiHeroTitle:  { color: "#fff", fontSize: 17, fontWeight: "800", marginBottom: spacing.xs },
  aiHeroSub:    { color: "rgba(255,255,255,0.8)", fontSize: 12, lineHeight: 17 },
  aiGrid:       { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  aiCard:       { width: (width - 52) / 2, borderRadius: radius.lg, padding: spacing.md },
  aiIcon:       { width: 42, height: 42, borderRadius: radius.md, alignItems: "center", justifyContent: "center", marginBottom: spacing.sm },
  aiCardTitle:  { fontSize: 13, fontWeight: "700", color: palette.gray900, marginBottom: 2 },
  aiCardDesc:   { fontSize: 11, color: palette.gray500, lineHeight: 15 },

  // Tips
  tipRow:       { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm, marginBottom: spacing.sm },
  tipDot:       { width: 6, height: 6, borderRadius: 3, backgroundColor: palette.primary600, marginTop: 5, flexShrink: 0 },
  tipTxt:       { flex: 1, fontSize: 13, color: palette.gray700, lineHeight: 18 },

  // Local AI Tutor fallback modal header
  modalHeader:    { flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: palette.gray100, backgroundColor: "#fff" },
  modalHeaderTxt: { fontSize: 16, fontWeight: "700", color: palette.gray800 },

  // Weak Topic Finder panel
  wtOverlay:    { flex: 1, backgroundColor: "rgba(17,24,39,0.45)", justifyContent: "flex-end" },
  wtSheet:      { backgroundColor: "#fff", borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, maxHeight: "70%", paddingBottom: spacing.md },
  wtHeader:     { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: spacing.lg, borderBottomWidth: 1, borderBottomColor: palette.gray100 },
  wtHeaderLeft: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  wtTitle:      { fontSize: 15, fontWeight: "800", color: palette.gray900 },
  wtSub:        { fontSize: 11, color: palette.gray500, marginTop: 1 },
  wtCloseBtn:   { width: 32, height: 32, borderRadius: 16, backgroundColor: palette.gray100, alignItems: "center", justifyContent: "center" },
  wtRow:        { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: palette.gray50, minHeight: 44 },
  wtDot:        { width: 8, height: 8, borderRadius: 4, backgroundColor: palette.success600, flexShrink: 0 },
  wtTopicLabel: { fontSize: 13, fontWeight: "600", color: palette.gray900 },
  wtTopicMeta:  { fontSize: 11, color: palette.gray400, marginTop: 1 },
  wtAccBadge:   { backgroundColor: semantic.danger.bg, borderRadius: radius.sm, paddingHorizontal: spacing.sm, paddingVertical: 3 },
  wtAccTxt:     { fontSize: 11, fontWeight: "700", color: semantic.danger.solid },
});

// ── AI Generation workflow styles ──────────────────────────────────────────────
const g = StyleSheet.create({
  wrap:  { gap: spacing.md },

  hero:  { borderRadius: radius.xl, padding: spacing.lg, flexDirection: "row", alignItems: "center", gap: spacing.md, marginBottom: spacing.md },
  heroIconWrap: { width: 48, height: 48, borderRadius: radius.md, backgroundColor: "rgba(255,255,255,0.2)", alignItems: "center", justifyContent: "center" },
  heroTitle: { color: "#fff", fontSize: 17, fontWeight: "800" },
  heroSub:   { color: "rgba(255,255,255,0.85)", fontSize: 11.5, marginTop: 3, lineHeight: 16 },

  // Category switcher
  tabGrid:      { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  tabCard:      { width: (width - 16 * 2 - 10) / 2, backgroundColor: "#fff", borderRadius: radius.lg, padding: 13, borderWidth: 2, borderColor: "transparent", ...cardShadow, minHeight: 44 },
  tabCardActive:{ borderColor: palette.primary600 },
  tabIcon:      { width: 36, height: 36, borderRadius: radius.md, alignItems: "center", justifyContent: "center", marginBottom: spacing.sm },
  tabHeaderRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 4 },
  tabLabel:     { fontSize: 12.5, fontWeight: "800", color: palette.gray900, flexShrink: 1 },
  countBadge:   { borderRadius: radius.sm, paddingHorizontal: 6, paddingVertical: 1 },
  countBadgeTxt:{ fontSize: 11, fontWeight: "800" },
  tabBlurb:     { fontSize: 10, color: palette.gray400, marginTop: 2 },

  // Filter card
  filterCard:    { backgroundColor: "#fff", borderRadius: radius.lg, padding: spacing.md, gap: spacing.sm, borderWidth: 1.5, borderColor: palette.gray200, borderStyle: "dashed" },
  filterEyebrow: { ...typography.caption, color: palette.gray400 },

  chipBlock: { gap: 6 },
  chipLabel: { fontSize: 11.5, fontWeight: "600", color: palette.gray500 },
  chipRow:   { gap: spacing.sm, paddingRight: 4 },
  chip:      { paddingHorizontal: 13, paddingVertical: 7, borderRadius: radius.lg, backgroundColor: palette.gray100, minHeight: 32 },
  chipActive:{ backgroundColor: palette.primary600 },
  chipTxt:   { fontSize: 12, fontWeight: "600", color: palette.gray600 },
  chipTxtActive: { color: "#fff" },

  generateBtn:        { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm, backgroundColor: palette.primary600, borderRadius: radius.lg, paddingVertical: 13, marginTop: spacing.xs, minHeight: 44 },
  generateBtnDisabled:{ opacity: 0.5 },
  generateBtnTxt:     { color: "#fff", fontSize: 14, fontWeight: "700" },
  remainingTxt:       { fontSize: 11, color: palette.gray400, fontWeight: "600", textAlign: "center", marginTop: -2 },

  sourceRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  sourceTxt: { fontSize: 11, color: palette.gray400 },

  errorBox: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm, backgroundColor: semantic.danger.bg, borderRadius: radius.md, padding: spacing.md },
  errorTxt: { flex: 1, fontSize: 12.5, color: semantic.danger.solid, lineHeight: 17 },

  // Results header
  resultsHeaderRow:      { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  toggleResultsBtn:       { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: palette.primary50, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: 9, minHeight: 40 },
  toggleResultsBtnActive: { backgroundColor: palette.gray100 },
  toggleResultsTxt:       { fontSize: 12.5, fontWeight: "700", color: palette.primary700 },
  refreshBtn:             { flexDirection: "row", alignItems: "center", gap: 5 },
  refreshTxt:             { fontSize: 11.5, fontWeight: "600", color: palette.gray500 },

  // Empty results
  emptyResults:    { alignItems: "center", backgroundColor: "#fff", borderRadius: radius.lg, paddingVertical: spacing["3xl"], paddingHorizontal: spacing.xl },
  emptyResultsTxt: { fontSize: 13, fontWeight: "700", color: palette.gray500, marginTop: spacing.md, textAlign: "center" },
  emptyResultsSub: { fontSize: 11, color: palette.gray400, marginTop: spacing.xs, textAlign: "center" },

  // Inline question results
  resultsMetaRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  resultsMetaTxt: { fontSize: 11, color: palette.gray400 },
  downloadChip:   { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: palette.primary50, borderRadius: radius.md, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
  downloadChipTxt:{ fontSize: 11.5, fontWeight: "700", color: palette.primary700 },

  qCard:     { backgroundColor: "#fff", borderRadius: radius.lg, padding: spacing.md, ...cardShadow },
  qText:     { fontSize: 13.5, fontWeight: "700", color: palette.gray900, lineHeight: 19 },
  optRow:    { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm, paddingHorizontal: spacing.sm, paddingVertical: spacing.sm, borderRadius: radius.md, borderWidth: 1, borderColor: palette.gray100 },
  optRowSm:  { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm, paddingHorizontal: 9, paddingVertical: 6, borderRadius: radius.sm, borderWidth: 1, borderColor: "transparent" },
  optRowCorrect: { borderColor: palette.success100, backgroundColor: semantic.success.bg },
  optLetter: { fontSize: 12, fontWeight: "800", color: palette.gray400, textTransform: "uppercase" },
  optLetterCorrect: { color: semantic.success.text },
  optTxt:    { flex: 1, fontSize: 12.5, color: palette.gray700 },
  optTxtSm:  { flex: 1, fontSize: 11.5, color: palette.gray600 },
  optTxtCorrect: { color: palette.success700, fontWeight: "600" },

  qFooter:   { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: spacing.sm, flexWrap: "wrap" },
  revealBtn: { flexDirection: "row", alignItems: "center", gap: 4 },
  revealTxt: { fontSize: 11.5, fontWeight: "700", color: palette.primary600 },
  explainTxt:{ flex: 1, fontSize: 11, color: palette.gray500, fontStyle: "italic" },

  // Paper card
  paperCard:      { backgroundColor: "#fff", borderRadius: radius.lg, padding: spacing.md, ...cardShadow },
  paperRow:       { flexDirection: "row", alignItems: "flex-start", gap: spacing.md },
  paperIcon:      { width: 40, height: 40, borderRadius: radius.md, alignItems: "center", justifyContent: "center" },
  paperTitle:     { fontSize: 13, fontWeight: "700", color: palette.gray900 },
  paperMetaRow:   { flexDirection: "row", flexWrap: "wrap", gap: 4, marginTop: 3 },
  paperMetaTxt:   { fontSize: 10.5, color: palette.gray400, textTransform: "capitalize" },
  paperBadgeRow:  { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 5 },
  diffBadge:      { borderRadius: 7, paddingHorizontal: 7, paddingVertical: 2 },
  diffBadgeTxt:   { fontSize: 10, fontWeight: "700", textTransform: "capitalize" },

  paperActions:   { flexDirection: "row", gap: spacing.sm, marginTop: spacing.md },
  paperActionBtn: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: palette.primary50, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, minHeight: 36 },
  paperActionTxt: { fontSize: 11.5, fontWeight: "700", color: palette.primary700 },

  paperPreview:   { marginTop: spacing.md, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: palette.gray100, gap: spacing.sm },
  previewQ:       { backgroundColor: palette.gray50, borderRadius: radius.md, padding: spacing.sm },
  previewQTxt:    { fontSize: 12, fontWeight: "600", color: palette.gray900, lineHeight: 17 },

  // Flashcards
  flashcard:      { width: (width - 16 * 2 - spacing.sm) / 2, minHeight: 120, borderRadius: radius.lg, borderWidth: 2, padding: spacing.md, justifyContent: "space-between" },
  flashcardLabel: { fontSize: 9.5, fontWeight: "800", letterSpacing: 0.5 },
  flashcardTxt:   { fontSize: 12.5, fontWeight: "700", color: palette.gray900, lineHeight: 17, marginTop: 4 },
  flashcardHint:  { fontSize: 10, color: palette.gray400, marginTop: 6 },

  // Revision Plan day cards
  planDayCard:      { backgroundColor: "#fff", borderRadius: radius.lg, padding: spacing.md, ...cardShadow, gap: 4 },
  planDayHeader:    { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginBottom: 2 },
  planDayBadge:     { width: 30, height: 30, borderRadius: radius.md, backgroundColor: palette.primary600, alignItems: "center", justifyContent: "center" },
  planDayBadgeTxt:  { color: "#fff", fontWeight: "800", fontSize: 13 },
  planDayTitle:     { fontSize: 13, fontWeight: "700", color: palette.gray900 },
  planDayFocus:     { fontSize: 10.5, color: palette.gray400 },
  planDayTopics:    { fontSize: 11, color: palette.gray500 },
  planDayAction:    { fontSize: 11.5, color: palette.gray600, lineHeight: 16 },
});
