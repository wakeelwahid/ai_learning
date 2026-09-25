/**
 * UserAvatar — the ONE way to render a student's face anywhere on the platform
 * (battles, leaderboards, chat, activity feeds, friend lists, invitations…).
 *
 * The photo URL is DERIVED from the user id (gateway /users/avatar/{id}), so
 * every surface gets real photos without each backend list endpoint having to
 * join avatar_url. Scale story for thousands of concurrent users:
 *   - the endpoint is Redis read-through cached (positive + negative) so
 *     repeat hits never touch Postgres;
 *   - responses carry Cache-Control (5 min), so each browser fetches a given
 *     avatar at most once per five minutes regardless of how many rows it
 *     appears in;
 *   - students without a photo resolve to a deterministic initials circle
 *     client-side (the 404 is cached too).
 * An explicit `src` (e.g. a fresh ?v= URL right after upload) wins over the
 * derived URL.
 */
import { useState } from "react";

const API_ORIGIN = (import.meta.env.VITE_API_URL ?? "http://localhost:9000/api").replace(/\/api\/?$/, "");

export const avatarUrlFor = (userId?: string | null): string | null =>
  userId ? `${API_ORIGIN}/api/v1/users/avatar/${userId}` : null;

const GRADIENTS = [
  "from-indigo-500 to-purple-600",
  "from-emerald-500 to-teal-600",
  "from-amber-500 to-orange-600",
  "from-rose-500 to-pink-600",
  "from-sky-500 to-blue-600",
  "from-violet-500 to-fuchsia-600",
];

function gradientFor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = seed.charCodeAt(i) + ((h << 5) - h);
  return GRADIENTS[Math.abs(h) % GRADIENTS.length];
}

export default function UserAvatar({
  userId,
  name,
  src,
  sizeClass = "w-8 h-8 text-sm",
  className = "",
}: {
  userId?: string | null;
  name?: string | null;
  /** Explicit URL (wins over the derived one), e.g. right after an upload */
  src?: string | null;
  /** Tailwind size + font classes, e.g. "w-10 h-10 text-base" */
  sizeClass?: string;
  className?: string;
}) {
  const [broken, setBroken] = useState(false);
  const url = src || avatarUrlFor(userId);
  const label = (name || "?").trim();

  if (url && !broken) {
    return (
      <img
        src={url}
        alt={label}
        loading="lazy"
        onError={() => setBroken(true)}
        className={`${sizeClass} rounded-full object-cover flex-shrink-0 ${className}`}
      />
    );
  }
  return (
    <div
      className={`${sizeClass} rounded-full bg-gradient-to-br ${gradientFor(label)} flex items-center justify-center text-white font-bold select-none flex-shrink-0 ${className}`}
    >
      {label.charAt(0).toUpperCase()}
    </div>
  );
}
