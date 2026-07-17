import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { font, iconSize, radius, space } from "../theme";

export function Badge({
  label,
  color,
  icon,
}: {
  label: string;
  color: string;
  icon?: keyof typeof Ionicons.glyphMap;
}) {
  return (
    <View style={[styles.badge, { backgroundColor: `${color}18`, borderColor: `${color}44` }]}>
      {icon ? <Ionicons name={icon} size={iconSize.sm - 4} color={color} style={{ marginRight: space(1) }} /> : null}
      <Text style={[styles.label, { color }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    paddingVertical: space(1),
    paddingHorizontal: space(2.5),
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  label: { ...font.label, letterSpacing: 0.6 },
});
