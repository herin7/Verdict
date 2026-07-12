import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { fonts, radius } from "../theme";

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
    <View style={[styles.badge, { backgroundColor: `${color}22`, borderColor: `${color}55` }]}>
      {icon && <Ionicons name={icon} size={12} color={color} style={{ marginRight: 5 }} />}
      <Text style={[styles.label, { color }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  label: { fontFamily: fonts.sansBold, fontSize: 11.5, textTransform: "uppercase", letterSpacing: 0.6 },
});
