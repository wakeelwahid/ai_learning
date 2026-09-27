import { useState, useRef, useEffect } from "react";
import { aiApi } from "@/lib/api";
import {
  Brain, Send, BookOpen, Sparkles, ChevronDown,
  RotateCcw, Copy, CheckCheck, Loader2, GraduationCap,
} from "lucide-react";
import toast from "react-hot-toast";
import { useLanguage } from "@/contexts/LanguageContext";
import { useSubscription } from "@/contexts/SubscriptionContext";
import StudyLimitBanner from "@/components/StudyLimitBanner";
import UpgradePrompt from "@/components/ui/UpgradePrompt";
import { useStudyHeartbeat } from "@/hooks/useStudyHeartbeat";

interface Message {
  role: "user" | "assistant";
  content: string;
  llm?: string;
}

const SUBJECTS = ["All Subjects", "Mathematics", "Physics", "Chemistry", "Biology", "English", "Social Science", "Computer Science"];
const CLASSES  = ["All Classes", "6", "7", "8", "9", "10", "11", "12"];

const SUGGESTIONS: Record<string, string[]> = {
  "All Subjects": [
    "Explain Newton's second law of motion with examples.",
    "What is photosynthesis and how does it work?",
    "Solve: Find the roots of x² - 5x + 6 = 0",
    "Describe the water cycle.",
  ],
  Physics: [
    "Explain Ohm's Law with a circuit example.",
    "What is the difference between speed and velocity?",
    "How does a transformer work?",
    "Explain the laws of reflection of light.",
  ],
  Mathematics: [
    "Prove that √2 is irrational.",
    "Explain the Pythagoras theorem with a diagram.",
    "What are trigonometric ratios? Give examples.",
    "Solve: 3x + 2y = 12 and x - y = 1",
  ],
  Chemistry: [
    "What is a chemical reaction? Give 3 examples.",
    "Explain the periodic table trends.",
    "How are acids different from bases?",
    "What is neutralisation? Give an equation.",
  ],
  Biology: [
    "Explain the process of cell division (mitosis).",
    "What is the role of the kidney in excretion?",
    "Describe the process of digestion in humans.",
    "What is the central dogma of molecular biology?",
  ],
};

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
      className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
      title="Copy"
    >
      {copied ? <CheckCheck className="w-3.5 h-3.5 text-success-500" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  );
}

