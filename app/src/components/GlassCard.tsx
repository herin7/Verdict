import type { ReactNode } from "react";
import type { StyleProp, ViewStyle } from "react-native";
import { Surface } from "./ui";

/** @deprecated Use Surface — kept as thin alias for daylight migration. */
export function GlassCard({
  children,
  style,
  padded = true,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  padded?: boolean;
}) {
  return (
    <Surface style={style} padded={padded}>
      {children}
    </Surface>
  );
}
