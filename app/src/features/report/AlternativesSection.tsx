import { StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { Icon } from "../../components/icons";
import { Press, Text } from "../../components/ui";
import { colors, iconSize, space } from "../../theme";
import type { ConsensusReport } from "../../types";
import { useInbox } from "../inbox/inbox";
import { ReportSection } from "./ReportSection";

/** Alternatives the sources mention. Tapping one shares it to the inbox and opens it. */
export function AlternativesSection({ alternatives }: { alternatives: ConsensusReport["alternatives"] }) {
  const router = useRouter();
  const inbox = useInbox();
  if (alternatives.length === 0) return null;

  return (
    <ReportSection title="Also consider">
      {alternatives.map((alt, i) => (
        <Press
          key={alt.name}
          onPress={async () => {
            const { clientId } = await inbox.add({ text: alt.name, imageUri: null });
            router.push(`/item/${clientId}`);
          }}
          style={[styles.row, i > 0 && styles.divider]}
          accessibilityLabel={`Get the verdict on ${alt.name}`}
          accessibilityHint={alt.why}
        >
          <View style={styles.text}>
            <Text variant="bodyStrong">{alt.name}</Text>
            <Text variant="subhead">{alt.why}</Text>
          </View>
          <View style={styles.cta}>
            <Icon.Sparkle size={iconSize.sm} color={colors.primary} weight="fill" />
            <Icon.CaretRight size={iconSize.sm} color={colors.textFaint} weight="bold" />
          </View>
        </Press>
      ))}
    </ReportSection>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: space(3), paddingVertical: space(2), minHeight: 56 },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, paddingTop: space(3) },
  text: { flex: 1, gap: space(0.5) },
  cta: { flexDirection: "row", alignItems: "center", gap: space(1) },
});
