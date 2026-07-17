import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { MotiView } from "moti";
import {
  colors,
  elevation,
  font,
  fonts,
  motion,
  radius,
  space,
  verdictColor,
  verdictGradient,
  verdictLabel,
  verdictSoft,
  type VerdictKind,
} from "../theme";
import { Money } from "./ui";

type Props = {
  verdict: VerdictKind;
  productTitle: string;
  headline?: string;
  /** Primary money callout (savings or price). */
  amount?: number | null;
  currency?: string;
  amountLabel?: string;
  sourceCount?: number;
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
  reduceMotion?: boolean;
};

/** Signature report hero — tear-off price ticket. */
export function VerdictTicket({
  verdict,
  productTitle,
  headline,
  amount,
  currency = "INR",
  amountLabel,
  sourceCount,
  compact,
  style,
  reduceMotion,
}: Props) {
  const [g0, g1] = verdictGradient[verdict];
  const stamp = (
    <View style={[styles.stamp, { backgroundColor: verdictSoft[verdict], borderColor: verdictColor[verdict] }]}>
      <Text style={[styles.stampText, { color: verdictColor[verdict] }]}>{verdictLabel[verdict]}</Text>
    </View>
  );

  const body = (
    <View style={[styles.ticket, { backgroundColor: g0 }, style]}>
      <View style={[styles.top, { backgroundColor: g1 }]}>
        <Text style={styles.eyebrow}>Verdict</Text>
        {stamp}
      </View>
      <View style={styles.perforation}>
        {Array.from({ length: 18 }).map((_, i) => (
          <View key={i} style={styles.dot} />
        ))}
      </View>
      <View style={[styles.body, compact && styles.bodyCompact]}>
        <Text style={styles.product} numberOfLines={compact ? 2 : 3}>
          {productTitle}
        </Text>
        {headline ? (
          <Text style={styles.headline} numberOfLines={compact ? 2 : 4}>
            {headline}
          </Text>
        ) : null}
        {amount != null && Number.isFinite(amount) ? (
          <View style={styles.moneyRow}>
            {amountLabel ? <Text style={styles.amountLabel}>{amountLabel}</Text> : null}
            <Money amount={amount} currency={currency} style={styles.amount} />
          </View>
        ) : null}
        {sourceCount != null ? (
          <Text style={styles.sources}>
            {sourceCount} source{sourceCount === 1 ? "" : "s"} checked
          </Text>
        ) : null}
      </View>
    </View>
  );

  if (reduceMotion) return body;

  return (
    <MotiView
      from={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ type: "timing", duration: motion.normal }}
    >
      {body}
    </MotiView>
  );
}

const styles = StyleSheet.create({
  ticket: {
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    overflow: "hidden",
    ...elevation.soft,
  },
  top: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: space(4),
    paddingVertical: space(3),
  },
  eyebrow: { ...font.monoSm, color: colors.textMuted, textTransform: "uppercase" },
  stamp: {
    paddingHorizontal: space(3),
    paddingVertical: space(1.5),
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderStyle: "dashed",
  },
  stampText: { ...font.label, letterSpacing: 1.2, textTransform: "uppercase" },
  perforation: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: space(2),
    backgroundColor: colors.bg,
  },
  dot: {
    width: space(1.5),
    height: space(1.5),
    borderRadius: radius.pill,
    backgroundColor: colors.ticketPerforation,
    marginVertical: space(1),
  },
  body: { padding: space(4), gap: space(2), backgroundColor: colors.surface },
  bodyCompact: { padding: space(3), gap: space(1.5) },
  product: { ...font.h3, color: colors.text },
  headline: { ...font.body, color: colors.textMuted },
  moneyRow: { marginTop: space(1), gap: space(0.5) },
  amountLabel: { ...font.caption, color: colors.textFaint },
  amount: { fontFamily: fonts.monoBold, fontSize: 28, lineHeight: 34, color: colors.text },
  sources: { ...font.monoSm, color: colors.textFaint, marginTop: space(1) },
});
