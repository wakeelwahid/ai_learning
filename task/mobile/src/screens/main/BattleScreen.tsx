import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  View, Text, TouchableOpacity, ScrollView, TextInput,
  StyleSheet, ActivityIndicator, Linking, Clipboard, Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigation } from "@react-navigation/native";
import Toast from "react-native-toast-message";
import { battleApi, CreateBattleParams, BattleType } from "../../api/battle";
import UserAvatar from "@/components/UserAvatar";
import LiveBattleScreen from "./LiveBattleScreen";
import StudyPartyScreen from "@/screens/main/StudyPartyScreen";
import BattleHistoryScreen from "@/screens/main/BattleHistoryScreen";
import { palette, semantic, radius, spacing, typography, cardShadow } from "@/theme/colors";

interface Props { user: any }

// Battle-mode tile colors — decorative category identifiers (not semantic
// status/feedback), so kept as flat solid fills rather than the previous
// two-color gradients (no gradients anywhere per the design system,
// brand or otherwise). One representative solid hex per mode instead of a
// [start, end] pair.
interface BattleMode {
  type: BattleType;
  emoji: string;
  label: string;
  sub: string;
  color: string;
  badge?: string;
}

const BATTLE_MODES: BattleMode[] = [
  { type: "solo",         emoji: "🤖", label: "Solo vs AI",   sub: "Beat the AI",       color: palette.primary600 },
  { type: "1v1",          emoji: "⚔️", label: "1v1 Battle",   sub: "Challenge friend",  color: palette.purple600, badge: "Hot" },
  { type: "public",       emoji: "🌐", label: "Public",       sub: "Join anyone",        color: palette.success600, badge: "Live" },
  { type: "team",         emoji: "🏆", label: "Team",         sub: "A vs B",             color: palette.warning600, badge: "New" },
  { type: "group",        emoji: "👥", label: "Group",        sub: "Up to 20",           color: palette.primary500 },
  { type: "subject",      emoji: "📚", label: "Subject",      sub: "Open quiz",          color: palette.info600 },
  { type: "chapter",      emoji: "📖", label: "Chapter",      sub: "Revision",           color: palette.success600 },
  { type: "class_battle", emoji: "🏫", label: "Class",        sub: "Class vs Class",     color: palette.warning600 },
  { type: "study_party",  emoji: "🎓", label: "Study Party",  sub: "Watch + Quiz",       color: "#EC4899", badge: "New" },
];

const SUBJECTS = ["Mathematics", "Physics", "Chemistry", "Biology", "History", "English", "CS"];
const DIFFICULTIES = ["easy", "medium", "hard"] as const;

const TYPE_FILTERS = [
  { key: "all",          label: "All" },
  { key: "1v1",          label: "1v1" },
  { key: "group",        label: "Group" },
  { key: "public",       label: "Public" },
  { key: "team",         label: "Team" },
  { key: "class_battle", label: "Class" },
  { key: "subject",      label: "Subject" },
  { key: "chapter",      label: "Chapter" },
  { key: "study_party",  label: "Party" },
];

const STATUS_CFG: Record<string, { label: string; color: string; bg: string; dot: string }> = {
  waiting:   { label: "Waiting",   color: palette.warning700, bg: palette.warning50, dot: palette.warning500 },
  starting:  { label: "Starting",  color: "#C2410C", bg: "#FFF7ED", dot: "#F97316" },
  active:    { label: "Live",      color: semantic.success.text, bg: semantic.success.bg, dot: palette.success500 },
  completed: { label: "Completed", color: palette.primary700, bg: palette.primary50, dot: palette.primary500 },
};

const MY_BATTLES_PAGE_SIZE = 10;

// Battle-type left-border tag colors — decorative category identifiers,
// same rationale as BATTLE_MODES above.
const TYPE_BORDER: Record<string, string> = {
  "1v1": palette.purple600, group: palette.primary500, public: palette.success600, team: palette.warning600,
  class_battle: "#EAB308", school_battle: "#EC4899", subject: palette.info600,
  chapter: palette.success600, study_party: "#EC4899",
};

const DIFF_COLORS: Record<string, { bg: string; text: string }> = {
  easy:   { bg: semantic.success.bg, text: semantic.success.text },
  medium: { bg: palette.warning100, text: palette.warning700 },
  hard:   { bg: semantic.danger.bg, text: semantic.danger.text },
};

