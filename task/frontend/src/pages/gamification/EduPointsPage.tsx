import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import BackButton from "@/components/ui/BackButton";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import Tabs from "@/components/ui/Tabs";
import EmptyState from "@/components/ui/EmptyState";
import { Coins, History, Zap, CheckCircle2, AlertCircle, Snowflake, Youtube, Clock, XCircle } from "lucide-react";
import toast from "react-hot-toast";
import { gamificationApi } from "@/lib/api";
import { useAppSelector } from "@/store";
import { useLanguage } from "@/contexts/LanguageContext";

const CATEGORY_LABELS: Record<string, string> = {
  quiz:       "Quiz Packs",
  flashcards: "Flashcards",
  pyq:        "PYQ Collections",
  videos:     "Knowledge Videos",
  profile:    "Profile Customization",
};

const CATEGORY_ICONS: Record<string, string> = {
  quiz: "📚", flashcards: "🗂️", pyq: "📝", videos: "🎬", profile: "✨",
};

export default function EduPointsPage() {
  const { t } = useLanguage();
  const userId = useAppSelector((s) => s.auth.user?.id ?? "");
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState<"shop" | "history">("shop");
  const [activeCategory, setActiveCategory] = useState("all");

  const { data: balanceData } = useQuery({
    queryKey: ["ep-balance", userId],
    queryFn: () => gamificationApi.eduPointsBalance(userId).then((r) => r.data),
    enabled: !!userId,
  });

  const { data: shopItems = [] } = useQuery({
    queryKey: ["ep-shop", userId],
    queryFn: () => gamificationApi.eduPointsShop(userId).then((r) => r.data),
    enabled: !!userId && activeTab === "shop",
  });

  const { data: history = [] } = useQuery({
    queryKey: ["ep-history", userId],
    queryFn: () => gamificationApi.eduPointsHistory(userId).then((r) => r.data),
    enabled: !!userId && activeTab === "history",
  });

  const spendMutation = useMutation({
    mutationFn: (item: string) => gamificationApi.spendEduPoints(userId, item).then((r) => r.data),
    onSuccess: (data) => {
      toast.success(data.message ?? "Item unlocked!");
      qc.invalidateQueries({ queryKey: ["ep-balance", userId] });
      qc.invalidateQueries({ queryKey: ["ep-shop", userId] });
    },
    onError: (err: any) => toast.error(err.response?.data?.detail ?? "Purchase failed"),
  });

  const { data: freezeStatus, refetch: refetchFreeze } = useQuery({
    queryKey: ["streak-freeze-status", userId],
    queryFn: () => gamificationApi.getStreakFreezeStatus(userId).then((r) => r.data),
    enabled: !!userId,
  });

  const { data: ytClaim, refetch: refetchYtClaim } = useQuery({
    queryKey: ["yt-claim-status", userId],
    queryFn: () => gamificationApi.ytClaimStatus(userId).then((r) => r.data),
    enabled: !!userId,
  });

  const [ytFile, setYtFile] = useState<File | null>(null);
  const ytSubmitMutation = useMutation({
    mutationFn: async () => {
      if (!ytFile) throw new Error("No screenshot selected");
      const b64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = reject;
        reader.readAsDataURL(ytFile);
      });
      return gamificationApi.ytSubmitClaim(userId, b64).then((r) => r.data);
    },
    onSuccess: () => {
      toast.success("Claim submitted! Awaiting admin review.");
      setYtFile(null);
      refetchYtClaim();
    },
    onError: (err: any) => toast.error(err.response?.data?.detail ?? "Couldn't submit claim"),
  });

  const buyFreezeMutation = useMutation({
    mutationFn: () => gamificationApi.purchaseStreakFreeze(userId).then((r) => r.data),
    onSuccess: (data) => {
      toast.success(`Streak Freeze purchased! You now have ${data.freeze_count} shield${data.freeze_count !== 1 ? "s" : ""} banked.`);
      qc.invalidateQueries({ queryKey: ["ep-balance", userId] });
      refetchFreeze();
    },
    onError: (err: any) => toast.error(err.response?.data?.detail ?? "Purchase failed"),
  });

  const balance = balanceData?.balance ?? 0;
  const categories = ["all", ...Object.keys(CATEGORY_LABELS)];
  const filteredItems = activeCategory === "all"
    ? shopItems
    : shopItems.filter((i: any) => i.category === activeCategory);

  return (
    <div className="w-full space-y-6">
      <BackButton label="Back" />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-3">
            <Coins className="text-warning-500 w-7 h-7 shrink-0" /> {t("edupoints")}
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Earn points by learning. Spend them on premium content and perks.
          </p>
        </div>

        {/* Balance card */}
        <Card className="text-center px-4 sm:px-6 py-4 border-warning-100 dark:border-warning-900/40 bg-warning-50 dark:bg-warning-900/10">
          <div className="text-3xl font-bold text-warning-700 dark:text-warning-300">{balance.toLocaleString()}</div>
          <div className="text-xs font-semibold uppercase tracking-wide text-warning-600 dark:text-warning-400">{t("yourBalance")}</div>
          <div className="text-xs text-gray-500 dark:text-gray-400 mt-1 break-words">
            {balanceData?.total_earned ?? 0} earned · {balanceData?.total_spent ?? 0} spent
          </div>
        </Card>
      </div>

      {/* Earning guide */}
      <Card>
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
          <Zap className="w-4 h-4 text-warning-500" /> {t("howToEarn")}
        </h2>
        <div className="grid grid-cols-1 xs:grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 text-sm">
          {[
            ["Daily Login", "+1"],
            ["Watch Video (100%)", "+3"],
            ["Complete Quiz", "+5"],
            ["Quiz Score >80%", "+10"],
            ["Quiz Score 100%", "+15"],
            ["Solo Battle Win", "+10"],
            ["Class Battle Win", "+50"],
            ["School Battle Win", "+75"],
            ["7 Day Streak", "+50"],
            ["30 Day Streak", "+150"],
            ["Refer a Friend", "+250"],
            ["YouTube Subscribe", "+500"],
          ].map(([label, pts]) => (
            <div key={label} className="flex justify-between items-center gap-2 bg-gray-50 dark:bg-gray-900/60 rounded-xl px-3 py-2 min-w-0">
              <span className="text-gray-600 dark:text-gray-300 truncate min-w-0">{label}</span>
              <span className="font-semibold text-warning-600 dark:text-warning-400 flex-shrink-0">{pts}</span>
            </div>
          ))}
        </div>
      </Card>

      {/* Tabs */}
      <Tabs
        tabs={[
          { key: "shop", label: "Shop" },
          { key: "history", label: "History" },
        ]}
        active={activeTab}
        onChange={(key) => setActiveTab(key as "shop" | "history")}
      />

      {/* Shop */}
      {activeTab === "shop" && (
        <div className="space-y-6">

          {/* Streak Freeze purchase card */}
          <Card className="flex flex-col sm:flex-row sm:items-center gap-4 border-l-4 border-l-primary-500">
            <div className="flex items-center gap-4 flex-1 min-w-0">
              <div className="w-12 h-12 rounded-xl bg-info-50 dark:bg-info-900/30 flex items-center justify-center flex-shrink-0">
                <Snowflake className="w-6 h-6 text-info-600 dark:text-info-400" />
              </div>
              <div className="min-w-0">
                <div className="font-semibold text-gray-900 dark:text-white text-base">Streak Freeze Shield</div>
                <div className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                  Automatically protects your streak when you miss a day. Bank up to 3.
                </div>
                {freezeStatus && (
                  <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2 text-xs text-gray-500 dark:text-gray-400">
                    <span>Banked: <span className="font-semibold text-gray-800 dark:text-gray-200">{freezeStatus.freeze_count}/{freezeStatus.max_bank}</span></span>
                    <span className="hidden xs:inline">·</span>
                    <span>Cost: <span className="font-semibold text-warning-600 dark:text-warning-400">{freezeStatus.cost_ep} EP</span></span>
                    <span className="hidden xs:inline">·</span>
                    <span>Balance: <span className="font-semibold text-gray-800 dark:text-gray-200">{freezeStatus.ep_balance} EP</span></span>
                  </div>
                )}
              </div>
            </div>
            <Button
              onClick={() => buyFreezeMutation.mutate()}
              disabled={
                buyFreezeMutation.isPending ||
                (freezeStatus && !freezeStatus.can_purchase)
              }
              isLoading={buyFreezeMutation.isPending}
              className="flex-shrink-0"
            >
              <Snowflake className="w-4 h-4" />
              {buyFreezeMutation.isPending
                ? "Buying..."
                : freezeStatus?.freeze_count >= freezeStatus?.max_bank
                ? "Max banked"
                : `Buy for ${freezeStatus?.cost_ep ?? 50} EP`}
            </Button>
          </Card>

          {/* YouTube Subscribe claim card — one-time, admin-reviewed */}
          <Card className="flex flex-col sm:flex-row sm:items-center gap-4 border-l-4 border-l-danger-500">
            <div className="flex items-center gap-4 flex-1 min-w-0">
              <div className="w-12 h-12 rounded-xl bg-danger-50 dark:bg-danger-900/30 flex items-center justify-center flex-shrink-0">
                <Youtube className="w-6 h-6 text-danger-600 dark:text-danger-400" />
              </div>
              <div className="min-w-0">
                <div className="font-semibold text-gray-900 dark:text-white text-base">Subscribe on YouTube · +500 EP</div>
                <div className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                  Subscribe to our channel and upload a screenshot as proof. One-time reward, admin-reviewed.
                </div>
                {ytClaim?.status === "approved" && (
                  <div className="flex items-center gap-1.5 mt-2 text-sm font-semibold text-success-600 dark:text-success-400">
                    <CheckCircle2 className="w-4 h-4" /> Approved — 500 EP credited
                  </div>
                )}
                {ytClaim?.status === "pending" && (
                  <div className="flex items-center gap-1.5 mt-2 text-sm font-semibold text-warning-600 dark:text-warning-400">
                    <Clock className="w-4 h-4" /> Pending review
                  </div>
                )}
                {ytClaim?.status === "rejected" && (
                  <div className="flex items-center gap-1.5 mt-2 text-sm font-semibold text-danger-600 dark:text-danger-400">
                    <XCircle className="w-4 h-4" /> Rejected{ytClaim.review_note ? ` — ${ytClaim.review_note}` : ""}
                  </div>
                )}
              </div>
            </div>
            {(!ytClaim?.status || ytClaim.status === "rejected") && (
              <div className="flex items-center gap-2 flex-shrink-0">
                <input
                  type="file"
                  accept="image/*"
                  id="yt-screenshot-input"
                  className="hidden"
                  onChange={(e) => setYtFile(e.target.files?.[0] ?? null)}
                />
                <label
                  htmlFor="yt-screenshot-input"
                  className="text-xs font-medium text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 cursor-pointer hover:border-primary-400 truncate max-w-[140px]"
                >
                  {ytFile ? ytFile.name : "Choose screenshot"}
                </label>
                <Button
                  onClick={() => ytSubmitMutation.mutate()}
                  disabled={!ytFile || ytSubmitMutation.isPending}
                  isLoading={ytSubmitMutation.isPending}
                >
                  Submit
                </Button>
              </div>
            )}
          </Card>

          {/* Category filter */}
          <div className="flex flex-wrap gap-2">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                  activeCategory === cat
                    ? "bg-primary-600 text-white"
                    : "bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
                }`}
              >
                {cat === "all" ? "All" : `${CATEGORY_ICONS[cat] ?? ""} ${CATEGORY_LABELS[cat]}`}
              </button>
            ))}
          </div>

          {/* Items grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {filteredItems.map((item: any) => (
              <Card
                key={item.key}
                className={`flex flex-col gap-3 transition-colors ${
                  item.owned
                    ? "border-success-200 dark:border-success-900/40 opacity-70"
                    : "hover:border-primary-300 dark:hover:border-primary-700"
                }`}
              >
                <div className="flex justify-between items-start gap-2">
                  <div className="min-w-0">
                    <div className="text-xs text-gray-400 uppercase tracking-wide mb-1 truncate">
                      {CATEGORY_ICONS[item.category]} {CATEGORY_LABELS[item.category] ?? item.category}
                    </div>
                    <div className="font-semibold text-gray-900 dark:text-white break-words">{item.name}</div>
                  </div>
                  {item.owned && <CheckCircle2 className="w-5 h-5 text-success-500 shrink-0" />}
                </div>

                <div className="flex items-center justify-between gap-2 flex-wrap mt-auto">
                  <span className="flex items-center gap-1 text-warning-600 dark:text-warning-400 font-semibold text-lg flex-shrink-0">
                    <Coins className="w-4 h-4" /> {item.cost}
                  </span>
                  {item.owned ? (
                    <Badge variant="success">Owned</Badge>
                  ) : (
                    <Button
                      size="sm"
                      onClick={() => spendMutation.mutate(item.key)}
                      disabled={balance < item.cost || spendMutation.isPending}
                      className="max-w-full"
                    >
                      {balance < item.cost ? (
                        <span className="flex items-center gap-1 min-w-0">
                          <AlertCircle className="w-3 h-3 shrink-0" /> <span className="truncate">Need {item.cost - balance} more</span>
                        </span>
                      ) : "Unlock"}
                    </Button>
                  )}
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* History */}
      {activeTab === "history" && (
        <div className="space-y-2">
          {history.length === 0 && (
            <EmptyState icon={History} title={t("noData")} />
          )}
          {history.map((tx: any) => (
            <Card
              key={tx.id}
              className="flex items-center justify-between gap-3 px-3 sm:px-5 py-3"
            >
              <div className="min-w-0">
                <div className="font-medium text-gray-900 dark:text-white capitalize truncate">
                  {tx.event ? tx.event.replace(/_/g, " ") : `Spent on ${tx.item_key?.replace(/_/g, " ")}`}
                </div>
                <div className="text-xs text-gray-400 break-words">
                  {new Date(tx.created_at).toLocaleString()} · Balance after: {tx.balance_after}
                </div>
              </div>
              <span
                className={`font-semibold text-lg flex-shrink-0 ${
                  tx.points > 0 ? "text-success-600 dark:text-success-400" : "text-danger-600 dark:text-danger-400"
                }`}
              >
                {tx.points > 0 ? `+${tx.points}` : tx.points}
              </span>
            </Card>
          ))}
        </div>
      )}

    </div>
  );
}
