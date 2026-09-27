import { useEffect, useRef, useState } from "react";
import BackButton from "@/components/ui/BackButton";
import { aiApi } from "@/lib/api";
import { parseApiError } from "@/lib/errors";
import { useSelectedChild } from "@/hooks/useSelectedChild";
import { NoChildrenState, PendingBadge, PendingChildState } from "@/components/parent/ChildSelector";
import {
  ArrowUp, Bot, Brain, ChevronDown, Loader, Sparkles, User,
} from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";

interface Source {
  domain: string;
  date: string;
  text: string;
  score: number;
}

interface Message {
  role: "user" | "ai";
  content: string;
  sources?: Source[];
}


const QUICK_QUESTIONS = [
  "Which subject needs the most improvement?",
  "How is my child performing overall?",
  "Has my child been studying regularly?",
  "How is my child doing in quiz battles?",
  "What badges and XP has my child earned?",
  "How many videos and chapters has my child completed?",
  "What career is my child interested in?",
  "What should my child focus on this week?",
];

/** Quiet "show its working" disclosure — the real records the answer was grounded in. */
function SourceList({ sources }: { sources: Source[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-2 pt-2 border-t border-gray-100 dark:border-gray-700">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1 text-[11px] text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
      >
        <ChevronDown className={`w-3 h-3 transition-transform ${open ? "rotate-180" : ""}`} />
        Based on {sources.length} record{sources.length === 1 ? "" : "s"}
      </button>
      {open && (
        <ul className="mt-2 space-y-2">
          {sources.map((s, i) => (
            <li key={i} className="text-[11px] text-gray-500 dark:text-gray-400 leading-relaxed">
              <span className="inline-block px-1.5 py-0.5 mr-1.5 rounded bg-gray-100 dark:bg-gray-700 text-[10px] font-medium">
                {s.domain}
              </span>
              <span className="text-gray-400">{s.date}</span>
              <span className="block break-words">{s.text}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function ParentAIChatPage() {
  const { t } = useLanguage();

  const {
    children: students,
    selectedChild: child,
    selectedChildId,
    setSelectedChildId,
    isLoading: studentsLoading,
  } = useSelectedChild();
  const canChat = child?.is_approved === true;

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (child) {
      setMessages([{
        role: "ai",
        content: t("howCanIHelp"),
      }]);
    }
  }, [child?.student_user_id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const sendMessage = async (text: string) => {
    if (!text.trim() || loading || !canChat || !child) return;
    const userMsg: Message = { role: "user", content: text.trim() };
    setMessages(prev => [...prev, userMsg]);
    setInput("");
    setLoading(true);
    try {
      const history = messages.map(m => ({ role: m.role === "ai" ? "assistant" : "user", content: m.content }));
      const { data } = await aiApi.parentChat(text.trim(), child.student_user_id, history);
      setMessages(prev => [...prev, { role: "ai", content: data.answer, sources: data.sources ?? [] }]);
    } catch (err) {
      const fallback = `Sorry, I couldn't get an answer right now: ${parseApiError(err)} I don't want to guess at ${child?.student_name ?? "your child"}'s real performance data.`;
      setMessages(prev => [...prev, { role: "ai", content: fallback }]);
    } finally {
      setLoading(false);
    }
  };

  const renderContent = (text: string) => {
    const parts = text.split(/(\*\*[^*]+\*\*)/g);
    return parts.map((part, i) =>
      part.startsWith("**") && part.endsWith("**")
        ? <strong key={i}>{part.slice(2, -2)}</strong>
        : part.split("\n").map((line, j) => (
            <span key={`${i}-${j}`}>{line}{j < part.split("\n").length - 1 && <br />}</span>
          ))
    );
  };

  return (
    <div className="w-full flex flex-col h-[calc(100vh-120px)] animate-fade-in">
      <BackButton label="Back" />
      {/* Header */}
      <div className="flex items-center gap-3 mb-4 flex-shrink-0">
        <div className="w-10 h-10 rounded-2xl bg-primary-600 flex items-center justify-center">
          <Brain className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">{t("aiStudyTutor")}</h1>
          <p className="text-sm font-normal text-gray-500 dark:text-gray-400">Ask anything about your child's learning</p>
        </div>
      </div>

      {/* Child selector */}
      {students.length > 0 && (
        <div className="flex gap-2 mb-4 overflow-x-auto no-scrollbar flex-shrink-0">
          {students.map((s, i) => (
            <button
              key={s.id}
              onClick={() => setSelectedChildId(s.student_user_id)}
              className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium transition-all flex-shrink-0 ${
                s.student_user_id === selectedChildId
                  ? "bg-primary-600 text-white"
                  : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
              }`}
            >
              <div className="w-5 h-5 rounded-full bg-white/20 flex items-center justify-center text-xs font-bold">
                {(s.student_name ?? "S")[0]}
              </div>
              {s.student_name ?? `Child ${i+1}`}
              {!s.is_approved && <PendingBadge />}
            </button>
          ))}
        </div>
      )}

      {!studentsLoading && students.length === 0 ? (
        <NoChildrenState />
      ) : child && !child.is_approved ? (
        <PendingChildState child={child} />
      ) : (
      <>
      {/* Chat messages */}
      <div className="flex-1 overflow-y-auto space-y-4 pr-1 mb-4">
        {messages.map((msg, i) => (
          <div key={i} className={`flex gap-3 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            {msg.role === "ai" && (
              <div className="w-8 h-8 rounded-xl bg-primary-600 flex items-center justify-center flex-shrink-0 mt-0.5">
                <Bot className="w-4 h-4 text-white" />
              </div>
            )}
            <div className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
              msg.role === "user"
                ? "bg-primary-600 text-white rounded-tr-sm"
                : "bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 border border-gray-100 dark:border-gray-700 rounded-tl-sm shadow-sm"
            }`}>
              {renderContent(msg.content)}
              {msg.role === "ai" && !!msg.sources?.length && <SourceList sources={msg.sources} />}
            </div>
            {msg.role === "user" && (
              <div className="w-8 h-8 rounded-xl bg-gray-200 dark:bg-gray-700 flex items-center justify-center flex-shrink-0 mt-0.5">
                <User className="w-4 h-4 text-gray-500 dark:text-gray-400" />
              </div>
            )}
          </div>
        ))}

        {loading && (
          <div className="flex gap-3">
            <div className="w-8 h-8 rounded-xl bg-primary-600 flex items-center justify-center flex-shrink-0">
              <Bot className="w-4 h-4 text-white" />
            </div>
            <div className="bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm">
              <Loader className="w-4 h-4 animate-spin text-gray-400" />
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Quick questions */}
      {messages.length <= 1 && (
        <div className="flex flex-wrap gap-2 mb-3 flex-shrink-0">
          {QUICK_QUESTIONS.map(q => (
            <button
              key={q}
              onClick={() => sendMessage(q)}
              className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300 rounded-xl hover:bg-primary-100 dark:hover:bg-primary-900/40 transition-colors border border-primary-100 dark:border-primary-800"
            >
              <Sparkles className="w-3 h-3" /> {q}
            </button>
          ))}
        </div>
      )}

      {/* Input */}
      <div className="flex-shrink-0">
        <div className="flex items-center gap-2 bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-1.5 shadow-sm">
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(input); } }}
            placeholder={t("askSyllabus")}
            className="flex-1 bg-transparent px-3 py-2 text-sm text-gray-800 dark:text-gray-200 focus:outline-none placeholder-gray-400"
            disabled={loading || !canChat}
          />
          <button
            type="button"
            onClick={() => sendMessage(input)}
            disabled={!input.trim() || loading || !canChat}
            className="w-9 h-9 rounded-xl bg-primary-600 hover:bg-primary-700 disabled:bg-gray-200 dark:disabled:bg-gray-700 flex items-center justify-center transition-colors flex-shrink-0"
          >
            <ArrowUp className="w-4 h-4 text-white disabled:text-gray-400" />
          </button>
        </div>
        <p className="text-center text-xs text-gray-400 mt-2">
          {t("aiDisclaimer")}
        </p>
      </div>
      </>
      )}
    </div>
  );
}
