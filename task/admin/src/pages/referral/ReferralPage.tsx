import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { referralApi } from "@/lib/api";
import StatsCard from "@/components/ui/StatsCard";
import {
  Users, Gift, TrendingUp, Star, RefreshCw, ChevronLeft, ChevronRight,
  CheckCircle, XCircle, Clock, Award,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell,
} from "recharts";

const MILESTONES = [
  { count: 1,  reward: "Premium Notes" },
  { count: 2,  reward: "Practice Papers" },
  { count: 3,  reward: "Quiz Boost" },
  { count: 5,  reward: "Adaptive Learning" },
  { count: 7,  reward: "7 Days Premium" },
  { count: 10, reward: "30 Days Premium" },
];

const STATUS_COLOR: Record<string, string> = {
  pending:   "bg-warning-100 text-warning-700 dark:bg-warning-900/40 dark:text-warning-300",
  qualified: "bg-success-100 text-success-700 dark:bg-success-900/40 dark:text-success-300",
  rewarded:  "bg-info-100 text-info-700 dark:bg-info-900/40 dark:text-info-300",
  invalid:   "bg-danger-100 text-danger-700 dark:bg-danger-900/40 dark:text-danger-300",
};

// Single-hue sequential ramp (indigo, light -> dark) for the funnel bar chart —
// no rainbow/gradient palette, matches the design system's one-accent rule.
const FUNNEL_COLORS = ["#c7d2fe", "#a5b4fc", "#818cf8", "#6366f1", "#4f46e5", "#4338ca"];

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLOR[status] ?? "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300"}`}>
      {status === "qualified" || status === "rewarded" ? <CheckCircle className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

function BoolCell({ v }: { v: boolean }) {
  return v
    ? <CheckCircle className="w-4 h-4 text-success-500" />
    : <XCircle className="w-4 h-4 text-gray-300 dark:text-gray-600" />;
}

export default function ReferralPage() {
  const [codesPage, setCodesPage]       = useState(1);
  const [referralsPage, setReferralsPage] = useState(1);
  const [statusFilter, setStatusFilter]   = useState("");
  const PAGE_SIZE = 20;

  const { data: overview, isLoading: ovLoading, refetch: refetchOv } = useQuery({
    queryKey: ["referral-admin-overview"],
    queryFn: () => referralApi.adminOverview().then((r) => r.data),
  });

  const { data: codesData, isLoading: codesLoading, refetch: refetchCodes } = useQuery({
    queryKey: ["referral-admin-all-codes", codesPage],
    queryFn: () => referralApi.adminAllCodes({ page: codesPage, limit: PAGE_SIZE }).then((r) => r.data),
    keepPreviousData: true,
  } as any);

  const { data: referralsData, isLoading: refsLoading, refetch: refetchRefs } = useQuery({
    queryKey: ["referral-admin-all-referrals", referralsPage, statusFilter],
    queryFn: () =>
      referralApi.adminAllReferrals({
        page: referralsPage,
        limit: PAGE_SIZE,
        ...(statusFilter ? { status: statusFilter } : {}),
      }).then((r) => r.data),
    keepPreviousData: true,
  } as any);

  const codes     = (codesData as any)?.codes     ?? [];
  const totalCodes = (codesData as any)?.total    ?? 0;
  const referrals  = (referralsData as any)?.referrals ?? [];
  const totalRefs  = (referralsData as any)?.total ?? 0;
  const funnel     = (referralsData as any)?.funnel ?? {};

  const funnelData = [
    { name: "Signed Up",   value: funnel.signup    ?? 0 },
    { name: "Email Verified", value: funnel.email  ?? 0 },
    { name: "Video Watched",  value: funnel.video  ?? 0 },
    { name: "Quiz Done",   value: funnel.quiz      ?? 0 },
    { name: "Qualified",   value: funnel.qualified ?? 0 },
    { name: "Rewarded",    value: funnel.rewarded  ?? 0 },
  ];

  const refetch = () => { refetchOv(); refetchCodes(); refetchRefs(); };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Referral Program</h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm mt-0.5">All users' referral activity, funnel, and rewards</p>
        </div>
        <button onClick={refetch} className="btn btn-sm btn-secondary">
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Overview Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatsCard label="Total Referrers"  value={ovLoading ? "…" : String(overview?.total_referrers ?? 0)} icon={Users}      color="bg-info-600" />
        <StatsCard label="Total Invites"    value={ovLoading ? "…" : String(overview?.total_referrals ?? 0)} icon={TrendingUp}  color="bg-success-600" />
        <StatsCard label="Qualified"        value={ovLoading ? "…" : String(overview?.total_qualified ?? 0)}  icon={Star}       color="bg-primary-600" />
        <StatsCard
          label="Conversion Rate"
          value={
            ovLoading ? "…"
            : overview?.total_referrals
              ? `${Math.round(((overview.total_qualified ?? 0) / overview.total_referrals) * 100)}%`
              : "0%"
          }
          icon={Gift}
          color="bg-warning-600"
        />
      </div>

      {/* Funnel + Milestones */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Qualification Funnel */}
        <div className="card p-5 lg:col-span-2">
          <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-4">Qualification Funnel</h3>
          {refsLoading ? (
            <div className="py-8 text-center text-gray-400 dark:text-gray-500 text-sm">Loading…</div>
          ) : funnel.total === 0 ? (
            <div className="py-8 text-center text-gray-400 dark:text-gray-500 text-sm">No referral records yet.</div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={funnelData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
                <YAxis dataKey="name" type="category" tick={{ fontSize: 11 }} width={110} />
                <Tooltip />
                <Bar dataKey="value" radius={[0, 4, 4, 0]} name="Users">
                  {funnelData.map((_, i) => <Cell key={i} fill={FUNNEL_COLORS[i % FUNNEL_COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Milestone Rewards */}
        <div className="card p-5">
          <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-3 flex items-center gap-2">
            <Award className="w-4 h-4 text-warning-500" /> Milestone Rewards
          </h3>
          <div className="space-y-2">
            {MILESTONES.map(({ count, reward }) => (
              <div key={count} className="flex justify-between items-center py-2 border-b border-gray-50 dark:border-gray-800 text-sm">
                <span className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                  <span className="w-5 h-5 rounded-full bg-primary-100 dark:bg-primary-900/40 text-primary-700 dark:text-primary-300 text-xs font-bold flex items-center justify-center">{count}</span>
                  referral{count > 1 ? "s" : ""}
                </span>
                <span className="text-gray-800 dark:text-gray-200 font-medium text-xs">{reward}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* All User Referral Codes Table */}
      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
          <h3 className="font-semibold text-gray-900 dark:text-gray-100">All Users — Referral Codes</h3>
          <span className="text-xs text-gray-400 dark:text-gray-500">{totalCodes} total</span>
        </div>
        {codesLoading ? (
          <div className="p-8 text-center text-gray-400 dark:text-gray-500">Loading…</div>
        ) : codes.length === 0 ? (
          <div className="p-8 text-center text-gray-400 dark:text-gray-500">No referral codes yet.</div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 dark:bg-gray-900/40 border-b border-gray-100 dark:border-gray-700">
                  <tr>
                    <th className="table-th">User ID</th>
                    <th className="table-th">Code</th>
                    <th className="table-th text-right">Invites</th>
                    <th className="table-th text-right">Qualified</th>
                    <th className="table-th">Next Milestone</th>
                    <th className="table-th">Joined</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
                  {codes.map((c: any) => {
                    const next = MILESTONES.find((m) => m.count > c.qualified_referrals);
                    return (
                      <tr key={c.user_id} className="table-row-hover">
                        <td className="table-td font-mono text-xs text-gray-500 dark:text-gray-400">{c.user_id.slice(0, 12)}…</td>
                        <td className="table-td">
                          <code className="text-xs bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded font-mono">{c.code}</code>
                        </td>
                        <td className="table-td text-right font-semibold">{c.total_referrals}</td>
                        <td className="table-td text-right font-semibold text-success-600 dark:text-success-400">{c.qualified_referrals}</td>
                        <td className="table-td text-xs text-gray-500 dark:text-gray-400">
                          {next ? `${c.qualified_referrals}/${next.count} → ${next.reward}` : <span className="badge badge-warning">All Unlocked</span>}
                        </td>
                        <td className="table-td text-xs text-gray-400 dark:text-gray-500">{c.created_at?.slice(0, 10)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="px-5 py-3 border-t border-gray-100 dark:border-gray-700 flex items-center justify-between">
              <span className="text-xs text-gray-400 dark:text-gray-500">Page {codesPage} of {Math.ceil(totalCodes / PAGE_SIZE) || 1}</span>
              <div className="flex gap-2">
                <button className="btn btn-xs btn-secondary" disabled={codesPage <= 1} onClick={() => setCodesPage((p) => p - 1)}><ChevronLeft className="w-3.5 h-3.5" /></button>
                <button className="btn btn-xs btn-secondary" disabled={codesPage >= Math.ceil(totalCodes / PAGE_SIZE)} onClick={() => setCodesPage((p) => p + 1)}><ChevronRight className="w-3.5 h-3.5" /></button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* All Referral Records Table */}
      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between flex-wrap gap-3">
          <h3 className="font-semibold text-gray-900 dark:text-gray-100">All Referral Records</h3>
          <div className="flex items-center gap-3">
            <select
              className="input text-sm py-1"
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setReferralsPage(1); }}
            >
              <option value="">All Statuses</option>
              <option value="pending">Pending</option>
              <option value="qualified">Qualified</option>
              <option value="rewarded">Rewarded</option>
              <option value="invalid">Invalid</option>
            </select>
            <span className="text-xs text-gray-400 dark:text-gray-500">{totalRefs} total</span>
          </div>
        </div>
        {refsLoading ? (
          <div className="p-8 text-center text-gray-400 dark:text-gray-500">Loading…</div>
        ) : referrals.length === 0 ? (
          <div className="p-8 text-center text-gray-400 dark:text-gray-500">No referral records found.</div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 dark:bg-gray-900/40 border-b border-gray-100 dark:border-gray-700">
                  <tr>
                    <th className="table-th">Referrer</th>
                    <th className="table-th">Referred</th>
                    <th className="table-th">Code</th>
                    <th className="table-th">Status</th>
                    <th className="table-th text-center">Signup</th>
                    <th className="table-th text-center">Email</th>
                    <th className="table-th text-center">Video</th>
                    <th className="table-th text-center">Quiz</th>
                    <th className="table-th">Qualified At</th>
                    <th className="table-th">Invited At</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
                  {referrals.map((r: any) => (
                    <tr key={r.id} className="table-row-hover">
                      <td className="table-td font-mono text-xs text-gray-500 dark:text-gray-400">{r.referrer_id.slice(0, 8)}…</td>
                      <td className="table-td font-mono text-xs text-gray-500 dark:text-gray-400">{r.referred_id.slice(0, 8)}…</td>
                      <td className="table-td">
                        <code className="text-xs bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded font-mono">{r.referral_code}</code>
                      </td>
                      <td className="table-td"><StatusBadge status={r.status} /></td>
                      <td className="table-td text-center"><BoolCell v={r.signup_completed} /></td>
                      <td className="table-td text-center"><BoolCell v={r.email_verified} /></td>
                      <td className="table-td text-center"><BoolCell v={r.video_watched} /></td>
                      <td className="table-td text-center"><BoolCell v={r.quiz_completed} /></td>
                      <td className="table-td text-xs text-gray-400 dark:text-gray-500">{r.qualified_at?.slice(0, 10) ?? "—"}</td>
                      <td className="table-td text-xs text-gray-400 dark:text-gray-500">{r.created_at?.slice(0, 10)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="px-5 py-3 border-t border-gray-100 dark:border-gray-700 flex items-center justify-between">
              <span className="text-xs text-gray-400 dark:text-gray-500">Page {referralsPage} of {Math.ceil(totalRefs / PAGE_SIZE) || 1}</span>
              <div className="flex gap-2">
                <button className="btn btn-xs btn-secondary" disabled={referralsPage <= 1} onClick={() => setReferralsPage((p) => p - 1)}><ChevronLeft className="w-3.5 h-3.5" /></button>
                <button className="btn btn-xs btn-secondary" disabled={referralsPage >= Math.ceil(totalRefs / PAGE_SIZE)} onClick={() => setReferralsPage((p) => p + 1)}><ChevronRight className="w-3.5 h-3.5" /></button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
