import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { Image } from "expo-image";
import { Icon, type IconComponent } from "./icons";
import { Skeleton } from "./ui";
import { colors, radius } from "../theme";

export type ThumbStatus = "loading" | "loaded" | "empty";

const CATEGORY_ICON: [RegExp, IconComponent][] = [
  [/phone|mobile/i, Icon.DeviceMobile],
  [/headphone|earbud|earphone|audio/i, Icon.Headphones],
  [/laptop|notebook|computer/i, Icon.Laptop],
  [/watch/i, Icon.Watch],
  [/camera/i, Icon.Camera],
  [/shoe|sneaker|footwear/i, Icon.Sneaker],
  [/book/i, Icon.Book],
  [/kitchen|cooker|appliance/i, Icon.CookingPot],
  [/tv|television/i, Icon.Television],
  [/game|console/i, Icon.GameController],
  [/speaker/i, Icon.SpeakerHigh],
  [/bike|bicycle/i, Icon.Bicycle],
  [/car|vehicle/i, Icon.Car],
];

function categoryIcon(category: string): IconComponent {
  return CATEGORY_ICON.find(([re]) => re.test(category))?.[1] ?? Icon.Package;
}

/** Product photo → the user's own capture → a category glyph. Never an empty box. */
export function ProductThumb({
  category,
  status = "loaded",
  imageUrl,
  fallbackUri,
  size = 64,
}: {
  category: string;
  status?: ThumbStatus;
  imageUrl?: string | null;
  fallbackUri?: string | null;
  size?: number;
}) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const box = { width: size, height: size, borderRadius: size > 80 ? radius.lg : radius.md };

  if (status === "loading") return <Skeleton style={box} />;

  const uri = imageUrl && imageUrl !== failedUrl ? imageUrl : fallbackUri;
  if (uri) {
    return (
      <Image
        source={{ uri }}
        style={[box, styles.image]}
        contentFit="contain"
        transition={200}
        onError={() => setFailedUrl(imageUrl ?? null)}
        accessible={false}
      />
    );
  }

  const Glyph = categoryIcon(category);
  return (
    <View style={[box, styles.glyph]} accessible={false}>
      <Glyph size={size * 0.42} color={colors.primary} weight="duotone" />
    </View>
  );
}

const styles = StyleSheet.create({
  image: { backgroundColor: colors.surface, borderCurve: "continuous" },
  glyph: { alignItems: "center", justifyContent: "center", backgroundColor: colors.primarySoft, borderCurve: "continuous" },
});
