import { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Search, Check, UserCheck, Clock, UserPlus } from "lucide-react";
import toast from "react-hot-toast";
import { chatApi } from "@/lib/api";
import UserAvatar from "@/components/UserAvatar";
import { useAppSelector } from "@/store";
import { Card } from "@/components/ui";

interface StudentResult {
  user_id: string;
  full_name: string;
  school_name?: string | null;
  class_number?: number | null;
  board?: string | null;
  avatar_url?: string | null;
  friend_status: "none" | "pending_sent" | "pending_received" | "friends";
  request_id?: string;
}

interface RequestRow {
  id: string;
  name: string;
  school?: string | null;
  mutualFriends: number;
  createdAt?: string;
}

// Backend row: `id`, `status`, `created_at`, `mutual_friends_count`, and
// `other_profile` (sender for incoming, recipient for outgoing; same as `from_profile` on incoming)
function mapRequestRow(r: any): RequestRow {
  const profile = r.other_profile ?? r.from_profile;
  return {
    id: r.id ?? r.request_id ?? "",
    name: profile?.full_name ?? "User",
    school: profile?.school_name ?? null,
    mutualFriends: r.mutual_friends_count ?? 0,
    createdAt: r.created_at,
  };
}

function requestSubtitle(req: RequestRow): string {
  return [
    req.mutualFriends ? `${req.mutualFriends} mutual friend${req.mutualFriends > 1 ? "s" : ""}` : null,
    req.school,
  ]
    .filter(Boolean)
    .join(" · ");
}

function timeAgo(iso?: string): string {
  if (!iso) return "";
  try {
    const diff = Date.now() - new Date(iso).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1) return "just now";
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    if (h < 48) return "Yesterday";
    return `${Math.floor(h / 24)}d ago`;
  } catch { return ""; }
}

