import { StyleSheet, Text, View, type TextStyle, type StyleProp } from "react-native";
import { colors, fonts } from "../theme";

/** INR exactly as `₹ 29,990` — never raw source strings. */
export function formatPriceParts(
  amount: number | null | undefined,
  currency: string = "INR"
): { glyph: string; amount: string } | null {
  if (amount == null || !Number.isFinite(amount)) return null;
  const code = currency === "USD" ? "USD" : "INR";
  const glyph = code === "USD" ? "$" : "₹";
  const amountText = new Intl.NumberFormat(code === "USD" ? "en-US" : "en-IN", {
    maximumFractionDigits: amount % 1 === 0 ? 0 : 2,
  }).format(amount);
  return { glyph, amount: amountText };
}

export function formatPrice(amount: number | null | undefined, currency: string = "INR"): string {
  const parts = formatPriceParts(amount, currency);
  if (!parts) return "Check manually";
  return `${parts.glyph} ${parts.amount}`;
}

export function PriceText({
  amount,
  currency = "INR",
  style,
  glyphStyle,
  fallback = "Check manually",
}: {
  amount: number | null | undefined;
  currency?: string;
  style?: StyleProp<TextStyle>;
  glyphStyle?: StyleProp<TextStyle>;
  fallback?: string;
}) {
  const parts = formatPriceParts(amount, currency);
  if (!parts) {
    return <Text style={[styles.fallback, style]}>{fallback}</Text>;
  }
  return (
    <View style={styles.row}>
      <Text style={[styles.glyph, glyphStyle, style]}>{parts.glyph}</Text>
      <Text style={[styles.amount, style]}> {parts.amount}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "baseline" },
  glyph: { fontFamily: fonts.serif, color: colors.text },
  amount: { fontFamily: fonts.serif, color: colors.text },
  fallback: { fontFamily: fonts.sans, color: colors.textMuted },
});
