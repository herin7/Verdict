export const colors = {
  bg: "#000000",
  bgElevated: "#0e0e0e",
  surface: "rgba(255,255,255,0.05)",
  surfaceBorder: "rgba(255,215,109,0.16)",
  text: "#ffffff",
  textMuted: "#b8b2a3",
  textFaint: "#6e6656",

  accent: "#FFD76D",
  accentSoft: "rgba(255,215,109,0.14)",
  onAccent: "#171106",

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

export const radius = { sm: 10, md: 16, lg: 22, xl: 28, pill: 999 };

/** 4pt spacing scale: space(4) = 16 */
export const space = (n: number) => n * 4;

export const spacing = space;

export const elevation = {
  soft: {
    shadowColor: "#000",
    shadowOpacity: 0.35,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
};

export const motion = {
  fast: 180,
  normal: 320,
  slow: 520,
  spring: { damping: 16, stiffness: 180, mass: 0.8 },
};

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
  display: { fontFamily: fonts.serif, fontSize: 40, letterSpacing: 0.2, lineHeight: 44 },
  h1: { fontFamily: fonts.serif, fontSize: 32, letterSpacing: 0.2 },
  h2: { fontFamily: fonts.sansSemiBold, fontSize: 17, letterSpacing: -0.2 },
  body: { fontFamily: fonts.sans, fontSize: 15, lineHeight: 22 },
  small: { fontFamily: fonts.sansSemiBold, fontSize: 12.5 },
  label: { fontFamily: fonts.sansBold, fontSize: 11.5, letterSpacing: 0.8 },
  mono: { fontFamily: fonts.monoBold, fontSize: 14 },
};
