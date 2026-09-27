// Shared design tokens for the mobile app — single source of truth, mirrors
// frontend/tailwind.config.js and admin/tailwind.config.js (same emerald
// scale, same neutral gray scale, same semantic colors) plus the type scale
// documented in frontend/src/index.css. Import from here instead of
// hardcoding hex values or ad-hoc font sizes so every screen stays visually
// consistent with web/admin.
//
// BREAKING CHANGES FROM THE PREVIOUS VERSION OF THIS FILE (sweep-phase agents
// touching screens must account for these):
//   - REMOVED: `brandGradient` (was [primary600, purple700]) — the design
//     system drops indigo-to-violet gradients everywhere. Replace call sites
//     that used it as a `<LinearGradient colors={brandGradient}>` background
//     with a solid `palette.primary600` fill (View style backgroundColor),
//     or where a `LinearGradient` component is structurally required, pass
//     `solid.primary` (a same-color 2-tuple) so the component keeps working
//     with zero visible gradient.
//   - REMOVED: `accentGradients` (indigo/emerald/fuchsia/amber/cyan/rose/
//     teal/violet 2-tuples) — same reason. Replace per-item `grad` lookups
//     with a solid tint from `accentSolid` (same keys, one hex each) or from
//     `palette`/semantic exports directly.
//   - `purple500/600/700` remain (still valid Tailwind-style values) but are
//     no longer part of the brand palette — do not pair them with primary
//     for gradients; they are only appropriate for the same narrow
//     exceptions called out in the design system doc (none currently apply
//     to mobile screens).
//   - Everything else (primary/gray/success/warning/danger/info, radius,
//     shadows) is additive/renamed-safe: existing keys kept, new ones added.

export const palette = {
  // Primary emerald scale — exact match to Tailwind's real emerald ramp used
  // in frontend/tailwind.config.js and admin/tailwind.config.js. Kept
  // distinct from `success*` below (a different green family) so a
  // status/feedback green never reads as the same signal as the brand accent.
  primary50:  "#ecfdf5",
  primary100: "#d1fae5",
  primary200: "#a7f3d0",
  primary300: "#6ee7b7",
  primary400: "#34d399",
  primary500: "#10b981",
  primary600: "#059669",
  primary700: "#047857",
  primary800: "#065f46",
  primary900: "#064e3b",
  primary950: "#022c22",

  // No longer part of the brand palette (see header note) — kept only for
  // any narrow, explicitly-approved non-brand use; do not use for new UI.
  purple500: "#a855f7",
  purple600: "#9333ea",
  purple700: "#7c3aed",

  // Neutral scale — gray, matching web/admin (frontend & admin index.css use
  // `gray-*` throughout; committing to the same family here keeps a Card or
  // Input looking identical whether rendered in React DOM or React Native).
  gray50:  "#f9fafb",
  gray100: "#f3f4f6",
  gray200: "#e5e7eb",
  gray300: "#d1d5db",
  gray400: "#9ca3af",
  gray500: "#6b7280",
  gray600: "#4b5563",
  gray700: "#374151",
  gray800: "#1f2937",
  gray900: "#111827",
  gray950: "#030712",

  // Semantic colors — one shade family each, status/feedback only.
  success50:  "#f0fdf4",
  success100: "#dcfce7",
  success500: "#22c55e",
  success600: "#16a34a",
  success700: "#15803d",
  warning50:  "#fffbeb",
  warning100: "#fef3c7",
  warning500: "#f59e0b",
  warning600: "#d97706",
  warning700: "#b45309",
  danger50:   "#fef2f2",
  danger100:  "#fee2e2",
  danger500:  "#ef4444",
  danger600:  "#dc2626",
  danger700:  "#b91c1c",
  info50:     "#eff6ff",
  info100:    "#dbeafe",
  info500:    "#3b82f6",
  info600:    "#2563eb",
  info700:    "#1d4ed8",
} as const;

// Dark-mode neutral + surface tokens — a considered dark scale (not just
// inverted grays), for screens/components that support a dark appearance.
export const darkPalette = {
  bg:       palette.gray950,
  surface:  palette.gray900,
  surfaceAlt: palette.gray800,
  border:   palette.gray700,
  textPrimary:   palette.gray50,
  textSecondary: palette.gray400,
} as const;

