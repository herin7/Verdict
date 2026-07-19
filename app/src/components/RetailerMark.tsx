import { StyleSheet, Text, View } from "react-native";
import { Favicon } from "./Icons";
import { retailerById, retailerLogoUrl } from "../retailers";
import { colors, fonts, space } from "../theme";

export function RetailerMark({
  retailerId,
  name,
  url,
  size = 18,
  showName = true,
}: {
  retailerId?: string | null;
  name?: string | null;
  url?: string | null;
  size?: number;
  showName?: boolean;
}) {
  const meta = retailerId ? retailerById(retailerId) : null;
  const label = name || meta?.name || "Store";
  const logo = retailerLogoUrl(retailerId || meta?.id || "", url);
  return (
    <View style={styles.row} accessibilityLabel={label}>
      <Favicon url={logo} size={size} />
      {showName ? (
        <Text style={styles.name} numberOfLines={1}>
          {label}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: space(1.5), flexShrink: 1 },
  name: { fontFamily: fonts.sansMedium, fontSize: 13, color: colors.text, flexShrink: 1 },
});
