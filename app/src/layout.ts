import { useWindowDimensions } from "react-native";
import { space } from "./theme";

/** Base tab bar content height (icons + label), excluding safe-area inset. */
export const tabBarContentHeight = space(14);

export function gutterForWidth(width: number): number {
  if (width >= 768) return space(8);
  if (width >= 400) return space(5);
  return space(4);
}

export function useLayout() {
  const { width, height } = useWindowDimensions();
  const gutter = gutterForWidth(width);
  const isCompact = width < 380;
  const isTablet = width >= 768;
  const contentWidth = Math.min(width - gutter * 2, isTablet ? 560 : width - gutter * 2);
  return { width, height, gutter, contentWidth, isCompact, isTablet, tabBarContentHeight };
}
