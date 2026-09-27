/**
 * Phase 12: Subscription Context with localStorage caching.
 *
 * Problem: Without caching, every page mount under PrivateRoute calls the
 * payment_service. At 6,000 concurrent users this causes a synchronous fan-out
 * spike on every login / page navigation.
 *
 * Fix: Cache the plan tier in localStorage with a 5-minute TTL.
 *   - On mount: use cached value immediately (no loading flash).
 *   - In background: silently refresh from API and update cache.
 *   - On user change (logout/login): clear cache and re-fetch.
 */
import { createContext, useContext, useEffect, useRef, useState, ReactNode } from "react";
import { paymentApi } from "@/lib/api";
import { useAppSelector } from "@/store";

export type PlanTier = "free" | "basic" | "premium";

interface SubscriptionState {
  plan: PlanTier;
  isActive: boolean;
  expiresAt: string | null;
  loading: boolean;
}

interface CachedPlan {
  plan: PlanTier;
  isActive: boolean;
  expiresAt: string | null;
  ts: number;
}

const CACHE_KEY    = "edu_sub_plan";
const CACHE_TTL_MS = 5 * 60 * 1000;   // 5 minutes

function readCache(userId: string): CachedPlan | null {
  try {
    const raw = localStorage.getItem(`${CACHE_KEY}:${userId}`);
    if (!raw) return null;
    const parsed: CachedPlan = JSON.parse(raw);
    if (Date.now() - parsed.ts > CACHE_TTL_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeCache(userId: string, data: CachedPlan): void {
  try {
    localStorage.setItem(`${CACHE_KEY}:${userId}`, JSON.stringify(data));
  } catch {
    // localStorage quota exceeded — ignore
  }
}

function clearCache(userId: string): void {
  try {
    localStorage.removeItem(`${CACHE_KEY}:${userId}`);
  } catch { /* ignore */ }
}

function mapPlanTier(raw: string): PlanTier {
  if (raw === "premium" || raw === "annual" || raw === "quarterly") return "premium";
  if (raw === "basic"   || raw === "monthly")                        return "basic";
  return "free";
}

const SubscriptionContext = createContext<SubscriptionState>({
  plan: "free",
  isActive: false,
  expiresAt: null,
  loading: true,
});

export function SubscriptionProvider({ children }: { children: ReactNode }) {
  const user = useAppSelector((s) => s.auth.user);
  const [state, setState] = useState<SubscriptionState>({
    plan: "free",
    isActive: false,
    expiresAt: null,
    loading: true,
  });
  const prevUserId = useRef<string | null>(null);

  useEffect(() => {
    if (!user?.id) {
      setState({ plan: "free", isActive: false, expiresAt: null, loading: false });
      return;
    }

    // Clear stale cache when user switches accounts
    if (prevUserId.current && prevUserId.current !== user.id) {
      clearCache(prevUserId.current);
    }
    prevUserId.current = user.id;

    // Fast-path: serve from cache immediately (no loading spinner)
    const cached = readCache(user.id);
    if (cached) {
      setState({ plan: cached.plan, isActive: cached.isActive, expiresAt: cached.expiresAt, loading: false });
    } else {
      setState((s) => ({ ...s, loading: true }));
    }

    // Background refresh — always validate against server
    let cancelled = false;
    paymentApi
      .getSubscription(user.id)
      .then(({ data }) => {
        if (cancelled) return;
        let plan: PlanTier = "free";
        let isActive = false;
        let expiresAt: string | null = null;

        if (data?.status === "active") {
          plan     = mapPlanTier(data.plan ?? "free");
          isActive = true;
          expiresAt = data.expires_at ?? null;
        }

        const fresh: CachedPlan = { plan, isActive, expiresAt, ts: Date.now() };
        writeCache(user.id, fresh);
        setState({ plan, isActive, expiresAt, loading: false });
      })
      .catch(() => {
        if (cancelled) return;
        // Keep cached value if API fails; only set loading=false
        setState((s) => ({ ...s, loading: false }));
      });

    return () => { cancelled = true; };
  }, [user?.id]);

  return (
    <SubscriptionContext.Provider value={state}>
      {children}
    </SubscriptionContext.Provider>
  );
}

export function useSubscription() {
  return useContext(SubscriptionContext);
}

export function hasPlan(current: PlanTier, required: PlanTier): boolean {
  const rank: Record<PlanTier, number> = { free: 0, basic: 1, premium: 2 };
  return rank[current] >= rank[required];
}
