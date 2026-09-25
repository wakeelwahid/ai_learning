import React, { useState, useEffect, useRef } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  SafeAreaView, StatusBar, ActivityIndicator, Modal, Linking, TextInput,
  AppState, Alert,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import Toast from "react-native-toast-message";
import { quizApi } from "@/api/quiz";
import { aiApi } from "@/api/ai";
import { referralApi } from "@/api/referral";
import { recordShareEvent } from "@/api/gamification";
import { useAppSelector } from "@/store";
import { useLanguage } from "@/contexts/LanguageContext";
import { useStudyHeartbeat } from "@/hooks/useStudyHeartbeat";
import { useStudyTime } from "@/hooks/useStudyTime";
import StudyLimitBanner from "@/components/StudyLimitBanner";
import UpgradePrompt from "@/components/ui/UpgradePrompt";
import { palette, semantic, radius, spacing, typography, cardShadow, cardShadowElevated } from "@/theme/colors";

// ── Types ─────────────────────────────────────────────────────────────────────
// Real quizzes return `options` as a dict keyed by letter, e.g.
// {"A": "Option A", "B": "Option B"}. fill_blank / subjective questions have
// no options at all (free-text answer). The old dummy fallback questions use
// a plain string[] with no natural key.
//
// What must be SUBMITTED is inconsistent across question types in the
// backend's own seed data: MCQ's correct_answer is the options KEY ("B"),
// but true_false's correct_answer is the option LABEL text ("True"), not
// its key — confirmed against a live attempt (submitting the key for a
// true_false question scored it wrong; submitting the label scored it
// right). answerValue() below picks the right one per type.
interface Question {
  id:            string;
  text:          string;
  options:       Record<string, string> | string[] | null;
  question_type?: string;
  answer?:       string;
}

/** Normalizes any of the three option shapes above into [key, label] pairs
 * ready to render. */
function optionEntries(options: Question["options"]): [string, string][] {
  if (!options) return [];
  if (Array.isArray(options)) return options.map((label, i) => [String.fromCharCode(65 + i), label]);
  return Object.entries(options);
}

/** What to actually submit as user_answer for a given option — see the note
 * on Question above for why this can't just always be the key. */
function answerValue(questionType: string | undefined, key: string, label: string): string {
  return questionType === "true_false" ? label : key;
}

interface MistakeExplanation {
  question:       string;
  correct_answer: string;
  explanation:    string;
  tip:            string;
  concept:        string;
}

// ── Dummy fallback questions ───────────────────────────────────────────────────
const DUMMY_QUESTIONS: Question[] = [
  {
    id: "q1", text: "What is the powerhouse of the cell?",
    options: ["Nucleus", "Mitochondria", "Ribosome", "Golgi Body"],
  },
  {
    id: "q2", text: "Which planet is closest to the Sun?",
    options: ["Venus", "Earth", "Mercury", "Mars"],
  },
  {
    id: "q3", text: "What is 12 × 12?",
    options: ["124", "144", "132", "148"],
  },
  {
    id: "q4", text: "Who wrote 'Romeo and Juliet'?",
    options: ["Charles Dickens", "William Shakespeare", "Jane Austen", "Mark Twain"],
  },
  {
    id: "q5", text: "What is the chemical symbol for Gold?",
    options: ["Go", "Gd", "Au", "Ag"],
  },
];

// ── Props ─────────────────────────────────────────────────────────────────────
interface Props {
  quizId:  string;
  title?:  string;
  onBack:  () => void;
}

type Step = "start" | "resume" | "question" | "result";

