import { useState } from "react";
import { Image, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../theme";

function safeHostname(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

/** Real favicon fetched live from the source's own domain (Google's favicon service), not a placeholder. */
export function Favicon({ url, size = 20 }: { url: string; size?: number }) {
  const [failed, setFailed] = useState(false);
  const domain = safeHostname(url);

  if (!domain || failed) {
    return <Ionicons name="globe-outline" size={size * 0.65} color={colors.textMuted} />;
  }
  return (
    <Image
      source={{ uri: `https://www.google.com/s2/favicons?sz=64&domain=${domain}` }}
      style={{ width: size, height: size, borderRadius: size / 4 }}
      onError={() => setFailed(true)}
    />
  );
}

const SOURCE_ICON: Record<string, keyof typeof Ionicons.glyphMap> = {
  reddit: "logo-reddit",
  retail: "storefront-outline",
  amazon: "storefront-outline",
  flipkart: "storefront-outline",
  youtube: "logo-youtube",
  blog_forum: "chatbubbles-outline",
  news: "newspaper-outline",
  official: "business-outline",
  price: "pricetag-outline",
};

export function SourceTypeIcon({ type, size = 14, color }: { type: string; size?: number; color?: string }) {
  const name = SOURCE_ICON[type] ?? "globe-outline";
  return <Ionicons name={name} size={size} color={color ?? colors.textMuted} />;
}

const CATEGORY_ICON: [RegExp, keyof typeof Ionicons.glyphMap][] = [
  [/phone/i, "phone-portrait-outline"],
  [/headphone|earbud|earphone/i, "headset-outline"],
  [/laptop|notebook/i, "laptop-outline"],
  [/watch/i, "watch-outline"],
  [/camera/i, "camera-outline"],
  [/shoe|sneaker|footwear/i, "footsteps-outline"],
  [/book/i, "book-outline"],
  [/kitchen|cooker|appliance/i, "restaurant-outline"],
  [/tv|television/i, "tv-outline"],
  [/game|console/i, "game-controller-outline"],
  [/speaker|audio/i, "volume-high-outline"],
  [/bike|bicycle/i, "bicycle-outline"],
  [/car|vehicle/i, "car-outline"],
];

export function categoryIconName(category: string): keyof typeof Ionicons.glyphMap {
  const match = CATEGORY_ICON.find(([re]) => re.test(category));
  return match ? match[1] : "cube-outline";
}

export function CategoryIcon({
  category,
  size = 22,
  color = colors.text,
}: {
  category: string;
  size?: number;
  color?: string;
}) {
  return (
    <View style={{ width: size + 16, height: size + 16, borderRadius: (size + 16) / 2, alignItems: "center", justifyContent: "center", backgroundColor: colors.accentSoft }}>
      <Ionicons name={categoryIconName(category)} size={size} color={color} />
    </View>
  );
}
