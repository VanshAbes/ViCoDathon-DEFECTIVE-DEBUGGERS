import type { Config } from "tailwindcss";

/**
 * NEXUS // INTERVIEW COMMAND — design token system.
 *
 * Palette logic:
 *  - void / obsidian / graphite: layered dark neutrals (background -> shell -> panel -> raised)
 *  - cyan: primary signal color (live status, primary actions, focus)
 *  - violet: secondary signal color (agent/AI presence, used sparingly)
 *  - signal-* : semantic status colors for pass/fail/skip/at-risk states
 */
const config: Config = {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        void: "#05070A",
        obsidian: {
          DEFAULT: "#0A0D12",
          shell: "#0B0E14",
        },
        graphite: {
          DEFAULT: "#10141B",
          raised: "#161B24",
          hover: "#1B212C",
        },
        line: {
          hairline: "rgba(148,163,184,0.08)",
          subtle: "rgba(148,163,184,0.14)",
          strong: "rgba(148,163,184,0.26)",
        },
        ink: {
          primary: "#E8EDF4",
          secondary: "#9AA7BA",
          tertiary: "#5B6678",
          disabled: "#3B4351",
        },
        cyan: {
          DEFAULT: "#2FE6FF",
          dim: "rgba(47,230,255,0.12)",
          line: "rgba(47,230,255,0.35)",
          soft: "#8FF3FF",
        },
        violet: {
          DEFAULT: "#8B7CF6",
          dim: "rgba(139,124,246,0.12)",
          line: "rgba(139,124,246,0.35)",
          soft: "#C3B9FB",
        },
        signal: {
          pass: "#34D399",
          "pass-dim": "rgba(52,211,153,0.12)",
          warn: "#F5B84B",
          "warn-dim": "rgba(245,184,75,0.12)",
          fail: "#F1596A",
          "fail-dim": "rgba(241,89,106,0.12)",
          idle: "#5B6678",
          "idle-dim": "rgba(91,102,120,0.12)",
        },
      },
      fontFamily: {
        sans: [
          "Inter",
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "sans-serif",
        ],
        mono: ["IBM Plex Mono", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      fontSize: {
        "2xs": ["0.6875rem", { lineHeight: "1rem", letterSpacing: "0.02em" }],
      },
      letterSpacing: {
        widest2: "0.18em",
      },
      backgroundImage: {
        "grid-fine":
          "linear-gradient(rgba(148,163,184,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,0.05) 1px, transparent 1px)",
        "grid-fade":
          "radial-gradient(ellipse 80% 60% at 50% -10%, rgba(47,230,255,0.08), transparent 60%)",
      },
      backgroundSize: {
        grid: "28px 28px",
      },
      boxShadow: {
        panel: "0 1px 0 0 rgba(255,255,255,0.02) inset, 0 12px 32px -16px rgba(0,0,0,0.6)",
        glow: "0 0 0 1px rgba(47,230,255,0.25), 0 0 24px -4px rgba(47,230,255,0.35)",
        "glow-violet": "0 0 0 1px rgba(139,124,246,0.25), 0 0 24px -4px rgba(139,124,246,0.35)",
      },
      keyframes: {
        pulseDot: {
          "0%, 100%": { opacity: "1", boxShadow: "0 0 0 0 rgba(47,230,255,0.5)" },
          "50%": { opacity: "0.6", boxShadow: "0 0 0 4px rgba(47,230,255,0)" },
        },
        scan: {
          "0%": { backgroundPosition: "0 0" },
          "100%": { backgroundPosition: "0 28px" },
        },
        fadeUp: {
          "0%": { opacity: "0", transform: "translateY(4px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        blink: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0" },
        },
      },
      animation: {
        "pulse-dot": "pulseDot 2s ease-in-out infinite",
        "fade-up": "fadeUp 0.25s ease-out",
        blink: "blink 1s step-end infinite",
      },
      borderRadius: {
        xs: "3px",
      },
    },
  },
  plugins: [],
};

export default config;
