import { useState, useEffect, useRef, type SyntheticEvent } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import ReactPlayer from "react-player";
import { contentApi } from "@/lib/api";
import { useAppSelector } from "@/store";
import BookmarkButton from "@/components/content/BookmarkButton";
import StudyLimitBanner from "@/components/StudyLimitBanner";
import UpgradePrompt from "@/components/ui/UpgradePrompt";
import { useStudyHeartbeat } from "@/hooks/useStudyHeartbeat";
import { useStudyTime } from "@/hooks/useStudyTime";
import { useLanguage } from "@/contexts/LanguageContext";
import {
  ChevronLeft, PlayCircle, CheckCircle, Brain,
  ChevronRight, Award, BookOpen, Loader2, Star, Gauge, Lock,
  FileText, Download, ExternalLink,
} from "lucide-react";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DEMO_YT_ID = "d_S4LiGALwk";
const SPEEDS = [0.75, 1, 1.25, 1.5, 2];

export default function VideoPlayerPage() {
  const { videoId } = useParams<{ videoId: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const user = useAppSelector((s) => s.auth.user);

  const qid       = searchParams.get("qid");
  const chapterId = searchParams.get("chapter");
  const eid       = searchParams.get("eid");
  const isReal    = !!videoId && UUID_RE.test(videoId);

  const [speed, setSpeed]               = useState(1);
  const [medium, setMedium]             = useState<"en" | "hi">("en");
  const [videoWatched, setVideoWatched] = useState(false);
  const [navigatingToQ, setNavigatingToQ] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);
  const [ytPos, setYtPos] = useState(0);
  const [showNotes, setShowNotes] = useState(false);
  const { t } = useLanguage();
  const { limitReached } = useStudyTime();
  const playBlocked = limitReached && !hasStarted;
  useStudyHeartbeat(isPlaying);

  // Pause/resume + position tracking
  const playerRef   = useRef<any>(null);            // react-player instance (YouTube)
  const mediaRef   = useRef<HTMLVideoElement | null>(null);
  const lastSentRef = useRef(0);          // throttle position saves
  const resumedRef  = useRef(false);      // seek-to-resume only once

  // ── Persistence helpers ──────────────────────────────────────────────────────
  const LS_POS_KEY  = videoId ? `edulearn_vpos_${videoId}` : null;
  const LS_ROUTE_KEY = "edulearn_last_route";

  // Layer 1 — localStorage: read saved position immediately (before API loads)
  const localPos = LS_POS_KEY ? (() => {
    try {
      const raw = localStorage.getItem(LS_POS_KEY);
      if (!raw) return 0;
      const { pos, ts } = JSON.parse(raw) as { pos: number; ts: number };
      // Ignore stale entries older than 30 days
      return Date.now() - ts < 30 * 86400_000 ? pos : 0;
    } catch { return 0; }
  })() : 0;

  // Layer 2 — sessionStorage: mid-session position (survives soft refresh, cleared on tab close)
  const SS_POS_KEY = videoId ? `edulearn_ss_vpos_${videoId}` : null;

  const saveToStorage = (pos: number) => {
    if (!videoId || pos < 3) return;
    // localStorage (30-day persistence)
    if (LS_POS_KEY) localStorage.setItem(LS_POS_KEY, JSON.stringify({ pos, ts: Date.now() }));
    // sessionStorage (tab-lifetime)
    if (SS_POS_KEY) sessionStorage.setItem(SS_POS_KEY, String(pos));
  };

  // Persist last-visited route so browser refresh / tab-reopen navigates back here
  useEffect(() => {
    if (videoId) {
      const path = window.location.pathname + window.location.search;
      localStorage.setItem(LS_ROUTE_KEY, path);
    }
  }, [videoId]);

  // Reset the broken-player fallback when navigating to a different video
  useEffect(() => { setPlayerFailed(false); }, [videoId]);

  // Save final position before page unload (refresh / tab close)
  useEffect(() => {
    const onBeforeUnload = () => {
      const pos = playerRef.current?.getCurrentTime?.() ?? (mediaRef.current?.currentTime ?? 0);
      saveToStorage(Math.floor(pos));
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoId]);

  const { data: videoData, isLoading: vLoading, error: videoError } = useQuery({
    queryKey: ["videoById", videoId],
    queryFn: () => contentApi.getVideoById(videoId!).then((r) => r.data),
    enabled: isReal,
    retry: (failureCount, err: any) => err?.response?.status !== 402 && failureCount < 2,
  });
  // 402 = this is a premium video and the viewer has no active subscription.
  const premiumMessage = (videoError as any)?.response?.status === 402
    ? ((videoError as any)?.response?.data?.detail as string | undefined)
      ?? "This video is part of a premium plan. Subscribe to watch."
    : null;

  // Existing watch progress → resume point. Also the "video watch" quota
  // check (see content_service's get_video_progress) — a 429 here means
  // the daily new-video limit was hit, surfaced below instead of silently
  // failing the query.
  const { data: savedProgress, error: progressError } = useQuery({
    queryKey: ["videoProgress", videoId, user?.id],
    queryFn: () => contentApi.videoProgress(videoId!, user!.id).then((r) => r.data),
    enabled: isReal && !!videoId && !!user?.id,
    retry: (failureCount, err: any) => err?.response?.status !== 429 && failureCount < 2,
  });
  const videoQuotaMessage = (progressError as any)?.response?.status === 429
    ? ((progressError as any)?.response?.data?.detail as string | undefined)
    : null;

  // Bookmark state — cached per-user so navigating between videos in the same
  // session doesn't refetch; BookmarkButton owns the toggle itself, this
  // query only supplies the initial state.
  const { data: bookmarksData } = useQuery({
    queryKey: ["myBookmarks", user?.id],
    queryFn: () => contentApi.myBookmarks(user!.id).then((r) => r.data),
    enabled: !!user?.id,
    staleTime: 60_000,
  });
  const isBookmarked = !!(bookmarksData as any)?.videos?.some((b: any) => b.video_id === videoId);
  // Effective resume position: prefer API (most authoritative), fall back to localStorage
  const effectiveResumeAt = (savedProgress as any)?.last_position_seconds ?? localPos ?? 0;

  const { data: playlistRaw } = useQuery({
    queryKey: ["exerciseQuestions", eid],
    queryFn: () => contentApi.exerciseQuestions(eid!).then((r) => r.data),
    enabled: !!eid && UUID_RE.test(eid),
  });

  const { data: chExercisesRaw } = useQuery({
    queryKey: ["chapterExercises", chapterId],
    queryFn: () => contentApi.chapterExercises(chapterId!).then((r) => r.data),
    enabled: !!chapterId && UUID_RE.test(chapterId),
  });

  const { data: exProgress } = useQuery({
    queryKey: ["exProgress", eid, user?.id],
    queryFn: () => contentApi.exerciseProgress(eid!, user!.id).then((r) => r.data),
    enabled: !!eid && UUID_RE.test(eid) && !!user?.id,
  });

  const vidData    = videoData as any;
  // playerFailed covers a present-but-broken youtube_id (private/deleted/
  // region-blocked video), not just a missing one — the ?? fallback below
  // only catches null/undefined, so an invalid-but-truthy id needs the
  // player's own onError to trigger the same demo fallback.
  const [playerFailed, setPlayerFailed] = useState(false);
  const ytId       = playerFailed ? DEMO_YT_ID : (vidData?.youtube_id    ?? DEMO_YT_ID);
  const ytIdHi     = vidData?.youtube_id_hi ?? null;
  const vidTitle   = vidData?.title         ?? "Solution Video";
  const duration   = vidData?.duration_seconds ?? 0;
  const notesUrl   = vidData?.notes_url     ?? null;
  const activeYtId = medium === "hi" && ytIdHi && !playerFailed ? ytIdHi : ytId;

  // Notes unlock — from API (actual_watched_seconds skip-resistant)
  const notesUnlocked: boolean = !!(savedProgress as any)?.notes_unlocked || videoWatched;

  // Reset seek-once flag when video changes so each new video seeks to its own saved position
  useEffect(() => { resumedRef.current = false; }, [activeYtId]);

  const playlist: any[]    = Array.isArray(playlistRaw)   ? playlistRaw   : [];
  const chExercises: any[] = Array.isArray(chExercisesRaw) ? chExercisesRaw : [];
  const recommended        = chExercises.filter((e) => e.id !== eid).slice(0, 3);

  // Backend is the source of truth: use savedProgress.is_completed (this video) OR
  // exProgress.unlocked (all exercise videos done). videoWatched is a real-time
  // optimistic flag for the current session only.
  const videoComplete = videoWatched || !!(savedProgress as any)?.is_completed;
  const unlocked      = videoComplete || !!(exProgress as any)?.unlocked;

  useEffect(() => {
    if ((exProgress as any)?.unlocked || (savedProgress as any)?.is_completed) {
      setVideoWatched(true);
    }
  }, [exProgress, savedProgress]);

  // ── Auto-complete ────────────────────────────────────────────────────────────
  const markWatched = async () => {
    if (videoComplete) return;
    setVideoWatched(true);
    if (isReal && videoId && user) {
      const finalPos = mediaRef.current ? Math.floor(mediaRef.current.currentTime) : ytPos;
      if (finalPos > 0) {
        await contentApi.updateProgress(videoId, finalPos, true, user.id, { position_seconds: finalPos, status: "completed" }).catch(() => {});
      }
      await contentApi.completeVideo(videoId, user.id).catch(() => {});
      queryClient.invalidateQueries({ queryKey: ["exProgress", eid, user.id] });
      queryClient.invalidateQueries({ queryKey: ["continue-watching", user.id] });
    }
  };

  // Persist playhead + status. For HTML5 video uses the element; for YouTube uses ytPos.
  const sendProgress = (status: "playing" | "paused", el?: HTMLVideoElement | null) => {
    if (!isReal || !videoId || !user) return;
    const m = el ?? mediaRef.current;
    const pos = m?.duration ? Math.floor(m.currentTime) : ytPos;
    if (pos < 3) return;
    contentApi.updateProgress(videoId, pos, false, user.id, { position_seconds: pos, status }).catch(() => {});
  };

  // Interval-based tracking:
  //   Every 1 s  → localStorage (instant resume)
  //   Every 30 s → POST to API → Redis (primary); background worker flushes to DB every 45 s
  useEffect(() => {
    if (!isPlaying || !isReal || !videoId || !user) return;
    const iv = setInterval(() => {
      const pos = Math.floor(playerRef.current?.getCurrentTime?.() ?? 0);
      if (pos <= 0) return;
      setYtPos(pos);
      saveToStorage(pos);

      if (Math.abs(pos - lastSentRef.current) >= 30) {
        lastSentRef.current = pos;
        contentApi.updateProgress(videoId, pos, false, user.id, { position_seconds: pos, status: "playing" }).catch(() => {});
      }

      const dur = playerRef.current?.getDuration?.() ?? 0;
      if (!videoWatched && dur > 0 && pos / dur > 0.9) markWatched();
    }, 1000);
    return () => clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying, isReal, videoId, user]);

  const handleTimeUpdate = (e: SyntheticEvent<HTMLVideoElement>) => {
    if (!isReal) return;
    const el = e.currentTarget;
    mediaRef.current = el;

    // Resume to the saved position once, when playback first reports time
    if (!resumedRef.current && effectiveResumeAt > 5 && el.duration && el.currentTime < effectiveResumeAt - 2 && effectiveResumeAt < el.duration * 0.9) {
      resumedRef.current = true;
      try { el.currentTime = effectiveResumeAt; } catch { /* youtube may reject */ }
      return;
    }
    resumedRef.current = true;

    if (videoWatched) return;
    // Save position every ~5s while playing
    if (Math.abs(el.currentTime - lastSentRef.current) >= 5) {
      lastSentRef.current = el.currentTime;
      sendProgress("playing", el);
    }
    if (el.duration && el.currentTime / el.duration > 0.9) markWatched();
  };

  // Seek to saved position when YouTube player is ready (fires after iframe loads)
  const onPlayerReady = () => {
    if (!resumedRef.current && effectiveResumeAt > 5) {
      resumedRef.current = true;
      try { playerRef.current?.seekTo(effectiveResumeAt, "seconds"); } catch { /* ignore */ }
    }
  };

  // Save a final paused snapshot when leaving the page
  useEffect(() => {
    return () => { if (!videoComplete) sendProgress("paused"); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoId]);

  const goToQuestion = async (qq: any) => {
    if (qq.id === qid || navigatingToQ) return;
    setNavigatingToQ(qq.id);
    try {
      const res = await contentApi.getQuestionVideo(qq.id);
      const vid = res.data;
      if (vid?.id) navigate(`/learn/video/${vid.id}?qid=${qq.id}&chapter=${chapterId ?? ""}&eid=${eid ?? ""}`);
    } catch { /* no video */ } finally { setNavigatingToQ(null); }
  };

  const practiceTarget = eid && UUID_RE.test(eid)
    ? `/learn/practice/exercise/${eid}`
    : qid && UUID_RE.test(qid)
      ? `/learn/practice/question/${qid}`
      : null;
  const titleParam = encodeURIComponent(vidTitle);
  const goQuiz = () => practiceTarget && navigate(`${practiceTarget}?mode=quiz&title=${titleParam}&chapter=${chapterId ?? ""}`);

  if (isReal && vLoading) {
    return (
      <div className="w-full space-y-3 animate-pulse">
        <div className="skeleton h-7 w-24" />
        <div className="skeleton aspect-video rounded-xl" />
        <div className="skeleton h-20 w-full rounded-xl" />
      </div>
    );
  }

  if (videoQuotaMessage || premiumMessage) {
    return (
      <div className="w-full space-y-3">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-primary-600 dark:text-gray-400 dark:hover:text-primary-400 transition-colors"
        >
          ← Back
        </button>
        <UpgradePrompt message={(videoQuotaMessage || premiumMessage)!} />
      </div>
    );
  }

  return (
    <div className="w-full space-y-3 animate-fade-in pb-8">

      {/* Back */}
      <button
        onClick={() => navigate(-1)}
        className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-primary-600 dark:text-gray-400 dark:hover:text-primary-400 transition-colors"
      >
        <ChevronLeft className="w-4 h-4" /> Back
      </button>

      <StudyLimitBanner />

      {/* Player */}
      <div className="rounded-xl overflow-hidden bg-black aspect-video shadow-lg">
        {playBlocked ? (
          <div className="w-full h-full flex flex-col items-center justify-center text-center px-4 gap-2">
            <Lock className="w-8 h-8 text-gray-400" />
            <p className="text-sm font-semibold text-gray-200">{t("parentVideoBlockedTitle")}</p>
            <p className="text-xs text-gray-400 max-w-xs">{t("parentVideoBlockedDesc")}</p>
          </div>
        ) : (
          <ReactPlayer
            ref={playerRef as any}
            src={`https://www.youtube.com/watch?v=${activeYtId}`}
            width="100%"
            height="100%"
            controls
            playbackRate={speed}
            onReady={onPlayerReady}
            onTimeUpdate={handleTimeUpdate}
            onPlay={() => { setIsPlaying(true); setHasStarted(true); sendProgress("playing"); }}
            onPause={() => { setIsPlaying(false); sendProgress("paused"); }}
            onEnded={() => { setIsPlaying(false); markWatched(); }}
            onError={(_e: SyntheticEvent) => { if (!playerFailed) setPlayerFailed(true); }}
          />
        )}
      </div>

      {/* Compact controls: medium + speed */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="font-semibold text-gray-400 dark:text-gray-500">Medium</span>
          {(["en", "hi"] as const).map((m) => {
            const available = m === "en" || !!ytIdHi;
            return (
              <button
                key={m}
                onClick={() => available && setMedium(m)}
                disabled={!available}
                className={`px-2 py-0.5 rounded-md font-semibold border transition-all ${
                  medium === m
                    ? "bg-primary-600 text-white border-primary-600"
                    : available
                      ? "bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:border-primary-400"
                      : "opacity-40 cursor-not-allowed bg-gray-100 dark:bg-gray-800 text-gray-400 border-gray-200 dark:border-gray-700"
                }`}
              >
                {m === "en" ? "EN" : "HI"}
              </button>
            );
          })}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="flex items-center gap-1 font-semibold text-gray-400 dark:text-gray-500"><Gauge className="w-3 h-3" />Speed</span>
          {SPEEDS.map((r) => (
            <button
              key={r}
              onClick={() => setSpeed(r)}
              className={`px-2 py-0.5 rounded-md font-semibold border transition-all ${
                speed === r
                  ? "bg-primary-600 text-white border-primary-600"
                  : "bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:border-primary-400"
              }`}
            >
              {r === 1 ? "1x" : `${r}x`}
            </button>
          ))}
        </div>
      </div>

      {/* Title + badges */}
      <div>
        <div className="flex items-start justify-between gap-2">
          <h1 className="text-base font-bold text-gray-900 dark:text-white leading-snug">{vidTitle}</h1>
          {isReal && videoId && (
            <BookmarkButton entityType="video" entityId={videoId} initialBookmarked={isBookmarked} className="flex-shrink-0 mt-0.5" />
          )}
        </div>
        <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
          <span className="badge-primary text-[10px]">CBSE</span>
          <span className="badge-gray text-[10px]">Class 10</span>
          {duration > 0 && <span className="badge-blue text-[10px]">{Math.floor(duration / 60)}:{String(duration % 60).padStart(2, "0")}</span>}
          {videoComplete && <span className="flex items-center gap-1 badge-green text-[10px]"><CheckCircle className="w-3 h-3" /> Watched</span>}
        </div>
      </div>

      {/* ── Video Playlist (right after the player) ── */}
      {playlist.length > 0 && (
        <div className="card p-0 overflow-hidden">
          <div className="px-3 py-2 border-b border-gray-100 dark:border-gray-700 flex items-center gap-2">
            <BookOpen className="w-3.5 h-3.5 text-primary-600 dark:text-primary-400" />
            <span className="text-xs font-bold text-gray-900 dark:text-white">Video Playlist</span>
            <span className="badge-gray ml-auto text-[10px]">{playlist.length}</span>
          </div>
          <div className="divide-y divide-gray-100 dark:divide-gray-700 max-h-64 overflow-y-auto no-scrollbar">
            {playlist.map((qq: any, idx: number) => {
              const isCurrent = qq.id === qid;
              const isLoad = navigatingToQ === qq.id;
              return (
                <button
                  key={qq.id}
                  onClick={() => goToQuestion(qq)}
                  disabled={isCurrent || !!navigatingToQ}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors ${
                    isCurrent ? "bg-primary-50 dark:bg-primary-900/20 cursor-default" : "hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer"
                  }`}
                >
                  <div className={`w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0 text-[11px] font-bold ${
                    isCurrent ? "bg-primary-600 text-white" : "bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400"
                  }`}>
                    {isLoad ? <Loader2 className="w-3 h-3 animate-spin" /> : isCurrent ? <PlayCircle className="w-3.5 h-3.5" /> : idx + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-xs font-medium leading-tight truncate ${isCurrent ? "text-primary-700 dark:text-primary-300" : "text-gray-800 dark:text-gray-200"}`}>
                      Q{qq.question_number}. {qq.question_text ? qq.question_text.slice(0, 48) + (qq.question_text.length > 48 ? "…" : "") : `Question ${qq.question_number}`}
                    </p>
                  </div>
                  {isCurrent
                    ? <span className="text-[10px] text-primary-500 dark:text-primary-400 flex-shrink-0">Playing</span>
                    : <ChevronRight className="w-3.5 h-3.5 text-gray-300 dark:text-gray-600 flex-shrink-0" />}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ── What's next: completion bar + Notes + Quiz ── */}
      <div className="card p-4 space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          {unlocked ? <CheckCircle className="w-4 h-4 text-emerald-500 flex-shrink-0" /> : <Lock className="w-4 h-4 text-gray-400 flex-shrink-0" />}
          <p className="text-sm font-bold text-gray-900 dark:text-white min-w-0 flex-1">
            {unlocked ? "What's next?" : "Watch the video to continue"}
          </p>
          <span className="text-[10px] font-bold text-amber-600 bg-amber-50 dark:bg-amber-900/30 px-1.5 py-0.5 rounded-full flex-shrink-0">Optional</span>
        </div>

        <p className={`text-xs ${unlocked ? "text-emerald-700 dark:text-emerald-400" : "text-gray-500 dark:text-gray-400"}`}>
          {unlocked
            ? "Video complete — take the quiz or read the notes."
            : "After completing the video you can start the quiz. Notes unlock at 70%."}
        </p>

        {/* Quiz + Notes — horizontal, single row */}
        <div className="flex gap-2">
          <button
            onClick={goQuiz}
            disabled={!unlocked || !practiceTarget}
            className={`flex-1 flex items-center gap-2 px-3 py-2.5 rounded-xl border text-left transition-all ${
              unlocked && practiceTarget
                ? "border-primary-200 dark:border-primary-800 bg-primary-50 dark:bg-primary-900/20 hover:border-primary-400 cursor-pointer"
                : "border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 opacity-60 cursor-not-allowed"
            }`}
          >
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${unlocked ? "bg-primary-600" : "bg-gray-300 dark:bg-gray-600"}`}>
              {unlocked ? <Award className="w-4 h-4 text-white" /> : <Lock className="w-3.5 h-3.5 text-white" />}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-gray-900 dark:text-white leading-tight">Quiz</p>
              <p className="text-[11px] text-gray-500 dark:text-gray-400 leading-tight">{unlocked ? "Graded" : "Locked"}</p>
            </div>
          </button>

          <button
            onClick={() => { if (notesUnlocked && notesUrl) setShowNotes((v) => !v); }}
            disabled={!notesUnlocked || !notesUrl}
            className={`flex-1 flex items-center gap-2 px-3 py-2.5 rounded-xl border text-left transition-all ${
              notesUnlocked && notesUrl
                ? "border-primary-200 dark:border-primary-800 bg-primary-50 dark:bg-primary-900/20 hover:border-primary-400 cursor-pointer"
                : "border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 opacity-60 cursor-not-allowed"
            }`}
          >
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${notesUnlocked && notesUrl ? "bg-amber-500" : "bg-gray-300 dark:bg-gray-600"}`}>
              {notesUnlocked && notesUrl ? <FileText className="w-4 h-4 text-white" /> : <Lock className="w-3.5 h-3.5 text-white" />}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-gray-900 dark:text-white leading-tight">Notes</p>
              <p className="text-[11px] text-gray-500 dark:text-gray-400 leading-tight">
                {!notesUrl ? "Not added" : notesUnlocked ? (showNotes ? "Hide" : "Read / PDF") : "Locked"}
              </p>
            </div>
          </button>
        </div>

      </div>

      {/* ── Inline Notes Panel ── */}
      {showNotes && notesUnlocked && notesUrl && (
        <div className="card p-4 space-y-3 border-amber-200 dark:border-amber-800">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <FileText className="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0" />
              <span className="text-sm font-bold text-gray-900 dark:text-white truncate">Chapter Notes</span>
              <span className="badge-green text-[10px] flex-shrink-0">Unlocked</span>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <a
                href={notesUrl}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400 hover:underline"
                onClick={(e) => e.stopPropagation()}
              >
                <Download className="w-3.5 h-3.5" /> Download PDF
              </a>
              <a
                href={notesUrl}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1 text-xs text-primary-600 dark:text-primary-400 hover:underline"
                onClick={(e) => e.stopPropagation()}
              >
                <ExternalLink className="w-3.5 h-3.5" /> Open
              </a>
            </div>
          </div>
          {/* PDF embed */}
          <div className="w-full rounded-xl overflow-hidden border border-amber-100 dark:border-amber-800 bg-gray-50 dark:bg-gray-900" style={{ height: "600px" }}>
            <iframe
              src={`${notesUrl}#toolbar=1&navpanes=0`}
              className="w-full h-full"
              title="Chapter Notes"
              allow="fullscreen"
            />
          </div>
          <p className="text-[10px] text-center text-gray-400">
            If the notes don't load above,{" "}
            <a href={notesUrl} target="_blank" rel="noreferrer" className="underline text-amber-500">open them in a new tab</a>.
          </p>
        </div>
      )}

      {/* Recommended (compact) */}
      {recommended.length > 0 && (
        <div className="card p-0 overflow-hidden">
          <div className="px-3 py-2 border-b border-gray-100 dark:border-gray-700 flex items-center gap-2">
            <Star className="w-3.5 h-3.5 text-yellow-500" />
            <span className="text-xs font-bold text-gray-900 dark:text-white">More Exercises</span>
          </div>
          <div className="divide-y divide-gray-100 dark:divide-gray-700">
            {recommended.map((ex: any) => (
              <button
                key={ex.id}
                onClick={() => navigate(`/learn?chapter=${chapterId}&exercise=${ex.id}`)}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              >
                <div className="w-6 h-6 rounded-md bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center flex-shrink-0">
                  <BookOpen className="w-3.5 h-3.5 text-primary-600 dark:text-primary-400" />
                </div>
                <p className="flex-1 min-w-0 text-xs font-medium text-gray-800 dark:text-gray-200 truncate">{ex.name}</p>
                <ChevronRight className="w-3.5 h-3.5 text-gray-300 dark:text-gray-600 flex-shrink-0" />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* AI Tutor (compact single line) */}
      <button
        onClick={() => navigate("/ai-assistant")}
        className="w-full flex items-center gap-2.5 p-3 rounded-xl bg-primary-50 dark:bg-primary-900/20 border border-primary-100 dark:border-primary-800 text-left hover:border-primary-300 transition-colors"
      >
        <Brain className="w-4 h-4 text-primary-600 dark:text-primary-400 flex-shrink-0" />
        <p className="flex-1 text-xs font-medium text-primary-900 dark:text-primary-200">Still confused? Ask the AI Tutor</p>
        <ChevronRight className="w-3.5 h-3.5 text-primary-400 flex-shrink-0" />
      </button>

      {!isReal && <p className="text-xs text-center text-gray-400">Demo content</p>}
    </div>
  );
}
