import { View, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, iconSize, radius, space } from "../theme";

export function VintageIcon({
  name,
  size = iconSize.sm,
  tint = colors.accent,
}: {
  name: keyof typeof Ionicons.glyphMap;
  size?: number;
  tint?: string;
}) {
  return (
    <View style={[styles.plate, { borderColor: `${tint}44`, backgroundColor: colors.accentSoft }]}>
      <Ionicons name={name} size={size} color={tint} />
    </View>
  );
}

const styles = StyleSheet.create({
  plate: {
    width: space(7),
    height: space(7),
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
  },
});
