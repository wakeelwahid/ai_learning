import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
  ActivityIndicator,
  Alert,
  Dimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Toast from "react-native-toast-message";
import * as ImagePicker from "expo-image-picker";
import { useAppSelector } from "@/store";
import { palette, semantic } from "@/theme/colors";
import { EmptyState } from "@/components/ui";
import {
  getEduPointsBalance,
  getEduPointsShop,
  getEduPointsHistory,
  spendEduPoints,
  getStreakFreezeStatus,
  purchaseStreakFreeze,
  ytClaimStatus,
  ytSubmitClaim,
} from "@/api/gamification";

const { width } = Dimensions.get("window");
const CARD_GAP = 12;
// Narrow screens (<320px) can't fit two readable item cards side by side, so
// fall back to a single column there.
const COLS = width < 320 ? 1 : 2;
const CARD_W = (width - 32 - CARD_GAP * (COLS - 1)) / COLS;

// ─── Category metadata (mirrors frontend/src/pages/gamification/EduPointsPage.tsx) ──

const CATEGORY_LABELS: Record<string, string> = {
  quiz: "Quiz Packs",
  flashcards: "Flashcards",
  pyq: "PYQ Collections",
  videos: "Knowledge Videos",
  profile: "Profile Customization",
};

const CATEGORY_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  quiz: "help-circle",
  flashcards: "albums",
  pyq: "document-text",
  videos: "play-circle",
  profile: "sparkles",
};

type Tab = "shop" | "history";

// ─── Earning guide (mirrors frontend/src/pages/gamification/EduPointsPage.tsx) ────

const EARN_WAYS: {
  label: string;
  pts: string;
  icon: keyof typeof Ionicons.glyphMap;
}[] = [
  { label: "Daily Login", pts: "+1", icon: "calendar" },
  { label: "Watch Video (100%)", pts: "+3", icon: "play-circle" },
  { label: "Complete Quiz", pts: "+5", icon: "help-circle" },
  { label: "Quiz Score >80%", pts: "+10", icon: "trending-up" },
  { label: "Quiz Score 100%", pts: "+15", icon: "star" },
  { label: "Solo Battle Win", pts: "+10", icon: "flash" },
  { label: "Class Battle Win", pts: "+50", icon: "people" },
  { label: "School Battle Win", pts: "+75", icon: "school" },
  { label: "7 Day Streak", pts: "+50", icon: "flame" },
  { label: "30 Day Streak", pts: "+150", icon: "trophy" },
  { label: "Refer a Friend", pts: "+250", icon: "gift" },
  { label: "YouTube Subscribe", pts: "+500", icon: "logo-youtube" },
];

// ─── Small pieces ─────────────────────────────────────────────────────────────