// Semantic color groups, exported cleanly for status/feedback UI
// (badges, alerts, toasts, inline validation).
export const semantic = {
  success: { bg: palette.success50, border: palette.success100, solid: palette.success600, text: palette.success700 },
  warning: { bg: palette.warning50, border: palette.warning100, solid: palette.warning600, text: palette.warning700 },
  danger:  { bg: palette.danger50,  border: palette.danger100,  solid: palette.danger600,  text: palette.danger700 },
  info:    { bg: palette.info50,    border: palette.info100,    solid: palette.info600,    text: palette.info700 },
} as const;

// Solid replacements for the removed `accentGradients` — same keys, one
// flat hex each, so a per-item "grad" lookup becomes a per-item solid tint.
// NOTE: `indigo` is a literal hex, not an alias for `primary600` — several
// call sites use it alongside `emerald`/`violet`/`cyan` etc. in the same
// multi-color swatch list (e.g. per-subject or per-room tinting), so it must
// stay visually distinct from the brand accent rather than following it.
export const accentSolid = {
  indigo:  "#4f46e5",
  emerald: palette.success600,
  fuchsia: "#c026d3",
  amber:   palette.warning600,
  cyan:    "#0891b2",
  rose:    "#e11d48",
  teal:    "#0d9488",
  violet:  palette.purple600,
} as const;

// Solid stand-in for the removed `brandGradient`, for call sites still
// structured around a `LinearGradient colors={...}` prop — passing a
// same-color pair renders as a flat fill with zero code-shape changes.
export const solid = {
  primary: [palette.primary600, palette.primary600] as const,
};

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  pill: 999,
} as const;

// Restrained shadows — reduced elevation vs. the previous heavier presets;
// two levels only, matching web's shadow-sm / shadow-md philosophy.
export const cardShadow = {
  shadowColor: "#000",
  shadowOffset: { width: 0, height: 1 },
  shadowOpacity: 0.04,
  shadowRadius: 3,
  elevation: 1,
} as const;

// Slightly more present shadow for hero/emphasis or hover-equivalent
// (pressed) states — mirrors web's `.card-hover` / `shadow-md`.
export const cardShadowElevated = {
  shadowColor: "#000",
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.08,
  shadowRadius: 8,
  elevation: 3,
} as const;

// Spacing scale — small numeric scale for consistent margins/padding.
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  "2xl": 24,
  "3xl": 32,
  "4xl": 40,
  "5xl": 48,
} as const;

// Typography — named text styles matching the type scale documented in
// frontend/src/index.css (display/h1/h2/h3/h4/bodyLg/body/bodySm/caption).
// fontFamily uses Inter once loaded (see App.tsx useFonts gate); falls back
// to the OS default system font while/if loading, matching the platform
// convention of never hardcoding a font family that might not be ready.
const FONT_FAMILY = "Inter_400Regular";
const FONT_FAMILY_MEDIUM = "Inter_500Medium";
const FONT_FAMILY_SEMIBOLD = "Inter_600SemiBold";
const FONT_FAMILY_BOLD = "Inter_700Bold";

export const typography = {
  display:  { fontSize: 28, lineHeight: 34, fontWeight: "700" as const, fontFamily: FONT_FAMILY_BOLD },
  h1:       { fontSize: 24, lineHeight: 30, fontWeight: "700" as const, fontFamily: FONT_FAMILY_BOLD },
  h2:       { fontSize: 20, lineHeight: 26, fontWeight: "600" as const, fontFamily: FONT_FAMILY_SEMIBOLD },
  h3:       { fontSize: 17, lineHeight: 23, fontWeight: "600" as const, fontFamily: FONT_FAMILY_SEMIBOLD },
  h4:       { fontSize: 15, lineHeight: 21, fontWeight: "600" as const, fontFamily: FONT_FAMILY_SEMIBOLD },
  bodyLg:   { fontSize: 16, lineHeight: 23, fontWeight: "400" as const, fontFamily: FONT_FAMILY },
  body:     { fontSize: 14, lineHeight: 20, fontWeight: "400" as const, fontFamily: FONT_FAMILY },
  bodyMedium: { fontSize: 14, lineHeight: 20, fontWeight: "500" as const, fontFamily: FONT_FAMILY_MEDIUM },
  bodySm:   { fontSize: 12.5, lineHeight: 18, fontWeight: "400" as const, fontFamily: FONT_FAMILY },
  caption:  { fontSize: 11.5, lineHeight: 15, fontWeight: "600" as const, fontFamily: FONT_FAMILY_SEMIBOLD, textTransform: "uppercase" as const, letterSpacing: 0.4 },
} as const;
