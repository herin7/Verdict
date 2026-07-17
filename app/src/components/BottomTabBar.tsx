import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Tappable } from "./Tappable";
import { tabBarContentHeight } from "../layout";
import { colors, font, iconSize, space } from "../theme";

export type TabId = "dashboard" | "scan" | "library" | "profile";

const TABS: {
  id: TabId;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  activeIcon: keyof typeof Ionicons.glyphMap;
}[] = [
  { id: "dashboard", label: "Home", icon: "home-outline", activeIcon: "home" },
  { id: "scan", label: "Scan", icon: "scan-outline", activeIcon: "scan" },
  { id: "library", label: "Saved", icon: "bookmark-outline", activeIcon: "bookmark" },
  { id: "profile", label: "Profile", icon: "person-outline", activeIcon: "person" },
];

export function BottomTabBar({ active, onChange }: { active: TabId; onChange: (id: TabId) => void }) {
  const insets = useSafeAreaInsets();
  return (
    <View
      style={[
        styles.bar,
        {
          paddingBottom: Math.max(insets.bottom, space(2)),
          minHeight: tabBarContentHeight + Math.max(insets.bottom, space(2)),
        },
      ]}
    >
      {TABS.map((tab) => {
        const isActive = tab.id === active;
        return (
          <Tappable
            key={tab.id}
            onPress={() => onChange(tab.id)}
            style={styles.tab}
            accessibilityLabel={tab.label}
          >
            <View style={styles.iconWrap}>
              {isActive ? <View style={styles.activeDot} /> : null}
              <Ionicons
                name={isActive ? tab.activeIcon : tab.icon}
                size={iconSize.lg}
                color={isActive ? colors.accent : colors.textFaint}
              />
            </View>
            <Text style={[styles.label, isActive && styles.labelActive]}>{tab.label}</Text>
          </Tappable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    backgroundColor: colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    paddingTop: space(2),
  },
  tab: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: space(1),
    paddingVertical: space(1),
    minHeight: space(11),
  },
  iconWrap: { alignItems: "center", justifyContent: "center", height: iconSize.lg },
  activeDot: {
    position: "absolute",
    top: -space(2) - 1,
    width: space(5),
    height: space(0.5),
    borderRadius: 1,
    backgroundColor: colors.accent,
  },
  label: { ...font.tab, color: colors.textFaint },
  labelActive: { color: colors.accent },
});
