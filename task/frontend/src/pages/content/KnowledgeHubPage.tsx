import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAppSelector } from "@/store";
import { useLanguage } from "@/contexts/LanguageContext";
import { contentApi } from "@/lib/api";
import ArticleCard, { type KnowledgeArticle } from "@/components/content/ArticleCard";
import {
  ChevronRight, Rocket, Sparkles, TrendingUp,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────────
interface KnowledgeCategory {
  id: string;
  name: string;
  icon?: string;
  color?: string;
  description?: string;
  sequence?: number;
}

// ── Mascot illustration (friendly AI robot, matches the hero's brand color) ───
function LearningMascot() {
  return (
    <svg viewBox="0 0 140 130" className="w-32 h-28 sm:w-40 sm:h-36" aria-hidden="true">
      <ellipse cx="70" cy="118" rx="46" ry="7" fill="#000" opacity="0.08" />
      {/* antenna */}
      <line x1="70" y1="16" x2="70" y2="2" stroke="#FDE68A" strokeWidth="3" strokeLinecap="round" />
      <circle cx="70" cy="2" r="5" fill="#FDE68A" />
      {/* head */}
      <rect x="30" y="16" width="80" height="58" rx="22" fill="white" fillOpacity="0.95" />
      <rect x="30" y="16" width="80" height="58" rx="22" fill="none" stroke="white" strokeOpacity="0.4" strokeWidth="1.5" />
      {/* eyes */}
      <circle cx="55" cy="45" r="7" fill="#4F46E5" />
      <circle cx="85" cy="45" r="7" fill="#4F46E5" />
      <circle cx="57.5" cy="42.5" r="2" fill="white" />
      <circle cx="87.5" cy="42.5" r="2" fill="white" />
      {/* smile */}
      <path d="M52 58 Q70 68 88 58" stroke="#4F46E5" strokeWidth="3" strokeLinecap="round" fill="none" />
      {/* body */}
      <rect x="40" y="78" width="60" height="42" rx="16" fill="white" fillOpacity="0.85" />
      <rect x="58" y="90" width="24" height="18" rx="6" fill="#FDE68A" fillOpacity="0.9" />
      {/* arms */}
      <rect x="22" y="84" width="14" height="10" rx="5" fill="white" fillOpacity="0.85" />
      <rect x="104" y="84" width="14" height="10" rx="5" fill="white" fillOpacity="0.85" />
    </svg>
  );
}

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good Morning";
  if (h < 17) return "Good Afternoon";
  return "Good Evening";
}

// ── Skeleton Card ──────────────────────────────────────────────────────────────
function SkeletonCard() {
  return (
    <div className="card animate-pulse border-2 border-transparent">
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="h-5 w-16 bg-gray-200 dark:bg-gray-700 rounded-full" />
      </div>
      <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded mb-2 w-3/4" />
      <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded mb-1 w-full" />
      <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded mb-3 w-2/3" />
      <div className="flex items-center justify-between">
        <div className="flex gap-3">
          <div className="h-3 w-12 bg-gray-200 dark:bg-gray-700 rounded" />
          <div className="h-3 w-10 bg-gray-200 dark:bg-gray-700 rounded" />
        </div>
        <div className="h-7 w-16 bg-gray-200 dark:bg-gray-700 rounded-xl" />
      </div>
    </div>
  );
}

