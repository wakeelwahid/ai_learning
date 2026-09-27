import { useState } from "react";

export interface AchievementData {
  type: "streak" | "badge" | "quiz_perfect" | "battle_win" | "level_up";
  title: string;
  subtitle?: string;
  value?: number;
}

export interface AchievementShareState {
  open: boolean;
  achievement: AchievementData | null;
  referralCode: string;
}

export function useAchievementShare() {
  const [state, setState] = useState<AchievementShareState>({
    open: false,
    achievement: null,
    referralCode: "",
  });

  const openShare = (achievement: AchievementData, referralCode = "") => {
    setState({ open: true, achievement, referralCode });
  };

  const closeShare = () => {
    setState((prev) => ({ ...prev, open: false }));
  };

  return {
    isOpen: state.open,
    achievement: state.achievement,
    referralCode: state.referralCode,
    openShare,
    closeShare,
  };
}
