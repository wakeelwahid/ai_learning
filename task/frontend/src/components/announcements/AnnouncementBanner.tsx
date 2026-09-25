import { useRef, useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { announcementApi } from "@/lib/api";
import {
  Megaphone, Sparkles, RefreshCw, Wrench, BookOpen,
  ChevronRight, ChevronLeft, Pin, X, ExternalLink, Calendar,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────────
type AnnouncementType = "feature" | "update" | "maintenance" | "exam" | "general";

interface Announcement {
  id: string; title: string; body: string; type: AnnouncementType;
  link_url: string | null; image_url: string | null;
  release_date: string; expires_at: string | null;
  is_active: boolean; is_pinned: boolean;
  created_by: string | null; created_at: string;
}

// ── Config ─────────────────────────────────────────────────────────────────────
const CFG: Record<AnnouncementType, {
  label: string; icon: React.ElementType;
  dot: string; badge: string; border: string; modalGrad: string;
}> = {
  feature:     { label: "New Feature",  icon: Sparkles,  dot: "bg-purple-500",  badge: "bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300", border: "border-l-purple-500",  modalGrad: "from-purple-600 to-indigo-600" },
  update:      { label: "Update",       icon: RefreshCw, dot: "bg-blue-500",    badge: "bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300",         border: "border-l-blue-500",    modalGrad: "from-blue-600 to-cyan-600" },
  maintenance: { label: "Maintenance",  icon: Wrench,    dot: "bg-amber-500",   badge: "bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300",     border: "border-l-amber-500",   modalGrad: "from-amber-500 to-orange-500" },
  exam:        { label: "Exam Info",    icon: BookOpen,  dot: "bg-emerald-500", badge: "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300", border: "border-l-emerald-500", modalGrad: "from-emerald-600 to-teal-600" },
  general:     { label: "Info",         icon: Megaphone, dot: "bg-gray-400",    badge: "bg-gray-100 dark:bg-gray-700/60 text-gray-600 dark:text-gray-300",          border: "border-l-gray-400",    modalGrad: "from-gray-600 to-slate-600" },
};

const isNew = (d: string) => Date.now() - new Date(d).getTime() < 3 * 86400_000;

const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

// ── Modal ─────────────────────────────────────────────────────────────────────
function AnnouncementModal({ item, onClose }: { item: Announcement; onClose: () => void }) {
  const cfg = CFG[item.type] ?? CFG.general;
  const Icon = cfg.icon;

  // Close on Escape key
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />

      {/* Modal card */}
      <div
        className="relative w-full max-w-md bg-white dark:bg-gray-900 rounded-2xl shadow-2xl overflow-hidden animate-fade-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Coloured header strip */}
        <div className={`bg-gradient-to-r ${cfg.modalGrad} px-4 sm:px-5 py-4`}>
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-xl bg-white/20 flex items-center justify-center flex-shrink-0">
                <Icon className="w-4 h-4 text-white" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-white/80">
                    {cfg.label}
                  </span>
                  {isNew(item.release_date) && (
                    <span className="text-[10px] font-bold bg-white/25 text-white px-1.5 py-0.5 rounded-full">
                      NEW
                    </span>
                  )}
                  {item.is_pinned && (
                    <span className="text-[10px] font-bold bg-white/25 text-white px-1.5 py-0.5 rounded-full flex items-center gap-0.5">
                      <Pin className="w-2.5 h-2.5" /> Pinned
                    </span>
                  )}
                </div>
                <p className="text-white text-sm font-bold leading-snug mt-0.5 break-words">{item.title}</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="w-7 h-7 rounded-lg bg-white/20 hover:bg-white/30 flex items-center justify-center flex-shrink-0 transition-colors"
            >
              <X className="w-4 h-4 text-white" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="px-4 sm:px-5 py-4 space-y-4">
          <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed break-words">
            {item.body}
          </p>

          {/* Meta row */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-400 dark:text-gray-500 pt-1 border-t border-gray-100 dark:border-gray-800">
            <span className="flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5" />
              {fmtDate(item.release_date)}
            </span>
            {item.expires_at && (
              <span>Expires {fmtDate(item.expires_at)}</span>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 pt-1">
            {item.link_url && (
              <a
                href={item.link_url}
                target="_blank"
                rel="noopener noreferrer"
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-gradient-to-r ${cfg.modalGrad} text-white text-sm font-semibold hover:opacity-90 transition-opacity`}
              >
                Learn more <ExternalLink className="w-3.5 h-3.5" />
              </a>
            )}
            <button
              onClick={onClose}
              className={`${item.link_url ? "px-5" : "flex-1"} py-2.5 rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 text-sm font-semibold hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors`}
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Compact Card ──────────────────────────────────────────────────────────────
function AnnouncementCard({ item, onClick }: { item: Announcement; onClick: () => void }) {
  const cfg = CFG[item.type] ?? CFG.general;

  return (
    <button
      onClick={onClick}
      className={`relative flex-shrink-0 w-40 text-left rounded-lg border border-gray-200 dark:border-gray-700/60 bg-white dark:bg-gray-800/60 border-l-[3px] ${cfg.border} px-2.5 py-2 snap-start group hover:shadow-md hover:-translate-y-0.5 transition-all`}
    >
      {/* Pin dot */}
      {item.is_pinned && (
        <Pin className="absolute top-1.5 right-1.5 w-2.5 h-2.5 text-gray-300 dark:text-gray-600 rotate-45" />
      )}

      {/* Type row */}
      <div className="flex items-center gap-1 mb-1">
        <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${cfg.dot}`} />
        <span className={`text-[9px] font-bold uppercase tracking-wide px-1 py-0.5 rounded-full ${cfg.badge}`}>
          {cfg.label}
        </span>
        {isNew(item.release_date) && (
          <span className="text-[8px] font-extrabold uppercase bg-red-500 text-white px-1 py-0.5 rounded-full leading-none">
            NEW
          </span>
        )}
      </div>

      {/* Title */}
      <p className="text-[11px] font-bold text-gray-900 dark:text-white line-clamp-2 leading-snug mb-1">
        {item.title}
      </p>

      {/* Footer */}
      <div className="flex items-center justify-between">
        <span className="text-[9px] text-gray-400 dark:text-gray-500">
          {fmtDate(item.release_date)}
        </span>
        <ChevronRight className="w-3 h-3 text-gray-300 dark:text-gray-600 group-hover:text-gray-500 dark:group-hover:text-gray-400 transition-colors" />
      </div>
    </button>
  );
}

// ── Main Banner ───────────────────────────────────────────────────────────────
export default function AnnouncementBanner() {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState<Announcement | null>(null);

  const { data } = useQuery({
    queryKey: ["announcements"],
    queryFn: () => announcementApi.list(true).then((r) => r.data),
    staleTime: 5 * 60 * 1000,
  });

  const items: Announcement[] = data?.data ?? [];
  if (!items.length) return null;

  const scroll = (dir: 1 | -1) =>
    scrollRef.current?.scrollBy({ left: dir * 240, behavior: "smooth" });

  return (
    <>
      <section>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Megaphone className="w-3.5 h-3.5 text-primary-500" />
            <h2 className="font-bold text-gray-900 dark:text-white text-[13px]">
              Announcements
            </h2>
            <span className="text-[10px] font-bold bg-primary-100 dark:bg-primary-900/40 text-primary-600 dark:text-primary-400 px-1.5 py-0.5 rounded-full leading-none">
              {items.length}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={() => scroll(-1)} className="hidden sm:flex w-6 h-6 rounded-full bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 items-center justify-center text-gray-500">
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <button onClick={() => scroll(1)} className="hidden sm:flex w-6 h-6 rounded-full bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 items-center justify-center text-gray-500">
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        <div
          ref={scrollRef}
          className="flex gap-2.5 overflow-x-auto no-scrollbar pb-1 snap-x scroll-pl-1"
        >
          {items.map((item) => (
            <AnnouncementCard key={item.id} item={item} onClick={() => setActive(item)} />
          ))}
        </div>
      </section>

      {/* Modal */}
      {active && <AnnouncementModal item={active} onClose={() => setActive(null)} />}
    </>
  );
}
