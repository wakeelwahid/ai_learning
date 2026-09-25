import React, { useState } from "react";
import { TouchableOpacity, ActivityIndicator, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Toast from "react-native-toast-message";
import { contentApi } from "@/api/content";

interface Props {
  entityType: "video" | "note";
  entityId: string;
  /** Server-known bookmark state on mount — the button owns its own toggle
   * state after that, matching the web BookmarkButton's contract. */
  initialBookmarked: boolean;
  size?: number;
  /** Fired after a successful toggle with the new state, so a parent list
   * (e.g. the Saved screen) can refetch without this component needing to
   * know about React Query. */
  onToggled?: (bookmarked: boolean) => void;
}

/**
 * Reusable save-for-later toggle for a video or note — mirrors the web
 * frontend's BookmarkButton so both apps share one mental model and one
 * backend contract (POST /content/bookmarks/toggle).
 */
export default function BookmarkButton({ entityType, entityId, initialBookmarked, size = 22, onToggled }: Props) {
  const [bookmarked, setBookmarked] = useState(initialBookmarked);
  const [pending, setPending] = useState(false);

  const handlePress = async () => {
    if (pending) return;
    setPending(true);
    const next = !bookmarked;
    setBookmarked(next); // optimistic
    try {
      const { data } = await contentApi.toggleBookmark(entityType, entityId);
      setBookmarked(data.bookmarked);
      onToggled?.(data.bookmarked);
      Toast.show({ type: "success", text1: data.bookmarked ? "Saved for later" : "Removed from saved" });
    } catch {
      setBookmarked(!next); // revert on failure
      Toast.show({ type: "error", text1: "Couldn't update bookmark", text2: "Please try again." });
    } finally {
      setPending(false);
    }
  };

  return (
    <TouchableOpacity onPress={handlePress} disabled={pending} style={styles.btn} activeOpacity={0.7}>
      {pending ? (
        <ActivityIndicator size="small" color="#F59E0B" />
      ) : (
        <Ionicons
          name={bookmarked ? "bookmark" : "bookmark-outline"}
          size={size}
          color={bookmarked ? "#F59E0B" : "#9CA3AF"}
        />
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  btn: { padding: 4, alignItems: "center", justifyContent: "center" },
});