export default function BattleScreen({ user }: Props) {
  const navigation = useNavigation<any>();
  const queryClient = useQueryClient();

  const [activeBattle, setActiveBattle] = useState<any>(null);
  const [openBattles, setOpenBattles]   = useState<any[]>([]);
  const [stats, setStats]               = useState<any>(null);
  const [view, setView]                 = useState<"hub" | "create" | "history">("hub");
  const [creating, setCreating]         = useState(false);
  const [joining, setJoining]           = useState(false);
  const [actionId, setActionId]         = useState<string | null>(null);
  const [joinCode, setJoinCode]         = useState("");
  const [shareInfo, setShareInfo]       = useState<{ code: string; url: string } | null>(null);
  const [typeFilter, setTypeFilter]     = useState("all");
  const [searchQuery, setSearchQuery]   = useState("");
  const [form, setForm] = useState<CreateBattleParams>({
    battle_type: "solo", subject: "Mathematics", difficulty: "medium",
    question_count: 10, time_limit_sec: 300, max_players: 2,
    team_a_name: "Red Team", team_b_name: "Blue Team", class_a: "", class_b: "",
  });

  // ── My Battles tab ────────────────────────────────────────────────────────
  const [arenaTab, setArenaTab]         = useState<"live" | "mine">("live");
  const [myOffset, setMyOffset]         = useState(0);
  const [myBattlesAll, setMyBattlesAll] = useState<any[]>([]);
  const [rematchingId, setRematchingId] = useState<string | null>(null);

  const {
    data: myBattlesPage,
    isLoading: myBattlesLoading,
    isFetching: myBattlesFetching,
  } = useQuery({
    queryKey: ["my-battles", user?.id, myOffset],
    queryFn: () => battleApi.myBattles(user!.id, MY_BATTLES_PAGE_SIZE, myOffset).then((r) => r.data),
    enabled: !!user?.id && arenaTab === "mine",
    staleTime: 30_000,
  });

  useEffect(() => {
    const page = myBattlesPage?.battles ?? myBattlesPage?.results ?? [];
    if (!page.length && myOffset === 0) { setMyBattlesAll([]); return; }
    setMyBattlesAll((prev) => (myOffset === 0 ? page : [...prev, ...page]));
  }, [myBattlesPage]);

  const myBattlesTotal   = myBattlesPage?.total ?? null;
  const canLoadMoreMine  = myBattlesTotal != null
    ? myBattlesAll.length < myBattlesTotal
    : (myBattlesPage?.battles ?? myBattlesPage?.results ?? []).length >= MY_BATTLES_PAGE_SIZE;

  const handleLoadMoreMine = () => setMyOffset((o) => o + MY_BATTLES_PAGE_SIZE);

  // ── Global leaderboard (ranked by battles_won, then total_xp_earned) ────────
  const { data: leaderboardData } = useQuery({
    queryKey: ["battle-leaderboard"],
    queryFn: () => battleApi.leaderboard().then((r) => r.data),
    enabled: !!user?.id && arenaTab === "mine",
    staleTime: 30_000,
  });
  const leaderboard: any[] = leaderboardData?.leaderboard ?? [];

  // ── Per-battle "Details" (full final standings) ─────────────────────────────
  const [expandedBattleId, setExpandedBattleId]   = useState<string | null>(null);
  const [standingsByBattle, setStandingsByBattle] = useState<Record<string, any[]>>({});
  const [standingsLoadingId, setStandingsLoadingId] = useState<string | null>(null);

  const handleToggleDetails = async (b: any) => {
    if (expandedBattleId === b.id) { setExpandedBattleId(null); return; }
    setExpandedBattleId(b.id);
    if (standingsByBattle[b.id]) return;
    if (Array.isArray(b.standings) && b.standings.length > 0) {
      setStandingsByBattle((prev) => ({ ...prev, [b.id]: b.standings }));
      return;
    }
    setStandingsLoadingId(b.id);
    try {
      const r = await battleApi.get(b.id);
      const participants = r.data?.participants ?? r.data?.standings ?? [];
      setStandingsByBattle((prev) => ({ ...prev, [b.id]: participants }));
    } catch {
      Toast.show({ type: "error", text1: "Could not load standings" });
    } finally { setStandingsLoadingId(null); }
  };

  const handleRematch = async (battleId: string) => {
    setRematchingId(battleId);
    try {
      const r = await battleApi.rematch(battleId, user.id, user.full_name || "Student");
      Toast.show({ type: "success", text1: "Rematch created!", text2: "Get ready for round two." });
      setActiveBattle(r.data);
    } catch (e: any) {
      Toast.show({
        type: "error",
        text1: "Rematch failed",
        text2: e?.response?.data?.detail || "Could not start a rematch",
      });
    } finally { setRematchingId(null); }
  };

  const handleReview = (battleId: string) => {
    navigation.navigate("BattleReview", { battleId, userId: user.id });
  };

  const handleMyBattlePress = (b: any) => {
    if (b.status !== "completed") return;
    Alert.alert(
      b.subject || "Battle",
      "What would you like to do?",
      [
        { text: "Review", onPress: () => handleReview(b.id) },
        { text: "Rematch", onPress: () => handleRematch(b.id) },
        { text: "Cancel", style: "cancel" },
      ],
      { cancelable: true }
    );
  };

  const handleSwitchArenaTab = (tab: "live" | "mine") => {
    setArenaTab(tab);
    if (tab === "mine") {
      setMyOffset(0);
      queryClient.invalidateQueries({ queryKey: ["my-battles", user?.id, 0] });
    }
  };

  useEffect(() => {
    loadStats();
    loadOpen();
    const t = setInterval(loadOpen, 6000);
    return () => clearInterval(t);
  }, []);

  const loadStats = async () => {
    try { const r = await battleApi.stats(user.id); setStats(r.data); } catch {}
  };
  const loadOpen = async () => {
    try { const r = await battleApi.listOpen(); setOpenBattles(r.data?.battles ?? []); } catch {}
  };

  const filteredBattles = useMemo(() =>
    openBattles.filter((b) => {
      if (typeFilter !== "all" && b.battle_type !== typeFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        if (!b.subject?.toLowerCase().includes(q) && !b.topic?.toLowerCase().includes(q)) return false;
      }
      return true;
    }), [openBattles, typeFilter, searchQuery]);

  const handleModeSelect = (mode: BattleMode) => {
    setForm((f) => ({
      ...f, battle_type: mode.type,
      max_players: mode.type === "group" || mode.type === "public" ? 20 : mode.type === "team" ? 10 : 2,
    }));
    setView("create");
  };

  const handleCreate = async () => {
    setCreating(true);
    try {
      const r = await battleApi.create(form, user.id, user.full_name || "Student", user.avatar_url ?? undefined);
      const data = r.data;
      if (data.invite_code || data.share_code) {
        const code = data.invite_code ?? data.share_code;
        setShareInfo({ code, url: `https://app.eduai.in/battle/${code}` });
      }
      setActiveBattle(data);
      setView("hub");
    } catch (e: any) {
      Toast.show({ type: "error", text1: "Error", text2: e?.response?.data?.detail || "Failed to create battle" });
    } finally { setCreating(false); }
  };

  const handleJoin = async () => {
    if (!joinCode.trim()) return;
    setJoining(true);
    try {
      const r = await battleApi.join(joinCode.trim(), user.id, user.full_name || "Student", user.avatar_url ?? undefined);
      setActiveBattle(r.data); setJoinCode("");
    } catch (e: any) {
      Toast.show({ type: "error", text1: "Error", text2: e?.response?.data?.detail || "Invalid invite code" });
    } finally { setJoining(false); }
  };

  const handleJoinById = async (battleId: string) => {
    setActionId(battleId);
    try {
      const r = await battleApi.joinById(battleId, user.id, user.full_name || "Student", user.avatar_url ?? undefined);
      setActiveBattle(r.data);
    } catch (e: any) {
      Toast.show({ type: "error", text1: "Error", text2: e?.response?.data?.detail || "Could not join" });
    } finally { setActionId(null); }
  };

  const handleWatch = async (battleId: string) => {
    setActionId(battleId + ":watch");
    try {
      const r = await battleApi.spectate(battleId, user.id, user.full_name || "Spectator");
      setActiveBattle({ ...r.data, _spectating: true });
    } catch (e: any) {
      Toast.show({ type: "error", text1: "Error", text2: e?.response?.data?.detail || "Could not watch battle" });
    } finally { setActionId(null); }
  };

  const handleShare = useCallback((code: string, url: string) => {
    const text = `🔥 Join my Quiz Battle!\nCode: ${code}\n${url}`;
    const waUrl = `https://wa.me/?text=${encodeURIComponent(text)}`;
    Linking.canOpenURL(waUrl).then((ok) => {
      if (ok) Linking.openURL(waUrl);
      else { Clipboard.setString(url); Toast.show({ type: "success", text1: "Copied!", text2: "Share it with your friends." }); }
    });
  }, []);

  if (activeBattle) {
    const liveProps = {
      battle: activeBattle, userId: user.id, displayName: user.full_name || "Student",
      isSpectator: !!activeBattle._spectating,
      onExit: () => { setActiveBattle(null); loadStats(); setShareInfo(null); },
      onRematch: (newBattle: any) => { setShareInfo(null); setActiveBattle(newBattle); },
    };
    return activeBattle.battle_type === "study_party"
      ? <StudyPartyScreen {...liveProps} />
      : <LiveBattleScreen {...liveProps} />;
  }

  if (view === "history") {
    return (
      <BattleHistoryScreen
        userId={user.id}
        displayName={user.full_name || "Student"}
        onBack={() => setView("hub")}
        onRematch={(newBattle) => { setView("hub"); setActiveBattle(newBattle); }}
      />
    );
  }

  const selectedMode = BATTLE_MODES.find((m) => m.type === form.battle_type);

  return (
    <ScrollView style={s.container} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>

      {/* ── Hero ──────────────────────────────────────────────────── */}
      <View style={s.hero}>
        <View style={s.heroTop}>
          <View>
            <Text style={s.heroTitle}>Battle Arena</Text>
            <Text style={s.heroSub}>Challenge · Compete · Level Up</Text>
          </View>
          <TouchableOpacity style={s.historyBtn} onPress={() => setView("history")} activeOpacity={0.8}>
            <Ionicons name="trophy-outline" size={15} color="#fff" />
            <Text style={s.historyBtnText}>History</Text>
          </TouchableOpacity>
        </View>
        {stats && (
          <View style={s.statsRow}>
            {[
              { label: "Battles", value: stats.battles_played },
              { label: "Wins",    value: stats.battles_won },
              { label: "Win%",    value: `${stats.win_rate}%` },
              { label: "XP",      value: stats.total_xp_earned },
            ].map(({ label, value }) => (
              <View key={label} style={s.statBox}>
                <Text style={s.statVal}>{value}</Text>
                <Text style={s.statLbl}>{label}</Text>
              </View>
            ))}
          </View>
        )}
      </View>

      {/* ── Share banner ──────────────────────────────────────────── */}
      {shareInfo && (
        <View style={s.shareCard}>
          <View style={s.shareRow}>
            <Text style={s.shareTitle}>Share Your Battle</Text>
            <TouchableOpacity onPress={() => setShareInfo(null)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close" size={20} color={palette.gray400} />
            </TouchableOpacity>
          </View>
          <Text style={s.shareCode}>{shareInfo.code}</Text>
          <View style={s.shareBtns}>
            <TouchableOpacity style={s.waBtnGreen} onPress={() => handleShare(shareInfo.code, shareInfo.url)}>
              <Ionicons name="logo-whatsapp" size={16} color="#fff" />
              <Text style={s.waBtnText}>WhatsApp</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.copyBtn}
              onPress={() => { Clipboard.setString(shareInfo.code); Toast.show({ type: "success", text1: "Copied!" }); }}>
              <Ionicons name="copy-outline" size={16} color={palette.primary600} />
              <Text style={s.copyBtnText}>Copy Code</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* ── Battle Modes — 3-column ───────────────────────────────── */}
      <View style={s.sectionHeader}>
        <Text style={s.sectionLabel}>Choose Mode</Text>
      </View>
      <View style={s.modesGrid}>
        {BATTLE_MODES.map((mode) => (
          <TouchableOpacity key={mode.type} style={s.modeCard} onPress={() => handleModeSelect(mode)} activeOpacity={0.8}>
            <View style={[s.modeGrad, { backgroundColor: mode.color }]}>
              {mode.badge && (
                <View style={s.modeBadge}><Text style={s.modeBadgeText}>{mode.badge}</Text></View>
              )}
              <Text style={s.modeEmoji}>{mode.emoji}</Text>
              <Text style={s.modeLabel} numberOfLines={1}>{mode.label}</Text>
              <Text style={s.modeSub} numberOfLines={1}>{mode.sub}</Text>
            </View>
          </TouchableOpacity>
        ))}
      </View>

      {/* ── Create Form ───────────────────────────────────────────── */}
      {view === "create" && (
        <View style={s.card}>
          <View style={s.cardHeader}>
            <Text style={s.cardTitle}>{selectedMode?.emoji} {selectedMode?.label}</Text>
            <TouchableOpacity onPress={() => setView("hub")}>
              <Ionicons name="close-circle" size={24} color={palette.gray400} />
            </TouchableOpacity>
          </View>

          {form.battle_type === "study_party" && (
            <View style={s.infoBox}>
              <Text style={s.infoBoxText}>Friends watch a video, discuss, then quiz together. Share the invite code after creating.</Text>
            </View>
          )}

          <Text style={s.fieldLabel}>Subject</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 10 }}>
            {SUBJECTS.map((subj) => (
              <TouchableOpacity key={subj} onPress={() => setForm((f) => ({ ...f, subject: subj }))}
                style={[s.chip, form.subject === subj && s.chipActive]}>
                <Text style={[s.chipText, form.subject === subj && s.chipTextActive]}>{subj}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <Text style={s.fieldLabel}>Difficulty</Text>
          <View style={s.diffRow}>
            {DIFFICULTIES.map((d) => (
              <TouchableOpacity key={d} onPress={() => setForm((f) => ({ ...f, difficulty: d }))}
                style={[s.diffBtn, form.difficulty === d && s.diffBtnActive]}>
                <Text style={[s.diffText, form.difficulty === d && s.diffTextActive]}>
                  {d.charAt(0).toUpperCase() + d.slice(1)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {form.battle_type === "team" && (
            <>
              <Text style={s.fieldLabel}>Team Names</Text>
              <View style={s.teamRow}>
                <TextInput style={[s.input, { flex: 1 }]} placeholder="Team A"
                  value={form.team_a_name} onChangeText={(v) => setForm((f) => ({ ...f, team_a_name: v }))} />
                <Text style={s.vsText}>vs</Text>
                <TextInput style={[s.input, { flex: 1 }]} placeholder="Team B"
                  value={form.team_b_name} onChangeText={(v) => setForm((f) => ({ ...f, team_b_name: v }))} />
              </View>
            </>
          )}

          {form.battle_type === "class_battle" && (
            <>
              <Text style={s.fieldLabel}>Class Names</Text>
              <View style={s.teamRow}>
                <TextInput style={[s.input, { flex: 1 }]} placeholder="Class A (10A)"
                  value={form.class_a} onChangeText={(v) => setForm((f) => ({ ...f, class_a: v }))} />
                <Text style={s.vsText}>vs</Text>
                <TextInput style={[s.input, { flex: 1 }]} placeholder="Class B (10B)"
                  value={form.class_b} onChangeText={(v) => setForm((f) => ({ ...f, class_b: v }))} />
              </View>
            </>
          )}

          <View style={s.btnRow}>
            <TouchableOpacity style={s.cancelBtn} onPress={() => setView("hub")}>
              <Text style={s.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.createBtn} onPress={handleCreate} disabled={creating}>
              {creating ? <ActivityIndicator color={palette.gray50} size="small" /> : <Text style={s.createText}>Start Battle</Text>}
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* ── Join by Code ──────────────────────────────────────────── */}
      <View style={s.card}>
        <Text style={s.cardTitle}>Join with Code</Text>
        <View style={s.joinRow}>
          <TextInput
            style={s.codeInput} placeholder="Enter code"
            value={joinCode} onChangeText={(v) => setJoinCode(v.toUpperCase())}
            maxLength={8} autoCapitalize="characters"
          />
          <TouchableOpacity style={s.joinBtn} onPress={handleJoin} disabled={joining || joinCode.length < 4}>
            {joining ? <ActivityIndicator color={palette.gray50} size="small" /> : <Text style={s.joinBtnText}>Join →</Text>}
          </TouchableOpacity>
        </View>
      </View>

      {/* ── Live Arena / My Battles ──────────────────────────────── */}
      <View style={s.section}>

        {/* Tab switcher */}
        <View style={s.arenaTabRow}>
          <TouchableOpacity
            style={[s.arenaTabBtn, arenaTab === "live" && s.arenaTabBtnActive]}
            onPress={() => handleSwitchArenaTab("live")}
          >
            <View style={s.liveDot} />
            <Text style={[s.arenaTabText, arenaTab === "live" && s.arenaTabTextActive]}>Live Arena</Text>
            {openBattles.length > 0 && (
              <View style={s.countBadge}><Text style={s.countBadgeText}>{openBattles.length}</Text></View>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.arenaTabBtn, arenaTab === "mine" && s.arenaTabBtnActive]}
            onPress={() => handleSwitchArenaTab("mine")}
          >
            <Ionicons name="person-outline" size={15} color={arenaTab === "mine" ? palette.primary600 : palette.gray500} />
            <Text style={[s.arenaTabText, arenaTab === "mine" && s.arenaTabTextActive]}>My Battles</Text>
          </TouchableOpacity>
        </View>

        {arenaTab === "live" ? (
          <>
            <View style={s.arenaHeader}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }} />
              <TouchableOpacity onPress={loadOpen} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="refresh-outline" size={18} color={palette.primary600} />
              </TouchableOpacity>
            </View>

            {/* Search */}
            <View style={s.searchBar}>
              <Ionicons name="search-outline" size={16} color={palette.gray400} />
              <TextInput
                style={s.searchInput} placeholder="Search subject or topic..."
                placeholderTextColor={palette.gray400} value={searchQuery} onChangeText={setSearchQuery}
              />
              {searchQuery.length > 0 && (
                <TouchableOpacity onPress={() => setSearchQuery("")}>
                  <Ionicons name="close-circle" size={16} color={palette.gray400} />
                </TouchableOpacity>
              )}
            </View>

            {/* Filter chips */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 10 }}>
              {TYPE_FILTERS.map(({ key, label }) => (
                <TouchableOpacity key={key} onPress={() => setTypeFilter(key)}
                  style={[s.filterChip, typeFilter === key && s.filterChipActive]}>
                  <Text style={[s.filterChipText, typeFilter === key && s.filterChipTextActive]}>{label}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* Cards */}
            {filteredBattles.length === 0 ? (
              <View style={s.emptyCard}>
                <Text style={{ fontSize: 34, marginBottom: 8 }}>⚔️</Text>
                <Text style={s.emptyText}>
                  {openBattles.length === 0 ? "No open battles right now" : "No battles match filter"}
                </Text>
                <Text style={s.emptySub}>
                  {openBattles.length === 0 ? "Create a Public or Group battle" : "Try a different filter"}
                </Text>
              </View>
            ) : (
              filteredBattles.map((b) => {
                const mode      = BATTLE_MODES.find((m) => m.type === b.battle_type);
                const stCfg     = STATUS_CFG[b.status] ?? STATUS_CFG.waiting;
                const isLive    = b.status === "active";
                const isFull    = b.current_players >= b.max_players;
                const border    = TYPE_BORDER[b.battle_type] ?? palette.primary600;
                const diffC     = DIFF_COLORS[b.difficulty] ?? { bg: palette.gray100, text: palette.gray700 };
                const isJoining = actionId === b.id;
                const isWatching = actionId === b.id + ":watch";

                return (
                  <View key={b.id} style={[s.battleCard, { borderLeftColor: border }]}>
                    <View style={s.battleTop}>
                      {/* Emoji icon */}
                      <View style={s.emojiWrap}>
                        <Text style={{ fontSize: 22 }}>{mode?.emoji ?? "⚔️"}</Text>
                        {isLive && <View style={s.livePulse} />}
                      </View>

                      <View style={{ flex: 1 }}>
                        {/* Subject + status */}
                        <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 6, flexWrap: "wrap" }}>
                          <Text style={s.battleSubject} numberOfLines={1}>
                            {b.subject || "General"}{b.topic ? ` · ${b.topic}` : ""}
                          </Text>
                          <View style={[s.statusBadge, { backgroundColor: stCfg.bg }]}>
                            <View style={[s.statusDot, { backgroundColor: stCfg.dot }]} />
                            <Text style={[s.statusText, { color: stCfg.color }]}>{stCfg.label}</Text>
                          </View>
                        </View>

                        {/* Meta */}
                        <View style={s.metaRow}>
                          <View style={s.typeBadge}>
                            <Text style={s.typeBadgeText}>{b.battle_type.replace(/_/g, " ")}</Text>
                          </View>
                          <View style={[s.diffBadge, { backgroundColor: diffC.bg }]}>
                            <Text style={[s.diffBadgeText, { color: diffC.text }]}>{b.difficulty}</Text>
                          </View>
                          <Text style={s.metaText}>
                            {b.current_players}/{b.max_players} players · {b.time_limit_sec / 60} min · {b.question_count} Qs
                          </Text>
                        </View>

                        {/* Participants */}
                        {b.participants?.length > 0 && (
                          <View style={s.participantsRow}>
                            {b.participants.slice(0, 3).map((p: any, i: number) => (
                              <View key={i} style={s.pChip}>
                                <UserAvatar userId={p.user_id} name={p.display_name} uri={p.avatar_url} size={18} />
                                <Text style={s.pName} numberOfLines={1}>{p.display_name}</Text>
                              </View>
                            ))}
                            {b.participants.length > 3 && (
                              <Text style={s.moreText}>+{b.participants.length - 3}</Text>
                            )}
                          </View>
                        )}
                      </View>
                    </View>

                    {/* Actions */}
                    <View style={s.actionRow}>
                      <TouchableOpacity style={s.watchBtn} onPress={() => handleWatch(b.id)} disabled={!!actionId}>
                        {isWatching
                          ? <ActivityIndicator size="small" color={palette.primary600} />
                          : <><Ionicons name="eye-outline" size={14} color={palette.primary600} /><Text style={s.watchBtnText}> Watch</Text></>
                        }
                      </TouchableOpacity>

                      {!isLive && !isFull ? (
                        <TouchableOpacity style={s.joinSmallBtn} onPress={() => handleJoinById(b.id)} disabled={!!actionId}>
                          {isJoining
                            ? <ActivityIndicator size="small" color="#fff" />
                            : <Text style={s.joinSmallText}>Join →</Text>
                          }
                        </TouchableOpacity>
                      ) : (
                        <View style={[s.joinSmallBtn, { backgroundColor: isLive ? palette.success600 : palette.danger500, opacity: 0.9 }]}>
                          <Text style={s.joinSmallText}>{isLive ? "In Progress" : "Full"}</Text>
                        </View>
                      )}
                    </View>
                  </View>
                );
              })
            )}
          </>
        ) : (
          <>
            {/* Global Leaderboard — ranked by battles won, then total XP earned */}
            <View style={s.lbCard}>
              <View style={s.lbHeader}>
                <Ionicons name="trophy" size={17} color={palette.warning500} />
                <Text style={s.lbTitle}>Global Leaderboard</Text>
              </View>
              {leaderboard.length === 0 ? (
                <Text style={s.lbEmpty}>No entries yet.</Text>
              ) : (
                leaderboard.slice(0, 15).map((p: any, i: number) => (
                  <View
                    key={p.user_id ?? i}
                    style={[s.lbRow, p.user_id === user.id && s.lbRowMe]}
                  >
                    <Text style={[s.lbRank, i === 0 && s.lbRankGold, i === 1 && s.lbRankSilver, i === 2 && s.lbRankBronze]}>
                      {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : i + 1}
                    </Text>
                    <UserAvatar userId={p.user_id} name={p.display_name} size={32} />
                    <Text style={s.lbName} numberOfLines={1}>
                      {p.display_name || "Player"}{p.user_id === user.id ? " (You)" : ""}
                    </Text>
                    <Text style={s.lbWins}>{p.battles_won ?? 0}W</Text>
                    <Text style={s.lbXp}>{p.total_xp_earned ?? p.total_xp ?? 0} XP</Text>
                  </View>
                ))
              )}
            </View>

            {/* My Battles */}
            {myBattlesLoading && myOffset === 0 ? (
              <ActivityIndicator color={palette.primary600} style={{ marginTop: 16, marginBottom: 16 }} />
            ) : myBattlesAll.length === 0 ? (
              <View style={s.emptyCard}>
                <Text style={{ fontSize: 34, marginBottom: 8 }}>🗂️</Text>
                <Text style={s.emptyText}>You haven't created any battles yet</Text>
                <Text style={s.emptySub}>Battles you create will show up here</Text>
              </View>
            ) : (
              <>
                {myBattlesAll.map((b) => {
                  const mode       = BATTLE_MODES.find((m) => m.type === b.battle_type);
                  const stCfg      = STATUS_CFG[b.status] ?? STATUS_CFG.waiting;
                  const isLive     = b.status === "active";
                  const isCompleted = b.status === "completed";
                  const border     = TYPE_BORDER[b.battle_type] ?? palette.primary600;
                  const diffC      = DIFF_COLORS[b.difficulty] ?? { bg: palette.gray100, text: palette.gray700 };
                  const isRematching = rematchingId === b.id;
                  const mine       = b.my_result ?? b.participant ?? b.me ?? null;
                  const isExpanded = expandedBattleId === b.id;
                  const isLoadingStandings = standingsLoadingId === b.id;
                  const standings = standingsByBattle[b.id] ?? [];

                  return (
                    <TouchableOpacity
                      key={b.id}
                      style={[s.battleCard, { borderLeftColor: border }]}
                      activeOpacity={isCompleted ? 0.7 : 1}
                      onPress={() => handleMyBattlePress(b)}
                      disabled={!isCompleted}
                    >
                      <View style={s.battleTop}>
                        <View style={s.emojiWrap}>
                          <Text style={{ fontSize: 22 }}>{mode?.emoji ?? "⚔️"}</Text>
                          {isLive && <View style={s.livePulse} />}
                        </View>

                        <View style={{ flex: 1 }}>
                          <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 6, flexWrap: "wrap" }}>
                            <Text style={s.battleSubject} numberOfLines={1}>
                              {b.subject || "General"}{b.topic ? ` · ${b.topic}` : ""}
                            </Text>
                            <View style={[s.statusBadge, { backgroundColor: stCfg.bg }]}>
                              <View style={[s.statusDot, { backgroundColor: stCfg.dot }]} />
                              <Text style={[s.statusText, { color: stCfg.color }]}>{stCfg.label}</Text>
                            </View>
                          </View>

                          <View style={s.metaRow}>
                            <View style={s.typeBadge}>
                              <Text style={s.typeBadgeText}>{b.battle_type?.replace(/_/g, " ")}</Text>
                            </View>
                            {!!b.difficulty && (
                              <View style={[s.diffBadge, { backgroundColor: diffC.bg }]}>
                                <Text style={[s.diffBadgeText, { color: diffC.text }]}>{b.difficulty}</Text>
                              </View>
                            )}
                            <Text style={s.metaText}>
                              {b.current_players ?? b.participant_count ?? 0}/{b.max_players ?? "-"} players
                            </Text>
                          </View>

                          {/* My result stats — only when the user participated & battle is done */}
                          {mine && (
                            <View style={s.myStatsRow}>
                              <View style={s.myStatChip}>
                                <Text style={s.myStatVal}>{mine.score ?? "-"}</Text>
                                <Text style={s.myStatLbl}>Score</Text>
                              </View>
                              <View style={s.myStatChip}>
                                <Text style={s.myStatVal}>{mine.rank != null ? `#${mine.rank}` : "-"}</Text>
                                <Text style={s.myStatLbl}>Rank</Text>
                              </View>
                              <View style={s.myStatChip}>
                                <Text style={s.myStatVal}>{mine.accuracy != null ? `${Math.round(mine.accuracy)}%` : "-"}</Text>
                                <Text style={s.myStatLbl}>Accuracy</Text>
                              </View>
                              <View style={s.myStatChip}>
                                <Text style={s.myStatVal}>+{mine.xp ?? mine.xp_earned ?? 0}</Text>
                                <Text style={s.myStatLbl}>XP</Text>
                              </View>
                            </View>
                          )}
                        </View>
                      </View>

                      {isCompleted && (
                        <View style={s.actionRow}>
                          <TouchableOpacity
                            style={s.watchBtn}
                            onPress={() => handleReview(b.id)}
                          >
                            <Ionicons name="bar-chart-outline" size={14} color={palette.primary600} />
                            <Text style={s.watchBtnText}> Review</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={s.detailsBtn}
                            onPress={() => handleToggleDetails(b)}
                          >
                            <Ionicons name={isExpanded ? "chevron-up-outline" : "chevron-down-outline"} size={14} color={palette.gray500} />
                            <Text style={s.detailsBtnText}> Details</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={s.joinSmallBtn}
                            onPress={() => handleRematch(b.id)}
                            disabled={!!rematchingId}
                          >
                            {isRematching
                              ? <ActivityIndicator size="small" color="#fff" />
                              : <Text style={s.joinSmallText}>Rematch</Text>
                            }
                          </TouchableOpacity>
                        </View>
                      )}

                      {/* Expanded final standings — all participants */}
                      {isExpanded && (
                        <View style={s.standingsBox}>
                          <Text style={s.standingsTitle}>
                            <Ionicons name="trophy" size={13} color={palette.warning500} /> Final Standings
                          </Text>
                          {isLoadingStandings ? (
                            <ActivityIndicator color={palette.primary600} style={{ marginVertical: 10 }} />
                          ) : standings.length === 0 ? (
                            <Text style={s.standingsEmpty}>No standings available.</Text>
                          ) : (
                            standings.map((p: any, i: number) => (
                              <View key={p.user_id ?? i} style={s.standingRow}>
                                <Text style={[s.standingRank, i === 0 && s.lbRankGold, i === 1 && s.lbRankSilver, i === 2 && s.lbRankBronze]}>
                                  {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `#${p.rank ?? i + 1}`}
                                </Text>
                                {p.is_ai ? (
                                  <View style={s.standingAvatar}><Text style={s.standingAvatarText}>🤖</Text></View>
                                ) : (
                                  <UserAvatar userId={p.user_id} name={p.display_name} size={24} />
                                )}
                                <Text style={s.standingName} numberOfLines={1}>
                                  {p.display_name}{p.is_ai ? " (AI)" : ""}
                                </Text>
                                <Text style={s.standingScore}>{p.score ?? 0} pts</Text>
                                <Text style={s.standingCorrect}>{p.correct ?? 0}✓</Text>
                                <Text style={s.standingWrong}>{p.wrong ?? 0}✗</Text>
                                <Text style={s.standingAccuracy}>{p.accuracy ?? 0}%</Text>
                              </View>
                            ))
                          )}
                        </View>
                      )}
                    </TouchableOpacity>
                  );
                })}

                {canLoadMoreMine && (
                  <TouchableOpacity
                    style={s.loadMoreBtn}
                    onPress={handleLoadMoreMine}
                    disabled={myBattlesFetching}
                  >
                    {myBattlesFetching
                      ? <ActivityIndicator size="small" color={palette.primary600} />
                      : <Text style={s.loadMoreText}>Load More</Text>
                    }
                  </TouchableOpacity>
                )}
              </>
            )}
          </>
        )}
      </View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: palette.gray50 },

  // Hero
  hero:        { paddingTop: 26, paddingBottom: spacing["2xl"], paddingHorizontal: spacing.lg, borderBottomLeftRadius: radius.xl, borderBottomRightRadius: radius.xl, backgroundColor: palette.primary600 },
  heroTop:     { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: spacing.lg },
  heroTitle:   { ...typography.h1, color: "#fff", letterSpacing: 0.2 },
  heroSub:     { fontSize: 13, color: palette.primary200, marginTop: 4 },
  historyBtn:      { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "rgba(255,255,255,0.18)", borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, minHeight: 36 },
  historyBtnText:  { fontSize: 13, fontWeight: "700", color: "#fff" },
  statsRow:    { flexDirection: "row", gap: spacing.sm },
  statBox:     { flex: 1, backgroundColor: "rgba(255,255,255,0.14)", borderRadius: radius.md, paddingVertical: spacing.sm, alignItems: "center" },
  statVal:     { fontSize: 17, fontWeight: "800", color: "#fff" },
  statLbl:     { fontSize: 11, color: palette.primary200, marginTop: 2 },

  // Share
  shareCard:   { backgroundColor: palette.primary50, borderRadius: radius.lg, marginHorizontal: spacing.lg, marginTop: spacing.lg, padding: spacing.lg },
  shareRow:    { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 },
  shareTitle:  { fontSize: 14, fontWeight: "700", color: palette.primary900 },
  shareCode:   { fontSize: 28, fontWeight: "900", color: palette.primary600, letterSpacing: 6, fontFamily: "monospace", marginBottom: spacing.md },
  shareBtns:   { flexDirection: "row", gap: spacing.sm },
  waBtnGreen:  { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: palette.success500, borderRadius: radius.md, paddingVertical: spacing.md, minHeight: 44 },
  waBtnText:   { color: "#fff", fontWeight: "700", fontSize: 14 },
  copyBtn:     { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderWidth: 1.5, borderColor: palette.primary600, borderRadius: radius.md, paddingVertical: spacing.md, minHeight: 44 },
  copyBtnText: { color: palette.primary600, fontWeight: "700", fontSize: 14 },

  // Section header
  sectionHeader:    { paddingHorizontal: spacing.lg, paddingTop: spacing.xl, paddingBottom: spacing.sm },
  sectionLabel:     { ...typography.caption, color: palette.gray500, letterSpacing: 1 },

  // Modes
  modesGrid:      { flexDirection: "row", flexWrap: "wrap", paddingHorizontal: spacing.md, gap: spacing.sm },
  modeCard:       { width: "31%", borderRadius: radius.lg, overflow: "hidden" },
  modeGrad:       { padding: spacing.md, minHeight: 104, justifyContent: "flex-end", position: "relative" },
  modeBadge:      { position: "absolute", top: spacing.sm, right: spacing.sm, backgroundColor: "rgba(255,255,255,0.25)", borderRadius: 7, paddingHorizontal: 6, paddingVertical: 2 },
  modeBadgeText:  { fontSize: 9, fontWeight: "800", color: "#fff", textTransform: "uppercase", letterSpacing: 0.3 },
  modeEmoji:      { fontSize: 26, marginBottom: 6 },
  modeLabel:      { fontSize: 13, fontWeight: "700", color: "#fff" },
  modeSub:        { fontSize: 11, color: "rgba(255,255,255,0.75)", marginTop: 2 },

  // Card
  card:       { backgroundColor: "#fff", borderRadius: radius.lg, padding: spacing.lg, marginHorizontal: spacing.lg, marginTop: spacing.lg, borderWidth: 1, borderColor: palette.gray100, ...cardShadow },
  cardHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.md },
  cardTitle:  { ...typography.h4, color: palette.gray900 },
  // Neutral surface with an indigo accent border (no violet/decorative
  // accent per the design system).
  infoBox:    { backgroundColor: palette.primary50, borderRadius: radius.sm, padding: spacing.md, marginBottom: spacing.md, borderWidth: 1, borderColor: palette.primary100, borderLeftWidth: 3, borderLeftColor: palette.primary600 },
  infoBoxText: { ...typography.bodySm, color: palette.primary700, lineHeight: 19 },

  // Form
  fieldLabel:     { ...typography.caption, color: palette.gray500, letterSpacing: 0.5, marginBottom: spacing.sm },
  chip:           { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.pill, backgroundColor: palette.gray100, marginRight: spacing.sm, minHeight: 36, justifyContent: "center" },
  chipActive:     { backgroundColor: palette.primary600 },
  chipText:       { fontSize: 13, color: palette.gray700, fontWeight: "500" },
  chipTextActive: { color: "#fff", fontWeight: "700" },
  diffRow:        { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.lg },
  diffBtn:        { flex: 1, paddingVertical: 11, borderRadius: radius.md, backgroundColor: palette.gray100, alignItems: "center", minHeight: 44, justifyContent: "center" },
  diffBtnActive:  { backgroundColor: palette.primary600 },
  diffText:       { fontSize: 14, fontWeight: "600", color: palette.gray700 },
  diffTextActive: { color: "#fff" },
  teamRow:        { flexDirection: "row", alignItems: "center", marginBottom: spacing.lg },
  vsText:         { color: palette.gray400, marginHorizontal: spacing.sm, fontWeight: "700", fontSize: 13 },
  input:          { borderWidth: 1.5, borderColor: palette.gray200, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.md, fontSize: 14, color: palette.gray800, minHeight: 44 },
  btnRow:         { flexDirection: "row", gap: spacing.sm, marginTop: 4 },
  cancelBtn:      { flex: 1, paddingVertical: 13, borderRadius: radius.md, backgroundColor: palette.gray100, alignItems: "center", minHeight: 44, justifyContent: "center" },
  cancelText:     { fontSize: 15, fontWeight: "600", color: palette.gray700 },
  createBtn:      { flex: 2, paddingVertical: 13, borderRadius: radius.md, backgroundColor: palette.primary600, alignItems: "center", minHeight: 44, justifyContent: "center" },
  createText:     { fontSize: 15, fontWeight: "700", color: "#fff" },

  // Join
  joinRow:     { flexDirection: "row", gap: spacing.sm, marginTop: spacing.md },
  codeInput:   { flex: 1, borderWidth: 1.5, borderColor: palette.gray200, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.md, fontSize: 16, letterSpacing: 3, textTransform: "uppercase", color: palette.gray800, minHeight: 44 },
  joinBtn:     { backgroundColor: palette.primary600, borderRadius: radius.md, paddingHorizontal: spacing.xl, alignItems: "center", justifyContent: "center", minHeight: 44 },
  joinBtnText: { color: "#fff", fontWeight: "700", fontSize: 15 },

  // Live Arena
  section:      { marginHorizontal: spacing.lg, marginTop: spacing.xl, marginBottom: 4 },
  arenaHeader:  { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.sm },
  liveDot:      { width: 8, height: 8, borderRadius: 4, backgroundColor: palette.success500 },
  sectionTitle: { ...typography.h4, color: palette.gray900 },
  countBadge:   { backgroundColor: palette.primary50, borderRadius: radius.sm, paddingHorizontal: spacing.sm, paddingVertical: 2 },
  countBadgeText: { fontSize: 12, fontWeight: "700", color: palette.primary600 },

  // Arena tabs (Live Arena / My Battles)
  arenaTabRow:        { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.md },
  arenaTabBtn:        { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: spacing.md, borderRadius: radius.md, backgroundColor: palette.gray100, minHeight: 44 },
  arenaTabBtnActive:  { backgroundColor: palette.primary50, borderWidth: 1.5, borderColor: palette.primary200 },
  arenaTabText:       { fontSize: 14, fontWeight: "700", color: palette.gray500 },
  arenaTabTextActive: { color: palette.primary600 },

  // My Battles — own result stats
  myStatsRow:  { flexDirection: "row", gap: spacing.sm, marginTop: spacing.md },
  myStatChip:  { flex: 1, backgroundColor: palette.gray50, borderRadius: radius.md, paddingVertical: spacing.sm, alignItems: "center", borderWidth: 1, borderColor: palette.primary50 },
  myStatVal:   { fontSize: 14, fontWeight: "800", color: palette.primary600 },
  myStatLbl:   { fontSize: 10, color: palette.gray400, marginTop: 2, textTransform: "uppercase", letterSpacing: 0.3 },

  // Load more
  loadMoreBtn:  { alignSelf: "center", marginTop: spacing.sm, marginBottom: 4, paddingHorizontal: spacing["2xl"], paddingVertical: spacing.md, borderRadius: radius.md, borderWidth: 1.5, borderColor: palette.primary200, backgroundColor: palette.primary50, minHeight: 44, justifyContent: "center" },
  loadMoreText: { fontSize: 14, fontWeight: "700", color: palette.primary600 },

  // Search
  searchBar:   { flexDirection: "row", alignItems: "center", gap: spacing.sm, backgroundColor: "#fff", borderRadius: radius.md, borderWidth: 1.5, borderColor: palette.gray200, paddingHorizontal: spacing.md, paddingVertical: spacing.md, marginBottom: spacing.sm, minHeight: 44 },
  searchInput: { flex: 1, fontSize: 14, color: palette.gray800, padding: 0 },

  // Filter chips
  filterChip:           { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.pill, backgroundColor: palette.gray100, marginRight: spacing.sm, minHeight: 36, justifyContent: "center" },
  filterChipActive:     { backgroundColor: palette.primary600 },
  filterChipText:       { fontSize: 13, fontWeight: "600", color: palette.gray500 },
  filterChipTextActive: { color: "#fff" },

  // Empty
  emptyCard: { backgroundColor: "#fff", borderRadius: radius.lg, padding: spacing["3xl"], alignItems: "center", borderWidth: 1.5, borderColor: palette.gray200, borderStyle: "dashed" },
  emptyText: { fontSize: 14, fontWeight: "600", color: palette.gray500 },
  emptySub:  { fontSize: 12, color: palette.gray400, marginTop: 4, textAlign: "center" },

  // Battle card
  battleCard:      { backgroundColor: "#fff", borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.sm, borderLeftWidth: 3, ...cardShadow },
  battleTop:       { flexDirection: "row", gap: spacing.md, marginBottom: spacing.md },
  emojiWrap:       { width: 44, height: 44, borderRadius: radius.md, backgroundColor: palette.gray50, alignItems: "center", justifyContent: "center", position: "relative", borderWidth: 1, borderColor: palette.gray200 },
  livePulse:       { position: "absolute", top: -3, right: -3, width: 11, height: 11, borderRadius: 6, backgroundColor: palette.success500, borderWidth: 2, borderColor: "#fff" },
  battleSubject:   { fontSize: 15, fontWeight: "700", color: palette.gray900, flex: 1 },
  statusBadge:     { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: spacing.sm, paddingVertical: 3, borderRadius: radius.sm },
  statusDot:       { width: 6, height: 6, borderRadius: 3 },
  statusText:      { fontSize: 11, fontWeight: "700" },
  metaRow:         { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 6, marginTop: 6 },
  typeBadge:       { backgroundColor: palette.primary50, borderRadius: 7, paddingHorizontal: spacing.sm, paddingVertical: 3 },
  typeBadgeText:   { fontSize: 11, color: palette.primary600, fontWeight: "600", textTransform: "capitalize" },
  diffBadge:       { borderRadius: 7, paddingHorizontal: spacing.sm, paddingVertical: 3 },
  diffBadgeText:   { fontSize: 11, fontWeight: "600", textTransform: "capitalize" },
  metaText:        { fontSize: 12, color: palette.gray500 },
  participantsRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 6, marginTop: spacing.sm },
  pChip:           { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: palette.gray100, borderRadius: radius.md, paddingHorizontal: spacing.sm, paddingVertical: 3 },
  pAvatar:         { width: 18, height: 18, borderRadius: 9, backgroundColor: palette.primary200, alignItems: "center", justifyContent: "center" },
  pAvatarText:     { fontSize: 9, fontWeight: "800", color: palette.primary600 },
  pName:           { fontSize: 12, color: palette.gray700 },
  moreText:        { fontSize: 12, color: palette.gray400 },

  // Actions
  actionRow:    { flexDirection: "row", gap: spacing.sm },
  watchBtn:     { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", borderWidth: 1.5, borderColor: palette.primary200, borderRadius: radius.md, paddingVertical: spacing.md, backgroundColor: palette.primary50, minHeight: 44 },
  watchBtnText: { fontSize: 13, fontWeight: "700", color: palette.primary600 },
  detailsBtn:     { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", borderWidth: 1.5, borderColor: palette.gray200, borderRadius: radius.md, paddingVertical: spacing.md, backgroundColor: palette.gray50, minHeight: 44 },
  detailsBtnText: { fontSize: 13, fontWeight: "700", color: palette.gray500 },
  joinSmallBtn: { flex: 1, backgroundColor: palette.primary600, borderRadius: radius.md, paddingVertical: spacing.md, alignItems: "center", justifyContent: "center", minHeight: 44 },
  joinSmallText: { color: "#fff", fontWeight: "700", fontSize: 13 },

  // Global leaderboard card (My Battles tab)
  lbCard:       { backgroundColor: "#fff", borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing.md, ...cardShadow },
  lbHeader:     { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginBottom: spacing.sm },
  lbTitle:      { ...typography.h4, color: palette.gray900 },
  lbEmpty:      { fontSize: 13, color: palette.gray400, textAlign: "center", paddingVertical: spacing.md },
  lbRow:        { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: spacing.sm, minHeight: 40 },
  lbRowMe:      { backgroundColor: palette.primary50, borderRadius: radius.md, paddingHorizontal: spacing.sm },
  lbRank:       { width: 26, textAlign: "center", fontSize: 13, fontWeight: "800", color: palette.gray400 },
  lbRankGold:   { color: palette.warning500 },
  lbRankSilver: { color: palette.gray400 },
  lbRankBronze: { color: "#FB923C" },
  lbAvatar:     { width: 32, height: 32, borderRadius: 16, backgroundColor: palette.primary400, alignItems: "center", justifyContent: "center" },
  lbAvatarText: { fontSize: 14, fontWeight: "800", color: "#fff" },
  lbName:       { flex: 1, fontSize: 14, fontWeight: "600", color: palette.gray700 },
  lbWins:       { fontSize: 13, fontWeight: "800", color: palette.primary600, marginRight: 6 },
  lbXp:         { fontSize: 12, fontWeight: "700", color: palette.warning600 },

  // Expanded final standings (My Battles → Details)
  standingsBox:       { marginTop: spacing.sm, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: palette.gray100 },
  standingsTitle:      { fontSize: 11, fontWeight: "800", color: palette.gray400, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: spacing.sm },
  standingsEmpty:      { fontSize: 12, color: palette.gray400, textAlign: "center", paddingVertical: spacing.sm },
  standingRow:         { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 5 },
  standingRank:        { width: 24, textAlign: "center", fontSize: 12, fontWeight: "800", color: palette.gray400 },
  standingAvatar:      { width: 24, height: 24, borderRadius: 12, backgroundColor: palette.gray100, alignItems: "center", justifyContent: "center" },
  standingAvatarText:  { fontSize: 11, fontWeight: "800", color: palette.gray500 },
  standingName:        { flex: 1, fontSize: 13, fontWeight: "600", color: palette.gray700 },
  standingScore:       { width: 56, textAlign: "right", fontSize: 12, fontWeight: "800", color: palette.primary600 },
  standingCorrect:     { width: 32, textAlign: "right", fontSize: 12, color: palette.success600 },
  standingWrong:       { width: 28, textAlign: "right", fontSize: 12, color: palette.danger600 },
  standingAccuracy:    { width: 40, textAlign: "right", fontSize: 12, color: palette.gray400 },
});
