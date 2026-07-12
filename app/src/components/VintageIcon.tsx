import { View, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, radius } from "../theme";

/** Old-school stamped icon plate - consistent stroke weight + gold seal feel. */
export function VintageIcon({
  name,
  size = 15,
  tint = colors.accent,
}: {
  name: keyof typeof Ionicons.glyphMap;
  size?: number;
  tint?: string;
}) {
  return (
    <View style={[styles.plate, { borderColor: `${tint}44` }]}>
      <Ionicons name={name} size={size} color={tint} />
    </View>
  );
}

const styles = StyleSheet.create({
  plate: {
    width: 28,
    height: 28,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,215,109,0.08)",
    borderWidth: 1,
  },
});
