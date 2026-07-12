export const colors = {
  bg: "#000000",
  bgElevated: "#0e0e0e",
  surface: "rgba(255,255,255,0.05)",
  surfaceBorder: "rgba(255,215,109,0.16)",
  text: "#ffffff",
  textMuted: "#b8b2a3",
  textFaint: "#6e6656",

  // Brand: everything chrome (buttons, CTAs, active states, gauges) uses gold.
  accent: "#FFD76D",
  accentSoft: "rgba(255,215,109,0.14)",
  onAccent: "#171106", // text/icon color placed on top of solid gold

  // Verdict semantics kept distinct from the brand color for at-a-glance meaning.
  buy: "#34d399",
  wait: "#FFD76D",
  avoid: "#fb7185",
  mixed: "#c4a7f7",
};

export const verdictGradient: Record<"buy" | "wait" | "avoid" | "mixed", [string, string]> = {
  buy: ["#12261f", "#050807"],
  wait: ["#2b2205", "#0d0a02"],
  avoid: ["#2b0d13", "#0d0405"],
  mixed: ["#20182e", "#0a0810"],
};

export const verdictColor: Record<"buy" | "wait" | "avoid" | "mixed", string> = {
  buy: colors.buy,
  wait: colors.wait,
  avoid: colors.avoid,
  mixed: colors.mixed,
};

export const verdictLabel: Record<"buy" | "wait" | "avoid" | "mixed", string> = {
  buy: "Buy",
  wait: "Wait",
  avoid: "Avoid",
  mixed: "Mixed",
};

export const goldGradient: [string, string] = ["#FFE49A", "#FFC94D"];

export const radius = { sm: 10, md: 16, lg: 22, pill: 999 };

export const spacing = (n: number) => n * 4;

/**
 * Type system: Instrument Serif for display/editorial moments, Arimo (metric-
 * compatible with Helvetica/Arial) for UI chrome and body copy, JetBrains Mono
 * for numeric/data readouts (score, stats, prices).
 */
export const fonts = {
  serif: "InstrumentSerif_400Regular",
  serifItalic: "InstrumentSerif_400Regular_Italic",
  sans: "Arimo_400Regular",
  sansMedium: "Arimo_500Medium",
  sansSemiBold: "Arimo_600SemiBold",
  sansBold: "Arimo_700Bold",
  mono: "JetBrainsMono_500Medium",
  monoBold: "JetBrainsMono_700Bold",
};

export const font = {
  h1: { fontFamily: fonts.serif, fontSize: 32, letterSpacing: 0.2 },
  h2: { fontFamily: fonts.sansSemiBold, fontSize: 17, letterSpacing: -0.2 },
  body: { fontFamily: fonts.sans, fontSize: 15, lineHeight: 22 },
  small: { fontFamily: fonts.sansSemiBold, fontSize: 12.5 },
  label: { fontFamily: fonts.sansBold, fontSize: 11.5, letterSpacing: 0.8 },
};
