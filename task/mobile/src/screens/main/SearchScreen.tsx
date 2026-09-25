import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View, Text, TextInput, FlatList, TouchableOpacity,
  StyleSheet, SafeAreaView, StatusBar, ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import * as WebBrowser from "expo-web-browser";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Toast from "react-native-toast-message";
import { searchApi } from "@/api/content";
import { palette, radius, spacing, cardShadow } from "@/theme/colors";

// ─── Types ────────────────────────────────────────────────────────────────────
// Shape returned by GET /v1/content/search (services/content_service/app/crud/content_crud.py
// → search_content()). Results already come back bucketed by category — no flattening/faking
// needed. `questions` and `pyqs` are wired up server-side but the queries backing them are
// currently unimplemented (always return []), so those tabs will simply show "no results"
// until the backend fills them in.
interface SearchVideo {
  id:         string;
  title:      string;
  subject?:   string;
  board?:     string;
  chapter?:   string;
  duration?:  string;
  youtube_id?: string;
}

interface SearchNote {
  id:       string;
  title:    string;
  subject?: string;
  board?:   string;
  chapter?: string;
}

interface SearchChapter {
  id:       string;
  title:    string;
  subject?: string;
  board?:   string;
  videos?:  number;
  notes?:   number;
}

interface SearchResponse {
  videos:    SearchVideo[];
  notes:     SearchNote[];
  chapters:  SearchChapter[];
  questions: any[];
  pyqs:      any[];
}

type TabKey = "all" | "videos" | "notes" | "chapters" | "questions" | "pyqs";

const TABS: { key: TabKey; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: "all",       label: "All",       icon: "apps-outline" },
  { key: "videos",    label: "Videos",    icon: "play-circle-outline" },
  { key: "notes",     label: "Notes",     icon: "document-text-outline" },
  { key: "chapters",  label: "Chapters",  icon: "book-outline" },
  { key: "questions", label: "Questions", icon: "help-circle-outline" },
  { key: "pyqs",      label: "PYQs",      icon: "newspaper-outline" },
];

const RECENT_KEY = "edulearn_recent_searches";
const MAX_RECENT = 10;

// A single row shape unifying all result types for rendering. Each kind
// gets one distinct solid tint (no gradients, no indigo/violet pairing)
// purely to help scan a mixed result list at a glance.
interface UnifiedResult {
  kind: "video" | "note" | "chapter" | "question" | "pyq";
  id: string;
  title: string;
  meta: string;
  icon: keyof typeof Ionicons.glyphMap;
  iconColor: string;
  raw: any;
}

function toUnified(data: SearchResponse | undefined): UnifiedResult[] {
  if (!data) return [];
  const out: UnifiedResult[] = [];

  for (const v of data.videos ?? []) {
    out.push({
      kind: "video",
      id: v.id,
      title: v.title,
      meta: [v.subject, v.chapter, v.board].filter(Boolean).join(" · "),
      icon: "play-circle",
      iconColor: palette.primary600,
      raw: v,
    });
  }
  for (const n of data.notes ?? []) {
    out.push({
      kind: "note",
      id: n.id,
      title: n.title,
      meta: [n.subject, n.chapter, n.board].filter(Boolean).join(" · "),
      icon: "document-text",
      iconColor: palette.success600,
      raw: n,
    });
  }
  for (const c of data.chapters ?? []) {
    out.push({
      kind: "chapter",
      id: c.id,
      title: c.title,
      meta: [c.subject, c.board].filter(Boolean).join(" · "),
      icon: "book",
      iconColor: palette.info600,
      raw: c,
    });
  }
  for (const q of data.questions ?? []) {
    out.push({
      kind: "question",
      id: q.id ?? String(Math.random()),
      title: q.title ?? q.question_text ?? "Question",
      meta: [q.subject, q.chapter, q.board].filter(Boolean).join(" · "),
      icon: "help-circle",
      iconColor: palette.warning600,
      raw: q,
    });
  }
  for (const p of data.pyqs ?? []) {
    out.push({
      kind: "pyq",
      id: p.id ?? String(Math.random()),
      title: p.title ?? "Previous Year Paper",
      meta: [p.subject, p.year, p.board].filter(Boolean).join(" · "),
      icon: "newspaper",
      iconColor: palette.danger500,
      raw: p,
    });
  }
  return out;
}

