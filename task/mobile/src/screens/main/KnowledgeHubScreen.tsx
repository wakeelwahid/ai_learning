import React, { useEffect, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, SafeAreaView,
  RefreshControl, ActivityIndicator, Image, Modal,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { useQuery } from "@tanstack/react-query";
import * as WebBrowser from "expo-web-browser";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { contentApi } from "@/api/content";
import { palette, semantic } from "@/theme/colors";
import { EmptyState } from "@/components/ui";

const BOOKMARKS_KEY = "knowledge_hub_bookmarks";

interface KnowledgeCategory {
  id: string;
  name: string;
  icon?: string;
  color?: string;
  description?: string;
  sequence?: number;
}

interface KnowledgeArticle {
  id: string;
  category_id: string;
  title: string;
  description: string;
  content?: string;
  cover_image_url?: string;
  duration_min?: number;
  view_count?: number;
  is_trending?: boolean;
  content_type?: "video" | "article";
  video_url?: string;
  external_url?: string;
  author?: string;
}

function formatViews(n?: number): string {
  if (!n) return "0";
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}K`;
  return String(n);
}

export default function KnowledgeHubScreen() {
  const navigation = useNavigation<any>();
  const [refreshing, setRefreshing] = useState(false);
  const [activeCatId, setActiveCatId] = useState<string | null>(null);
  const [openArticle, setOpenArticle] = useState<KnowledgeArticle | null>(null);
  const [bookmarked, setBookmarked] = useState<Set<string>>(new Set());

  // ── Load persisted bookmarks ─────────────────────────────────────────────────
  useEffect(() => {
    AsyncStorage.getItem(BOOKMARKS_KEY)
      .then((raw) => {
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) setBookmarked(new Set(parsed));
        }
      })
      .catch(() => {});
  }, []);

  const {
    data: categoriesRes,
    isLoading: catsLoading,
    refetch: refetchCategories,
  } = useQuery({
    queryKey: ["knowledge-categories"],
    queryFn: () => contentApi.getKnowledgeCategories().then(r => r.data),
    staleTime: 5 * 60_000,
  });

  const {
    data: articlesRes,
    isLoading: articlesLoading,
    refetch: refetchArticles,
  } = useQuery({
    queryKey: ["knowledge-articles", activeCatId],
    queryFn: () =>
      contentApi
        .getKnowledgeArticles(activeCatId ? { category_id: activeCatId, limit: 50 } : { limit: 50 })
        .then(r => r.data),
    staleTime: 60_000,
  });

  const categories: KnowledgeCategory[] = categoriesRes ?? [];
  const articles: KnowledgeArticle[] = articlesRes?.items ?? articlesRes ?? [];
  const isLoading = catsLoading || articlesLoading;

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([refetchCategories(), refetchArticles()]);
    setRefreshing(false);
  };

  const openArticleUrl = (article: KnowledgeArticle) => {
    const url = article.video_url || article.external_url;
    if (url) WebBrowser.openBrowserAsync(url);
  };

  const handlePress = (article: KnowledgeArticle) => {
    contentApi.viewKnowledgeArticle(article.id).catch(() => {/* fire-and-forget */});
    const url = article.video_url || article.external_url;
    if (article.content_type === "video" && url) {
      openArticleUrl(article);
    } else {
      setOpenArticle(article);
    }
  };

  const toggleBookmark = (id: string) => {
    setBookmarked((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      AsyncStorage.setItem(BOOKMARKS_KEY, JSON.stringify(Array.from(next))).catch(() => {});
      return next;
    });
  };

  // Trending = top 4 articles ranked by view count
  const trending = [...articles]
    .sort((a, b) => (b.view_count ?? 0) - (a.view_count ?? 0))
    .slice(0, 4);

  // Hero article = top trending, or first article
  const heroArticle = trending[0] ?? articles[0] ?? null;

  return (
    <SafeAreaView style={styles.safe}>
      <View style={[styles.banner, { backgroundColor: palette.primary600 }]}>
        <View style={styles.bannerTopRow}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="arrow-back" size={20} color="#fff" />
          </TouchableOpacity>
        </View>
        <Text style={styles.bannerTitle}>Knowledge Hub</Text>
        <Text style={styles.bannerSub}>Explore concepts, guides, and resources</Text>

        {heroArticle && (
          <View style={styles.heroCard}>
            <View style={styles.heroPill}>
              <Ionicons name="flame" size={11} color={palette.warning500} />
              <Text style={styles.heroPillTxt}>Trending this week</Text>
            </View>
            <Text style={styles.heroTitle} numberOfLines={2}>{heroArticle.title}</Text>
            <Text style={styles.heroDesc} numberOfLines={2}>{heroArticle.description}</Text>
            <TouchableOpacity
              style={styles.heroBtn}
              activeOpacity={0.85}
              onPress={() => handlePress(heroArticle)}
            >
              <Ionicons name="play-circle" size={16} color={palette.primary600} />
              <Text style={styles.heroBtnTxt}>
                Watch Now{heroArticle.duration_min ? ` · ${heroArticle.duration_min} min` : ""}
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[palette.primary600]} />}
      >
        {/* Trending This Week */}
        {trending.length > 0 && (
          <View style={styles.trendingSection}>
            <View style={styles.trendingHeader}>
              <Ionicons name="trending-up" size={16} color={semantic.warning.text} />
              <Text style={styles.trendingHeaderTxt}>Trending This Week</Text>
            </View>
            {trending.map((tr, i) => {
              const tCat = categories.find((c) => c.id === tr.category_id);
              return (
                <TouchableOpacity
                  key={tr.id}
                  style={styles.trendingRow}
                  activeOpacity={0.85}
                  onPress={() => handlePress(tr)}
                >
                  <View style={styles.trendingBadgeNum}>
                    <Text style={styles.trendingBadgeNumTxt}>{i + 1}</Text>
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.trendingRowTitle} numberOfLines={1}>{tr.title}</Text>
                    <Text style={styles.trendingRowSub} numberOfLines={1}>
                      {tCat?.name ?? "—"} · {formatViews(tr.view_count)} views
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={palette.gray300} />
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {/* Category pills */}
        {categories.length > 0 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.pillRow}
          >
            <TouchableOpacity
              style={[styles.pill, activeCatId === null && styles.pillActive]}
              activeOpacity={0.8}
              onPress={() => setActiveCatId(null)}
            >
              <Text style={[styles.pillTxt, activeCatId === null && styles.pillTxtActive]}>All</Text>
            </TouchableOpacity>
            {categories.map((cat) => {
              const active = cat.id === activeCatId;
              return (
                <TouchableOpacity
                  key={cat.id}
                  style={[styles.pill, active && styles.pillActive]}
                  activeOpacity={0.8}
                  onPress={() => setActiveCatId(cat.id)}
                >
                  {cat.icon ? <Text style={styles.pillIcon}>{cat.icon}</Text> : null}
                  <Text style={[styles.pillTxt, active && styles.pillTxtActive]}>{cat.name}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}

        {isLoading && <ActivityIndicator color={palette.primary600} style={{ marginTop: 32 }} />}

        {!isLoading && articles.length === 0 && (
          <EmptyState icon="sparkles-outline" title="No articles yet" description="Check back soon for new content" />
        )}

        {!isLoading && articles.length > 0 && (
          <View style={styles.grid}>
            {articles.map((a) => (
              <TouchableOpacity
                key={a.id}
                style={styles.card}
                activeOpacity={0.85}
                onPress={() => handlePress(a)}
              >
                <View>
                  {a.cover_image_url ? (
                    <Image source={{ uri: a.cover_image_url }} style={styles.cardImg} resizeMode="cover" />
                  ) : (
                    <View style={[styles.cardImg, styles.cardImgFallback]}>
                      <Ionicons
                        name={a.content_type === "video" ? "play-circle" : "document-text"}
                        size={28}
                        color={palette.primary300}
                      />
                    </View>
                  )}
                  <TouchableOpacity
                    style={styles.bookmarkBtn}
                    activeOpacity={0.8}
                    onPress={() => toggleBookmark(a.id)}
                    hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                  >
                    <Ionicons
                      name={bookmarked.has(a.id) ? "bookmark" : "bookmark-outline"}
                      size={15}
                      color={bookmarked.has(a.id) ? palette.primary600 : palette.gray500}
                    />
                  </TouchableOpacity>
                </View>

                <View style={styles.cardBody}>
                  <View style={styles.badgeRow}>
                    <View style={[styles.typeBadge, a.content_type === "video" ? styles.typeBadgeVideo : styles.typeBadgeArticle]}>
                      <Ionicons
                        name={a.content_type === "video" ? "play" : "document-text-outline"}
                        size={10}
                        color={a.content_type === "video" ? semantic.info.text : semantic.success.text}
                      />
                      <Text style={[styles.typeBadgeTxt, { color: a.content_type === "video" ? semantic.info.text : semantic.success.text }]}>
                        {a.content_type === "video" ? "Video" : "Article"}
                      </Text>
                    </View>
                    {a.is_trending && (
                      <View style={styles.trendingBadge}>
                        <Ionicons name="flame" size={10} color={semantic.warning.text} />
                        <Text style={styles.trendingTxt}>Hot</Text>
                      </View>
                    )}
                  </View>

                  <Text style={styles.cardTitle} numberOfLines={2}>{a.title}</Text>
                  <Text style={styles.cardDesc} numberOfLines={2}>{a.description}</Text>

                  <View style={styles.metaRow}>
                    {a.duration_min != null && (
                      <View style={styles.metaItem}>
                        <Ionicons name="time-outline" size={11} color={palette.gray400} />
                        <Text style={styles.metaTxt}>{a.duration_min} min</Text>
                      </View>
                    )}
                    {a.view_count != null && (
                      <View style={styles.metaItem}>
                        <Ionicons name="eye-outline" size={11} color={palette.gray400} />
                        <Text style={styles.metaTxt}>{formatViews(a.view_count)}</Text>
                      </View>
                    )}
                  </View>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </ScrollView>

      {/* Inline article viewer */}
      <Modal visible={!!openArticle} animationType="slide" transparent onRequestClose={() => setOpenArticle(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.articleModal}>
            <View style={styles.articleHeader}>
              <Text style={styles.articleTitle} numberOfLines={2} ellipsizeMode="tail">{openArticle?.title}</Text>
              <TouchableOpacity onPress={() => setOpenArticle(null)} style={styles.articleClose}>
                <Ionicons name="close" size={20} color={palette.gray500} />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.articleScroll} showsVerticalScrollIndicator={false}>
              {openArticle?.cover_image_url && (
                <Image source={{ uri: openArticle.cover_image_url }} style={styles.articleImg} resizeMode="cover" />
              )}
              {openArticle?.author && (
                <Text style={styles.articleAuthor}>By {openArticle.author}</Text>
              )}
              <Text style={styles.articleDesc}>{openArticle?.description}</Text>
              {!!openArticle?.content && (
                <Text style={styles.articleBody}>{openArticle.content}</Text>
              )}
              {(openArticle?.video_url || openArticle?.external_url) && (
                <TouchableOpacity
                  style={styles.openExternalBtn}
                  activeOpacity={0.85}
                  onPress={() => openArticle && openArticleUrl(openArticle)}
                >
                  <Ionicons name="open-outline" size={16} color="#fff" />
                  <Text style={styles.openExternalTxt}>Open Link</Text>
                </TouchableOpacity>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:       { flex: 1, backgroundColor: palette.gray50 },
  banner:     { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 28 },
  bannerTopRow: { flexDirection: "row", alignItems: "center", marginBottom: 8 },
  backBtn:    { width: 32, height: 32, borderRadius: 16, backgroundColor: "rgba(255,255,255,0.18)", alignItems: "center", justifyContent: "center" },
  bannerTitle:{ color: "#fff", fontSize: 20, fontWeight: "800" },
  bannerSub:  { color: "rgba(255,255,255,0.8)", fontSize: 13, marginTop: 4 },
  content:    { paddingBottom: 32 },

  // Hero card (dynamic — top trending / first article)
  heroCard:     { backgroundColor: "rgba(255,255,255,0.12)", borderRadius: 16, padding: 14, marginTop: 16, borderWidth: 1, borderColor: "rgba(255,255,255,0.18)" },
  heroPill:     { flexDirection: "row", alignItems: "center", gap: 4, alignSelf: "flex-start", backgroundColor: "rgba(255,255,255,0.2)", borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4, marginBottom: 8 },
  heroPillTxt:  { color: "#fff", fontSize: 10.5, fontWeight: "700" },
  heroTitle:    { color: "#fff", fontSize: 16, fontWeight: "800", lineHeight: 21 },
  heroDesc:     { color: "rgba(255,255,255,0.75)", fontSize: 12, lineHeight: 17, marginTop: 4, marginBottom: 12 },
  heroBtn:      { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, alignSelf: "flex-start", backgroundColor: "#fff", borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10 },
  heroBtnTxt:   { color: palette.primary600, fontSize: 12.5, fontWeight: "700" },

  // Trending This Week
  trendingSection:    { paddingHorizontal: 16, marginBottom: 20 },
  trendingHeader:     { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 10 },
  trendingHeaderTxt:  { fontSize: 14, fontWeight: "800", color: palette.gray800 },
  trendingRow:        { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: "#fff", borderRadius: 16, padding: 12, marginBottom: 8, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2 },
  trendingBadgeNum:      { width: 30, height: 30, borderRadius: 10, backgroundColor: palette.primary50, alignItems: "center", justifyContent: "center" },
  trendingBadgeNumTxt:   { fontSize: 13, fontWeight: "800", color: palette.primary600 },
  trendingRowTitle:   { fontSize: 12.5, fontWeight: "700", color: palette.gray900 },
  trendingRowSub:     { fontSize: 10.5, color: palette.gray400, marginTop: 2, fontWeight: "600" },

  // Category pills
  pillRow:      { paddingHorizontal: 12, paddingVertical: 12, gap: 8 },
  pill:         { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 18, backgroundColor: "#fff", borderWidth: 1.5, borderColor: palette.gray200 },
  pillActive:   { backgroundColor: palette.primary600, borderColor: palette.primary600 },
  pillIcon:     { fontSize: 13 },
  pillTxt:      { fontSize: 12.5, fontWeight: "700", color: palette.gray600 },
  pillTxtActive:{ color: "#fff" },

  // Empty state
  empty:      { alignItems: "center", paddingVertical: 48 },
  emptyTxt:   { fontSize: 14, fontWeight: "600", color: palette.gray500, marginTop: 12 },
  emptySub:   { fontSize: 12, color: palette.gray400, marginTop: 4, textAlign: "center" },

  // Article grid
  grid:       { flexDirection: "row", flexWrap: "wrap", paddingHorizontal: 12, gap: 12 },
  card:       { width: "47%", borderRadius: 16, backgroundColor: "#fff", overflow: "hidden", elevation: 2, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 5 },
  cardImg:        { width: "100%", aspectRatio: 16 / 9 },
  cardImgFallback:{ backgroundColor: palette.primary50, alignItems: "center", justifyContent: "center" },
  bookmarkBtn:    { position: "absolute", top: 8, right: 8, width: 26, height: 26, borderRadius: 13, backgroundColor: "rgba(255,255,255,0.9)", alignItems: "center", justifyContent: "center", elevation: 2, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.15, shadowRadius: 2 },
  cardBody:   { padding: 12, gap: 6 },

  badgeRow:       { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  typeBadge:      { flexDirection: "row", alignItems: "center", gap: 3, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 10 },
  typeBadgeVideo:   { backgroundColor: semantic.info.bg },
  typeBadgeArticle: { backgroundColor: semantic.success.bg },
  typeBadgeTxt:   { fontSize: 9.5, fontWeight: "700" },
  trendingBadge:  { flexDirection: "row", alignItems: "center", gap: 2 },
  trendingTxt:    { fontSize: 9.5, fontWeight: "700", color: semantic.warning.text },

  cardTitle:  { fontSize: 12.5, fontWeight: "700", color: palette.gray900, lineHeight: 16 },
  cardDesc:   { fontSize: 10.5, color: palette.gray500, lineHeight: 14 },
  metaRow:    { flexDirection: "row", gap: 10, marginTop: 2 },
  metaItem:   { flexDirection: "row", alignItems: "center", gap: 3 },
  metaTxt:    { fontSize: 9.5, color: palette.gray400, fontWeight: "600" },

  // Article modal
  modalOverlay:   { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  articleModal:   { backgroundColor: "#fff", borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: "85%", paddingTop: 20 },
  articleHeader:  { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", paddingHorizontal: 20, marginBottom: 12, gap: 12 },
  articleTitle:   { flex: 1, fontSize: 17, fontWeight: "800", color: palette.gray900, lineHeight: 22 },
  articleClose:   { width: 32, height: 32, borderRadius: 16, backgroundColor: palette.gray100, alignItems: "center", justifyContent: "center" },
  articleScroll:  { paddingHorizontal: 20 },
  articleImg:     { width: "100%", aspectRatio: 16 / 9, borderRadius: 14, marginBottom: 12 },
  articleAuthor:  { fontSize: 12, fontWeight: "700", color: palette.primary600, marginBottom: 8 },
  articleDesc:    { fontSize: 13.5, color: palette.gray700, lineHeight: 20, marginBottom: 10, fontWeight: "600" },
  articleBody:    { fontSize: 13.5, color: palette.gray600, lineHeight: 21, marginBottom: 24 },
  openExternalBtn:{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: palette.primary600, borderRadius: 14, paddingVertical: 14, marginBottom: 28 },
  openExternalTxt:{ color: "#fff", fontSize: 14, fontWeight: "700" },
});
