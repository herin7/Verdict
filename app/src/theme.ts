import { Appearance } from "react-native";

/**
 * Single source for color, type, spacing, radius, shadow and motion.
 * Screens never hardcode these values.
 *
 * Brand: deep "trust" blue carries the UI (headers, primary actions, selection);
 * a warm yellow marks the moments that matter.
 * The scheme is read once at launch.
 */
const isDark = Appearance.getColorScheme() === "dark";

const light = {
  // Brand
  primary: "#1F3BD6",
  primaryPressed: "#172EAD",
  primaryDeep: "#0E1F7A", // header bands
  primarySoft: "#E8ECFF",
  onPrimary: "#FFFFFF",
  accent: "#FFC531", // yellow
  accentSoft: "#FFF4D1",
  onAccent: "#1A1404",

  // Neutrals
  bg: "#F2F4F9",
  surface: "#FFFFFF",
  surfaceMuted: "#EEF1F7",
  border: "#E1E5EE",
  text: "#0B1228",
  textMuted: "#535C75",
  textFaint: "#8790A6",
  scrim: "rgba(8, 12, 30, 0.55)",

  // Verdict semantics
  buy: "#0F9D58",
  buySoft: "#E2F6EB",
  wait: "#D97706",
  waitSoft: "#FDF0DD",
  avoid: "#DC2F45",
  avoidSoft: "#FDE7EA",
};

const dark: typeof light = {
  primary: "#6F88FF",
  primaryPressed: "#5A74F0",
  primaryDeep: "#101A4A",
  primarySoft: "#1A2452",
  onPrimary: "#FFFFFF",
  accent: "#FFC940",
  accentSoft: "#3A2F0E",
  onAccent: "#1A1404",

  bg: "#080B16",
  surface: "#121828",
  surfaceMuted: "#1A2236",
  border: "#252E45",
  text: "#F1F4FC",
  textMuted: "#A7B0C6",
  textFaint: "#6E7891",
  scrim: "rgba(0, 0, 0, 0.6)",

  buy: "#34C77B",
  buySoft: "#10291D",
  wait: "#F5A524",
  waitSoft: "#2E2210",
  avoid: "#FF5C6F",
  avoidSoft: "#331419",
};

export const colors = isDark ? dark : light;

export const statusBarStyle = isDark ? "light" : "dark";

export type VerdictKind = "buy" | "skip" | "depends";

export const verdictColor: Record<VerdictKind, string> = {
  buy: colors.buy,
  skip: colors.avoid,
  depends: colors.wait,
};

export const verdictSoft: Record<VerdictKind, string> = {
  buy: colors.buySoft,
  skip: colors.avoidSoft,
  depends: colors.waitSoft,
};

export const verdictLabel: Record<VerdictKind, string> = {
  buy: "Buy",
  skip: "Skip",
  depends: "Depends",
};

/** 4pt grid: space(4) = 16 */
export const space = (n: number) => n * 4;

export const radius = { sm: 8, md: 12, lg: 16, xl: 24, full: 999 } as const;

export const iconSize = { sm: 16, md: 20, lg: 24, xl: 32 } as const;

export const hitSlop = { top: 8, bottom: 8, left: 8, right: 8 };

export const shadow = {
  card: isDark ? "0 1px 2px rgba(0, 0, 0, 0.4)" : "0 1px 3px rgba(14, 31, 122, 0.06)",
  raised: isDark ? "0 6px 16px rgba(0, 0, 0, 0.45)" : "0 6px 20px rgba(14, 31, 122, 0.10)",
} as const;

export const motion = {
  fast: 150,
  normal: 250,
  slow: 400,
  spring: { damping: 18, stiffness: 260, mass: 0.8 },
} as const;

export const fonts = {
  regular: "PlusJakartaSans_400Regular",
  medium: "PlusJakartaSans_500Medium",
  semibold: "PlusJakartaSans_600SemiBold",
  bold: "PlusJakartaSans_700Bold",
  extrabold: "PlusJakartaSans_800ExtraBold",
} as const;

/** Five sizes, one family. Hierarchy comes from weight and color. */
export const type = {
  display: { fontFamily: fonts.extrabold, fontSize: 28, lineHeight: 34, letterSpacing: -0.6, color: colors.text },
  title: { fontFamily: fonts.bold, fontSize: 20, lineHeight: 26, letterSpacing: -0.3, color: colors.text },
  headline: { fontFamily: fonts.bold, fontSize: 16, lineHeight: 22, color: colors.text },
  body: { fontFamily: fonts.regular, fontSize: 16, lineHeight: 24, color: colors.text },
  bodyStrong: { fontFamily: fonts.semibold, fontSize: 16, lineHeight: 22, color: colors.text },
  subhead: { fontFamily: fonts.medium, fontSize: 14, lineHeight: 20, color: colors.textMuted },
  caption: { fontFamily: fonts.medium, fontSize: 12, lineHeight: 16, color: colors.textMuted },
  overline: {
    fontFamily: fonts.bold,
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 0.8,
    textTransform: "uppercase" as const,
    color: colors.textFaint,
  },
};
