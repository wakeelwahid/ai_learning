import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { useAppSelector } from "@/store";
import { shareApi } from "@/lib/api";

export interface ShareAchievementCardProps {
  achievement: {
    type: "streak" | "badge" | "quiz_perfect" | "battle_win" | "level_up";
    title: string;
    subtitle?: string;
    value?: number;
  };
  referralCode?: string;
  onClose: () => void;
}

// Emoji glyph per backend icon-name (gamification_service's share.py
// SHARE_CARD_META) — the gradient colors themselves come from the server
// response fetched below, so a tier/color change there needs no client redeploy.
const ICON_GLYPH: Record<string, string> = {
  fire: "🔥", star: "⭐", hundred: "💯", trophy: "🏆", bolt: "⚡",
};

// Fallback used only if the server call fails — keeps the share card
// functional offline/on error rather than blocking the whole flow.
const FALLBACK_GRADIENT = "from-blue-500 to-indigo-600";
const FALLBACK_ICON = "⭐";

export default function ShareAchievementCard({
  achievement,
  referralCode = "",
  onClose,
}: ShareAchievementCardProps) {
  const userId = useAppSelector((s) => s.auth.user?.id ?? "");
  const [cardMeta, setCardMeta] = useState<{ gradient_start: string; gradient_end: string; icon: string } | null>(null);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    shareApi.getShareCard(userId, achievement.type)
      .then((r) => { if (!cancelled) setCardMeta(r.data); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [userId, achievement.type]);

  // Inline style, not a Tailwind class string — the colors come from the
  // server at runtime, and Tailwind's build-time class scanner can't see
  // dynamically-interpolated `from-[...]` utility names.
  const gradientStyle = cardMeta
    ? { backgroundImage: `linear-gradient(to bottom right, ${cardMeta.gradient_start}, ${cardMeta.gradient_end})` }
    : undefined;
  const icon = cardMeta ? (ICON_GLYPH[cardMeta.icon] ?? FALLBACK_ICON) : FALLBACK_ICON;

  const shareUrl = referralCode
    ? `https://edulearn.app/join?ref=${referralCode}`
    : "https://edulearn.app";

  const whatsappText = encodeURIComponent(
    `I just earned ${achievement.title} on EduLearn! Join me at ${shareUrl}`
  );

  const twitterText = encodeURIComponent(
    `Just earned ${achievement.title} on EduLearn! Level up your studies. Join me: ${shareUrl} #EduLearn #StudyGoals`
  );

  const handleWhatsApp = () => {
    window.open(`https://wa.me/?text=${whatsappText}`, "_blank", "noopener,noreferrer");
  };

  const handleTwitter = () => {
    window.open(
      `https://twitter.com/intent/tweet?text=${twitterText}`,
      "_blank",
      "noopener,noreferrer"
    );
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
    } catch {
      // fallback — silently ignore if clipboard is unavailable
    }
  };

  const handleNativeShare = async () => {
    try {
      await navigator.share({
        title: "EduLearn Achievement",
        text: `I just earned ${achievement.title} on EduLearn!`,
        url: shareUrl,
      });
    } catch {
      // user cancelled or API unavailable — ignore
    }
  };

  const supportsShare = typeof navigator !== "undefined" && Boolean(navigator.share);

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/70 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      {/* Card — stop click propagation so backdrop click doesn't bubble through card */}
      <div
        className="relative w-full max-w-[320px] rounded-3xl overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Gradient header section */}
        <div
          className={`${cardMeta ? "" : `bg-gradient-to-br ${FALLBACK_GRADIENT}`} px-4 sm:px-6 pt-8 pb-6 flex flex-col items-center text-center`}
          style={gradientStyle}
        >
          {/* Close button */}
          <button
            onClick={onClose}
            aria-label="Close"
            className="absolute top-3 right-3 w-8 h-8 flex items-center justify-center rounded-full bg-white/20 hover:bg-white/30 text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>

          {/* Platform name */}
          <p className="text-white font-bold text-sm tracking-widest uppercase mb-3 opacity-90">
            EduLearn
          </p>

          {/* Icon */}
          <span className="text-6xl mb-3 leading-none select-none" aria-hidden="true">
            {icon}
          </span>

          {/* Title */}
          <h2 className="text-white font-bold text-2xl leading-tight mb-1">
            {achievement.title}
          </h2>

          {/* Subtitle */}
          {achievement.subtitle && (
            <p className="text-white/70 text-sm">{achievement.subtitle}</p>
          )}

          {/* Tagline */}
          <p className="text-white/80 text-sm mt-3 font-medium">Join me on EduLearn!</p>

          {/* Referral code */}
          {referralCode && (
            <p className="text-white/60 text-xs mt-1">Use code: {referralCode}</p>
          )}
        </div>

        {/* Buttons section */}
        <div className="bg-white dark:bg-gray-900 px-4 sm:px-5 py-5 space-y-2.5">
          {/* Native share (conditional) */}
          {supportsShare && (
            <button
              onClick={handleNativeShare}
              className="w-full flex items-center justify-center gap-2 bg-primary-600 hover:bg-primary-700 text-white font-semibold text-sm py-2.5 rounded-xl transition-colors"
            >
              Share
            </button>
          )}

          {/* WhatsApp */}
          <button
            onClick={handleWhatsApp}
            className="w-full flex items-center justify-center gap-2 bg-green-500 hover:bg-green-600 text-white font-semibold text-sm py-2.5 rounded-xl transition-colors"
          >
            WhatsApp
          </button>

          {/* Twitter / X */}
          <button
            onClick={handleTwitter}
            className="w-full flex items-center justify-center gap-2 bg-sky-500 hover:bg-sky-600 text-white font-semibold text-sm py-2.5 rounded-xl transition-colors"
          >
            Twitter
          </button>

          {/* Copy Link */}
          <button
            onClick={handleCopyLink}
            className="w-full flex items-center justify-center gap-2 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-100 font-semibold text-sm py-2.5 rounded-xl transition-colors"
          >
            Copy Link
          </button>
        </div>
      </div>
    </div>
  );
}
