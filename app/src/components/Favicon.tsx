import { useState } from "react";
import { Image } from "expo-image";
import { Icon } from "./icons";
import { colors, radius } from "../theme";

function hostname(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

/** The site's own favicon, falling back to a globe. */
export function Favicon({ url, size = 20 }: { url: string; size?: number }) {
  const [failed, setFailed] = useState(false);
  const domain = hostname(url);
  if (!domain || failed) return <Icon.Globe size={size} color={colors.textFaint} />;
  return (
    <Image
      source={{ uri: `https://www.google.com/s2/favicons?sz=64&domain=${domain}` }}
      style={{ width: size, height: size, borderRadius: radius.sm / 2 }}
      onError={() => setFailed(true)}
      accessible={false}
    />
  );
}
