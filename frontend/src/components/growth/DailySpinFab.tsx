import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { gamificationApi } from "@/lib/api";
import SpinWheelModal, { type DailyRewardStatus } from "./SpinWheelModal";

/**
 * Floating "Daily Spin" button — visibility is 100% server-driven:
 * it renders ONLY while the backend reports can_claim. After a successful
 * claim the shared ["daily-reward-status"] invalidation flips can_claim to
 * false and the FAB unmounts; it reappears when the server re-enables it.
 *
 * Position: stacked above the layout's "Ask AI Tutor" FAB
 * (fixed bottom-20 right-4 / lg:bottom-6 lg:right-6, z-30) so they never collide.
 */
export default function DailySpinFab({ userId }: { userId?: string }) {
  const [open, setOpen] = useState(false);

  const { data: status } = useQuery<DailyRewardStatus>({
    // Same query key as DailyRewardPopup / SpinWheelModal — shared cache + invalidation
    queryKey: ["daily-reward-status", userId],
    queryFn: () => gamificationApi.dailyRewardStatus(userId!).then((r) => r.data),
    enabled: !!userId,
  });

  if (!userId || !status) return null;
  // FAB is visible only while the server says a spin is claimable. The open
  // modal is kept mounted separately: the successful claim flips can_claim to
  // false (hiding the FAB), but the wheel must finish animating before close.
  if (!status.can_claim && !open) return null;

  return (
    <>
      {status.can_claim && (
        <button
          onClick={() => setOpen(true)}
          aria-label="Daily Spin — claim your reward"
          title="Daily Spin"
          className="fixed bottom-36 right-4 lg:bottom-24 lg:right-6 z-40 w-[60px] h-[60px] rounded-full bg-gradient-to-br from-[#6C5DD3] to-[#4F46E5] text-white shadow-lg shadow-indigo-500/40 flex flex-col items-center justify-center hover:scale-105 transition-transform"
        >
          {/* Gentle pulse while a spin is available */}
          <span className="absolute inset-0 rounded-full bg-indigo-400 opacity-30 animate-ping [animation-duration:2.5s]" aria-hidden="true" />
          <span className="relative text-xl leading-none">🎡</span>
          <span className="relative text-[9px] font-bold leading-tight mt-0.5">Spin</span>
        </button>
      )}

      {open && (
        <SpinWheelModal userId={userId} status={status} onClose={() => setOpen(false)} />
      )}
    </>
  );
}
