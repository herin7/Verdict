import { useEffect, useState } from "react";
import { StyleSheet, Text } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Tappable } from "./Tappable";
import { colors, font, fonts, iconSize, radius, space } from "../theme";
import { hasLocationPermission, requestLocationPermission } from "../location";
import { track } from "../analytics/posthog";

/**
 * Opt-in banner for approximate location, shown only when quick-commerce offers
 * are present and permission hasn't been granted yet. Never auto-prompts - the
 * OS permission dialog only appears after this explicit tap. Silently hides
 * itself once granted (or if the platform/permission check fails).
 */
export function LocationBanner({ onGranted }: { onGranted?: () => void }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let alive = true;
    hasLocationPermission().then((granted: boolean) => {
      if (alive) setVisible(!granted);
    });
    return () => {
      alive = false;
    };
  }, []);

  if (!visible) return null;

  async function enable() {
    const result = await requestLocationPermission();
    track("location_permission_requested", { result });
    if (result === "granted") {
      setVisible(false);
      onGranted?.();
    } else {
      setVisible(false);
    }
  }

  return (
    <Tappable onPress={enable} style={styles.banner} accessibilityLabel="Enable location">
      <Ionicons name="location-outline" size={iconSize.sm} color={colors.accent} />
      <Text style={styles.text}>Turn on location for accurate Blinkit / BigBasket prices</Text>
      <Ionicons name="chevron-forward" size={iconSize.sm} color={colors.textFaint} />
    </Tappable>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: space(2),
    padding: space(3),
    borderRadius: radius.md,
    backgroundColor: colors.accentSoft,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  text: { flex: 1, ...font.caption, fontFamily: fonts.sansSemiBold, color: colors.text },
});
