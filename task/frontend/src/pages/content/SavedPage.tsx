import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { contentApi } from "@/lib/api";
import { useAppSelector } from "@/store";
import BookmarkButton from "@/components/content/BookmarkButton";
import EmptyState from "@/components/ui/EmptyState";
import Card from "@/components/ui/Card";
import { SkeletonList } from "@/components/ui/Skeleton";
import { Bookmark, Download, FileText, Play, PlayCircle } from "lucide-react";

const SUBJECT_GRADIENT: Record<string, string> = {
  Physics: "from-blue-400 to-indigo-500", Mathematics: "from-purple-400 to-pink-500",
  Math: "from-purple-400 to-pink-500",
  Chemistry: "from-green-400 to-teal-500", Biology: "from-emerald-400 to-green-600",
  Science: "from-cyan-400 to-blue-500", "Social Science": "from-amber-400 to-orange-500",
};

function fmtDur(s: number) {
  const m = Math.floor(s / 60), sec = s % 60;
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}:${String(sec).padStart(2, "0")}`;
}

interface BookmarkedVideo {
  bookmark_id: string;
  video_id: string;
  title: string;
  youtube_id: string;
  duration_seconds: number;
  thumbnail_url: string | null;
  chapter_name: string | null;
  subject_name: string | null;
  board_name: string | null;
  class_number: number | null;
}

interface BookmarkedNote {
  bookmark_id: string;
  note_id: string;
  title: string;
  note_type: string;
  is_premium: boolean;
  chapter_name: string | null;
  subject_name: string | null;
}

function VideoCard({ video, onToggled }: { video: BookmarkedVideo; onToggled: () => void }) {
  const navigate = useNavigate();
  const grad = SUBJECT_GRADIENT[video.subject_name ?? ""] ?? "from-gray-400 to-gray-600";
  const img = video.thumbnail_url || (video.youtube_id ? `https://img.youtube.com/vi/${video.youtube_id}/mqdefault.jpg` : "");

  return (
    <div className="group text-left">
      <button onClick={() => navigate(`/learn/video/${video.video_id}`)} className="block w-full text-left">
        <div className="relative aspect-video rounded-xl overflow-hidden bg-gray-100 dark:bg-gray-800 shadow-sm group-hover:shadow-xl transition-all group-hover:-translate-y-1 ring-1 ring-black/5 dark:ring-white/5">
          {img ? (
            <img src={img} alt={video.title} loading="lazy" className="w-full h-full object-cover" />
          ) : (
            <div className={`w-full h-full bg-gradient-to-br ${grad} flex items-center justify-center`}>
              <PlayCircle className="w-8 h-8 text-white/80" />
            </div>
          )}
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
            <div className="w-10 h-10 rounded-full bg-white/90 flex items-center justify-center opacity-0 group-hover:opacity-100 scale-90 group-hover:scale-100 transition-all">
              <Play className="w-4 h-4 text-gray-900 ml-0.5" fill="currentColor" />
            </div>
          </div>
          {video.duration_seconds > 0 && (
            <span className="absolute bottom-2 right-2 text-[10px] font-semibold bg-black/75 text-white px-1.5 py-0.5 rounded flex items-center gap-1">
              {fmtDur(video.duration_seconds)}
            </span>
          )}
        </div>
      </button>
      <div className="mt-2 px-0.5 flex items-start justify-between gap-1.5">
        <div className="min-w-0">
          <button onClick={() => navigate(`/learn/video/${video.video_id}`)} className="text-left">
            <p className="text-sm font-semibold text-gray-900 dark:text-white line-clamp-2 leading-tight group-hover:text-primary-600 dark:group-hover:text-primary-400">
              {video.title}
            </p>
          </button>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5 truncate">
            {[video.subject_name, video.chapter_name].filter(Boolean).join(" · ")}
          </p>
        </div>
        <BookmarkButton
          entityType="video"
          entityId={video.video_id}
          initialBookmarked={true}
          size="sm"
          className="flex-shrink-0 mt-0.5"
          onToggled={onToggled}
        />
      </div>
    </div>
  );
}

function NoteCard({ note, onToggled }: { note: BookmarkedNote; onToggled: () => void }) {
  return (
    <Card className="flex items-start gap-3">
      <div className="w-10 h-10 rounded-xl bg-primary-50 dark:bg-primary-900/30 flex items-center justify-center flex-shrink-0">
        <FileText className="w-5 h-5 text-primary-600 dark:text-primary-400" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-gray-900 dark:text-white line-clamp-2">{note.title}</p>
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5 truncate">
          {[note.subject_name, note.chapter_name].filter(Boolean).join(" · ")}
        </p>
      </div>
      <BookmarkButton entityType="note" entityId={note.note_id} initialBookmarked={true} size="sm" className="flex-shrink-0" onToggled={onToggled} />
    </Card>
  );
}

export default function SavedPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const user = useAppSelector((s) => s.auth.user);
  const [tab, setTab] = useState<"videos" | "notes">("videos");

  const { data, isLoading } = useQuery({
    queryKey: ["myBookmarks", user?.id],
    queryFn: () => contentApi.myBookmarks(user!.id).then((r) => r.data),
    enabled: !!user?.id,
  });

  const videos: BookmarkedVideo[] = data?.videos ?? [];
  const notes: BookmarkedNote[] = data?.notes ?? [];

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["myBookmarks", user?.id] });

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-5">
      <div>
        <h1 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
          <Bookmark className="w-5 h-5 text-amber-500 fill-current" /> Saved for Later
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
          Videos and notes you've bookmarked to come back to.
        </p>
      </div>

      <div className="flex flex-wrap rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden w-fit max-w-full">
        {([
          { value: "videos", label: "Videos", count: videos.length, icon: PlayCircle },
          { value: "notes", label: "Notes", count: notes.length, icon: Download },
        ] as const).map(({ value, label, count, icon: Icon }) => (
          <button
            key={value}
            onClick={() => setTab(value)}
            className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 text-sm font-semibold transition-colors ${
              tab === value
                ? "bg-primary-600 text-white"
                : "bg-white dark:bg-gray-900 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800"
            }`}
          >
            <Icon className="w-4 h-4" /> {label} <span className="opacity-70">({count})</span>
          </button>
        ))}
      </div>

      {isLoading ? (
        <SkeletonList rows={4} />
      ) : tab === "videos" ? (
        videos.length === 0 ? (
          <EmptyState
            icon={PlayCircle}
            title="No saved videos yet"
            description="Tap the bookmark icon on any video to save it here for later."
            action={{ label: "Browse Videos", onClick: () => navigate("/learn") }}
          />
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {videos.map((v) => (
              <VideoCard key={v.bookmark_id} video={v} onToggled={invalidate} />
            ))}
          </div>
        )
      ) : notes.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No saved notes yet"
          description="Tap the bookmark icon on any chapter note to save it here for later."
          action={{ label: "Browse Chapters", onClick: () => navigate("/learn") }}
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {notes.map((n) => (
            <NoteCard key={n.bookmark_id} note={n} onToggled={invalidate} />
          ))}
        </div>
      )}
    </div>
  );
}
