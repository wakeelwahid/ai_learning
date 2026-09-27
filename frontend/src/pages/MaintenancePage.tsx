import { useEffect, useState } from "react";
import { Wrench, Clock, RefreshCw } from "lucide-react";

interface Props {
  title: string;
  message: string;
  endsAt: string | null;
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function getRemaining(endsAt: string) {
  const diff = Math.max(0, new Date(endsAt).getTime() - Date.now());
  const totalSec = Math.floor(diff / 1000);
  const d = Math.floor(totalSec / 86400);
  const h = Math.floor((totalSec % 86400) / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return { d, h, m, s, done: diff === 0 };
}

function CountdownUnit({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-white/10 border border-white/20 flex items-center justify-center">
        <span className="text-2xl sm:text-3xl font-bold text-white tabular-nums">
          {pad(value)}
        </span>
      </div>
      <span className="text-[10px] sm:text-xs font-semibold text-white/50 uppercase tracking-wide">
        {label}
      </span>
    </div>
  );
}

export default function MaintenancePage({ title, message, endsAt }: Props) {
  const [remaining, setRemaining] = useState(endsAt ? getRemaining(endsAt) : null);

  useEffect(() => {
    if (!endsAt) return;
    const timer = setInterval(() => setRemaining(getRemaining(endsAt)), 1000);
    return () => clearInterval(timer);
  }, [endsAt]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-gradient-to-br from-gray-950 via-primary-950 to-gray-950 px-6 text-center overflow-hidden">

      {/* Background grid pattern */}
      <div
        className="absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage: "radial-gradient(circle, white 1px, transparent 1px)",
          backgroundSize: "32px 32px",
        }}
      />

      {/* Glow blobs */}
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 rounded-full bg-primary-600/20 blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-64 h-64 rounded-full bg-primary-500/10 blur-3xl pointer-events-none" />

      <div className="relative flex flex-col items-center gap-6 max-w-md w-full">

        {/* Animated icon */}
        <div className="relative">
          <div className="w-20 h-20 rounded-3xl bg-white/10 border border-white/20 flex items-center justify-center shadow-xl">
            <Wrench className="w-9 h-9 text-primary-300 animate-bounce" />
          </div>
          {/* Pulsing ring */}
          <div className="absolute inset-0 rounded-3xl border-2 border-primary-400/30 animate-ping" />
        </div>

        {/* Text */}
        <div className="space-y-2">
          <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
            {title}
          </h1>
          <p className="text-sm sm:text-base text-white/60 leading-relaxed max-w-sm">
            {message}
          </p>
        </div>

        {/* Countdown — only shown when admin set an end time */}
        {remaining && !remaining.done && (
          <div className="space-y-3">
            <div className="flex items-center justify-center gap-1.5 text-xs text-white/40 font-semibold uppercase tracking-wide">
              <Clock className="w-3.5 h-3.5" /> Back in
            </div>
            <div className="flex items-end gap-3 sm:gap-4">
              {remaining.d > 0 && <CountdownUnit value={remaining.d} label="Days" />}
              <CountdownUnit value={remaining.h} label="Hours" />
              <CountdownUnit value={remaining.m} label="Min" />
              <CountdownUnit value={remaining.s} label="Sec" />
            </div>
          </div>
        )}

        {/* Divider */}
        <div className="w-full h-px bg-white/10" />

        {/* Brand + refresh hint */}
        <div className="space-y-3 w-full">
          <div className="flex items-center justify-center gap-2">
            <div className="w-6 h-6 rounded-lg bg-primary-600 flex items-center justify-center">
              <span className="text-white font-bold text-[10px]">E</span>
            </div>
            <span className="text-white/70 font-bold text-sm">EduLearn</span>
          </div>
          <button
            onClick={() => window.location.reload()}
            className="flex items-center gap-2 mx-auto text-xs text-white/30 hover:text-white/60 transition-colors"
          >
            <RefreshCw className="w-3 h-3" /> Refresh to check status
          </button>
        </div>
      </div>
    </div>
  );
}
