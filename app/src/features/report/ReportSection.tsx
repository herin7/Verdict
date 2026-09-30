import { useState } from "react";
import { LayoutAnimation, StyleSheet, View } from "react-native";
import { Icon, type IconComponent } from "../../components/icons";
import { Press, Text } from "../../components/ui";
import { colors, fonts, iconSize, radius, shadow, space } from "../../theme";
import { openLink } from "../../lib/links";
import type { CitedPoint, ReportSource } from "../../types";

/** A titled card - the building block of the report. */
export function ReportSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.card}>
      <Text variant="title" accessibilityRole="header">
        {title}
      </Text>
      {children}
    </View>
  );
}

/** Collapsed to one line of preview so detail stays out of the way. */
export function CollapsibleSection({
  title,
  preview,
  children,
}: {
  title: string;
  preview: string;
  children: React.ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);
  const Chevron = expanded ? Icon.CaretUp : Icon.CaretDown;
  return (
    <View style={styles.card}>
      <Press
        onPress={() => {
          LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
          setExpanded((e) => !e);
        }}
        style={styles.collapsibleHeader}
        accessibilityLabel={title}
        accessibilityHint={preview}
        accessibilityState={{ expanded }}
      >
        <View style={styles.flex}>
          <Text variant="title" accessibilityRole="header">
            {title}
          </Text>
          {!expanded ? <Text variant="subhead">{preview}</Text> : null}
        </View>
        <Chevron size={iconSize.md} color={colors.textFaint} weight="bold" />
      </Press>
      {expanded ? children : null}
    </View>
  );
}

/** Claims with tappable source numbers, e.g. "Hinge cracks  [2] [5]". */
export function EvidenceList({
  title,
  items,
  sources,
  tint,
  icon: Glyph,
  meta,
}: {
  title?: string;
  items: CitedPoint[];
  sources: ReportSource[];
  tint: string;
  icon: IconComponent;
  /** Optional trailing label per item (frequency, severity). */
  meta?: (index: number) => { label: string; color: string } | null;
}) {
  if (items.length === 0) return null;
  return (
    <View style={styles.bullets}>
      {title ? <Text variant="overline">{title}</Text> : null}
      {items.map((item, i) => {
        const tag = meta?.(i);
        return (
          <View key={i} style={styles.bulletRow}>
            <View style={styles.bulletIcon}>
              <Glyph size={iconSize.md} color={tint} weight="fill" />
            </View>
            <View style={styles.flex}>
              <Text variant="body">{item.text}</Text>
              <View style={styles.citeRow}>
                {tag ? (
                  <Text variant="caption" style={[styles.tag, { color: tag.color }]}>
                    {tag.label}
                  </Text>
                ) : null}
                {item.sources.map((n) =>
                  sources[n - 1] ? (
                    <Press
                      key={n}
                      onPress={() => void openLink(sources[n - 1].url)}
                      hitSlop={6}
                      style={styles.cite}
                      accessibilityRole="link"
                      accessibilityLabel={`Source ${n}: ${sources[n - 1].title}`}
                    >
                      <Text variant="caption" style={styles.citeText}>
                        {n}
                      </Text>
                    </Press>
                  ) : null
                )}
              </View>
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderCurve: "continuous",
    padding: space(4),
    gap: space(4),
    boxShadow: shadow.card,
  },
  collapsibleHeader: { flexDirection: "row", alignItems: "center", gap: space(3) },
  bullets: { gap: space(3) },
  bulletRow: { flexDirection: "row", gap: space(3) },
  bulletIcon: { paddingTop: 2 },
  citeRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space(1.5), marginTop: space(1) },
  tag: { fontFamily: fonts.bold },
  cite: {
    minWidth: 22,
    height: 22,
    paddingHorizontal: space(1.5),
    borderRadius: radius.full,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primarySoft,
  },
  citeText: { color: colors.primary, fontFamily: fonts.bold },
});
