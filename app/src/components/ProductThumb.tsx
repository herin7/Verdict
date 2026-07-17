import { useState } from "react";
import { Image, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Shimmer } from "./Shimmer";
import { categoryIconName } from "./Icons";
import { colors, radius } from "../theme";

export type ThumbStatus = "loading" | "loaded" | "empty";

/**
 * Product thumbnail for the scan confirm card: tries a real internet photo first,
 * falls back to the user's own captured shot, then a category icon. Never leaves
 * a blank slot - always shimmer, image, or icon.
 */
export function ProductThumb({
  category,
  status,
  imageUrl,
  fallbackUri,
  size = 60,
}: {
  category: string;
  status: ThumbStatus;
  imageUrl?: string | null;
  fallbackUri?: string | null;
  size?: number;
}) {
  const [remoteFailed, setRemoteFailed] = useState(false);
  const dims = { width: size, height: size, borderRadius: radius.md };

  if (status === "loading") {
    return <Shimmer style={dims} />;
  }

  if (imageUrl && !remoteFailed) {
    return (
      <Image
        source={{ uri: imageUrl }}
        style={[dims, styles.img]}
        resizeMode="cover"
        onError={() => setRemoteFailed(true)}
      />
    );
  }

  if (fallbackUri) {
    return <Image source={{ uri: fallbackUri }} style={[dims, styles.img]} resizeMode="cover" />;
  }

  return (
    <View style={[dims, styles.iconWrap]}>
      <Ionicons name={categoryIconName(category)} size={size * 0.42} color={colors.text} />
    </View>
  );
}

const styles = StyleSheet.create({
  img: {
    backgroundColor: colors.surfaceMuted,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  iconWrap: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.accentSoft,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
});
