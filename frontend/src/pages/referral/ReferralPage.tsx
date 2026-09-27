import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAppSelector } from "@/store";
import { referralApi } from "@/lib/api";
import { useLanguage } from "@/contexts/LanguageContext";
import {
  Gift, Copy, CheckCheck, Share2, Users, Trophy, Star,
  Zap, BookOpen, FileText, Target, Crown, Sparkles,
  CheckCircle2, ChevronRight,
} from "lucide-react";
import BackButton from "@/components/ui/BackButton";
import toast from "react-hot-toast";

// ── Reward milestones config ──────────────────────────────────────────────────
// Each milestone uses a single solid accent color (no gradients) — bg is the
// light tint used for its unlocked card/icon chip, text is the matching
// foreground color for labels/progress.
const MILESTONES = [
  {
    count: 1,
    key:   "premium_notes",
    label: "Premium Notes",
    desc:  "Full access to premium study notes for all chapters",
    icon:  BookOpen,
    solid: "bg-info-500",
    bg:    "bg-info-50 dark:bg-info-900/20",
    text:  "text-info-700 dark:text-info-300",
  },
  {
    count: 2,
    key:   "practice_papers",
    label: "Practice Papers",
    desc:  "Unlimited access to practice & mock test papers",
    icon:  FileText,
    solid: "bg-primary-500",
    bg:    "bg-primary-50 dark:bg-primary-900/20",
    text:  "text-primary-700 dark:text-primary-300",
  },
  {
    count: 3,
    key:   "quiz_boost",
    label: "Quiz Boost",
    desc:  "2× XP on every quiz for 30 days",
    icon:  Zap,
    solid: "bg-warning-500",
    bg:    "bg-warning-50 dark:bg-warning-900/20",
    text:  "text-warning-700 dark:text-warning-300",
  },
  {
    count: 5,
    key:   "adaptive_learning",
    label: "Adaptive Learning",
    desc:  "AI-personalised study path based on your weak areas",
    icon:  Target,
    solid: "bg-danger-500",
    bg:    "bg-danger-50 dark:bg-danger-900/20",
    text:  "text-danger-700 dark:text-danger-300",
  },
  {
    count: 7,
    key:   "7_days_premium",
    label: "7 Days Premium",
    desc:  "Full premium access — all subjects, live classes & more",
    icon:  Star,
    solid: "bg-primary-600",
    bg:    "bg-primary-50 dark:bg-primary-900/20",
    text:  "text-primary-700 dark:text-primary-300",
  },
  {
    count: 10,
    key:   "30_days_premium",
    label: "30 Days Premium",
    desc:  "Full month of premium — the ultimate reward!",
    icon:  Crown,
    solid: "bg-warning-600",
    bg:    "bg-warning-50 dark:bg-warning-900/20",
    text:  "text-warning-700 dark:text-warning-300",
  },
];

// ── Qualification checklist ───────────────────────────────────────────────────
const QUAL_STEPS = [
  { key: "signup_completed", label: "Sign up" },
  { key: "email_verified",   label: "Verify email" },
  { key: "video_watched",    label: "Watch a video" },
  { key: "quiz_completed",   label: "Complete a quiz" },
];

