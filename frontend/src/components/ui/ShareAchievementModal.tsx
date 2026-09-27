import { createContext, useContext, useState } from "react";
import ShareAchievementCard from "@/components/ui/ShareAchievementCard";
import type { AchievementData } from "@/hooks/useAchievementShare";

interface ShareModalContextValue {
  openShare: (achievement: AchievementData, referralCode?: string) => void;
}

const ShareModalContext = createContext<ShareModalContextValue>({
  openShare: () => undefined,
});

interface ShareModalState {
  open: boolean;
  achievement: AchievementData | null;
  referralCode: string;
}

export function ShareModalProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<ShareModalState>({
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

  return (
    <ShareModalContext.Provider value={{ openShare }}>
      {children}
      {state.open && state.achievement && (
        <ShareAchievementCard
          achievement={state.achievement}
          referralCode={state.referralCode}
          onClose={closeShare}
        />
      )}
    </ShareModalContext.Provider>
  );
}

export function useShareModal() {
  return useContext(ShareModalContext);
}