function filterByTab(all: UnifiedResult[], tab: TabKey): UnifiedResult[] {
  if (tab === "all") return all;
  const kindByTab: Record<Exclude<TabKey, "all">, UnifiedResult["kind"]> = {
    videos: "video", notes: "note", chapters: "chapter", questions: "question", pyqs: "pyq",
  };
  return all.filter((r) => r.kind === kindByTab[tab as Exclude<TabKey, "all">]);
}

// ─── Result row ───────────────────────────────────────────────────────────────

function ResultRow({ item, onPress }: { item: UnifiedResult; onPress: (item: UnifiedResult) => void }) {
  return (
    <TouchableOpacity style={styles.row} activeOpacity={0.75} onPress={() => onPress(item)}>
      <View style={[styles.rowIcon, { backgroundColor: item.iconColor }]}>
        <Ionicons name={item.icon} size={20} color="#fff" />
      </View>
      <View style={styles.rowInfo}>
        <Text style={styles.rowTitle} numberOfLines={2}>{item.title}</Text>
        {!!item.meta && <Text style={styles.rowMeta} numberOfLines={1}>{item.meta}</Text>}
      </View>
      {item.kind === "video" ? (
        <Ionicons name="play-circle-outline" size={20} color={palette.gray400} />
      ) : (
        <Ionicons name="chevron-forward" size={18} color={palette.gray300} />
      )}
    </TouchableOpacity>
  );
}

// ─── Recent search chip ─────────────────────────────────────────────────────────