function StatusBadge({ owned, canAfford }: { owned: boolean; canAfford: boolean }) {
  if (owned) {
    return (
      <View style={[styles.badge, { backgroundColor: semantic.success.bg }]}>
        <Ionicons name="checkmark-circle" size={12} color={semantic.success.solid} />
        <Text style={[styles.badgeTxt, { color: semantic.success.solid }]}>Owned</Text>
      </View>
    );
  }
  if (canAfford) {
    return (
      <View style={[styles.badge, { backgroundColor: palette.primary50 }]}>
        <Ionicons name="cart" size={12} color={palette.primary600} />
        <Text style={[styles.badgeTxt, { color: palette.primary600 }]}>Available</Text>
      </View>
    );
  }
  return (
    <View style={[styles.badge, { backgroundColor: palette.gray100 }]}>
      <Ionicons name="lock-closed" size={12} color={palette.gray400} />
      <Text style={[styles.badgeTxt, { color: palette.gray400 }]}>Locked</Text>
    </View>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function EduPointsShopScreen() {
  const navigation = useNavigation<any>();
  const user = useAppSelector((s) => s.auth.user);
  const userId = (user as any)?.id ?? (user as any)?.user_id ?? "";
  const queryClient = useQueryClient();

  const [tab, setTab] = useState<Tab>("shop");
  const [activeCategory, setActiveCategory] = useState("all");
  const [purchasingKey, setPurchasingKey] = useState<string | null>(null);

  // ── Queries ─────────────────────────────────────────────────────────────────

  const {
    data: balanceData,
    isLoading: balanceLoading,
  } = useQuery({
    queryKey: ["ep-balance", userId],
    queryFn: () => getEduPointsBalance(userId).then((r) => r.data),
    enabled: !!userId,
    staleTime: 30_000,
  });

  const {
    data: shopItems = [],
    isLoading: shopLoading,
  } = useQuery({
    queryKey: ["ep-shop", userId],
    queryFn: () => getEduPointsShop(userId).then((r) => r.data),
    enabled: !!userId,
    staleTime: 30_000,
  });

  const {
    data: history = [],
    isLoading: historyLoading,
  } = useQuery({
    queryKey: ["ep-history", userId],
    queryFn: () => getEduPointsHistory(userId, 50).then((r) => r.data),
    enabled: !!userId && tab === "history",
    staleTime: 15_000,
  });

  const {
    data: freezeStatus,
    isLoading: freezeLoading,
  } = useQuery({
    queryKey: ["streak-freeze-status", userId],
    queryFn: () => getStreakFreezeStatus(userId).then((r) => r.data),
    enabled: !!userId,
    staleTime: 15_000,
  });

  // ── Mutations ───────────────────────────────────────────────────────────────

  const spendMutation = useMutation({
    mutationFn: (item: string) => spendEduPoints(userId, item).then((r) => r.data),
    onSuccess: (data) => {
      Toast.show({
        type: "success",
        text1: "Purchase successful!",
        text2: data?.message ?? "Item unlocked.",
      });
      queryClient.invalidateQueries({ queryKey: ["ep-balance", userId] });
      queryClient.invalidateQueries({ queryKey: ["ep-shop", userId] });
      queryClient.invalidateQueries({ queryKey: ["ep-history", userId] });
    },
    onError: (err: any) => {
      Toast.show({
        type: "error",
        text1: "Purchase failed",
        text2: err?.response?.data?.detail ?? "Please try again.",
      });
    },
    onSettled: () => setPurchasingKey(null),
  });

  const freezeMutation = useMutation({
    mutationFn: () => purchaseStreakFreeze(userId).then((r) => r.data),
    onSuccess: (data) => {
      const count = data?.freeze_count ?? 0;
      Toast.show({
        type: "success",
        text1: "Streak Freeze purchased!",
        text2: `You now have ${count} shield${count === 1 ? "" : "s"} banked.`,
      });
      queryClient.invalidateQueries({ queryKey: ["ep-balance", userId] });
      queryClient.invalidateQueries({ queryKey: ["streak-freeze-status", userId] });
    },
    onError: (err: any) => {
      Toast.show({
        type: "error",
        text1: "Purchase failed",
        text2: err?.response?.data?.detail ?? "Please try again.",
      });
    },
  });

  const { data: ytClaim, isLoading: ytClaimLoading } = useQuery({
    queryKey: ["yt-claim-status", userId],
    queryFn: () => ytClaimStatus(userId).then((r) => r.data),
    enabled: !!userId,
    staleTime: 15_000,
  });

  const ytSubmitMutation = useMutation({
    mutationFn: (b64: string) => ytSubmitClaim(userId, b64).then((r) => r.data),
    onSuccess: () => {
      Toast.show({ type: "success", text1: "Claim submitted!", text2: "Awaiting admin review." });
      queryClient.invalidateQueries({ queryKey: ["yt-claim-status", userId] });
    },
    onError: (err: any) => {
      Toast.show({
        type: "error",
        text1: "Couldn't submit claim",
        text2: err?.response?.data?.detail ?? "Please try again.",
      });
    },
  });

  const pickYoutubeScreenshot = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Toast.show({ type: "error", text1: "Permission needed", text2: "Allow photo access in Settings to upload a screenshot." });
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7,
      base64: true,
    });
    if (result.canceled || !result.assets?.[0]?.base64) return;
    const asset = result.assets[0];
    const mime = asset.mimeType ?? "image/jpeg";
    ytSubmitMutation.mutate(`data:${mime};base64,${asset.base64}`);
  };

  // ── Derived data ────────────────────────────────────────────────────────────

  const balance: number = balanceData?.balance ?? 0;
  const totalEarned: number = balanceData?.total_earned ?? 0;
  const totalSpent: number = balanceData?.total_spent ?? 0;

  const categories = ["all", ...Object.keys(CATEGORY_LABELS)];
  const filteredItems =
    activeCategory === "all"
      ? shopItems
      : shopItems.filter((i: any) => i.category === activeCategory);

  const freezeCount: number = freezeStatus?.freeze_count ?? 0;
  const freezeMax: number = freezeStatus?.max_bank ?? 3;
  const freezeCost: number = freezeStatus?.cost_ep ?? 50;
  const freezeAtCapacity = freezeCount >= freezeMax;
  const canBuyFreeze = freezeStatus?.can_purchase ?? (!freezeAtCapacity && balance >= freezeCost);

  // ── Handlers ─────────────────────────────────────────────────────────────────

  const confirmPurchase = (item: any) => {
    Alert.alert(
      "Confirm Purchase",
      `Spend ${item.cost} EduPoints to unlock "${item.name}"?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Purchase",
          onPress: () => {
            setPurchasingKey(item.key);
            spendMutation.mutate(item.key);
          },
        },
      ]
    );
  };

  const confirmFreezePurchase = () => {
    Alert.alert(
      "Buy Streak Freeze Shield",
      `Spend ${freezeCost} EduPoints to bank a shield? It auto-protects your streak the next time you miss a day.`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Buy", onPress: () => freezeMutation.mutate() },
      ]
    );
  };

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" />

      {/* Header */}
      <View style={[styles.header, { backgroundColor: palette.primary600 }]}>
        <View style={styles.headerTop}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={22} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>EduPoints Shop</Text>
          <View style={{ width: 36 }} />
        </View>

        {/* Balance card */}
        <View style={styles.balanceCard}>
          <Ionicons name="diamond" size={26} color={palette.warning500} />
          {balanceLoading ? (
            <ActivityIndicator color="#fff" style={{ marginVertical: 6 }} />
          ) : (
            <Text
              style={styles.balanceValue}
              numberOfLines={1}
              adjustsFontSizeToFit
            >
              {balance.toLocaleString()}
            </Text>
          )}
          <Text style={styles.balanceLabel}>Your Balance</Text>
          <Text style={styles.balanceSub}>
            {totalEarned.toLocaleString()} earned · {totalSpent.toLocaleString()} spent
          </Text>
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* How to Earn EduPoints */}
        <View style={styles.section}>
          <View style={styles.earnCard}>
            <View style={styles.earnHeaderRow}>
              <Ionicons name="flash" size={16} color={semantic.warning.solid} />
              <Text style={styles.earnTitle}>How to Earn EduPoints</Text>
            </View>
            <View style={styles.earnGrid}>
              {EARN_WAYS.map((way) => (
                <View key={way.label} style={styles.earnItem}>
                  <View style={styles.earnIconWrap}>
                    <Ionicons name={way.icon} size={14} color={palette.primary600} />
                  </View>
                  <Text style={styles.earnLabel} numberOfLines={2}>
                    {way.label}
                  </Text>
                  <Text style={styles.earnPts}>{way.pts}</Text>
                </View>
              ))}
            </View>
          </View>
        </View>

        {/* Streak Freeze card */}
        <View style={styles.section}>
          <View style={styles.freezeCard}>
            <View style={styles.freezeIconWrap}>
              <Ionicons name="snow" size={24} color={semantic.info.solid} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.freezeTitle}>Streak Freeze Shield</Text>
              <Text style={styles.freezeDesc}>
                Auto-protects your streak when you miss a day. Bank up to {freezeMax}.
              </Text>
              {freezeLoading ? (
                <ActivityIndicator color={semantic.info.solid} style={{ marginTop: 8, alignSelf: "flex-start" }} />
              ) : (
                <View style={styles.freezeMetaRow}>
                  <Text style={styles.freezeMetaTxt}>
                    Banked: <Text style={styles.freezeMetaBold}>{freezeCount}/{freezeMax}</Text>
                  </Text>
                  <Text style={styles.freezeMetaDot}>·</Text>
                  <Text style={styles.freezeMetaTxt}>
                    Cost: <Text style={[styles.freezeMetaBold, { color: semantic.warning.solid }]}>{freezeCost} EP</Text>
                  </Text>
                </View>
              )}
              <TouchableOpacity
                style={[
                  styles.freezeBtn,
                  (freezeAtCapacity || !canBuyFreeze || freezeMutation.isPending) &&
                    styles.freezeBtnDisabled,
                ]}
                disabled={freezeAtCapacity || !canBuyFreeze || freezeMutation.isPending}
                onPress={confirmFreezePurchase}
                activeOpacity={0.85}
              >
                {freezeMutation.isPending ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <>
                    <Ionicons name="snow" size={14} color="#fff" style={{ marginRight: 6 }} />
                    <Text style={styles.freezeBtnTxt}>
                      {freezeAtCapacity ? "Max Banked" : `Buy Shield (${freezeCost} EP)`}
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* YouTube Subscribe claim card — one-time, admin-reviewed */}
        <View style={styles.section}>
          <View style={styles.freezeCard}>
            <View style={[styles.freezeIconWrap, { backgroundColor: semantic.danger.bg }]}>
              <Ionicons name="logo-youtube" size={24} color={semantic.danger.solid} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.freezeTitle}>Subscribe on YouTube · +500 EP</Text>
              <Text style={styles.freezeDesc}>
                Subscribe to our channel and upload a screenshot as proof. One-time reward, admin-reviewed.
              </Text>
              {ytClaimLoading ? (
                <ActivityIndicator color={semantic.danger.solid} style={{ marginTop: 8, alignSelf: "flex-start" }} />
              ) : ytClaim?.status === "approved" ? (
                <View style={styles.ytStatusRow}>
                  <Ionicons name="checkmark-circle" size={14} color={semantic.success.solid} />
                  <Text style={[styles.ytStatusTxt, { color: semantic.success.solid }]}>Approved — 500 EP credited</Text>
                </View>
              ) : ytClaim?.status === "pending" ? (
                <View style={styles.ytStatusRow}>
                  <Ionicons name="time" size={14} color={semantic.warning.solid} />
                  <Text style={[styles.ytStatusTxt, { color: semantic.warning.solid }]}>Pending review</Text>
                </View>
              ) : (
                <>
                  {ytClaim?.status === "rejected" && (
                    <View style={styles.ytStatusRow}>
                      <Ionicons name="close-circle" size={14} color={semantic.danger.solid} />
                      <Text style={[styles.ytStatusTxt, { color: semantic.danger.solid }]}>
                        Rejected{ytClaim.review_note ? ` — ${ytClaim.review_note}` : ""}
                      </Text>
                    </View>
                  )}
                  <TouchableOpacity
                    style={[styles.freezeBtn, { backgroundColor: semantic.danger.solid }, ytSubmitMutation.isPending && styles.freezeBtnDisabled]}
                    disabled={ytSubmitMutation.isPending}
                    onPress={pickYoutubeScreenshot}
                    activeOpacity={0.85}
                  >
                    {ytSubmitMutation.isPending ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <>
                        <Ionicons name="image" size={14} color="#fff" style={{ marginRight: 6 }} />
                        <Text style={styles.freezeBtnTxt}>Upload Screenshot</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </>
              )}
            </View>
          </View>
        </View>

        {/* Tabs */}
        <View style={styles.tabRow}>
          {(["shop", "history"] as Tab[]).map((tKey) => (
            <TouchableOpacity
              key={tKey}
              onPress={() => setTab(tKey)}
              style={[styles.tabBtn, tab === tKey && styles.tabBtnActive]}
              activeOpacity={0.8}
            >
              <Ionicons
                name={tKey === "shop" ? "bag-handle" : "time"}
                size={15}
                color={tab === tKey ? "#fff" : palette.gray500}
                style={{ marginRight: 6 }}
              />
              <Text style={[styles.tabTxt, tab === tKey && styles.tabTxtActive]}>
                {tKey === "shop" ? "Shop" : "History"}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Shop tab */}
        {tab === "shop" && (
          <View style={styles.section}>
            {/* Category filter */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={{ marginBottom: 14 }}
              contentContainerStyle={{ gap: 8 }}
            >
              {categories.map((cat) => (
                <TouchableOpacity
                  key={cat}
                  onPress={() => setActiveCategory(cat)}
                  style={[styles.chip, activeCategory === cat && styles.chipActive]}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.chipTxt, activeCategory === cat && styles.chipTxtActive]}>
                    {cat === "all" ? "All" : CATEGORY_LABELS[cat]}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {shopLoading && (
              <ActivityIndicator color={palette.primary600} style={{ marginTop: 24 }} />
            )}

            {!shopLoading && filteredItems.length === 0 && (
              <EmptyState
                icon="bag-outline"
                title="No shop items available"
                description="Check back later for new items to unlock"
              />
            )}

            {!shopLoading && filteredItems.length > 0 && (
              <View style={styles.grid}>
                {filteredItems.map((item: any) => {
                  const owned = !!item.owned;
                  const canAfford = balance >= item.cost;
                  const isPurchasing =
                    spendMutation.isPending && purchasingKey === item.key;
                  return (
                    <View
                      key={item.key}
                      style={[
                        styles.itemCard,
                        owned && styles.itemCardOwned,
                        !owned && !canAfford && styles.itemCardLocked,
                      ]}
                    >
                      <View style={styles.itemHeaderRow}>
                        <View style={styles.itemCatIconWrap}>
                          <Ionicons
                            name={CATEGORY_ICONS[item.category] ?? "pricetag"}
                            size={16}
                            color={palette.primary600}
                          />
                        </View>
                        <StatusBadge owned={owned} canAfford={canAfford} />
                      </View>

                      <Text style={styles.itemCat}>
                        {CATEGORY_LABELS[item.category] ?? item.category}
                      </Text>
                      <Text style={styles.itemName} numberOfLines={2}>
                        {item.name}
                      </Text>

                      <View style={styles.itemFooterRow}>
                        <View style={styles.itemCostRow}>
                          <Ionicons name="diamond" size={14} color={semantic.warning.solid} />
                          <Text style={styles.itemCost}>{item.cost}</Text>
                        </View>

                        {owned ? (
                          <Text style={styles.ownedTxt}>Owned</Text>
                        ) : (
                          <TouchableOpacity
                            style={[styles.buyBtn, !canAfford && styles.buyBtnDisabled]}
                            disabled={!canAfford || spendMutation.isPending}
                            onPress={() => confirmPurchase(item)}
                            activeOpacity={0.85}
                          >
                            {isPurchasing ? (
                              <ActivityIndicator size="small" color="#fff" />
                            ) : (
                              <Text
                                style={[
                                  styles.buyBtnTxt,
                                  !canAfford && styles.buyBtnTxtDisabled,
                                ]}
                              >
                                {canAfford ? "Unlock" : "Need more"}
                              </Text>
                            )}
                          </TouchableOpacity>
                        )}
                      </View>
                    </View>
                  );
                })}
              </View>
            )}
          </View>
        )}

        {/* History tab */}
        {tab === "history" && (
          <View style={[styles.section, { marginBottom: 32 }]}>
            {historyLoading && (
              <ActivityIndicator color={palette.primary600} style={{ marginTop: 24 }} />
            )}

            {!historyLoading && history.length === 0 && (
              <EmptyState
                icon="receipt-outline"
                title="No transactions yet"
                description="Your EduPoints activity will show up here"
              />
            )}

            {!historyLoading &&
              history.map((tx: any) => {
                const isPositive = tx.points > 0;
                const label = tx.event
                  ? tx.event.replace(/_/g, " ")
                  : `Spent on ${(tx.item_key ?? "item").replace(/_/g, " ")}`;
                return (
                  <View key={tx.id} style={styles.historyRow}>
                    <View
                      style={[
                        styles.historyIconWrap,
                        { backgroundColor: isPositive ? semantic.success.bg : semantic.danger.bg },
                      ]}
                    >
                      <Ionicons
                        name={isPositive ? "add" : "remove"}
                        size={16}
                        color={isPositive ? semantic.success.solid : semantic.danger.solid}
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.historyLabel} numberOfLines={1}>
                        {label.charAt(0).toUpperCase() + label.slice(1)}
                      </Text>
                      <Text style={styles.historyMeta}>
                        {new Date(tx.created_at).toLocaleString()} · Balance: {tx.balance_after}
                      </Text>
                    </View>
                    <Text
                      style={[
                        styles.historyAmount,
                        { color: isPositive ? semantic.success.solid : semantic.danger.solid },
                      ]}
                    >
                      {isPositive ? `+${tx.points}` : tx.points}
                    </Text>
                  </View>
                );
              })}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: palette.gray50 },
  scroll: { flex: 1 },
  content: { paddingBottom: 24 },

  // Header
  header: { paddingTop: 8, paddingBottom: 20, paddingHorizontal: 16 },
  headerTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: { fontSize: 16, fontWeight: "700", color: "#fff" },

  balanceCard: {
    backgroundColor: "rgba(255,255,255,0.12)",
    borderRadius: 18,
    paddingVertical: 18,
    alignItems: "center",
  },
  balanceValue: { fontSize: 30, fontWeight: "800", color: "#fff", marginTop: 4 },
  balanceLabel: { fontSize: 12, fontWeight: "600", color: "rgba(255,255,255,0.85)", marginTop: 2 },
  balanceSub: { fontSize: 11, color: "rgba(255,255,255,0.65)", marginTop: 4 },

  // Sections
  section: { paddingHorizontal: 16, marginTop: 18 },

  // How to Earn
  earnCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 16,
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
  },
  earnHeaderRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 12 },
  earnTitle: { fontSize: 14, fontWeight: "800", color: palette.gray900 },
  earnGrid: { flexDirection: "row", flexWrap: "wrap", gap: CARD_GAP },
  earnItem: {
    width: CARD_W,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: palette.gray50,
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 10,
    gap: 8,
  },
  earnIconWrap: {
    width: 26,
    height: 26,
    borderRadius: 8,
    backgroundColor: palette.primary50,
    alignItems: "center",
    justifyContent: "center",
  },
  earnLabel: { flex: 1, fontSize: 11, fontWeight: "600", color: palette.gray700 },
  earnPts: { fontSize: 12, fontWeight: "800", color: semantic.warning.solid },

  // Streak Freeze
  freezeCard: {
    flexDirection: "row",
    gap: 12,
    backgroundColor: semantic.info.bg,
    borderWidth: 1,
    borderColor: semantic.info.border,
    borderRadius: 18,
    padding: 16,
  },
  freezeIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: semantic.info.bg,
    alignItems: "center",
    justifyContent: "center",
  },
  freezeTitle: { fontSize: 14, fontWeight: "800", color: semantic.info.text },
  freezeDesc: { fontSize: 12, color: semantic.info.solid, marginTop: 3, lineHeight: 17 },
  freezeMetaRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 8 },
  freezeMetaTxt: { fontSize: 12, color: semantic.info.text },
  freezeMetaBold: { fontWeight: "800", color: semantic.info.text },
  freezeMetaDot: { color: semantic.info.border },
  freezeBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: semantic.info.solid,
    borderRadius: 12,
    paddingVertical: 10,
    marginTop: 12,
    alignSelf: "flex-start",
    paddingHorizontal: 16,
  },
  freezeBtnDisabled: { backgroundColor: palette.gray300 },
  freezeBtnTxt: { color: "#fff", fontSize: 13, fontWeight: "700" },

  ytStatusRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 10 },
  ytStatusTxt: { fontSize: 12.5, fontWeight: "700" },

  // Tabs
  tabRow: {
    flexDirection: "row",
    marginHorizontal: 16,
    marginTop: 18,
    backgroundColor: palette.gray100,
    borderRadius: 12,
    padding: 4,
  },
  tabBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 9,
    borderRadius: 9,
  },
  tabBtnActive: { backgroundColor: palette.primary600 },
  tabTxt: { fontSize: 13, fontWeight: "700", color: palette.gray500 },
  tabTxtActive: { color: "#fff" },

  // Category chips
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: palette.gray100,
  },
  chipActive: { backgroundColor: palette.primary600 },
  chipTxt: { fontSize: 12, fontWeight: "600", color: palette.gray500 },
  chipTxtActive: { color: "#fff" },

  // Shop grid
  grid: { flexDirection: "row", flexWrap: "wrap", gap: CARD_GAP },
  itemCard: {
    width: CARD_W,
    backgroundColor: "#fff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: palette.gray200,
    padding: 14,
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
  },
  itemCardOwned: { borderColor: semantic.success.border, backgroundColor: semantic.success.bg },
  itemCardLocked: { opacity: 0.85 },
  itemHeaderRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  itemCatIconWrap: {
    width: 30,
    height: 30,
    borderRadius: 9,
    backgroundColor: palette.primary50,
    alignItems: "center",
    justifyContent: "center",
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 8,
  },
  badgeTxt: { fontSize: 9, fontWeight: "700", textTransform: "uppercase" },
  itemCat: { fontSize: 9, fontWeight: "700", color: palette.gray400, marginTop: 10, textTransform: "uppercase" },
  itemName: { fontSize: 13, fontWeight: "700", color: palette.gray900, marginTop: 3, minHeight: 34 },
  itemFooterRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 12,
  },
  itemCostRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  itemCost: { fontSize: 15, fontWeight: "800", color: semantic.warning.solid },
  ownedTxt: { fontSize: 11, fontWeight: "700", color: semantic.success.solid },
  buyBtn: {
    backgroundColor: palette.primary600,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
    minWidth: 64,
    alignItems: "center",
  },
  buyBtnDisabled: { backgroundColor: palette.gray100 },
  buyBtnTxt: { fontSize: 11, fontWeight: "700", color: "#fff" },
  buyBtnTxtDisabled: { color: palette.gray400 },

  // History
  historyRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: palette.gray100,
    padding: 12,
    marginBottom: 10,
    gap: 12,
  },
  historyIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  historyLabel: { fontSize: 13, fontWeight: "700", color: palette.gray900, textTransform: "capitalize" },
  historyMeta: { fontSize: 11, color: palette.gray400, marginTop: 2 },
  historyAmount: { fontSize: 15, fontWeight: "800" },

  // Empty state
  empty: { alignItems: "center", paddingVertical: 48 },
  emptyTxt: { fontSize: 14, fontWeight: "700", color: palette.gray500, marginTop: 12 },
  emptySub: { fontSize: 12, color: palette.gray400, marginTop: 4, textAlign: "center" },
});