interface SavedQuizState {
  answers: Record<string, string>;
  current_q: number;
  marked_for_review: number[];
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default function QuizScreen({ quizId, title = "Quiz", onBack }: Props) {
  const { t } = useLanguage();
  const navigation = useNavigation<any>();
  const user = useAppSelector(s => s.auth.user);
  // Callers always resolve a real quiz id before opening this screen (see
  // DashboardScreen's startQuickQuiz) — this guard just stops any future
  // caller from repeating the old "demo" placeholder bug, where a
  // non-UUID id was sent straight to endpoints that require one and
  // 422'd on every request.
  const isRealQuiz = UUID_RE.test(quizId);

  const TIME_PER_Q = 60;

  const [step,          setStep]          = useState<Step>("start");
  const [loading,       setLoading]       = useState(false);
  const [loadError,     setLoadError]     = useState(false);
  const [quotaMessage,  setQuotaMessage]  = useState<string | null>(null);
  const [questions,     setQuestions]     = useState<Question[]>([]);
  const [attemptId,     setAttemptId]     = useState<string | null>(null);
  const [currentIndex,  setCurrentIndex]  = useState(0);
  const [selected,      setSelected]      = useState<string | null>(null);
  const [answers,       setAnswers]       = useState<Record<string, string>>({});
  const [score,            setScore]            = useState(0);
  const [xpEarned,         setXpEarned]         = useState(0);
  const [referralCode,     setReferralCode]     = useState<string | null>(null);
  const [submitting,       setSubmitting]       = useState(false);
  const [analysis,         setAnalysis]         = useState<MistakeExplanation[] | null>(null);
  const [analysisLoading,  setAnalysisLoading]  = useState(false);
  const [expandedMistake,  setExpandedMistake]  = useState<number | null>(null);
  const [timeLeft,         setTimeLeft]         = useState(TIME_PER_Q);
  const [markedForReview,  setMarkedForReview]  = useState<Set<number>>(new Set());

  const { blocked: studyBlocked } = useStudyTime();
  useStudyHeartbeat(step === "question");

  // ── Resume support ─────────────────────────────────────────────────────────
  // A found-but-not-yet-restored resumable attempt: shown as a "Resume?"
  // choice on the start screen rather than auto-restored, since silently
  // dropping the user back into question 7 with no explanation would be
  // more confusing than a bare "Start Quiz" if they genuinely meant to
  // start fresh (e.g. they abandoned the old attempt on purpose).
  const [resumable, setResumable] = useState<{ attemptId: string; state: SavedQuizState } | null>(null);
  const [resumeChecked, setResumeChecked] = useState(false);

  // Keep the latest in-progress state in a ref so the AppState background
  // listener (registered once) can always read the current values without
  // re-subscribing on every keystroke/answer.
  const liveStateRef = useRef<{ attemptId: string | null; answers: Record<string, string>; currentIndex: number; markedForReview: Set<number> }>({
    attemptId: null, answers: {}, currentIndex: 0, markedForReview: new Set(),
  });
  useEffect(() => {
    liveStateRef.current = { attemptId, answers, currentIndex, markedForReview };
  }, [attemptId, answers, currentIndex, markedForReview]);

  const persistState = (attId: string, answersToSave: Record<string, string>, idx: number, marked: Set<number>) => {
    quizApi.saveState(attId, user?.id ?? "", {
      answers: answersToSave,
      current_q: idx,
      marked_for_review: Array.from(marked),
    }).catch(() => { /* best-effort — losing one checkpoint isn't fatal */ });
  };

  // Tapping the in-question "X" used to call onBack directly with no
  // confirmation, silently discarding the current unsaved selection (only
  // previously-answered questions were recoverable via the resume flow
  // above — persistState was only ever called from handleNext and the
  // AppState background listener, never here). Now it confirms first and
  // persists the current state before leaving, matching what the resume
  // flow already expects to find.
  const handleExitQuiz = () => {
    if (!attemptId) { onBack(); return; }
    Alert.alert(
      "Leave quiz?",
      "Your progress on this question will be saved, but you'll need to resume to finish the quiz.",
      [
        { text: "Keep going", style: "cancel" },
        {
          text: "Leave",
          style: "destructive",
          onPress: () => {
            persistState(attemptId, answers, currentIndex, markedForReview);
            onBack();
          },
        },
      ],
    );
  };

  // Hardware-back / swipe-back guard — this screen is a real Stack.Screen
  // (not a Modal with onRequestClose anymore), so Android back and the iOS
  // swipe gesture both fire a "beforeRemove" navigation event instead. Runs
  // the exact same confirm-and-save flow as the in-question "X" button
  // (handleExitQuiz) so neither exit path can bypass the other — without
  // this listener, hardware-back would silently discard the in-progress
  // answer the confirmation exists to protect.
  useEffect(() => {
    const sub = navigation.addListener("beforeRemove", (e: any) => {
      const live = liveStateRef.current;
      if (!live.attemptId) return; // nothing in progress — let it leave freely
      e.preventDefault();
      Alert.alert(
        "Leave quiz?",
        "Your progress on this question will be saved, but you'll need to resume to finish the quiz.",
        [
          { text: "Keep going", style: "cancel" },
          {
            text: "Leave",
            style: "destructive",
            onPress: () => {
              persistState(live.attemptId!, live.answers, live.currentIndex, live.markedForReview);
              navigation.dispatch(e.data.action);
            },
          },
        ],
      );
    });
    return sub;
  }, [navigation]);

  // Force a save when the app is backgrounded/closed mid-quiz — the
  // per-answer save in handleNext already covers the "answered a question
  // then got interrupted" case, but not "sitting on a half-typed free-text
  // answer" or "walked away mid-question with nothing submitted yet".
  useEffect(() => {
    const sub = AppState.addEventListener("change", (next) => {
      if (next !== "background" && next !== "inactive") return;
      const live = liveStateRef.current;
      if (live.attemptId) {
        persistState(live.attemptId, live.answers, live.currentIndex, live.markedForReview);
      }
    });
    return () => sub.remove();
  }, []);

  // On mount: is there an in-progress attempt for THIS quiz with saved
  // state? Offer to resume rather than silently starting a brand-new
  // attempt (which the backend allows — nothing stops multiple concurrent
  // attempts — but would strand the old one's progress forever).
  useEffect(() => {
    if (!isRealQuiz || !user?.id) { setResumeChecked(true); return; }
    (async () => {
      try {
        const { data } = await quizApi.getUserAttempts(user.id);
        const attempts = Array.isArray(data) ? data : [];
        const inProgress = attempts.find((a: any) => a.quiz_id === quizId && a.status === "in_progress");
        if (!inProgress) return;
        const { data: stateResp } = await quizApi.getState(inProgress.id, user.id);
        const saved = stateResp?.state as SavedQuizState | undefined;
        if (saved && typeof saved.current_q === "number") {
          setResumable({ attemptId: inProgress.id, state: saved });
        }
      } catch {
        // No saved state (404) or a network hiccup — just start fresh, same
        // as today's behavior for every quiz before this feature existed.
      } finally {
        setResumeChecked(true);
      }
    })();
  }, [quizId, isRealQuiz, user?.id]);

  const handleResume = () => {
    if (!resumable) return;
    setAttemptId(resumable.attemptId);
    setAnswers(resumable.state.answers ?? {});
    setCurrentIndex(resumable.state.current_q ?? 0);
    setMarkedForReview(new Set(resumable.state.marked_for_review ?? []));
    setSelected(null);
    setStep("question");
  };

  const handleDiscardResume = () => {
    setResumable(null);
    setStep("start");
  };

  // ── Load questions ─────────────────────────────────────────────────────────
  // DUMMY_QUESTIONS is only for the non-UUID demo/preview route (!isRealQuiz)
  // — an empty response or a request failure for a REAL quiz must surface as
  // an error, not silently swap in unrelated trivia the student would have
  // no way to distinguish from their actual quiz (previously happened here).
  const loadQuestions = async () => {
    if (!isRealQuiz) { setQuestions(DUMMY_QUESTIONS); setLoadError(false); return; }
    setLoading(true);
    setLoadError(false);
    try {
      const { data } = await quizApi.getQuestions(quizId);
      const qs: Question[] = Array.isArray(data) ? data : (data.questions ?? []);
      if (qs.length > 0) {
        setQuestions(qs);
      } else {
        setQuestions([]);
        setLoadError(true);
      }
    } catch {
      setQuestions([]);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadQuestions(); }, [quizId]);

  // Reset timer when question changes
  useEffect(() => { setTimeLeft(TIME_PER_Q); }, [currentIndex]);

  // Countdown
  useEffect(() => {
    if (step !== "question") return;
    const interval = setInterval(() => {
      setTimeLeft(t => {
        if (t <= 1) { handleNext(); return TIME_PER_Q; }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [currentIndex, step]);

  // ── Start attempt ──────────────────────────────────────────────────────────
  const handleStart = async () => {
    if (!user?.id || !isRealQuiz) { setStep("question"); return; }
    try {
      const { data } = await quizApi.startAttempt(quizId, user.id);
      setAttemptId(data?.id ?? data?.attempt_id ?? null);
    } catch (err: any) {
      if (err?.response?.status === 429 && err.response.data?.detail) {
        setQuotaMessage(err.response.data.detail);
        return;
      }
      // proceed without server-tracked attempt
    }
    setCurrentIndex(0);
    setSelected(null);
    setAnswers({});
    setStep("question");
  };

  // ── Select option ──────────────────────────────────────────────────────────
  const handleSelect = (option: string) => {
    if (selected !== null) return; // already answered
    setSelected(option);
  };

  // ── Next question / finish ──────────────────────────────────────────────────
  const handleNext = async () => {
    if (!selected) return;
    const q = questions[currentIndex];
    const updatedAnswers = { ...answers, [q.id]: selected };
    setAnswers(updatedAnswers);

    // Optional: submit answer to server
    if (attemptId) {
      try {
        await quizApi.submitAnswer(attemptId, q.id, selected);
      } catch { /* best-effort */ }
    }

    if (currentIndex < questions.length - 1) {
      const nextIndex = currentIndex + 1;
      setCurrentIndex(nextIndex);
      setSelected(null);
      // Checkpoint after every answered question — the actual "survive an
      // app kill" guarantee (the AppState listener above covers the
      // in-between-answers case; this covers the far more common "answered
      // a question, then got interrupted before the next one" case).
      if (attemptId) persistState(attemptId, updatedAnswers, nextIndex, markedForReview);
    } else {
      // Final submission
      setSubmitting(true);
      let finalScore = 0;
      let finalXp    = 0;
      try {
        if (attemptId && user?.id) {
          const { data } = await quizApi.submitQuiz(attemptId, user.id);
          finalScore = data?.score ?? data?.correct ?? 0;
          finalXp    = data?.xp_earned ?? Math.round(finalScore * 10);
        } else {
          // Estimate locally using correct_answer field if present
          questions.forEach(q2 => {
            if (q2.answer && updatedAnswers[q2.id] === q2.answer) finalScore++;
          });
          finalXp = finalScore * 10;
        }
      } catch {
        // estimate score locally
        questions.forEach(q2 => {
          if (q2.answer && updatedAnswers[q2.id] === q2.answer) finalScore++;
        });
        finalXp = finalScore * 10;
      } finally {
        setSubmitting(false);
      }
      setScore(finalScore);
      setXpEarned(finalXp);
      setStep("result");

      // Real referral code for the share card below — fetched once here
      // rather than trusting a `referral_code` field on the User object,
      // which auth_service's /auth/me never actually returns.
      const willShowShareCard = questions.length > 0 && Math.round((finalScore / questions.length) * 100) >= 70;
      if (willShowShareCard && user?.id) {
        referralApi.getCode(user.id)
          .then(({ data }) => setReferralCode(data?.code ?? null))
          .catch(() => setReferralCode(null));
      }
    }
  };

  const handleAnalyseMistakes = async () => {
    const mistakes = questions
      .filter(q => q.answer && answers[q.id] && answers[q.id].toLowerCase() !== q.answer.toLowerCase())
      .map(q => ({
        question:       q.text,
        user_answer:    answers[q.id] ?? "",
        correct_answer: q.answer ?? "",
      }));

    if (mistakes.length === 0) {
      Toast.show({ type: "success", text1: "No mistakes!", text2: "Perfect score — nothing to analyse." });
      return;
    }
    setAnalysisLoading(true);
    try {
      const { data } = await aiApi.mistakeAnalysis(mistakes);
      setAnalysis(data.explanations ?? []);
    } catch (err: any) {
      const detail: string | undefined = err?.response?.data?.detail;
      Toast.show({ type: "error", text1: detail ?? "Could not analyse mistakes" });
    } finally {
      setAnalysisLoading(false);
    }
  };

  const pct = questions.length > 0 ? Math.round((score / questions.length) * 100) : 0;

  // ── START SCREEN ───────────────────────────────────────────────────────────
  if (step === "start") {
    return (
      <SafeAreaView style={styles.safe}>
        <StatusBar barStyle="light-content" />
        <View style={styles.header}>
          <TouchableOpacity onPress={onBack} style={styles.backBtn}>
            <Ionicons name="arrow-back-outline" size={20} color="rgba(255,255,255,0.9)" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{title}</Text>
        </View>

        <ScrollView contentContainerStyle={styles.startBody}>
          <StudyLimitBanner style={{ marginBottom: spacing.md }} />
          {resumable && (
            <View style={styles.resumeCard}>
              <View style={styles.resumeIconWrap}>
                <Ionicons name="play-skip-forward-outline" size={22} color={palette.warning600} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.resumeTitle}>Continue where you left off?</Text>
                <Text style={styles.resumeSub}>
                  You answered {Object.keys(resumable.state.answers ?? {}).length} question{Object.keys(resumable.state.answers ?? {}).length === 1 ? "" : "s"} in this quiz already.
                </Text>
                <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm }}>
                  <TouchableOpacity onPress={handleResume} style={styles.resumeBtn} activeOpacity={0.85}>
                    <Text style={styles.resumeBtnTxt}>Resume</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={handleDiscardResume} style={styles.resumeDiscardBtn} activeOpacity={0.7}>
                    <Text style={styles.resumeDiscardBtnTxt}>Start Over</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          )}

          <View style={styles.startCard}>
            <View style={styles.startIconWrap}>
              <Ionicons name="help-circle" size={44} color="#fff" />
            </View>
            <Text style={styles.startTitle}>{title}</Text>

            {loading || !resumeChecked ? (
              <ActivityIndicator color={palette.primary600} style={{ marginVertical: 20 }} />
            ) : loadError ? (
              <View style={{ alignItems: "center", marginVertical: 12 }}>
                <Text style={styles.loadErrorTxt}>Couldn't load this quiz's questions. Please check your connection and try again.</Text>
                <TouchableOpacity onPress={loadQuestions} style={styles.loadErrorRetryBtn} activeOpacity={0.85}>
                  <Ionicons name="refresh" size={16} color={palette.primary600} />
                  <Text style={styles.loadErrorRetryBtnTxt}>Retry</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <Text style={styles.startSub}>
                {questions.length} questions · Multiple choice
              </Text>
            )}

            <View style={styles.infoRow}>
              <View style={styles.infoChip}>
                <Ionicons name="time-outline" size={14} color={palette.gray500} />
                <Text style={styles.infoChipTxt}>No time limit</Text>
              </View>
              <View style={styles.infoChip}>
                <Ionicons name="star-outline" size={14} color={palette.gray500} />
                <Text style={styles.infoChipTxt}>Earn XP</Text>
              </View>
              <View style={styles.infoChip}>
                <Ionicons name="list-outline" size={14} color={palette.gray500} />
                <Text style={styles.infoChipTxt}>{questions.length} Qs</Text>
              </View>
            </View>

            {quotaMessage ? (
              <View style={{ width: "100%", marginTop: spacing.md }}>
                <UpgradePrompt message={quotaMessage} />
              </View>
            ) : (
              <TouchableOpacity
                onPress={handleStart}
                disabled={loading || loadError || studyBlocked}
                activeOpacity={0.85}
                style={{ width: "100%" }}
              >
                <View style={[styles.startBtn, { backgroundColor: (loading || loadError || studyBlocked) ? palette.primary300 : palette.primary600 }]}>
                  <Ionicons name="play" size={18} color="#fff" />
                  <Text style={styles.startBtnTxt}>Start Quiz</Text>
                </View>
              </TouchableOpacity>
            )}

            <TouchableOpacity onPress={onBack} style={styles.cancelBtn} activeOpacity={0.7}>
              <Text style={styles.cancelBtnTxt}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── QUESTION SCREEN ────────────────────────────────────────────────────────
  if (step === "question") {
    const q     = questions[currentIndex];
    const total = questions.length;
    const prog  = (currentIndex + 1) / total;

    return (
      <SafeAreaView style={styles.safe}>
        <StatusBar barStyle="light-content" />
        <View style={styles.header}>
          <TouchableOpacity onPress={handleExitQuiz} style={styles.backBtn}>
            <Ionicons name="close" size={20} color="rgba(255,255,255,0.9)" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Question {currentIndex + 1} of {total}</Text>
        </View>

        {/* Progress bar */}
        <View style={styles.progressBarWrap}>
          <View style={[styles.progressBarFill, { width: `${prog * 100}%` as any }]} />
        </View>

        <ScrollView contentContainerStyle={styles.qBody}>
          {/* Timer bar */}
          <View style={{ marginBottom: 12 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
              <Text style={{ fontSize: 12, color: palette.gray500 }}>Q {currentIndex + 1}/{total}</Text>
              <Text style={{ fontSize: 12, color: timeLeft <= 10 ? palette.danger500 : palette.gray500, fontWeight: "600" }}>
                {timeLeft}s
              </Text>
            </View>
            <View style={{ height: 4, backgroundColor: palette.gray200, borderRadius: 2 }}>
              <View style={{
                height: 4,
                borderRadius: 2,
                width: `${(timeLeft / TIME_PER_Q) * 100}%` as any,
                backgroundColor: timeLeft <= 10 ? palette.danger500 : palette.primary600,
              }} />
            </View>
          </View>

          <View style={styles.qCard}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <View style={styles.qNumBadge}>
                <Text style={styles.qNumTxt}>Q{currentIndex + 1}</Text>
              </View>
              <TouchableOpacity onPress={() => setMarkedForReview(prev => {
                const next = new Set(prev);
                if (next.has(currentIndex)) next.delete(currentIndex); else next.add(currentIndex);
                return next;
              })}>
                <Text style={{ fontSize: 16 }}>{markedForReview.has(currentIndex) ? "🚩" : "⚑"}</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.qText}>{q.text}</Text>
          </View>

          {optionEntries(q.options).length > 0 ? (
            <>
              <Text style={styles.optionsLabel}>Choose one answer</Text>
              {optionEntries(q.options).map(([key, label]) => {
                const value = answerValue(q.question_type, key, label);
                const isSelected = selected === value;
                return (
                  <TouchableOpacity
                    key={key}
                    onPress={() => handleSelect(value)}
                    activeOpacity={0.8}
                    style={[styles.optionCard, isSelected && styles.optionCardSelected]}
                  >
                    {isSelected ? (
                      <View style={[styles.optionLetter, { backgroundColor: palette.primary600 }]}>
                        <Text style={styles.optionLetterTxtSelected}>{key}</Text>
                      </View>
                    ) : (
                      <View style={styles.optionLetter}>
                        <Text style={styles.optionLetterTxt}>{key}</Text>
                      </View>
                    )}
                    <Text style={[styles.optionTxt, isSelected && styles.optionTxtSelected]}>{label}</Text>
                    {isSelected && (
                      <Ionicons name="checkmark-circle" size={20} color={palette.primary600} />
                    )}
                  </TouchableOpacity>
                );
              })}
            </>
          ) : (
            <>
              <Text style={styles.optionsLabel}>Type your answer</Text>
              <TextInput
                style={styles.freeTextInput}
                value={selected ?? ""}
                // Free text needs continuous typing — handleSelect's "lock
                // after first pick" guard is for tap-once MCQ options only.
                onChangeText={setSelected}
                placeholder="Write your answer here…"
                placeholderTextColor={palette.gray400}
                multiline
              />
            </>
          )}

          {selected && (
            <TouchableOpacity onPress={handleNext} disabled={submitting} activeOpacity={0.85}>
              <View style={[styles.nextBtn, { backgroundColor: submitting ? palette.primary300 : palette.primary600 }]}>
                {submitting ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <>
                    <Text style={styles.nextBtnTxt}>
                      {currentIndex < total - 1 ? "Next Question" : "Finish Quiz"}
                    </Text>
                    <Ionicons name="arrow-forward" size={18} color="#fff" />
                  </>
                )}
              </View>
            </TouchableOpacity>
          )}
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── RESULT SCREEN ──────────────────────────────────────────────────────────
  const resultColor = pct >= 70 ? palette.success600 : pct >= 40 ? palette.warning600 : palette.danger600;

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" />
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Quiz Complete!</Text>
      </View>

      <ScrollView contentContainerStyle={styles.resultBody}>
        {/* Score circle */}
        <View style={[styles.scoreCircleWrap, { borderColor: resultColor }]}>
          <Text style={[styles.scoreCirclePct, { color: resultColor }]}>{pct}%</Text>
          <Text style={styles.scoreCircleSub}>{score}/{questions.length} correct</Text>
        </View>

        {/* XP earned */}
        {xpEarned > 0 && (
          <View style={styles.xpCard}>
            <Ionicons name="star" size={20} color={palette.warning600} />
            <Text style={styles.xpTxt}>+{xpEarned} XP earned!</Text>
          </View>
        )}

        {/* Result message */}
        <View style={styles.resultMsgCard}>
          <Ionicons
            name={pct >= 70 ? "trophy-outline" : pct >= 40 ? "ribbon-outline" : "refresh-circle-outline"}
            size={28}
            color={resultColor}
          />
          <Text style={[styles.resultMsg, { color: resultColor }]}>
            {pct >= 70 ? "Excellent work!" : pct >= 40 ? "Good effort!" : "Keep practicing!"}
          </Text>
          <Text style={styles.resultMsgSub}>
            {pct >= 70
              ? "You've mastered this topic. Keep it up!"
              : pct >= 40
              ? "You're on the right track. Review missed questions."
              : "Don't give up — review the material and try again."}
          </Text>
        </View>

        {/* WhatsApp share card — shown on score >= 70% */}
        {pct >= 70 && (
          <View style={styles.waShareCard}>
            <View style={styles.waShareHeader}>
              <LinearGradient colors={[palette.success500, palette.success700]} style={styles.waShareIconWrap}>
                <Ionicons name="share-social" size={20} color="#fff" />
              </LinearGradient>
              <View>
                <Text style={styles.waShareTitle}>Share your score!</Text>
                <Text style={styles.waShareSub}>Challenge friends on WhatsApp</Text>
              </View>
            </View>
            <TouchableOpacity
              onPress={() => {
                const link = referralCode
                  ? `https://edulearn.app/join?ref=${referralCode}`
                  : "https://edulearn.app";
                const emoji = pct >= 90 ? "🏆" : "🌟";
                const codeLine = referralCode ? `\n\nUse my code ${referralCode} when you join!` : "";
                const msg = encodeURIComponent(
                  `${emoji} I just scored ${score}/${questions.length} (${pct}%) on EduLearn!\n\nJoin me: ${link}${codeLine}`
                );
                Linking.openURL(`https://wa.me/?text=${msg}`);
                if (user?.id) {
                  recordShareEvent(user.id, "quiz_perfect", "whatsapp").catch(() => {});
                }
              }}
              activeOpacity={0.85}
            >
              <LinearGradient colors={[palette.success500, palette.success700]} style={styles.waShareBtn}>
                <Ionicons name="logo-whatsapp" size={20} color="#fff" />
                <Text style={styles.waShareBtnTxt}>Share on WhatsApp</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        )}

        {/* Analyse Mistakes button */}
        {!analysis && (
          <TouchableOpacity
            onPress={handleAnalyseMistakes}
            disabled={analysisLoading}
            activeOpacity={0.85}
            style={{ width: "100%", marginBottom: 4 }}
          >
            <View style={[styles.nextBtn, { backgroundColor: analysisLoading ? palette.primary300 : palette.primary600 }]}>
              {analysisLoading
                ? <ActivityIndicator color="#fff" size="small" />
                : <>
                    <Ionicons name="bulb-outline" size={18} color="#fff" />
                    <Text style={styles.nextBtnTxt}>Analyse My Mistakes</Text>
                  </>}
            </View>
          </TouchableOpacity>
        )}

        <TouchableOpacity onPress={onBack} activeOpacity={0.85} style={{ width: "100%" }}>
          <View style={[styles.nextBtn, { backgroundColor: palette.primary600 }]}>
            <Ionicons name="arrow-back" size={18} color="#fff" />
            <Text style={styles.nextBtnTxt}>Back</Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => {
            setStep("start");
            setCurrentIndex(0);
            setSelected(null);
            setAnswers({});
            setScore(0);
            setXpEarned(0);
            setAnalysis(null);
          }}
          style={styles.retryBtn}
          activeOpacity={0.7}
        >
          <Ionicons name="refresh-outline" size={16} color={palette.primary600} />
          <Text style={styles.retryBtnTxt}>Try Again</Text>
        </TouchableOpacity>

        {/* Mistake Analysis cards */}
        {analysis && analysis.length > 0 && (
          <View style={{ width: "100%", marginTop: 20, gap: 10 }}>
            <Text style={styles.analysisSectionTitle}>
              <Ionicons name="bulb" size={14} color={palette.primary700} /> Mistake Analysis
            </Text>
            {analysis.map((item, idx) => (
              <TouchableOpacity
                key={idx}
                onPress={() => setExpandedMistake(expandedMistake === idx ? null : idx)}
                activeOpacity={0.8}
                style={styles.mistakeCard}
              >
                <View style={styles.mistakeHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.mistakeQuestion} numberOfLines={expandedMistake === idx ? undefined : 2}>
                      {item.question}
                    </Text>
                    <Text style={styles.mistakeConcept}>{item.concept}</Text>
                  </View>
                  <Ionicons
                    name={expandedMistake === idx ? "chevron-up" : "chevron-down"}
                    size={16}
                    color={palette.gray400}
                  />
                </View>
                {expandedMistake === idx && (
                  <View style={styles.mistakeBody}>
                    <View style={styles.mistakeCorrectRow}>
                      <Ionicons name="checkmark-circle" size={14} color={palette.success500} />
                      <Text style={styles.mistakeCorrect}>Correct: {item.correct_answer}</Text>
                    </View>
                    <Text style={styles.mistakeExplanation}>{item.explanation}</Text>
                    <View style={styles.tipCard}>
                      <Text style={styles.tipLabel}>Study Tip</Text>
                      <Text style={styles.tipText}>{item.tip}</Text>
                    </View>
                  </View>
                )}
              </TouchableOpacity>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:                 { flex: 1, backgroundColor: palette.gray50 },
  header:               { paddingTop: spacing.lg, paddingHorizontal: spacing["2xl"], paddingBottom: spacing["2xl"], flexDirection: "row", alignItems: "center", gap: spacing.md, backgroundColor: palette.primary600 },
  backBtn:              { width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(255,255,255,0.15)", alignItems: "center", justifyContent: "center" },
  headerTitle:          { color: "#fff", ...typography.h4, flex: 1, textAlign: "center", marginRight: 36 },

  // Progress bar
  progressBarWrap:      { height: 4, backgroundColor: palette.gray200 },
  progressBarFill:      { height: 4, backgroundColor: palette.primary600, borderRadius: 2 },

  // Start screen
  startBody:            { flexGrow: 1, padding: spacing.xl, justifyContent: "center" },
  startCard:            { backgroundColor: "#fff", borderRadius: radius.xl, padding: spacing["3xl"], alignItems: "center", borderWidth: 1, borderColor: palette.gray100, ...cardShadowElevated },
  startIconWrap:        { width: 88, height: 88, borderRadius: radius.xl, alignItems: "center", justifyContent: "center", marginBottom: spacing.xl, backgroundColor: palette.primary600 },
  startTitle:           { ...typography.h2, color: palette.gray900, marginBottom: spacing.sm, textAlign: "center" },
  startSub:             { ...typography.bodyLg, color: palette.gray500, marginBottom: spacing["2xl"], textAlign: "center" },
  loadErrorTxt:         { ...typography.body, color: semantic.danger.text, textAlign: "center", marginBottom: spacing.md, paddingHorizontal: spacing.md },
  loadErrorRetryBtn:    { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderRadius: radius.md, borderWidth: 1.5, borderColor: palette.primary600, marginBottom: spacing.lg },
  loadErrorRetryBtnTxt: { ...typography.bodySm, color: palette.primary600, fontWeight: "700" },
  infoRow:              { flexDirection: "row", gap: spacing.sm, marginBottom: spacing["3xl"], flexWrap: "wrap", justifyContent: "center" },
  infoChip:             { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: palette.gray100, borderRadius: radius.sm, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
  infoChipTxt:          { ...typography.bodySm, fontWeight: "600", color: palette.gray700 },
  startBtn:             { borderRadius: radius.md, paddingVertical: spacing.lg, alignItems: "center", flexDirection: "row", justifyContent: "center", gap: spacing.sm, width: "100%" },
  startBtnTxt:          { color: "#fff", ...typography.h4 },
  cancelBtn:            { marginTop: spacing.md, paddingVertical: spacing.sm, minHeight: 44, alignItems: "center", justifyContent: "center" },
  cancelBtnTxt:         { fontSize: 13, color: palette.gray400, fontWeight: "600" },

  // Resume card
  resumeCard:           { flexDirection: "row", gap: spacing.md, backgroundColor: semantic.warning.bg, borderRadius: radius.lg, borderWidth: 1.5, borderColor: semantic.warning.border, padding: spacing.lg, marginBottom: spacing.lg, width: "100%" },
  resumeIconWrap:       { width: 40, height: 40, borderRadius: radius.md, backgroundColor: "#fff", alignItems: "center", justifyContent: "center" },
  resumeTitle:          { fontSize: 14, fontWeight: "700", color: semantic.warning.text },
  resumeSub:            { fontSize: 12, color: semantic.warning.text, marginTop: 2, lineHeight: 17 },
  resumeBtn:            { backgroundColor: palette.primary600, borderRadius: radius.sm, paddingVertical: spacing.sm, paddingHorizontal: spacing.lg, minHeight: 36, alignItems: "center", justifyContent: "center" },
  resumeBtnTxt:         { color: "#fff", fontSize: 13, fontWeight: "700" },
  resumeDiscardBtn:     { paddingVertical: spacing.sm, paddingHorizontal: spacing.md, minHeight: 36, alignItems: "center", justifyContent: "center" },
  resumeDiscardBtnTxt:  { color: semantic.warning.text, fontSize: 13, fontWeight: "600" },

  // Question screen
  qBody:                { padding: spacing.lg, paddingBottom: spacing["3xl"] },
  qCard:                { backgroundColor: "#fff", borderRadius: radius.xl, padding: spacing.xl, marginBottom: spacing.xl, borderWidth: 1, borderColor: palette.gray100, ...cardShadow },
  qNumBadge:            { alignSelf: "flex-start", backgroundColor: palette.primary50, borderRadius: radius.sm, paddingHorizontal: spacing.sm, paddingVertical: 4 },
  qNumTxt:              { fontSize: 12, fontWeight: "700", color: palette.primary600 },
  qText:                { fontSize: 17, fontWeight: "700", color: palette.gray900, lineHeight: 26 },
  optionsLabel:         { ...typography.caption, color: palette.gray400, marginBottom: spacing.sm },
  freeTextInput:        { backgroundColor: "#fff", borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.sm, borderWidth: 2, borderColor: palette.gray200, minHeight: 100, fontSize: 15, color: palette.gray900, textAlignVertical: "top", ...cardShadow },
  optionCard:           { flexDirection: "row", alignItems: "center", backgroundColor: "#fff", borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.sm, borderWidth: 2, borderColor: palette.gray200, gap: spacing.md, minHeight: 44, ...cardShadow },
  optionCardSelected:   { borderColor: palette.primary600, backgroundColor: palette.primary50 },
  optionLetter:         { width: 32, height: 32, borderRadius: radius.sm, backgroundColor: palette.gray100, alignItems: "center", justifyContent: "center" },
  optionLetterTxt:      { fontSize: 13, fontWeight: "800", color: palette.gray700 },
  optionLetterTxtSelected: { fontSize: 13, fontWeight: "800", color: "#fff" },
  optionTxt:            { flex: 1, fontSize: 15, color: palette.gray700, fontWeight: "500" },
  optionTxtSelected:    { color: palette.primary950, fontWeight: "600" },
  nextBtn:              { borderRadius: radius.md, paddingVertical: spacing.lg, alignItems: "center", flexDirection: "row", justifyContent: "center", gap: spacing.sm, marginTop: spacing.sm, minHeight: 44 },
  nextBtnTxt:           { color: "#fff", ...typography.h4 },

  // Result screen
  resultBody:           { padding: spacing["2xl"], alignItems: "center" },
  scoreCircleWrap:      { width: 140, height: 140, borderRadius: 70, borderWidth: 6, backgroundColor: "#fff", alignItems: "center", justifyContent: "center", marginBottom: spacing["2xl"], ...cardShadowElevated },
  scoreCirclePct:       { fontSize: 32, fontWeight: "900" },
  scoreCircleSub:       { fontSize: 12, color: palette.gray500, marginTop: 2 },
  xpCard:               { flexDirection: "row", alignItems: "center", gap: spacing.sm, backgroundColor: semantic.warning.bg, borderRadius: radius.md, paddingHorizontal: spacing.xl, paddingVertical: spacing.md, marginBottom: spacing.xl, borderWidth: 1.5, borderColor: semantic.warning.border },
  xpTxt:                { fontSize: 15, fontWeight: "700", color: semantic.warning.solid },
  resultMsgCard:        { backgroundColor: "#fff", borderRadius: radius.xl, padding: spacing["2xl"], alignItems: "center", marginBottom: spacing["2xl"], width: "100%", borderWidth: 1, borderColor: palette.gray100, gap: spacing.sm, ...cardShadow },
  resultMsg:            { fontSize: 18, fontWeight: "800" },
  resultMsgSub:         { fontSize: 13, color: palette.gray500, textAlign: "center", lineHeight: 20 },
  retryBtn:             { flexDirection: "row", alignItems: "center", gap: 6, marginTop: spacing.md, paddingVertical: spacing.sm, paddingHorizontal: spacing.xl, borderRadius: radius.sm, backgroundColor: palette.primary50, minHeight: 44 },
  retryBtnTxt:          { fontSize: 14, fontWeight: "600", color: palette.primary600 },

  // WhatsApp share card
  waShareCard:          { backgroundColor: "#fff", borderRadius: radius.xl, padding: spacing.xl, marginBottom: spacing.lg, width: "100%", borderWidth: 1, borderColor: palette.gray100, ...cardShadow },
  waShareHeader:        { flexDirection: "row", alignItems: "center", gap: spacing.md, marginBottom: spacing.lg },
  waShareIconWrap:      { width: 40, height: 40, borderRadius: radius.md, alignItems: "center", justifyContent: "center" },
  waShareTitle:         { fontSize: 15, fontWeight: "700", color: palette.gray900 },
  waShareSub:           { fontSize: 12, color: palette.gray500, marginTop: 2 },
  waShareBtn:           { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm, borderRadius: radius.md, paddingVertical: 13, minHeight: 44 },
  waShareBtnTxt:        { color: "#fff", fontSize: 15, fontWeight: "700" },

  // Mistake Analysis
  analysisSectionTitle: { fontSize: 14, fontWeight: "700", color: palette.gray800, marginBottom: spacing.xs },
  mistakeCard:          { backgroundColor: "#fff", borderRadius: radius.lg, padding: spacing.md, borderWidth: 1.5, borderColor: palette.danger100, ...cardShadow },
  mistakeHeader:        { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm },
  mistakeQuestion:      { fontSize: 13, fontWeight: "600", color: palette.gray900, lineHeight: 18, flex: 1 },
  mistakeConcept:       { fontSize: 11, color: palette.primary600, fontWeight: "600", marginTop: 3 },
  mistakeBody:          { marginTop: spacing.sm, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: palette.gray100, gap: spacing.sm },
  mistakeCorrectRow:    { flexDirection: "row", alignItems: "center", gap: 6 },
  mistakeCorrect:       { fontSize: 12, fontWeight: "600", color: semantic.success.text },
  mistakeExplanation:   { fontSize: 12, color: palette.gray600, lineHeight: 18 },
  tipCard:              { backgroundColor: semantic.warning.bg, borderRadius: radius.sm, padding: spacing.sm, borderWidth: 1, borderColor: semantic.warning.border },
  tipLabel:             { ...typography.caption, color: semantic.warning.text, marginBottom: 2 },
  tipText:              { fontSize: 12, color: semantic.warning.solid, lineHeight: 17 },
});
