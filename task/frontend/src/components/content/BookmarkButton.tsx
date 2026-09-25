import { useState } from "react";
import { Bookmark } from "lucide-react";
import toast from "react-hot-toast";
import { contentApi } from "@/lib/api";

interface Props {
  entityType: "video" | "note";
  entityId: string;
  /** Server-known bookmark state on mount — the button is uncontrolled after
   * that (it owns its own toggle state), matching how a real bookmark icon
   * behaves: instant local feedback, no waiting on a refetch. */
  initialBookmarked: boolean;
  size?: "sm" | "md";
  className?: string;
  /** Fired after a successful toggle, with the new state — lets a parent
   * list (e.g. the Saved page) invalidate/refetch without this component
   * needing to know about React Query. */
  onToggled?: (bookmarked: boolean) => void;
}

const SIZE_CLASSES: Record<NonNullable<Props["size"]>, string> = {
  sm: "w-3.5 h-3.5",
  md: "w-5 h-5",
};

/**
 * Reusable save-for-later toggle for a video or note. Self-contained: owns
 * its own request + optimistic state, so any list/detail page can drop this
 * in without re-implementing the toggle call or the pending-state UI.
 */
export default function BookmarkButton({ entityType, entityId, initialBookmarked, size = "md", className = "", onToggled }: Props) {
  const [bookmarked, setBookmarked] = useState(initialBookmarked);
  const [pending, setPending] = useState(false);

  const handleToggle = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (pending) return;
    setPending(true);
    const next = !bookmarked;
    setBookmarked(next); // optimistic
    try {
      const { data } = await contentApi.toggleBookmark(entityType, entityId);
      setBookmarked(data.bookmarked);
      onToggled?.(data.bookmarked);
      toast.success(data.bookmarked ? "Saved for later" : "Removed from saved", { id: "bookmark-toast" });
    } catch {
      setBookmarked(!next); // revert on failure
      toast.error("Couldn't update bookmark. Please try again.", { id: "bookmark-toast" });
    } finally {
      setPending(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleToggle}
      disabled={pending}
      aria-pressed={bookmarked}
      aria-label={bookmarked ? "Remove from saved" : "Save for later"}
      title={bookmarked ? "Remove from saved" : "Save for later"}
      className={`inline-flex items-center justify-center rounded-full transition-colors disabled:opacity-60 ${
        bookmarked
          ? "text-amber-500 hover:text-amber-600"
          : "text-gray-400 hover:text-amber-500"
      } ${className}`}
    >
      <Bookmark className={`${SIZE_CLASSES[size]} ${bookmarked ? "fill-current" : ""}`} />
    </button>
  );
}
