import { PlayCircle, Clock, Flame, ChevronRight, Bookmark, Globe } from "lucide-react";

export interface KnowledgeArticle {
  id: string;
  title: string;
  description: string;
  category_id: string;
  category?: { id: string; name: string; icon?: string; color?: string };
  duration_min?: number;
  content_type?: "video" | "article";
  video_url?: string | null;
  external_url?: string | null;
  view_count?: number;
  is_trending?: boolean;
  is_published?: boolean;
  cover_image_url?: string;
  author?: string;
  content?: string;
}

function formatViews(n?: number): string {
  if (!n) return "0";
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}K`;
  return String(n);
}

function formatDuration(min?: number): string {
  if (!min) return "—";
  return `${min} min`;
}

interface Props {
  article: KnowledgeArticle;
  bookmarked: boolean;
  onToggleBookmark: (id: string, e: React.MouseEvent) => void;
  onRead: (article: KnowledgeArticle) => void;
}

export default function ArticleCard({ article, bookmarked, onToggleBookmark, onRead }: Props) {
  const isVideo = article.content_type === "video";

  return (
    <div
      onClick={() => onRead(article)}
      className="card p-0 overflow-hidden cursor-pointer hover:shadow-md hover:-translate-y-0.5 transition-all group border-2 border-transparent hover:border-primary-200 dark:hover:border-primary-700"
    >
      {/* Thumbnail */}
      <div className="relative aspect-video bg-primary-100 dark:bg-primary-900/30 overflow-hidden">
        {article.cover_image_url ? (
          <img
            src={article.cover_image_url}
            alt=""
            loading="lazy"
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            {isVideo
              ? <PlayCircle className="w-9 h-9 text-primary-300 dark:text-primary-700" />
              : <Globe className="w-9 h-9 text-primary-300 dark:text-primary-700" />}
          </div>
        )}

        <div className="absolute top-2.5 left-2.5 flex items-center gap-1.5">
          <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full backdrop-blur-sm ${
            isVideo
              ? "bg-blue-600/90 text-white"
              : "bg-green-600/90 text-white"
          }`}>
            {isVideo ? "▶ Video" : "📄 Article"}
          </span>
          {article.is_trending && (
            <span className="flex items-center gap-0.5 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-orange-500/90 text-white backdrop-blur-sm">
              <Flame className="w-2.5 h-2.5" /> Hot
            </span>
          )}
        </div>

        <button
          onClick={(e) => onToggleBookmark(article.id, e)}
          className={`absolute top-2.5 right-2.5 p-1.5 rounded-full backdrop-blur-sm transition-colors ${
            bookmarked
              ? "bg-white text-primary-600"
              : "bg-black/30 text-white hover:bg-black/50"
          }`}
        >
          <Bookmark className={`w-3.5 h-3.5 ${bookmarked ? "fill-current" : ""}`} />
        </button>
      </div>

      {/* Body */}
      <div className="p-4">
        <h3 className="font-bold text-gray-900 dark:text-white group-hover:text-primary-700 dark:group-hover:text-primary-300 text-sm leading-snug mb-1 line-clamp-2">
          {article.title}
        </h3>
        <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2 mb-3">{article.description}</p>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-3 text-xs text-gray-400">
            {article.duration_min != null && (
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3" />{formatDuration(article.duration_min)}
              </span>
            )}
            {article.view_count != null && (
              <span className="flex items-center gap-1">
                <Globe className="w-3 h-3" />{formatViews(article.view_count)} reads
              </span>
            )}
          </div>
          <button
            onClick={(e) => { e.stopPropagation(); onRead(article); }}
            className="flex items-center gap-1.5 bg-primary-600 text-white text-xs font-semibold px-3 py-1.5 rounded-xl hover:bg-primary-700 transition-colors shrink-0"
          >
            {isVideo
              ? <><PlayCircle className="w-3.5 h-3.5" /> Watch</>
              : <><ChevronRight className="w-3.5 h-3.5" /> Read</>}
          </button>
        </div>
      </div>
    </div>
  );
}