export default function KnowledgeHubPage() {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const user = useAppSelector(s => s.auth.user);
  const [selectedCatId, setSelectedCatId] = useState<string | null>(null);
  const [bookmarked, setBookmarked] = useState<Set<string>>(new Set());

  const firstName = user?.full_name?.trim().split(" ")[0] || "Student";

  // ── API queries ──────────────────────────────────────────────────────────────
  const { data: categoriesRes, isLoading: catsLoading } = useQuery({
    queryKey: ["knowledge-categories"],
    queryFn: () => contentApi.knowledgeCategories(),
  });

  const { data: articlesRes, isLoading: articlesLoading } = useQuery({
    queryKey: ["knowledge-articles"],
    queryFn: () => contentApi.knowledgeArticles({ limit: 100 }),
  });

  const categories: KnowledgeCategory[] = categoriesRes?.data ?? [];
  const allArticles: KnowledgeArticle[] = articlesRes?.data?.items ?? articlesRes?.data ?? [];

  // Pick the active category — default to first category once loaded
  const activeCatId = selectedCatId ?? (categories[0]?.id ?? null);
  const activeCat = categories.find((c) => c.id === activeCatId) ?? null;

  // Client-side filter
  const catArticles = activeCatId
    ? allArticles.filter((a) => a.category_id === activeCatId)
    : allArticles;

  // Trending = is_trending === true
  const trending = allArticles.filter((a) => a.is_trending === true).slice(0, 4);

  const isLoading = catsLoading || articlesLoading;

  // ── Helpers ──────────────────────────────────────────────────────────────────
  function toggleBookmark(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    setBookmarked((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }

  function handleRead(article: KnowledgeArticle) {
    contentApi.viewKnowledgeArticle(article.id).catch(() => {/* fire-and-forget */});
    // Knowledge Hub articles (video or plain) are a separate data model from
    // the curriculum `videos` table that /learn/video/:videoId reads from —
    // routing a video-type knowledge article there looked up a row that
    // doesn't exist there. KnowledgeArticlePage embeds a player itself when
    // content_type is "video", so every article type goes through one route.
    navigate(`/knowledge/${article.id}`);
  }

  function formatViews(n?: number): string {
    if (!n) return "0";
    if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}K`;
    return String(n);
  }

  // ── Hero article = first trending, or first article ────────────────────────
  const heroArticle = trending[0] ?? allArticles[0] ?? null;
  return (
    <div className="w-full space-y-6 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
          <Sparkles className="w-6 h-6 text-yellow-500" /> {t("knowledgeHub")}
        </h1>
        <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">
          {t("knowledgeHubSub")}
        </p>
      </div>

      {/* Hero card — greeting banner with mascot, full width */}
      <div className="rounded-2xl overflow-hidden bg-primary-50 dark:bg-gray-800 border border-primary-100 dark:border-gray-700 p-6 sm:p-8 relative">
        <div className="absolute top-0 right-0 w-64 h-64 bg-primary-100/40 dark:bg-primary-900/10 rounded-full -translate-y-20 translate-x-20" />
        <div className="relative flex items-center justify-between gap-6">
          <div className="min-w-0">
            <p className="text-sm text-gray-500 dark:text-gray-400 font-medium mb-1">{getGreeting()}, {firstName} 👋</p>
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white leading-tight">
              Learn <span className="text-primary-600 dark:text-primary-400">Smarter</span>, Grow Faster
            </h2>
            <p className="text-gray-500 dark:text-gray-400 text-sm mt-2 max-w-md">
              AI powered learning, personalized for you. Explore topics, practice with real questions, and build your future step by step.
            </p>
            <button
              onClick={() => heroArticle ? handleRead(heroArticle) : navigate("/learn")}
              className="mt-4 inline-flex items-center gap-2 bg-primary-600 hover:bg-primary-700 text-white px-5 py-2.5 rounded-xl font-semibold text-sm transition-colors"
            >
              <Rocket className="w-4 h-4" /> Start Learning
            </button>
          </div>
          <div className="hidden sm:block flex-shrink-0">
            <LearningMascot />
          </div>
        </div>
      </div>

      {/* 2-col at xl: left = categories + articles, right = trending sidebar */}
      <div className="xl:flex xl:gap-8 xl:items-start">

        {/* ── LEFT: categories + articles ── */}
        <div className="flex-1 min-w-0 space-y-6">

          {/* Trending — mobile / tablet only */}
          {trending.length > 0 && (
            <section className="xl:hidden">
              <h2 className="font-bold text-gray-900 dark:text-white flex items-center gap-2 mb-3">
                <TrendingUp className="w-5 h-5 text-orange-500" /> {t("trendingThisWeek")}
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {trending.map((tr, i) => {
                  const tCat = categories.find((c) => c.id === tr.category_id);
                  return (
                    <button
                      key={tr.id}
                      onClick={() => handleRead(tr)}
                      className="card text-left flex items-center gap-3 hover:shadow-md hover:-translate-y-0.5 transition-all group border-2 border-transparent hover:border-primary-200 dark:hover:border-primary-700"
                    >
                      <div className="w-10 h-10 rounded-xl bg-primary-100 dark:bg-primary-900/40 flex items-center justify-center text-lg font-bold text-primary-600 dark:text-primary-400 flex-shrink-0">
                        {i + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-900 dark:text-white group-hover:text-primary-700 dark:group-hover:text-primary-300 truncate">{tr.title}</p>
                        <p className="text-xs text-gray-400 mt-0.5">{tCat?.name ?? "—"} · {formatViews(tr.view_count)} views</p>
                      </div>
                      <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-primary-500 flex-shrink-0" />
                    </button>
                  );
                })}
              </div>
            </section>
          )}

          {/* Category tabs */}
          <section>
            <h2 className="font-bold text-gray-900 dark:text-white mb-3">{t("browseByCategory")}</h2>

            {/* Category pills */}
            {!catsLoading && categories.length > 0 && (
              <div className="flex gap-3 overflow-x-auto no-scrollbar pb-1 mb-5">
                {categories.map((cat) => {
                  const active = cat.id === activeCatId;
                  return (
                    <button
                      key={cat.id}
                      onClick={() => setSelectedCatId(cat.id)}
                      className={`flex-shrink-0 flex items-center gap-2 px-4 py-2 rounded-2xl text-sm font-semibold transition-all border-2 ${
                        active
                          ? "bg-primary-600 text-white border-primary-600 shadow-sm"
                          : "bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700 hover:border-primary-300 dark:hover:border-primary-600"
                      }`}
                    >
                      {cat.icon && <span>{cat.icon}</span>}
                      {cat.name}
                    </button>
                  );
                })}
              </div>
            )}

            {/* Active category header */}
            {activeCat && (
              <div
                className="rounded-2xl p-4 mb-4 text-white flex items-center gap-3"
                style={{ background: activeCat.color ?? "#4F46E5" }}
              >
                {activeCat.icon && <span className="text-3xl flex-shrink-0">{activeCat.icon}</span>}
                <div className="min-w-0">
                  <p className="font-bold text-lg truncate">{activeCat.name}</p>
                  <p className="text-white/80 text-sm">{catArticles.length} articles &amp; videos</p>
                </div>
              </div>
            )}

            {/* Articles grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
              {isLoading ? (
                // Loading skeleton
                [0, 1, 2].map((i) => <SkeletonCard key={i} />)
              ) : catArticles.length === 0 ? (
                // Empty state
                <div className="col-span-full flex flex-col items-center justify-center py-16 text-center">
                  <Sparkles className="w-10 h-10 text-gray-300 dark:text-gray-600 mb-3" />
                  <p className="text-gray-500 dark:text-gray-400 font-medium">No articles yet</p>
                  <p className="text-gray-400 dark:text-gray-500 text-sm mt-1">Check back soon for new content.</p>
                </div>
              ) : (
                catArticles.map((item) => (
                  <ArticleCard
                    key={item.id}
                    article={item}
                    bookmarked={bookmarked.has(item.id)}
                    onToggleBookmark={toggleBookmark}
                    onRead={handleRead}
                  />
                ))
              )}
            </div>
          </section>
        </div>

        {/* ── RIGHT: trending sidebar (xl+) ── */}
        <aside className="hidden xl:flex flex-col w-72 flex-shrink-0 sticky top-6 self-start space-y-4">
          {trending.length > 0 && (
            <div className="card">
              <h2 className="font-bold text-gray-900 dark:text-white flex items-center gap-2 mb-4">
                <TrendingUp className="w-5 h-5 text-orange-500" /> {t("trendingThisWeek")}
              </h2>
              <div className="space-y-3">
                {trending.map((tr, i) => {
                  const tCat = categories.find((c) => c.id === tr.category_id);
                  return (
                    <button
                      key={tr.id}
                      onClick={() => handleRead(tr)}
                      className="w-full text-left flex items-center gap-3 p-2.5 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800/50 group transition-colors"
                    >
                      <div className="w-9 h-9 rounded-xl bg-primary-100 dark:bg-primary-900/40 flex items-center justify-center text-base font-black text-primary-600 dark:text-primary-400 flex-shrink-0">
                        {i + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-900 dark:text-white group-hover:text-primary-600 line-clamp-2 leading-tight">{tr.title}</p>
                        <p className="text-[11px] text-gray-400 mt-0.5">{tCat?.name ?? "—"} · {formatViews(tr.view_count)} views</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Category quick-jump */}
          {categories.length > 0 && (
            <div className="card">
              <h3 className="font-semibold text-gray-900 dark:text-white mb-3 text-sm">Browse Topics</h3>
              <div className="space-y-1.5">
                {categories.map((cat) => (
                  <button
                    key={cat.id}
                    onClick={() => setSelectedCatId(cat.id)}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm font-medium transition-colors text-left ${
                      activeCatId === cat.id
                        ? "bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300"
                        : "text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800/50"
                    }`}
                  >
                    {cat.icon && <span>{cat.icon}</span>} {cat.name}
                  </button>
                ))}
              </div>
            </div>
          )}
        </aside>

      </div>
    </div>
  );
}
