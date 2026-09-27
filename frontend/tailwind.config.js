/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  darkMode: "class",
  theme: {
    screens: {
      // Extra breakpoint below Tailwind's default `sm` (640px) so narrow
      // viewports (~360px+) can still opt into a slightly less cramped
      // layout while anything narrower (down to the 270px minimum this
      // app supports) safely falls back to the unprefixed base classes.
      xs: "400px",
      sm: "640px",
      md: "768px",
      lg: "1024px",
      xl: "1280px",
      "2xl": "1536px",
    },
    extend: {
      colors: {
        // Single brand accent — emerald-600 (#059669), a clean, professional
        // green matching Tailwind's real emerald ramp exactly (verified via
        // tailwindcss/colors), so `primary-*` and `emerald-*` are interchangeable.
        // Kept distinct from `success` below (a different green family) so a
        // "correct answer" / "completed" state still reads as its own signal.
        primary: {
          50:  "#ecfdf5",
          100: "#d1fae5",
          200: "#a7f3d0",
          300: "#6ee7b7",
          400: "#34d399",
          500: "#10b981",
          600: "#059669",
          700: "#047857",
          800: "#065f46",
          900: "#064e3b",
          950: "#022c22",
        },
        // Semantic status colors — one shade family each, used ONLY for
        // status/feedback (badges, alerts, form errors), never as decoration.
        // Full scales match Tailwind's real green/amber/red/blue ramps exactly
        // (verified via tailwindcss/colors), same convention as `primary` above.
        success: {
          50: "#f0fdf4", 100: "#dcfce7", 200: "#bbf7d0", 300: "#86efac", 400: "#4ade80",
          500: "#22c55e", 600: "#16a34a", 700: "#15803d", 800: "#166534", 900: "#14532d", 950: "#052e16",
        },
        warning: {
          50: "#fffbeb", 100: "#fef3c7", 200: "#fde68a", 300: "#fcd34d", 400: "#fbbf24",
          500: "#f59e0b", 600: "#d97706", 700: "#b45309", 800: "#92400e", 900: "#78350f", 950: "#451a03",
        },
        danger: {
          50: "#fef2f2", 100: "#fee2e2", 200: "#fecaca", 300: "#fca5a5", 400: "#f87171",
          500: "#ef4444", 600: "#dc2626", 700: "#b91c1c", 800: "#991b1b", 900: "#7f1d1d", 950: "#450a0a",
        },
        info: {
          50: "#eff6ff", 100: "#dbeafe", 200: "#bfdbfe", 300: "#93c5fd", 400: "#60a5fa",
          500: "#3b82f6", 600: "#2563eb", 700: "#1d4ed8", 800: "#1e40af", 900: "#1e3a8a", 950: "#172554",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
      },
      borderRadius: {
        sm: "0.375rem",
        md: "0.5rem",
        lg: "0.75rem",
        xl: "1rem",
        "2xl": "1.25rem",
      },
      boxShadow: {
        // Restrained elevation — two levels only. Resting cards use `sm`
        // (near-invisible), interactive cards elevate to `md` on hover.
        sm: "0 1px 2px 0 rgb(0 0 0 / 0.04)",
        md: "0 4px 12px -2px rgb(0 0 0 / 0.08)",
      },
      animation: {
        skeleton: "skeleton 1.5s ease-in-out infinite",
        "fade-in":  "fadeIn 0.3s ease-out",
        "slide-up": "slideUp 0.4s ease-out",
        "scale-in": "scaleIn 0.2s ease-out",
        "bounce-soft": "bounceSoft 0.6s ease-in-out",
        wave: "wave 1.6s ease-in-out 1",
      },
      keyframes: {
        skeleton: {
          "0%, 100%": { opacity: "1" },
          "50%":       { opacity: "0.4" },
        },
        fadeIn: {
          from: { opacity: "0" },
          to:   { opacity: "1" },
        },
        slideUp: {
          from: { opacity: "0", transform: "translateY(16px)" },
          to:   { opacity: "1", transform: "translateY(0)" },
        },
        scaleIn: {
          from: { opacity: "0", transform: "scale(0.95)" },
          to:   { opacity: "1", transform: "scale(1)" },
        },
        bounceSoft: {
          "0%, 100%": { transform: "scale(1)" },
          "50%":      { transform: "scale(1.08)" },
        },
        wave: {
          "0%, 60%, 100%": { transform: "rotate(0deg)" },
          "10%, 30%":      { transform: "rotate(14deg)" },
          "20%":           { transform: "rotate(-8deg)" },
          "40%":           { transform: "rotate(10deg)" },
          "50%":           { transform: "rotate(-4deg)" },
        },
      },
    },
  },
  plugins: [],
};
