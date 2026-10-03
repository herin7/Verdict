import { StyleSheet, View } from "react-native";
import { FadeIn } from "../../components/FadeIn";
import { Text } from "../../components/ui";
import { colors, fonts, radius, space } from "../../theme";
import { buyerDna, labelOf, type BuyerProfile } from "./questions";

/**
 * Who they told us they are, read back: the traits, then exactly what every
 * verdict will weigh first and what will count against a product.
 */
export function BuyerDna({ profile, animate = true }: { profile: BuyerProfile; animate?: boolean }) {
  const traits = buyerDna(profile);
  const step = animate ? 120 : 0;
  return (
    <View style={styles.wrap}>
      <View style={styles.traits} accessible accessibilityLabel={`Your buyer DNA: ${traits.join(", ")}`}>
        {traits.map((trait, i) => (
          <FadeIn key={trait} delay={i * step} duration={animate ? 450 : 0}>
            <Text style={[styles.trait, i === traits.length - 1 && styles.traitLast]}>{trait}</Text>
          </FadeIn>
        ))}
      </View>

      <FadeIn delay={traits.length * step + step} style={styles.weighs}>
        <Group title="Weighed first">
          {profile.nonNegotiables.map((key, i) => (
            <Tag key={key} label={labelOf(key)} rank={i + 1} />
          ))}
        </Group>
        <Group title="Counts against a product">
          {profile.regrets.map((key) => (
            <Tag key={key} label={labelOf(key)} />
          ))}
        </Group>
      </FadeIn>
    </View>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.group}>
      <Text variant="overline">{title}</Text>
      <View style={styles.tags}>{children}</View>
    </View>
  );
}

function Tag({ label, rank }: { label: string; rank?: number }) {
  return (
    <View style={[styles.tag, rank ? styles.tagRanked : null]}>
      {rank ? <Text style={styles.rank}>{rank}</Text> : null}
      <Text variant="subhead" style={[styles.tagText, rank ? styles.tagTextRanked : null]}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space(10) },
  traits: { gap: space(1) },
  trait: { fontFamily: fonts.extrabold, fontSize: 32, lineHeight: 40, letterSpacing: -0.8, color: colors.text },
  traitLast: { color: colors.primary },
  weighs: { gap: space(6) },
  group: { gap: space(3) },
  tags: { flexDirection: "row", flexWrap: "wrap", gap: space(2) },
  tag: {
    flexDirection: "row",
    alignItems: "center",
    gap: space(2),
    paddingHorizontal: space(3),
    minHeight: 36,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceMuted,
  },
  tagRanked: { backgroundColor: colors.primarySoft },
  rank: { fontFamily: fonts.extrabold, fontSize: 12, color: colors.primary },
  tagText: { color: colors.text },
  tagTextRanked: { color: colors.primary, fontFamily: fonts.semibold },
});