function RecentChip({ term, onPress, onRemove }: { term: string; onPress: () => void; onRemove: () => void }) {
  return (
    <TouchableOpacity style={styles.recentChip} activeOpacity={0.75} onPress={onPress}>
      <Ionicons name="time-outline" size={14} color={palette.gray500} />
      <Text style={styles.recentChipTxt}>{term}</Text>
      <TouchableOpacity hitSlop={8} onPress={onRemove}>
        <Ionicons name="close" size={14} color={palette.gray400} />
      </TouchableOpacity>
    </TouchableOpacity>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function SearchScreen() {
  const navigation = useNavigation<any>();

  const [query,      setQuery]      = useState("");
  const [activeTab,  setActiveTab]  = useState<TabKey>("all");
  const [results,    setResults]    = useState<SearchResponse | undefined>(undefined);
  const [searching,  setSearching]  = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [recent,     setRecent]     = useState<string[]>([]);

  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Load recent searches ─────────────────────────────────────────────────────
  useEffect(() => {
    AsyncStorage.getItem(RECENT_KEY)
      .then((raw) => {
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) setRecent(parsed);
        }
      })
      .catch(() => {});
  }, []);

  const persistRecent = useCallback(async (list: string[]) => {
    setRecent(list);
    try {
      await AsyncStorage.setItem(RECENT_KEY, JSON.stringify(list));
    } catch {
      // ignore
    }
  }, []);

  const addRecent = useCallback((term: string) => {
    const trimmed = term.trim();
    if (!trimmed) return;
    setRecent((prev) => {
      const next = [trimmed, ...prev.filter((t) => t.toLowerCase() !== trimmed.toLowerCase())].slice(0, MAX_RECENT);
      AsyncStorage.setItem(RECENT_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  const removeRecent = useCallback((term: string) => {
    setRecent((prev) => {
      const next = prev.filter((t) => t !== term);
      AsyncStorage.setItem(RECENT_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  // ── Run search (used by both debounce and recent-search tap) ────────────────────
  const runSearch = useCallback(async (term: string) => {
    setSearching(true);
    setHasSearched(true);
    try {
      const res = await searchApi.global(term);
      setResults(res.data ?? undefined);
    } catch {
      setResults(undefined);
    } finally {
      setSearching(false);
    }
  }, []);

  // ── Debounced input handler (300ms, matching StudentSearchScreen) ───────────────
  const handleQueryChange = useCallback((text: string) => {
    setQuery(text);
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    if (!text.trim()) {
      setResults(undefined);
      setHasSearched(false);
      return;
    }
    debounceTimer.current = setTimeout(() => {
      runSearch(text.trim());
      addRecent(text.trim());
    }, 300);
  }, [runSearch, addRecent]);

  useEffect(() => () => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
  }, []);

  const handleRecentTap = useCallback((term: string) => {
    setQuery(term);
    setActiveTab("all");
    runSearch(term);
    addRecent(term);
  }, [runSearch, addRecent]);

  const handleClear = useCallback(() => {
    setQuery("");
    setResults(undefined);
    setHasSearched(false);
    setActiveTab("all");
  }, []);

  // ── Open a result ─────────────────────────────────────────────────────────────
  const handleResultPress = useCallback((item: UnifiedResult) => {
    if (item.kind === "video" && item.raw?.youtube_id) {
      WebBrowser.openBrowserAsync(`https://www.youtube.com/watch?v=${item.raw.youtube_id}`);
      return;
    }
    // No deep-link destination is wired up yet for notes/chapters/questions/PYQs (and
    // videos without a youtube_id) from a bare search result — the content hierarchy
    // screens expect full board→class→subject→chapter navigation params that a global
    // search result doesn't carry. Rather than fake a broken navigation, surface a toast.
    Toast.show({
      type: "info",
      text1: item.title,
      text2: "Open this from Learn to view full details.",
    });
  }, []);

  const unified = filterByTab(toUnified(results), activeTab);
  const showRecents = !query.trim();
  const showEmpty = !showRecents && hasSearched && !searching && unified.length === 0;

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor={palette.primary600} />

      {/* Header */}
      <View style={[styles.header, { backgroundColor: palette.primary600 }]}>
        <View style={styles.headerTopRow}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} activeOpacity={0.7}>
            <Ionicons name="arrow-back" size={22} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Search</Text>
          <View style={{ width: 36 }} />
        </View>

        <View style={styles.searchRow}>
          <Ionicons name="search" size={18} color={palette.gray400} style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            value={query}
            onChangeText={handleQueryChange}
            placeholder="Search videos, notes, chapters..."
            placeholderTextColor={palette.gray400}
            autoFocus
            returnKeyType="search"
            clearButtonMode="never"
          />
          {searching && <ActivityIndicator size="small" color={palette.primary600} style={{ marginRight: spacing.sm }} />}
          {!!query && (
            <TouchableOpacity onPress={handleClear} hitSlop={8} style={{ marginRight: spacing.md }}>
              <Ionicons name="close-circle" size={18} color={palette.gray400} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Tabs — only shown once there's something to filter */}
      {!showRecents && (
        <View style={styles.tabBar}>
          <FlatList
            data={TABS}
            horizontal
            showsHorizontalScrollIndicator={false}
            keyExtractor={(t) => t.key}
            contentContainerStyle={styles.tabBarContent}
            renderItem={({ item: t }) => {
              const count = t.key === "all" ? toUnified(results).length : filterByTab(toUnified(results), t.key).length;
              const active = activeTab === t.key;
              return (
                <TouchableOpacity
                  style={[styles.tabPill, active && styles.tabPillActive]}
                  activeOpacity={0.75}
                  onPress={() => setActiveTab(t.key)}
                >
                  <Ionicons name={t.icon} size={13} color={active ? "#fff" : palette.gray500} />
                  <Text style={[styles.tabPillTxt, active && styles.tabPillTxtActive]}>{t.label}</Text>
                  {count > 0 && (
                    <View style={[styles.tabCountBadge, active && styles.tabCountBadgeActive]}>
                      <Text style={[styles.tabCountTxt, active && styles.tabCountTxtActive]}>{count}</Text>
                    </View>
                  )}
                </TouchableOpacity>
              );
            }}
          />
        </View>
      )}

      {/* Content */}
      {showRecents ? (
        <View style={styles.flex}>
          {recent.length > 0 ? (
            <View style={styles.recentSection}>
              <View style={styles.recentHeaderRow}>
                <Text style={styles.recentHeaderTxt}>Recent Searches</Text>
                <TouchableOpacity onPress={() => persistRecent([])} hitSlop={8}>
                  <Text style={styles.recentClearTxt}>Clear all</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.recentChips}>
                {recent.map((term) => (
                  <RecentChip
                    key={term}
                    term={term}
                    onPress={() => handleRecentTap(term)}
                    onRemove={() => removeRecent(term)}
                  />
                ))}
              </View>
            </View>
          ) : (
            <View style={styles.emptyState}>
              <Ionicons name="search-outline" size={48} color={palette.gray300} />
              <Text style={styles.emptyText}>Search across videos, notes, chapters, and more</Text>
            </View>
          )}
        </View>
      ) : searching && !results ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={palette.primary600} />
        </View>
      ) : (
        <FlatList
          data={unified}
          keyExtractor={(item) => `${item.kind}-${item.id}`}
          renderItem={({ item }) => <ResultRow item={item} onPress={handleResultPress} />}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={unified.length === 0 ? { flex: 1 } : { paddingBottom: spacing["2xl"] }}
          ListEmptyComponent={
            showEmpty ? (
              <View style={styles.emptyState}>
                <Ionicons name="file-tray-outline" size={48} color={palette.gray300} />
                <Text style={styles.emptyText}>No results found for "{query}"</Text>
                <Text style={styles.emptySubText}>Try a different keyword or check your spelling</Text>
              </View>
            ) : null
          }
        />
      )}
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: palette.gray50 },
  flex: { flex: 1 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },

  // Header
  header: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.lg },
  headerTopRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.md },
  backBtn: { width: 36, height: 36, borderRadius: radius.sm, backgroundColor: "rgba(255,255,255,0.15)", alignItems: "center", justifyContent: "center" },
  headerTitle: { fontSize: 16, fontWeight: "800", color: "#fff" },

  searchRow: { flexDirection: "row", alignItems: "center", backgroundColor: "#fff", borderRadius: radius.md, paddingLeft: spacing.md, minHeight: 44 },
  searchIcon: { marginRight: 6 },
  searchInput: { flex: 1, paddingVertical: spacing.md, fontSize: 15, color: palette.gray900 },

  // Tabs
  tabBar: { backgroundColor: "#fff", borderBottomWidth: 1, borderBottomColor: palette.gray100 },
  tabBarContent: { paddingHorizontal: spacing.md, paddingVertical: spacing.md, gap: spacing.sm },
  tabPill: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: spacing.md, paddingVertical: 7, borderRadius: radius.lg, backgroundColor: palette.gray100, minHeight: 32 },
  tabPillActive: { backgroundColor: palette.primary600 },
  tabPillTxt: { fontSize: 12.5, fontWeight: "700", color: palette.gray500 },
  tabPillTxtActive: { color: "#fff" },
  tabCountBadge: { backgroundColor: palette.gray200, borderRadius: radius.sm, minWidth: 16, height: 16, alignItems: "center", justifyContent: "center", paddingHorizontal: 4 },
  tabCountBadgeActive: { backgroundColor: "rgba(255,255,255,0.25)" },
  tabCountTxt: { fontSize: 10, fontWeight: "700", color: palette.gray500 },
  tabCountTxtActive: { color: "#fff" },

  // Result row
  row: { flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.lg, paddingVertical: spacing.md, backgroundColor: "#fff", minHeight: 44 },
  rowIcon: { width: 42, height: 42, borderRadius: radius.md, alignItems: "center", justifyContent: "center", marginRight: spacing.md, ...cardShadow },
  rowInfo: { flex: 1, marginRight: spacing.sm },
  rowTitle: { fontSize: 14, fontWeight: "700", color: palette.gray900, lineHeight: 19 },
  rowMeta: { fontSize: 12, color: palette.gray500, marginTop: 2 },
  separator: { height: 1, backgroundColor: palette.gray100, marginLeft: 70 },

  // Recent searches
  recentSection: { paddingHorizontal: spacing.lg, paddingTop: spacing["2xl"] },
  recentHeaderRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.md },
  recentHeaderTxt: { fontSize: 13, fontWeight: "800", color: palette.gray700 },
  recentClearTxt: { fontSize: 12.5, fontWeight: "600", color: palette.primary600 },
  recentChips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  recentChip: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#fff", borderWidth: 1, borderColor: palette.gray200, borderRadius: radius.lg, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, minHeight: 40 },
  recentChipTxt: { fontSize: 12.5, fontWeight: "600", color: palette.gray700 },

  // Empty state
  emptyState: { flex: 1, alignItems: "center", justifyContent: "center", paddingTop: spacing["5xl"], paddingHorizontal: spacing["3xl"] },
  emptyText: { fontSize: 14, color: palette.gray500, fontWeight: "600", marginTop: spacing.md, textAlign: "center" },
  emptySubText: { fontSize: 12, color: palette.gray400, marginTop: spacing.xs, textAlign: "center" },
});