function ShareButton({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  const { t } = useLanguage();

  const shareText = `Hey! Join me on EduApp for free AI-powered study sessions. Use my referral code ${code} to sign up: https://eduapp.in/register?ref=${code}`;

  function copy() {
    navigator.clipboard.writeText(code);
    setCopied(true);
    toast.success(t("copied"));
    setTimeout(() => setCopied(false), 2000);
  }

  async function share() {
    if (navigator.share) {
      await navigator.share({ title: "Join EduApp", text: shareText });
    } else {
      navigator.clipboard.writeText(shareText);
      toast.success("Link copied to clipboard!");
    }
  }

  return (
    <div className="flex gap-2">
      <div className="flex-1 min-w-0 flex items-center gap-3 bg-gray-100 dark:bg-gray-800 rounded-2xl px-4 py-3 font-mono text-lg font-bold tracking-widest text-gray-900 dark:text-white select-all overflow-hidden">
        <span className="truncate">{code}</span>
      </div>
      <button onClick={copy}
        className="w-12 h-12 flex-shrink-0 flex items-center justify-center rounded-2xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:border-primary-400 hover:text-primary-600 transition-all shadow-sm"
        title={t("copy")}
      >
        {copied ? <CheckCheck className="w-4 h-4 text-success-500" /> : <Copy className="w-4 h-4 text-gray-500" />}
      </button>
      <button onClick={share}
        className="w-12 h-12 flex-shrink-0 flex items-center justify-center rounded-2xl bg-primary-600 hover:bg-primary-700 text-white shadow-sm transition-colors"
        title={t("share")}
      >
        <Share2 className="w-4 h-4" />
      </button>
    </div>
  );
}

function MilestoneCard({ m, qualified, claimed }: { m: typeof MILESTONES[0]; qualified: number; claimed: boolean }) {
  const unlocked = qualified >= m.count;
  const Icon = m.icon;
  const pct  = Math.min((qualified / m.count) * 100, 100);

  return (
    <div className={`relative rounded-2xl border transition-colors ${
      claimed   ? "border-success-300 dark:border-success-700 bg-success-50 dark:bg-success-900/10"
      : unlocked ? `border-transparent ${m.bg}`
      : "border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900"
    }`}>
      {/* Lock / check overlay */}
      {claimed && (
        <div className="absolute top-2.5 right-2.5">
          <CheckCircle2 className="w-5 h-5 text-success-500" />
        </div>
      )}
      {unlocked && !claimed && (
        <div className="absolute top-2.5 right-2.5">
          {/* No manual claim step exists — the backend grants this reward
              automatically the moment the milestone is reached. This badge
              means "processing," not "click to claim" (there's nothing to
              click); it clears on its own once the grant completes and the
              reward shows up in "Claimed rewards" below. */}
          <span className="text-xs font-semibold bg-warning-500 text-white px-2 py-0.5 rounded-full">Unlocking…</span>
        </div>
      )}

      <div className="p-4">
        <div className="flex items-start gap-3 mb-3">
          <div className={`w-10 h-10 rounded-xl ${m.solid} flex items-center justify-center flex-shrink-0 ${unlocked ? "" : "opacity-40"}`}>
            <Icon className="w-5 h-5 text-white" />
          </div>
          <div className="min-w-0">
            <p className={`font-semibold text-sm ${unlocked ? "text-gray-900 dark:text-white" : "text-gray-400 dark:text-gray-600"}`}>{m.label}</p>
            <p className={`text-xs mt-0.5 leading-relaxed ${unlocked ? "text-gray-500 dark:text-gray-400" : "text-gray-300 dark:text-gray-700"}`}>{m.desc}</p>
          </div>
        </div>

        <div className="flex items-center gap-2 mt-2">
          <div className="flex-1 h-1.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
            <div className={`h-full rounded-full ${m.solid} transition-all duration-700`} style={{ width: `${pct}%` }} />
          </div>
          <span className={`text-xs font-semibold shrink-0 ${unlocked ? m.text : "text-gray-400"}`}>
            {Math.min(qualified, m.count)}/{m.count}
          </span>
        </div>
      </div>
    </div>
  );
}

export default function ReferralPage() {
  const { t } = useLanguage();
  const user = useAppSelector(s => s.auth.user);

  const { data: codeData, isLoading: codeLoading } = useQuery({
    queryKey:  ["referral-code", user?.id],
    queryFn:   () => referralApi.getCode(user!.id).then(r => r.data),
    enabled:   !!user?.id,
  });

  const { data: rewardsData } = useQuery({
    queryKey:  ["referral-rewards", user?.id],
    queryFn:   () => referralApi.getRewards(user!.id).then(r => r.data),
    enabled:   !!user?.id,
  });

  const code       = codeData?.code      ?? t("loading");
  const total      = codeData?.total_referrals     ?? 0;
  const qualified  = codeData?.qualified_referrals ?? 0;
  const rewards: any[] = rewardsData ?? [];
  const claimedKeys = new Set(rewards.map((r: any) => r.reward_type));

  const nextMilestone = MILESTONES.find(m => qualified < m.count);
  const remaining = nextMilestone ? nextMilestone.count - qualified : 0;

  return (
    <div className="w-full space-y-6 animate-fade-in">
      <BackButton label="Back" />

      {/* Hero — full width */}
      <div className="rounded-3xl bg-primary-600 p-6 text-white relative overflow-hidden">
        <div className="absolute -top-8 -right-8 w-40 h-40 bg-white/10 rounded-full" />
        <div className="absolute -bottom-12 -left-6 w-32 h-32 bg-white/5 rounded-full" />
        <div className="relative">
          <div className="flex items-center gap-2 mb-4">
            <Gift className="w-6 h-6" />
            <span className="font-bold text-lg">{t("referEarnTitle")}</span>
          </div>
          <p className="text-white/80 text-sm mb-5 max-w-xs">
            {t("referEarnSub")}
          </p>
          <div className="grid grid-cols-1 xs:grid-cols-3 gap-3 mb-5">
            {[
              { label: t("invited"),   value: total     },
              { label: t("qualified"), value: qualified },
              { label: t("rewards"),   value: rewards.length },
            ].map(s => (
              <div key={s.label} className="bg-white/15 rounded-2xl p-3 text-center backdrop-blur-sm">
                <p className="text-2xl font-bold">{s.value}</p>
                <p className="text-white/70 text-xs mt-0.5">{s.label}</p>
              </div>
            ))}
          </div>
          {!codeLoading && <ShareButton code={code} />}
        </div>
      </div>

      {/* Next milestone / all unlocked banner */}
      {nextMilestone && (
        <div className={`flex items-center gap-3 p-4 rounded-2xl ${nextMilestone.bg} border border-current/10`}>
          <Sparkles className={`w-5 h-5 ${nextMilestone.text} shrink-0`} />
          <div className="flex-1">
            <p className={`font-semibold text-sm ${nextMilestone.text}`}>
              {remaining} more qualified referral{remaining !== 1 ? "s" : ""} to unlock <strong>{nextMilestone.label}</strong>
            </p>
          </div>
          <ChevronRight className={`w-4 h-4 ${nextMilestone.text} shrink-0`} />
        </div>
      )}
      {!nextMilestone && MILESTONES.length > 0 && (
        <div className="flex items-center gap-3 p-4 rounded-2xl bg-success-50 dark:bg-success-900/20 border border-success-200 dark:border-success-700">
          <Trophy className="w-5 h-5 text-success-600 dark:text-success-400" />
          <p className="font-semibold text-sm text-success-700 dark:text-success-300">You've unlocked all rewards! 🎉</p>
        </div>
      )}

      {/* 2-col at xl */}
      <div className="xl:flex xl:gap-8 xl:items-start">

        {/* ── LEFT: Milestones ── */}
        <div className="flex-1 min-w-0 space-y-5">
          <div>
            <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
              <Trophy className="w-4 h-4 text-warning-500" /> {t("rewardMilestones")}
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-2 gap-3">
              {MILESTONES.map(m => (
                <MilestoneCard key={m.key} m={m} qualified={qualified} claimed={claimedKeys.has(m.key)} />
              ))}
            </div>
          </div>

          {/* Claimed rewards */}
          {rewards.length > 0 && (
            <div>
              <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                <Gift className="w-4 h-4 text-success-600" /> Your Rewards
              </h3>
              <div className="space-y-2">
                {rewards.map((r: any) => {
                  const m = MILESTONES.find(ml => ml.key === r.reward_type);
                  const Icon = m?.icon ?? Gift;
                  return (
                    <div key={r.id} className="flex items-center gap-3 p-3 bg-success-50 dark:bg-success-900/10 border border-success-200 dark:border-success-700 rounded-2xl">
                      <div className={`w-9 h-9 rounded-xl ${m?.solid ?? "bg-success-500"} flex items-center justify-center flex-shrink-0`}>
                        <Icon className="w-4 h-4 text-white" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm text-gray-900 dark:text-white truncate">{m?.label ?? r.reward_type}</p>
                        <p className="text-xs text-gray-400">{r.is_claimed ? "Activated" : "Ready to use"}</p>
                      </div>
                      <span className={`flex-shrink-0 text-xs font-medium px-2 py-0.5 rounded-full ${r.is_claimed ? "bg-success-100 text-success-700 dark:bg-success-900/30 dark:text-success-400" : "bg-warning-100 text-warning-700 dark:bg-warning-900/30 dark:text-warning-400"}`}>
                        {r.is_claimed ? "Active" : "Pending"}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <p className="text-center text-xs text-gray-400 pb-4">
            Terms: Referrals are valid only after all 4 qualification steps are completed by the referred user.
          </p>
        </div>

        {/* ── RIGHT: sticky How it works sidebar (xl+) ── */}
        <aside className="hidden xl:flex flex-col w-72 flex-shrink-0 sticky top-6 self-start space-y-4">
          <div className="card">
            <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
              <Users className="w-4 h-4 text-primary-600" /> {t("howItWorks")}
            </h3>
            <div className="space-y-3">
              {[
                { n: "1", text: "Share your referral code with a friend" },
                { n: "2", text: "Friend signs up using your code" },
                { n: "3", text: "They complete all 4 steps to qualify:" },
              ].map(s => (
                <div key={s.n} className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">{s.n}</div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">{s.text}</p>
                </div>
              ))}
              <div className="ml-9 grid grid-cols-1 gap-2 pt-1">
                {QUAL_STEPS.map(step => (
                  <div key={step.key} className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                    <CheckCircle2 className="w-3.5 h-3.5 text-success-500 shrink-0" />
                    {step.label}
                  </div>
                ))}
              </div>
              <div className="flex items-start gap-3 pt-1">
                <div className="w-6 h-6 rounded-full bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 text-xs font-bold flex items-center justify-center flex-shrink-0">4</div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Both of you get rewarded — your friend gets a welcome XP bonus, and you unlock a reward at each milestone!</p>
              </div>
            </div>
          </div>

          {/* Tier quick reference */}
          <div className="card space-y-2">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Milestone Summary</p>
            {MILESTONES.map(m => {
              const Icon = m.icon;
              const unlocked = qualified >= m.count;
              return (
                <div key={m.key} className="flex items-center gap-2">
                  <div className={`w-7 h-7 rounded-lg ${m.solid} flex items-center justify-center flex-shrink-0 ${unlocked ? "" : "opacity-30"}`}>
                    <Icon className="w-3.5 h-3.5 text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-xs font-semibold truncate ${unlocked ? "text-gray-900 dark:text-white" : "text-gray-400"}`}>{m.label}</p>
                  </div>
                  <span className="text-xs font-semibold text-gray-400 flex-shrink-0">{m.count} refs</span>
                </div>
              );
            })}
          </div>
        </aside>

        {/* How it works — mobile/tablet only */}
        <div className="xl:hidden card mt-2">
          <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
            <Users className="w-4 h-4 text-primary-600" /> {t("howItWorks")}
          </h3>
          <div className="space-y-3">
            {[
              { n: "1", text: "Share your referral code with a friend" },
              { n: "2", text: "Friend signs up using your code" },
              { n: "3", text: "They complete all 4 steps to qualify:" },
            ].map(s => (
              <div key={s.n} className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">{s.n}</div>
                <p className="text-sm text-gray-600 dark:text-gray-400">{s.text}</p>
              </div>
            ))}
            <div className="ml-9 grid grid-cols-1 xs:grid-cols-2 gap-2 pt-1">
              {QUAL_STEPS.map(step => (
                <div key={step.key} className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 min-w-0">
                  <CheckCircle2 className="w-3.5 h-3.5 text-success-500 shrink-0" />
                  <span className="truncate">{step.label}</span>
                </div>
              ))}
            </div>
            <div className="flex items-start gap-3 pt-1">
              <div className="w-6 h-6 rounded-full bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 text-xs font-bold flex items-center justify-center flex-shrink-0">4</div>
              <p className="text-sm text-gray-600 dark:text-gray-400">You unlock a reward at each milestone!</p>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
