/** India Daylight — single source for color, type, space, motion. No hex in screens. */

export const colors = {
  bg: "#F7F8FA",
  bgElevated: "#FFFFFF",
  surface: "#FFFFFF",
  surfaceElevated: "#FFFFFF",
  surfaceMuted: "#F1F5F9",
  border: "#E2E8F0",
  /** @deprecated use border */
  surfaceBorder: "#E2E8F0",

  text: "#0F172A",
  textMuted: "#64748B",
  textFaint: "#94A3B8",

  accent: "#EA580C",
  accentSoft: "rgba(234,88,12,0.12)",
  onAccent: "#FFFFFF",

  buy: "#0F766E",
  buySoft: "rgba(15,118,110,0.12)",
  wait: "#B45309",
  waitSoft: "rgba(180,83,9,0.12)",
  avoid: "#E11D48",
  avoidSoft: "rgba(225,29,72,0.10)",
  mixed: "#7C3AED",
  mixedSoft: "rgba(124,58,237,0.10)",

  overlayScrim: "rgba(15,23,42,0.45)",
  ticketPerforation: "#CBD5E1",
};

export type VerdictKind = "buy" | "wait" | "avoid" | "mixed";

export const verdictGradient: Record<VerdictKind, [string, string]> = {
  buy: ["#ECFDF5", "#FFFFFF"],
  wait: ["#FFFBEB", "#FFFFFF"],
  avoid: ["#FFF1F2", "#FFFFFF"],
  mixed: ["#F5F3FF", "#FFFFFF"],
};

export const verdictColor: Record<VerdictKind, string> = {
  buy: colors.buy,
  wait: colors.wait,
  avoid: colors.avoid,
  mixed: colors.mixed,
};

export const verdictSoft: Record<VerdictKind, string> = {
  buy: colors.buySoft,
  wait: colors.waitSoft,
  avoid: colors.avoidSoft,
  mixed: colors.mixedSoft,
};

export const verdictLabel: Record<VerdictKind, string> = {
  buy: "Buy",
  wait: "Wait",
  avoid: "Avoid",
  mixed: "Mixed",
};

/** Primary CTA gradient (mango). */
export const ctaGradient: [string, string] = ["#FB923C", "#EA580C"];
/** @deprecated use ctaGradient */
export const goldGradient = ctaGradient;

export const radius = { sm: 10, md: 14, lg: 18, xl: 24, pill: 999 };

/** 4pt spacing scale: space(4) = 16 */
export const space = (n: number) => n * 4;
export const spacing = space;

export const iconSize = { sm: 16, md: 20, lg: 24, xl: 32 };
export const hitSlop = { top: 8, bottom: 8, left: 8, right: 8 };
/** Prefer StyleSheet.hairlineWidth at call sites; token for consistent 1px borders. */
export const hairline = 1;

export const elevation = {
  soft: {
    shadowColor: "#0F172A",
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  card: {
    shadowColor: "#0F172A",
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
};

export const motion = {
  fast: 180,
  normal: 320,
  slow: 520,
  spring: { damping: 18, stiffness: 220, mass: 0.85 },
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
  h1: { fontFamily: fonts.serif, fontSize: 32, letterSpacing: 0.2, lineHeight: 38 },
  h2: { fontFamily: fonts.sansSemiBold, fontSize: 18, letterSpacing: -0.2, lineHeight: 24 },
  h3: { fontFamily: fonts.sansSemiBold, fontSize: 16, letterSpacing: -0.1, lineHeight: 22 },
  body: { fontFamily: fonts.sans, fontSize: 15, lineHeight: 22 },
  bodyMedium: { fontFamily: fonts.sansMedium, fontSize: 15, lineHeight: 22 },
  small: { fontFamily: fonts.sansSemiBold, fontSize: 13, lineHeight: 18 },
  caption: { fontFamily: fonts.sans, fontSize: 12, lineHeight: 16 },
  label: { fontFamily: fonts.sansBold, fontSize: 11, letterSpacing: 0.6, lineHeight: 14 },
  mono: { fontFamily: fonts.monoBold, fontSize: 14, lineHeight: 18 },
  monoSm: { fontFamily: fonts.mono, fontSize: 11, letterSpacing: 0.4, lineHeight: 14 },
  tab: { fontFamily: fonts.sansSemiBold, fontSize: 11, lineHeight: 14 },
};
