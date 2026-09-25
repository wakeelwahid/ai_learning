import { useQuery } from "@tanstack/react-query";
import { parentApi, type LinkBadges } from "@/api/parent";
import { useAppSelector } from "@/store";

export function useLinkBadges() {
  const user = useAppSelector((s) => s.auth.user);
  const userId = user?.id ?? "";
  const role = (user?.role ?? "").toLowerCase();

  const { data } = useQuery({
    queryKey: ["link-badges", userId],
    queryFn: () => parentApi.linkBadges().then((r) => r.data as LinkBadges),
    enabled: !!userId && (role === "student" || role === "parent"),
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  return {
    pendingIncoming: data?.pending_incoming ?? 0,
    pendingOutgoing: data?.pending_outgoing ?? 0,
    pendingApprovals: data?.pending_approvals ?? 0,
  };
}