export default function StudentSearchPage() {
  const currentUserId = useAppSelector(s => s.auth.user?.id ?? "");

  const [activeTab, setActiveTab] = useState<"search" | "requests">("search");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<StudentResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [sentRequests, setSentRequests] = useState<RequestRow[]>([]);
  const [requestCount, setRequestCount] = useState(0);
  const [respondingId, setRespondingId] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Pending incoming/outgoing requests + server-cached incoming count
  const loadRequests = () => {
    if (!currentUserId) return;
    chatApi.getFriendRequests(currentUserId, "incoming")
      .then(res => {
        const rows = (res.data ?? []) as any[];
        setRequests(rows.filter(r => r.status === "pending").map(mapRequestRow));
      })
      .catch(() => setRequests([]));
    chatApi.getFriendRequests(currentUserId, "outgoing")
      .then(res => {
        const rows = (res.data ?? []) as any[];
        setSentRequests(rows.filter(r => r.status === "pending").map(mapRequestRow));
      })
      .catch(() => setSentRequests([]));
  };

  const refreshRequestCount = () => {
    if (!currentUserId) return;
    chatApi.getFriendRequestCount(currentUserId)
      .then(res => setRequestCount(res.data?.count ?? 0))
      .catch(() => {});
  };

  useEffect(() => {
    loadRequests();
    refreshRequestCount();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUserId]);

  // Load a page of students: empty q = discover list (all students), non-empty q = search
  const loadStudents = async (q: string, pageNum: number, append: boolean) => {
    if (append) setLoadingMore(true);
    else setLoading(true);
    try {
      const res = await chatApi.search(q, currentUserId, pageNum, 20);
      const items = (res.data?.results ?? []) as StudentResult[];
      setResults(prev => {
        if (!append) return items;
        const seen = new Set(prev.map(s => s.user_id));
        return [...prev, ...items.filter(s => !seen.has(s.user_id))];
      });
      setPage(res.data?.page ?? pageNum);
      setTotal(res.data?.total ?? items.length);
      setHasMore(res.data?.has_more ?? false);
    } catch {
      if (!append) {
        setResults([]);
        setTotal(0);
        setHasMore(false);
      }
    } finally {
      if (append) setLoadingMore(false);
      else setLoading(false);
    }
  };

  // Discover list on mount + debounced search on typing (page resets to 1)
  useEffect(() => {
    if (!currentUserId) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setLoading(true);
    const q = query.trim();
    // No debounce needed for the discover list (empty query)
    debounceRef.current = setTimeout(() => {
      loadStudents(q, 1, false);
    }, q ? 300 : 0);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, currentUserId]);

  const handleSendRequest = async (toId: string) => {
    try {
      await chatApi.sendFriendRequest(currentUserId, toId);
      setResults(prev =>
        prev.map(s => s.user_id === toId ? { ...s, friend_status: "pending_sent" } : s)
      );
      loadRequests(); // pick up the new row in Sent Requests
      refreshRequestCount();
    } catch (err: any) {
      const detail: string | undefined = err?.response?.data?.detail;
      toast.error(detail ?? "Couldn't send friend request. Please try again.");
    }
  };

  const handleRespond = async (requestId: string, status: "accepted" | "rejected") => {
    try {
      await chatApi.respondToRequest(requestId, status, currentUserId);
      setRequests(prev => prev.filter(r => r.id !== requestId));
    } catch {
      // silently fail
    }
    refreshRequestCount();
  };

  const handleCancel = async (requestId: string) => {
    setSentRequests(prev => prev.filter(r => r.id !== requestId)); // optimistic
    try {
      await chatApi.cancelFriendRequest(requestId);
    } catch {
      loadRequests(); // restore on failure
    }
    refreshRequestCount();
  };

  const handleInlineRespond = async (studentId: string, status: "accepted" | "rejected") => {
    const student = results.find(s => s.user_id === studentId);
    if (!student?.request_id) return;
    try {
      await chatApi.respondToRequest(student.request_id, status, currentUserId);
      setResults(prev =>
        prev.map(s =>
          s.user_id === studentId
            ? { ...s, friend_status: status === "accepted" ? "friends" : "none" }
            : s
        )
      );
      loadRequests();
      refreshRequestCount();
    } catch {
      // silently fail
    }
    setRespondingId(null);
  };

  const getInitial = (name: string) =>
    (name?.trim()[0] ?? "?").toUpperCase();

  return (
    <div className="w-full pt-4 pb-8 px-4 animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-3 mb-5">
        <Link
          to="/messages"
          className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <h1 className="text-xl font-semibold text-gray-900 dark:text-white">Find Students</h1>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-5">
        {(["search", "requests"] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
              activeTab === tab
                ? "bg-primary-600 text-white"
                : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
            }`}
          >
            {tab === "search" ? "Search" : "Requests"}
            {tab === "requests" && requestCount > 0 && (
              <span className="w-5 h-5 bg-danger-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                {requestCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Search Tab */}
      {activeTab === "search" && (
        <div className="space-y-4">
          {/* Search input */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search by name or school..."
              className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>

          {/* Loading skeleton */}
          {loading && (
            <div className="space-y-3">
              {[1, 2, 3].map(i => (
                <Card key={i} noPadding className="p-4 flex items-center gap-3 animate-pulse">
                  <div className="w-12 h-12 rounded-full bg-gray-200 dark:bg-gray-700 flex-shrink-0" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-1/3" />
                    <div className="h-2.5 bg-gray-200 dark:bg-gray-700 rounded w-1/2" />
                  </div>
                  <div className="h-8 w-24 bg-gray-200 dark:bg-gray-700 rounded-xl" />
                </Card>
              ))}
            </div>
          )}

          {/* Results */}
          {!loading && query.trim() && results.length === 0 && (
            <div className="text-center py-12 text-gray-400 dark:text-gray-500">
              <Search className="w-10 h-10 mx-auto mb-3 opacity-40" />
              <p className="text-sm font-medium">No students found for that search</p>
            </div>
          )}

          {!loading && results.length > 0 && (
            <div className="space-y-3">
              <p className="text-xs text-gray-400 dark:text-gray-500 px-1">
                {results.length} of {total} students
              </p>
              {results.map(student => (
                <Card
                  key={student.user_id}
                  noPadding
                  className="p-4 flex items-center gap-3"
                >
                  {/* Avatar — uploaded photo (explicit or derived) with initials fallback */}
                  <UserAvatar
                    userId={student.user_id}
                    name={student.full_name}
                    src={student.avatar_url}
                    sizeClass="w-12 h-12 text-lg"
                  />

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm text-gray-900 dark:text-white truncate">
                      {student.full_name}
                    </p>
                    {student.school_name && (
                      <p className="text-xs text-gray-400 dark:text-gray-500 truncate mt-0.5">
                        {student.school_name}
                      </p>
                    )}
                    {(student.class_number || student.board) && (
                      <span className="inline-block mt-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-primary-50 dark:bg-primary-900/30 text-primary-600 dark:text-primary-300">
                        {[student.class_number ? `Class ${student.class_number}` : null, student.board].filter(Boolean).join(" · ")}
                      </span>
                    )}
                  </div>

                  {/* Action button */}
                  <div className="flex-shrink-0">
                    {student.friend_status === "none" && (
                      <button
                        onClick={() => handleSendRequest(student.user_id)}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-primary-600 dark:text-primary-400 border border-primary-300 dark:border-primary-600 rounded-xl hover:bg-primary-50 dark:hover:bg-primary-900/20 transition-colors"
                      >
                        <UserPlus className="w-3.5 h-3.5" />
                        Add Friend
                      </button>
                    )}
                    {student.friend_status === "pending_sent" && (
                      <button
                        disabled
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-gray-400 border border-gray-200 dark:border-gray-600 rounded-xl cursor-not-allowed"
                      >
                        <Clock className="w-3.5 h-3.5" />
                        Request Sent
                      </button>
                    )}
                    {student.friend_status === "friends" && (
                      <button
                        disabled
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-700 rounded-xl cursor-not-allowed"
                      >
                        <Check className="w-3.5 h-3.5" />
                        Friends
                      </button>
                    )}
                    {student.friend_status === "pending_received" && (
                      respondingId === student.user_id ? (
                        <div className="flex gap-1.5">
                          <button
                            onClick={() => handleInlineRespond(student.user_id, "accepted")}
                            className="px-2.5 py-1.5 text-xs font-semibold text-white bg-emerald-500 hover:bg-emerald-600 rounded-xl transition-colors"
                          >
                            Accept
                          </button>
                          <button
                            onClick={() => handleInlineRespond(student.user_id, "rejected")}
                            className="px-2.5 py-1.5 text-xs font-semibold text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-xl transition-colors"
                          >
                            Reject
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setRespondingId(student.user_id)}
                          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-700 rounded-xl hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors"
                        >
                          <UserCheck className="w-3.5 h-3.5" />
                          Respond
                        </button>
                      )
                    )}
                  </div>
                </Card>
              ))}

              {/* Load more (pagination) */}
              {hasMore && (
                <button
                  onClick={() => loadStudents(query.trim(), page + 1, true)}
                  disabled={loadingMore}
                  className="w-full py-2.5 text-sm font-semibold text-primary-600 dark:text-primary-400 border border-primary-200 dark:border-primary-700 rounded-xl hover:bg-primary-50 dark:hover:bg-primary-900/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loadingMore ? "Loading…" : "Load more"}
                </button>
              )}
            </div>
          )}

          {/* Placeholder — only when the directory itself is empty */}
          {!loading && !query.trim() && results.length === 0 && (
            <div className="text-center py-12 text-gray-300 dark:text-gray-600">
              <Search className="w-10 h-10 mx-auto mb-3 opacity-40" />
              <p className="text-sm">No students to show yet — try searching by name or school</p>
            </div>
          )}
        </div>
      )}

      {/* Requests Tab */}
      {activeTab === "requests" && (
        <div className="space-y-5">
          {/* Incoming requests */}
          <div className="space-y-3">
            {requests.length === 0 ? (
              <div className="text-center py-12 text-gray-400 dark:text-gray-500">
                <UserCheck className="w-10 h-10 mx-auto mb-3 opacity-40" />
                <p className="text-sm font-medium">No pending requests</p>
              </div>
            ) : (
              requests.map(req => {
                const subtitle = requestSubtitle(req);
                return (
                <Card
                  key={req.id}
                  noPadding
                  className="p-4 flex items-center gap-3"
                >
                  <div className="w-11 h-11 rounded-full bg-primary-600 flex items-center justify-center text-white font-semibold flex-shrink-0">
                    {getInitial(req.name)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="font-semibold text-sm text-gray-900 dark:text-white truncate">
                        {req.name}
                      </p>
                      {req.createdAt && (
                        <span className="text-[10px] text-gray-400 flex-shrink-0">{timeAgo(req.createdAt)}</span>
                      )}
                    </div>
                    {subtitle && (
                      <p className="text-xs text-gray-400 dark:text-gray-500 truncate mt-0.5">
                        {subtitle}
                      </p>
                    )}
                  </div>
                  <div className="flex gap-2 flex-shrink-0">
                    <button
                      onClick={() => handleRespond(req.id, "accepted")}
                      className="px-3 py-1.5 text-xs font-semibold text-white bg-success-600 hover:bg-success-700 rounded-xl transition-colors"
                    >
                      Confirm
                    </button>
                    <button
                      onClick={() => handleRespond(req.id, "rejected")}
                      className="px-3 py-1.5 text-xs font-semibold text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-xl transition-colors"
                    >
                      Delete
                    </button>
                  </div>
                </Card>
                );
              })
            )}
          </div>

          {/* Sent (outgoing) requests */}
          <div className="space-y-3">
            <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide px-1">
              Sent Requests
            </p>
            {sentRequests.length === 0 ? (
              <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-6">No sent requests</p>
            ) : (
              sentRequests.map(req => {
                const subtitle = requestSubtitle(req);
                return (
                <Card
                  key={req.id}
                  noPadding
                  className="p-4 flex items-center gap-3"
                >
                  <div className="w-11 h-11 rounded-full bg-primary-600 flex items-center justify-center text-white font-semibold flex-shrink-0">
                    {getInitial(req.name)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="font-semibold text-sm text-gray-900 dark:text-white truncate">
                        {req.name}
                      </p>
                      {req.createdAt && (
                        <span className="text-[10px] text-gray-400 flex-shrink-0">{timeAgo(req.createdAt)}</span>
                      )}
                    </div>
                    {subtitle && (
                      <p className="text-xs text-gray-400 dark:text-gray-500 truncate mt-0.5">
                        {subtitle}
                      </p>
                    )}
                  </div>
                  <button
                    onClick={() => handleCancel(req.id)}
                    className="px-3 py-1.5 text-xs font-semibold text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-xl transition-colors flex-shrink-0"
                  >
                    Cancel
                  </button>
                </Card>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
