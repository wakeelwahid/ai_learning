import { useQuery } from "@tanstack/react-query";
import { useAppSelector } from "@/store";
import { parentApi } from "@/lib/api";

interface LinkBadges {
  pending_incoming: number;
  pending_outgoing: number;
  pending_approvals: number;
}

const EMPTY: LinkBadges = { pending_incoming: 0, pending_outgoing: 0, pending_approvals: 0 };

export function useLinkBadges() {
  const user = useAppSelector(s => s.auth.user);
  const userId = user?.id ?? "";
  const role = user?.role?.toLowerCase();
  const enabled = !!userId && (role === "student" || role === "parent");

  const { data } = useQuery({
    queryKey: ["link-badges", userId],
    queryFn: () => parentApi.linkBadges().then(r => ({ ...EMPTY, ...(r.data ?? {}) }) as LinkBadges),
    enabled,
    refetchInterval: 60_000,
    retry: 0,
  });

  return data ?? EMPTY;
}
