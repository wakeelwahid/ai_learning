// Re-exports the app's existing single source of truth for avatar rendering
// (derived-URL image with a deterministic initials fallback) under the
// ui/ primitives barrel, so new screens can `import { Avatar } from
// "@/components/ui"` alongside Button/Card/Badge without duplicating logic.
export { default as Avatar, avatarUrlFor } from "@/components/UserAvatar";
