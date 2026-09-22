import { useEffect } from "react";
import {
  ActivityIndicator,
  Pressable,
  Text as RNText,
  TextInput,
  View,
  StyleSheet,
  type PressableProps,
  type StyleProp,
  type TextInputProps,
  type TextProps,
  type ViewStyle,
} from "react-native";
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { Icon, type IconComponent } from "./icons";
import { colors, hitSlop, iconSize, radius, shadow, space, type } from "../theme";

/* ───────────────────────── Text ───────────────────────── */

export function Text({ variant = "body", style, ...props }: TextProps & { variant?: keyof typeof type }) {
  return <RNText style={[type[variant], style]} {...props} />;
}

/* ───────────────────────── Press ─────────────────────────
 * Every tappable thing. Layout styles apply to the Pressable itself, so
 * `flex: 1` and friends behave; pressed state dims and nudges the scale. */

export function Press({
  style,
  children,
  accessibilityRole = "button",
  ...props
}: Omit<PressableProps, "style"> & { style?: StyleProp<ViewStyle> }) {
  return (
    <Pressable
      accessibilityRole={accessibilityRole}
      style={({ pressed }) => [style, pressed && styles.pressed, props.disabled && styles.disabled]}
      {...props}
    >
      {children}
    </Pressable>
  );
}

/* ───────────────────────── Button ───────────────────────── */

const buttonVariants = {
  primary: { bg: colors.primary, fg: colors.onPrimary, border: "transparent" },
  accent: { bg: colors.accent, fg: colors.onAccent, border: "transparent" },
  secondary: { bg: colors.surface, fg: colors.text, border: colors.border },
  ghost: { bg: "transparent", fg: colors.primary, border: "transparent" },
} as const;

