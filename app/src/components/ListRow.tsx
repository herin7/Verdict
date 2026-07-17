import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Tappable } from "./Tappable";
import { Surface } from "./ui";
import { colors, font, iconSize, radius, space } from "../theme";

export function ListRow({
  icon,
  title,
  subtitle,
  onPress,
  right,
}: {
  icon?: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle?: string;
  onPress?: () => void;
  right?: React.ReactNode;
}) {
  const content = (
    <Surface style={styles.row} padded={false}>
      {icon ? (
        <View style={styles.iconWrap}>
          <Ionicons name={icon} size={iconSize.md} color={colors.accent} />
        </View>
      ) : null}
      <View style={styles.text}>
        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
      {right ?? <Ionicons name="chevron-forward" size={iconSize.md} color={colors.textFaint} />}
    </Surface>
  );

  if (!onPress) return content;
  return (
    <Tappable onPress={onPress} accessibilityLabel={title}>
      {content}
    </Tappable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space(3),
    paddingHorizontal: space(3.5),
    paddingVertical: space(3.5),
  },
  iconWrap: {
    width: space(10),
    height: space(10),
    borderRadius: radius.md,
    backgroundColor: colors.accentSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  text: { flex: 1, minWidth: 0, gap: space(0.5) },
  title: { ...font.bodyMedium, color: colors.text },
  subtitle: { ...font.caption, color: colors.textMuted },
});