export default function AIAssistantPage() {
  const { t } = useLanguage();
  useStudyHeartbeat(true);
  const { loading: subLoading } = useSubscription();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input,    setInput]    = useState("");
  const [loading,  setLoading]  = useState(false);
  const [quotaMessage, setQuotaMessage] = useState<string | null>(null);
  const [subject,  setSubject]  = useState("All Subjects");
  const [classNum, setClassNum] = useState("All Classes");
  const [chapter,  setChapter]  = useState("");
  const [filterOpen, setFilterOpen] = useState(false);
  const bottomRef  = useRef<HTMLDivElement>(null);
  const inputRef   = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const sendMessage = async (overrideInput?: string) => {
    const text = (overrideInput ?? input).trim();
    if (!text || loading) return;

    const userMsg: Message = { role: "user", content: text };
    setMessages(prev => [...prev, userMsg]);
    setInput("");
    setLoading(true);
    setQuotaMessage(null);

    try {
      const params: Record<string, string | number> = {};
      if (subject  !== "All Subjects") params.subject   = subject;
      if (classNum !== "All Classes")  params.class_num = Number(classNum);
      if (chapter.trim())              params.chapter   = chapter.trim();

      const { data } = await aiApi.study(text, params);
      const answer = data.answer ?? data.response ?? "No answer received.";
      setMessages(prev => [...prev, { role: "assistant", content: answer, llm: data.llm }]);
    } catch (err: any) {
      const detail: string | undefined = err?.response?.data?.detail;
      if (err?.response?.status === 429 && detail) {
        setQuotaMessage(detail);
      } else if (detail) {
        toast.error(detail);
      } else {
        toast.error("Failed to get response. Check your connection.");
      }
      setMessages(prev => prev.slice(0, -1));
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  const suggestions = SUGGESTIONS[subject] ?? SUGGESTIONS["All Subjects"];

  // Phase 12: skeleton while subscription status is resolving
  if (subLoading) return (
    <div className="flex flex-col h-full space-y-4 animate-pulse p-4">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-gray-200 dark:bg-gray-700" />
        <div className="h-5 bg-gray-200 dark:bg-gray-700 rounded w-40" />
      </div>
      <div className="flex-1 space-y-3">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-12 bg-gray-100 dark:bg-gray-800 rounded-xl" />
        ))}
      </div>
      <div className="h-14 bg-gray-200 dark:bg-gray-700 rounded-xl" />
    </div>
  );

  return (
    <div className="flex flex-col h-full max-h-[calc(100vh-5rem)] dark:bg-gray-950">
      <StudyLimitBanner className="flex-shrink-0 mb-2" />

      {/* ── Header ── */}
      <div className="flex-shrink-0 border-b border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 px-4 py-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-primary-600 flex items-center justify-center">
              <Brain className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="font-bold text-gray-900 dark:text-white text-sm leading-none">{t("aiStudyTutor")}</h1>
              <p className="text-xs text-gray-400 mt-0.5">{t("syllabusOnly")}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Filter toggle */}
            <button
              onClick={() => setFilterOpen(v => !v)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium border transition-all ${
                filterOpen ? "border-primary-400 bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300" : "border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-600"
              }`}
            >
              <GraduationCap className="w-3.5 h-3.5" />
              {t("filter")}
              <ChevronDown className={`w-3 h-3 transition-transform ${filterOpen ? "rotate-180" : ""}`} />
            </button>
            {messages.length > 0 && (
              <button
                onClick={() => setMessages([])}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium border border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:border-danger-300 dark:hover:border-danger-800 hover:text-danger-500 dark:hover:text-danger-400 transition-all"
              >
                <RotateCcw className="w-3.5 h-3.5" /> {t("clear")}
              </button>
            )}
          </div>
        </div>

        {/* Filter bar */}
        {filterOpen && (
          <div className="mt-3 flex flex-wrap gap-2 pt-3 border-t border-gray-100 dark:border-gray-800 animate-fade-in">
            <div className="relative">
              <select value={subject} onChange={e => setSubject(e.target.value)}
                className="text-xs border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 pr-7 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-primary-500 appearance-none">
                {SUBJECTS.map(s => <option key={s}>{s}</option>)}
              </select>
              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400 pointer-events-none" />
            </div>
            <div className="relative">
              <select value={classNum} onChange={e => setClassNum(e.target.value)}
                className="text-xs border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 pr-7 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-primary-500 appearance-none">
                {CLASSES.map(c => <option key={c}>{c}</option>)}
              </select>
              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400 pointer-events-none" />
            </div>
            <input
              value={chapter}
              onChange={e => setChapter(e.target.value)}
              placeholder="Chapter (optional)"
              className="text-xs border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-primary-500 w-44"
            />
          </div>
        )}
      </div>

      {/* ── Messages ── */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 bg-gray-50 dark:bg-gray-950">

        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center min-h-[60%] gap-8 text-center">
            {/* Welcome */}
            <div className="space-y-2">
              <div className="w-16 h-16 mx-auto rounded-2xl bg-primary-600 flex items-center justify-center">
                <Brain className="w-8 h-8 text-white" />
              </div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{t("howCanIHelp")}</h2>
              <p className="text-sm text-gray-400 max-w-xs mx-auto">{t("aiDisclaimer")}</p>
            </div>

            {/* Suggestions */}
            <div className="w-full max-w-xl">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-1.5 justify-center">
                <Sparkles className="w-3.5 h-3.5" /> {t("suggestedQuestions")}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {suggestions.map((s) => (
                  <button
                    key={s}
                    onClick={() => sendMessage(s)}
                    className="text-left text-xs text-gray-600 dark:text-gray-400 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 hover:border-primary-400 hover:text-primary-700 dark:hover:text-primary-300 hover:shadow-sm transition-all leading-relaxed"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i} className={`flex gap-3 ${m.role === "user" ? "flex-row-reverse" : ""}`}>
            {/* Avatar */}
            <div className={`w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center text-white text-xs font-bold mt-0.5 ${
              m.role === "user" ? "bg-primary-500" : "bg-primary-600"
            }`}>
              {m.role === "user" ? "U" : <Brain className="w-3.5 h-3.5" />}
            </div>

            {/* Bubble */}
            <div className={`relative group max-w-[78%] ${m.role === "user" ? "items-end" : "items-start"} flex flex-col`}>
              <div className={`px-4 py-3 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap break-words shadow-sm ${
                m.role === "user"
                  ? "bg-primary-600 text-white rounded-tr-sm"
                  : "bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-200 border border-gray-100 dark:border-gray-700 rounded-tl-sm"
              }`}>
                {m.content}
              </div>
              {m.role === "assistant" && (
                <div className="flex items-center gap-2 mt-1 px-1">
                  {m.llm && <span className="text-[10px] text-gray-400">{m.llm}</span>}
                  <CopyButton text={m.content} />
                </div>
              )}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex gap-3">
            <div className="w-7 h-7 rounded-full bg-primary-600 flex items-center justify-center flex-shrink-0">
              <Brain className="w-3.5 h-3.5 text-white" />
            </div>
            <div className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-700 rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm">
              <div className="flex gap-1.5 items-center">
                {[0, 1, 2].map(i => (
                  <div key={i} className="w-2 h-2 bg-primary-400 rounded-full animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
                ))}
              </div>
            </div>
          </div>
        )}

        {quotaMessage && <UpgradePrompt message={quotaMessage} variant="compact" />}

        <div ref={bottomRef} />
      </div>

      {/* ── Input ── */}
      <div className="flex-shrink-0 px-4 py-3 bg-white dark:bg-gray-900 border-t border-gray-100 dark:border-gray-800">
        {/* Context chips */}
        {(subject !== "All Subjects" || classNum !== "All Classes" || chapter) && (
          <div className="flex gap-1.5 mb-2 flex-wrap">
            {subject !== "All Subjects" && (
              <span className="inline-flex items-center gap-1 text-xs bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 px-2 py-0.5 rounded-full">
                <BookOpen className="w-3 h-3" />{subject}
              </span>
            )}
            {classNum !== "All Classes" && (
              <span className="inline-flex items-center gap-1 text-xs bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 px-2 py-0.5 rounded-full">
                Class {classNum}
              </span>
            )}
            {chapter && (
              <span className="inline-flex items-center gap-1 text-xs bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 px-2 py-0.5 rounded-full">
                {chapter}
              </span>
            )}
          </div>
        )}

        <div className="flex items-end gap-3">
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t("askSyllabus")}
            rows={1}
            className="flex-1 resize-none text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-primary-500 text-gray-900 dark:text-gray-100 placeholder-gray-400 max-h-36 overflow-y-auto leading-relaxed"
            style={{ minHeight: "44px" }}
          />
          <button
            onClick={() => sendMessage()}
            disabled={!input.trim() || loading}
            className="flex-shrink-0 w-11 h-11 rounded-2xl bg-primary-600 hover:bg-primary-700 text-white flex items-center justify-center shadow-sm disabled:opacity-40 transition-colors"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </button>
        </div>
        <p className="text-[10px] text-gray-400 text-center mt-2">
          {t("aiDisclaimer")} · Shift+Enter for new line
        </p>
      </div>
    </div>
  );
}
