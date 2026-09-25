import { useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import ReactPlayer from "react-player";
import { contentApi } from "@/lib/api";
import { ArrowLeft, Clock, Globe, Sparkles } from "lucide-react";
import type { KnowledgeArticle } from "@/components/content/ArticleCard";
import StudyLimitBanner from "@/components/StudyLimitBanner";
import { useStudyHeartbeat } from "@/hooks/useStudyHeartbeat";

function formatViews(n?: number): string {
  if (!n) return "0";
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}K`;
  return String(n);
}

export default function KnowledgeArticlePage() {
  const { articleId } = useParams<{ articleId: string }>();
  const navigate = useNavigate();
  useStudyHeartbeat(true);

  // Knowledge Hub fetches all articles up front (limit: 100) and this page
  // is only ever reached by navigating from there, so reuse that cached
  // list via the same query key instead of adding a second detail
  // endpoint — the list response already carries the full "content" field.
  const { data: articlesRes, isLoading } = useQuery({
    queryKey: ["knowledge-articles"],
    queryFn: () => contentApi.knowledgeArticles({ limit: 100 }),
  });

  const allArticles: KnowledgeArticle[] = articlesRes?.data?.items ?? articlesRes?.data ?? [];
  const article = allArticles.find((a) => a.id === articleId);
  const isVideo = article?.content_type === "video" && !!(article.video_url || article.external_url);

  useEffect(() => {
    if (articleId) {
      contentApi.viewKnowledgeArticle(articleId).catch(() => {/* fire-and-forget */});
    }
  }, [articleId]);

  if (isLoading) {
    return (
      <div className="w-full max-w-3xl mx-auto space-y-4 animate-pulse">
        <div className="h-6 w-24 bg-gray-200 dark:bg-gray-700 rounded" />
        <div className="h-8 w-3/4 bg-gray-200 dark:bg-gray-700 rounded" />
        <div className="h-48 w-full bg-gray-200 dark:bg-gray-700 rounded-2xl" />
        <div className="h-4 w-full bg-gray-200 dark:bg-gray-700 rounded" />
        <div className="h-4 w-5/6 bg-gray-200 dark:bg-gray-700 rounded" />
      </div>
    );
  }

  if (!article) {
    return (
      <div className="w-full max-w-3xl mx-auto text-center py-16">
        <Sparkles className="w-10 h-10 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
        <p className="text-gray-500 dark:text-gray-400 font-medium">Article not found</p>
        <button
          onClick={() => navigate("/knowledge-hub")}
          className="mt-4 inline-flex items-center gap-2 text-primary-600 dark:text-primary-400 font-semibold text-sm hover:underline"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Knowledge Hub
        </button>
      </div>
    );
  }

  return (
    <div className="w-full max-w-3xl mx-auto space-y-6 animate-fade-in">
      <StudyLimitBanner />
      <button
        onClick={() => navigate("/knowledge-hub")}
        className="inline-flex items-center gap-2 text-sm font-semibold text-gray-500 dark:text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" /> Back to Knowledge Hub
      </button>

      {isVideo ? (
        <div className="rounded-2xl overflow-hidden aspect-video bg-black">
          <ReactPlayer
            src={article.video_url || article.external_url || ""}
            width="100%"
            height="100%"
            controls
          />
        </div>
      ) : article.cover_image_url && (
        <div className="rounded-2xl overflow-hidden aspect-video bg-primary-100 dark:bg-primary-900/30">
          <img src={article.cover_image_url} alt="" className="w-full h-full object-cover" />
        </div>
      )}

      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white leading-tight">
          {article.title}
        </h1>
        <div className="flex items-center gap-3 sm:gap-4 mt-3 text-sm text-gray-400 flex-wrap">
          {article.author && <span className="truncate max-w-full">By {article.author}</span>}
          {article.duration_min != null && (
            <span className="flex items-center gap-1 flex-shrink-0"><Clock className="w-3.5 h-3.5" />{article.duration_min} min {isVideo ? "watch" : "read"}</span>
          )}
          <span className="flex items-center gap-1 flex-shrink-0"><Globe className="w-3.5 h-3.5" />{formatViews(article.view_count)} reads</span>
        </div>
      </div>

      <div className="card">
        <p className="text-gray-600 dark:text-gray-300 whitespace-pre-wrap leading-relaxed">
          {article.content || article.description}
        </p>
      </div>
    </div>
  );
}
