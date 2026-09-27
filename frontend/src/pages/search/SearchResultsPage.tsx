import { useState, useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { searchApi } from "@/lib/api";
import { useLanguage } from "@/contexts/LanguageContext";
import { Card, Button, Badge, EmptyState } from "@/components/ui";
import {
  Search, PlayCircle, FileText, Trophy, BookOpen, HelpCircle,
  Clock, X, ChevronRight, Loader2, AlertCircle, Filter,
} from "lucide-react";

interface SearchVideo   { id: string; title: string; subject?: string; board?: string; chapter?: string; duration?: string; timestamp?: string | null; }
interface SearchNote    { id: string; title: string; subject?: string; board?: string; chapter?: string; }
interface SearchQuestion { id: string; title?: string; subject?: string; chapter?: string; difficulty?: string; questionNo?: number; videoId?: string; timestamp?: string; }
interface SearchPyq     { id: string; title: string; year?: string; board?: string; subject?: string; chapter?: string; }
interface SearchChapter { id: string; title: string; subject?: string; board?: string; videos?: number; notes?: number; }
interface SearchResults { videos: SearchVideo[]; notes: SearchNote[]; questions: SearchQuestion[]; pyqs: SearchPyq[]; chapters: SearchChapter[]; }

const EMPTY_RESULTS: SearchResults = { videos: [], notes: [], questions: [], pyqs: [], chapters: [] };

const FILTER_TABS = ["All", "Videos", "Notes", "Questions", "PYQs", "Chapters"] as const;
type FilterTab = typeof FILTER_TABS[number];

function getRecentSearches(): string[] {
  try { return JSON.parse(localStorage.getItem("recent_searches") ?? "[]").slice(0, 6); } catch { return []; }
}
function saveRecentSearch(q: string) {
  try {
    const prev = getRecentSearches().filter(s => s !== q);
    localStorage.setItem("recent_searches", JSON.stringify([q, ...prev].slice(0, 10)));
  } catch {}
}

function HighlightText({ text, query }: { text: string; query: string }) {
  if (!query) return <>{text}</>;
  const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi");
  const parts = text.split(regex);
  return (
    <>
      {parts.map((p, i) =>
        regex.test(p) ? (
          <mark key={i} className="bg-yellow-200 dark:bg-yellow-800/60 text-yellow-900 dark:text-yellow-200 rounded px-0.5">{p}</mark>
        ) : p
      )}
    </>
  );
}

export default function SearchResultsPage() {
  const { t } = useLanguage();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const q = searchParams.get("q") ?? "";

  const [query, setQuery] = useState(q);
  const [activeFilter, setActiveFilter] = useState<FilterTab>("All");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [results, setResults] = useState<typeof EMPTY_RESULTS | null>(null);

  useEffect(() => {
    if (!q) return;
    setLoading(true);
    setError(false);
    saveRecentSearch(q);
    searchApi.global(q)
      .then((r) => setResults(r.data))
      .catch(() => { setError(true); setResults(null); })
      .finally(() => setLoading(false));
  }, [q]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) setSearchParams({ q: query.trim() });
  };

  const displayResults = results;

  const totalCount = displayResults
    ? Object.values(displayResults).flat().length
    : 0;

  return (
    <div className="w-full space-y-6 animate-fade-in">
      {/* Search bar */}
      <form onSubmit={handleSearch} className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("search")}
          className="w-full pl-12 pr-12 py-3.5 text-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500 dark:text-gray-100 placeholder-gray-400 text-base"
          autoFocus
        />
        {query && (
          <button type="button" onClick={() => setQuery("")} className="absolute right-4 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600">
            <X className="w-4 h-4" />
          </button>
        )}
      </form>

      {/* No query — show recent searches from localStorage */}
      {!q && (
        <Card className="space-y-3">
          <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 flex items-center gap-2">
            <Clock className="w-4 h-4" /> {t("recentSearches")}
          </h3>
          <div className="flex flex-wrap gap-2">
            {getRecentSearches().length === 0 && (
              <p className="text-sm text-gray-400">Your recent searches will appear here.</p>
            )}
            {getRecentSearches().map((s) => (
              <button
                key={s}
                onClick={() => { setQuery(s); setSearchParams({ q: s }); }}
                className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-gray-100 dark:bg-gray-700 text-sm text-gray-700 dark:text-gray-300 hover:bg-primary-50 dark:hover:bg-primary-900/20 hover:text-primary-700 dark:hover:text-primary-300 transition-colors"
              >
                <Clock className="w-3 h-3 text-gray-400" /> {s}
              </button>
            ))}
          </div>
          <div className="pt-2 border-t border-gray-100 dark:border-gray-700">
            <p className="text-xs text-gray-400 dark:text-gray-500">
              Try searching for: <span className="text-primary-600 dark:text-primary-400">"Chapter 2 Question 5"</span>, <span className="text-primary-600 dark:text-primary-400">"Newton Law"</span>, or <span className="text-primary-600 dark:text-primary-400">"CBSE 2025"</span>
            </p>
          </div>
        </Card>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-8 h-8 text-primary-500 animate-spin" />
        </div>
      )}

      {/* Error state */}
      {!loading && error && q && (
        <Card className="py-12 text-center">
          <AlertCircle className="w-10 h-10 text-danger-500/40 dark:text-danger-500/40 mx-auto mb-3" />
          <p className="text-gray-600 dark:text-gray-400 font-medium">Search failed</p>
          <p className="text-sm text-gray-400 mt-1">Unable to fetch results. Please try again.</p>
          <Button onClick={() => { setError(false); setSearchParams({ q }); }} className="mt-4">
            Retry
          </Button>
        </Card>
      )}

      {/* Results */}
      {!loading && displayResults && q && (
        <div className="space-y-5 animate-slide-up">
          {/* Result count + filters */}
          <div className="flex items-center justify-between flex-wrap gap-3">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              <span className="font-semibold text-gray-900 dark:text-white">{totalCount}</span> {t("resultsFor")} "<span className="text-primary-600 dark:text-primary-400">{q}</span>"
            </p>
            <div className="flex items-center gap-1.5 flex-wrap">
              <Filter className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
              {FILTER_TABS.map((f) => (
                <button
                  key={f}
                  onClick={() => setActiveFilter(f)}
                  className={`px-3 py-1 rounded-xl text-xs font-semibold transition-colors ${
                    activeFilter === f
                      ? "bg-primary-600 text-white"
                      : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>

          {/* Questions — show with timestamp link prominently */}
          {(activeFilter === "All" || activeFilter === "Questions") && displayResults.questions.length > 0 && (
            <section>
              <h3 className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2 flex items-center gap-2">
                <HelpCircle className="w-3.5 h-3.5" /> Questions
              </h3>
              <div className="space-y-2">
                {displayResults.questions.map((q2) => (
                  <Card key={q2.id} className="flex items-start gap-4 hover:shadow-md transition-shadow flex-wrap sm:flex-nowrap">
                    <div className="w-10 h-10 rounded-xl bg-warning-100 dark:bg-warning-900/30 flex items-center justify-center flex-shrink-0">
                      <span className="text-sm font-bold text-warning-700 dark:text-warning-400">Q{q2.questionNo}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 dark:text-white">
                        <HighlightText text={q2.title ?? ""} query={q} />
                      </p>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <span className="text-xs text-gray-400">{q2.subject} · {q2.chapter}</span>
                        <Badge variant={
                          q2.difficulty === "Easy" ? "success"
                          : q2.difficulty === "Hard" ? "danger"
                          : "warning"
                        }>{q2.difficulty}</Badge>
                      </div>
                    </div>
                    <button
                      onClick={() => navigate(`/learn/video/${q2.videoId}?t=${q2.timestamp}`)}
                      className="flex items-center gap-1.5 text-xs font-semibold text-primary-600 dark:text-primary-400 bg-primary-50 dark:bg-primary-900/20 px-3 py-1.5 rounded-xl hover:bg-primary-100 dark:hover:bg-primary-900/40 transition-colors flex-shrink-0 w-full sm:w-auto justify-center"
                    >
                      <PlayCircle className="w-3.5 h-3.5" />
                      Watch at {q2.timestamp}
                    </button>
                  </Card>
                ))}
              </div>
            </section>
          )}

          {/* Videos */}
          {(activeFilter === "All" || activeFilter === "Videos") && displayResults.videos.length > 0 && (
            <section>
              <h3 className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2 flex items-center gap-2">
                <PlayCircle className="w-3.5 h-3.5" /> Videos
              </h3>
              <div className="space-y-2">
                {displayResults.videos.map((v) => (
                  <button
                    key={v.id}
                    onClick={() => navigate(`/learn/video/${v.id}`)}
                    className="w-full text-left card p-4 flex items-center gap-4 hover:shadow-md hover:-translate-y-0.5 transition-all group border-2 border-transparent hover:border-primary-200 dark:hover:border-primary-700"
                  >
                    <div className="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center flex-shrink-0">
                      <PlayCircle className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-900 dark:text-white group-hover:text-primary-700 dark:group-hover:text-primary-300 truncate">
                        <HighlightText text={v.title} query={q} />
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5">{v.subject} · {v.board} · {v.chapter}</p>
                    </div>
                    <span className="flex items-center gap-1 text-xs text-gray-400 flex-shrink-0">
                      <Clock className="w-3 h-3" /> {v.duration}
                    </span>
                    <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-primary-500" />
                  </button>
                ))}
              </div>
            </section>
          )}

          {/* Notes */}
          {(activeFilter === "All" || activeFilter === "Notes") && displayResults.notes.length > 0 && (
            <section>
              <h3 className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2 flex items-center gap-2">
                <FileText className="w-3.5 h-3.5" /> Notes
              </h3>
              <div className="space-y-2">
                {displayResults.notes.map((n) => (
                  <div key={n.id} className="card p-4 flex items-center gap-4 flex-wrap sm:flex-nowrap hover:shadow-md transition-shadow">
                    <div className="w-10 h-10 rounded-xl bg-green-100 dark:bg-green-900/30 flex items-center justify-center flex-shrink-0">
                      <FileText className="w-5 h-5 text-green-600 dark:text-green-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                        <HighlightText text={n.title} query={q} />
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5">{n.subject} · {n.board} · {n.chapter}</p>
                    </div>
                    <button className="flex items-center gap-1.5 text-xs font-semibold text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-900/20 px-3 py-1.5 rounded-xl hover:bg-green-100 transition-colors flex-shrink-0 w-full sm:w-auto justify-center">
                      <FileText className="w-3.5 h-3.5" /> Read
                    </button>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* PYQs */}
          {(activeFilter === "All" || activeFilter === "PYQs") && displayResults.pyqs.length > 0 && (
            <section>
              <h3 className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2 flex items-center gap-2">
                <Trophy className="w-3.5 h-3.5" /> Previous Year Questions
              </h3>
              <div className="space-y-2">
                {displayResults.pyqs.map((p) => (
                  <div key={p.id} className="card p-4 flex items-center gap-4 flex-wrap sm:flex-nowrap hover:shadow-md transition-shadow">
                    <div className="w-10 h-10 rounded-xl bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center flex-shrink-0">
                      <Trophy className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                        <HighlightText text={p.title} query={q} />
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5">{p.board} {p.year} · {p.subject} · {p.chapter}</p>
                    </div>
                    <button
                      onClick={() => navigate("/pyps")}
                      className="flex items-center gap-1.5 text-xs font-semibold text-purple-700 dark:text-purple-400 bg-purple-50 dark:bg-purple-900/20 px-3 py-1.5 rounded-xl hover:bg-purple-100 transition-colors flex-shrink-0 w-full sm:w-auto justify-center"
                    >
                      View <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Chapters */}
          {(activeFilter === "All" || activeFilter === "Chapters") && displayResults.chapters.length > 0 && (
            <section>
              <h3 className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2 flex items-center gap-2">
                <BookOpen className="w-3.5 h-3.5" /> Chapters
              </h3>
              <div className="space-y-2">
                {displayResults.chapters.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => navigate("/learn")}
                    className="w-full text-left card p-4 flex items-center gap-4 hover:shadow-md hover:-translate-y-0.5 transition-all group border-2 border-transparent hover:border-primary-200 dark:hover:border-primary-700"
                  >
                    <div className="w-10 h-10 rounded-xl bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center flex-shrink-0">
                      <BookOpen className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-900 dark:text-white group-hover:text-primary-700 dark:group-hover:text-primary-300 truncate">
                        <HighlightText text={c.title} query={q} />
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5">{c.subject} · {c.board} · {c.videos} videos · {c.notes} notes</p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-primary-500" />
                  </button>
                ))}
              </div>
            </section>
          )}

          {/* Empty state */}
          {totalCount === 0 && (
            <Card>
              <EmptyState
                icon={AlertCircle}
                title={`${t("noResultsFor")} "${q}"`}
                description={t("tryDifferentKeywords")}
              />
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