export function Button({
  label,
  onPress,
  variant = "primary",
  size = "md",
  icon: LeadingIcon,
  loading,
  disabled,
  style,
}: {
  label: string;
  onPress?: () => void;
  variant?: keyof typeof buttonVariants;
  size?: "sm" | "md" | "lg";
  icon?: IconComponent;
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const v = buttonVariants[variant];
  return (
    <Press
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityLabel={label}
      accessibilityState={{ disabled: Boolean(disabled || loading), busy: Boolean(loading) }}
      style={[
        styles.button,
        styles[`button_${size}`],
        { backgroundColor: v.bg, borderColor: v.border },
        variant !== "ghost" && variant !== "secondary" && { boxShadow: shadow.card },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={v.fg} size="small" />
      ) : LeadingIcon ? (
        <LeadingIcon size={iconSize.md} color={v.fg} weight="bold" />
      ) : null}
      <Text variant="bodyStrong" style={[{ color: v.fg }, size === "sm" && styles.buttonTextSm]} numberOfLines={1}>
        {label}
      </Text>
    </Press>
  );
}

export function IconButton({
  icon: Glyph,
  onPress,
  label,
  tone = "surface",
  filled,
}: {
  icon: IconComponent;
  onPress?: () => void;
  label: string;
  /** "surface" on light backgrounds, "onPrimary" on the blue header band. */
  tone?: "surface" | "onPrimary";
  filled?: boolean;
}) {
  const onPrimary = tone === "onPrimary";
  return (
    <Press
      onPress={onPress}
      accessibilityLabel={label}
      hitSlop={hitSlop}
      style={[styles.iconButton, onPrimary ? styles.iconButtonOnPrimary : styles.iconButtonSurface]}
    >
      <Glyph
        size={iconSize.md}
        color={onPrimary ? colors.onPrimary : filled ? colors.primary : colors.text}
        weight={filled ? "fill" : "bold"}
      />
    </Press>
  );
}

/* ───────────────────────── Surfaces ───────────────────────── */

export function SectionHeader({
  title,
  actionLabel,
  onAction,
}: {
  title: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <View style={styles.sectionHeader}>
      <Text variant="title" accessibilityRole="header" style={styles.flex}>
        {title}
      </Text>
      {actionLabel && onAction ? (
        <Press onPress={onAction} hitSlop={hitSlop} accessibilityLabel={actionLabel}>
          <Text variant="subhead" style={styles.link}>
            {actionLabel}
          </Text>
        </Press>
      ) : null}
    </View>
  );
}

export function Pill({
  label,
  color = colors.textMuted,
  background = colors.surfaceMuted,
  icon: Glyph,
}: {
  label: string;
  color?: string;
  background?: string;
  icon?: IconComponent;
}) {
  return (
    <View style={[styles.pill, { backgroundColor: background }]}>
      {Glyph ? <Glyph size={14} color={color} weight="bold" /> : null}
      <Text variant="caption" style={[styles.pillText, { color }]}>
        {label}
      </Text>
    </View>
  );
}

export function Chip({ label, selected, onPress }: { label: string; selected?: boolean; onPress?: () => void }) {
  return (
    <Press
      onPress={onPress}
      accessibilityState={{ selected: Boolean(selected) }}
      style={[styles.chip, selected && styles.chipSelected]}
    >
      <Text variant="subhead" style={[styles.chipText, selected && styles.chipTextSelected]}>
        {label}
      </Text>
    </Press>
  );
}

/* ───────────────────────── Inputs ───────────────────────── */

export function Field({
  icon: Glyph,
  style,
  ref,
  ...props
}: TextInputProps & { icon?: IconComponent; ref?: React.Ref<TextInput> }) {
  return (
    <View style={[styles.field, style]}>
      {Glyph ? <Glyph size={iconSize.md} color={colors.textFaint} /> : null}
      <TextInput ref={ref} placeholderTextColor={colors.textFaint} style={styles.fieldInput} {...props} />
    </View>
  );
}

/* ───────────────────────── States ───────────────────────── */

export function EmptyState({
  icon: Glyph = Icon.Package,
  title,
  message,
  actionLabel,
  onAction,
}: {
  icon?: IconComponent;
  title: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <View style={styles.empty}>
      <View style={styles.emptyIcon}>
        <Glyph size={iconSize.xl} color={colors.primary} weight="duotone" />
      </View>
      <View style={styles.emptyText}>
        <Text variant="title" style={styles.center}>
          {title}
        </Text>
        <Text variant="subhead" style={styles.center}>
          {message}
        </Text>
      </View>
      {actionLabel && onAction ? <Button label={actionLabel} onPress={onAction} /> : null}
    </View>
  );
}

export function ErrorBanner({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <View style={styles.errorBanner} accessibilityLiveRegion="polite">
      <Icon.WarningCircle size={iconSize.md} color={colors.avoid} weight="fill" />
      <Text variant="subhead" style={[styles.flex, { color: colors.text }]}>
        {message}
      </Text>
      {onRetry ? (
        <Press onPress={onRetry} hitSlop={hitSlop} accessibilityLabel="Try again">
          <Text variant="subhead" style={styles.link}>
            Retry
          </Text>
        </Press>
      ) : null}
    </View>
  );
}

export function LoadingState({ label }: { label?: string }) {
  return (
    <View style={styles.loading} accessibilityLabel={label ?? "Loading"}>
      <ActivityIndicator color={colors.primary} />
      {label ? <Text variant="subhead">{label}</Text> : null}
    </View>
  );
}

/** Pulsing placeholder block. */
export function Skeleton({ style }: { style?: StyleProp<ViewStyle> }) {
  const opacity = useSharedValue(0.5);
  const reduceMotion = useReducedMotion();
  useEffect(() => {
    if (!reduceMotion) opacity.value = withRepeat(withTiming(1, { duration: 700 }), -1, true);
  }, [opacity, reduceMotion]);
  const animated = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return <Animated.View style={[styles.skeleton, style, animated]} />;
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { textAlign: "center" },
  pressed: { opacity: 0.86, transform: [{ scale: 0.98 }] },
  disabled: { opacity: 0.45 },
  link: { color: colors.primary, fontFamily: type.bodyStrong.fontFamily },

  button: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space(2),
    borderRadius: radius.md,
    borderCurve: "continuous",
    borderWidth: 1,
    paddingHorizontal: space(5),
  },
  button_sm: { minHeight: 36, paddingHorizontal: space(3), borderRadius: radius.sm },
  button_md: { minHeight: 48 },
  button_lg: { minHeight: 56, borderRadius: radius.lg },
  buttonTextSm: { fontSize: 14 },

  iconButton: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    alignItems: "center",
    justifyContent: "center",
  },
  iconButtonSurface: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  iconButtonOnPrimary: { backgroundColor: "rgba(255,255,255,0.14)" },

  sectionHeader: { flexDirection: "row", alignItems: "center", gap: space(3) },

  pill: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: space(1),
    paddingHorizontal: space(2.5),
    paddingVertical: space(1),
    borderRadius: radius.full,
  },
  pillText: { fontFamily: type.bodyStrong.fontFamily },

  chip: {
    paddingHorizontal: space(4),
    minHeight: 36,
    justifyContent: "center",
    borderRadius: radius.full,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { color: colors.text },
  chipTextSelected: { color: colors.onPrimary },

  field: {
    flexDirection: "row",
    alignItems: "center",
    gap: space(3),
    minHeight: 52,
    paddingHorizontal: space(4),
    borderRadius: radius.md,
    borderCurve: "continuous",
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  fieldInput: { flex: 1, ...type.body, paddingVertical: space(3) },

  empty: { alignItems: "center", gap: space(5), paddingVertical: space(12), paddingHorizontal: space(6) },
  emptyIcon: {
    width: 72,
    height: 72,
    borderRadius: radius.full,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primarySoft,
  },
  emptyText: { gap: space(2), maxWidth: 300 },
  errorBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: space(3),
    padding: space(4),
    borderRadius: radius.md,
    borderCurve: "continuous",
    backgroundColor: colors.avoidSoft,
  },
  loading: { flex: 1, alignItems: "center", justifyContent: "center", gap: space(3), padding: space(6) },
  skeleton: { backgroundColor: colors.border, borderRadius: radius.md },
});
