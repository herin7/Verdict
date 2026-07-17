import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { MotiView } from "moti";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets, type Edge } from "react-native-safe-area-context";
import { Tappable } from "./Tappable";
import { formatMoney } from "../format";
import { useLayout } from "../layout";
import {
  colors,
  ctaGradient,
  elevation,
  font,
  fonts,
  hitSlop,
  iconSize,
  motion,
  radius,
  space,
} from "../theme";

export function Screen({
  children,
  style,
  edges = ["top", "bottom"],
  padded = true,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  edges?: Edge[];
  padded?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const { gutter } = useLayout();
  return (
    <View
      style={[
        styles.screen,
        {
          paddingTop: edges.includes("top") ? insets.top : 0,
          paddingBottom: edges.includes("bottom") ? insets.bottom : 0,
          paddingLeft: (padded ? gutter : 0) + (edges.includes("left") ? insets.left : 0),
          paddingRight: (padded ? gutter : 0) + (edges.includes("right") ? insets.right : 0),
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

export function ScreenHeader({
  title,
  subtitle,
  onBack,
  right,
  style,
}: {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  right?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.screenHeader, style]}>
      {onBack ? (
        <IconButton icon="chevron-back" color={colors.text} onPress={onBack} accessibilityLabel="Go back" />
      ) : (
        <View style={styles.screenHeaderSpacer} />
      )}
      <View style={styles.screenHeaderTextWrap}>
        <Text style={styles.screenHeaderTitle} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={styles.screenHeaderSubtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right ?? <View style={styles.screenHeaderSpacer} />}
    </View>
  );
}

/** White elevated surface — replaces GlassCard on daylight. */
export function Surface({
  children,
  style,
  padded = true,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  padded?: boolean;
}) {
  return <View style={[styles.surface, padded && styles.surfacePadded, style]}>{children}</View>;
}

/** @deprecated prefer Surface */
export function Card({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return <Surface style={style}>{children}</Surface>;
}

export function Label({ children, style }: { children: React.ReactNode; style?: StyleProp<TextStyle> }) {
  return <Text style={[styles.label, style]}>{children}</Text>;
}

export function Body({ children, style }: { children: React.ReactNode; style?: StyleProp<TextStyle> }) {
  return <Text style={[styles.body, style]}>{children}</Text>;
}

export function Title({ children, style }: { children: React.ReactNode; style?: StyleProp<TextStyle> }) {
  return <Text style={[styles.title, style]}>{children}</Text>;
}

export function Money({
  amount,
  currency = "INR",
  style,
}: {
  amount: number;
  currency?: string;
  style?: StyleProp<TextStyle>;
}) {
  return <Text style={[styles.money, style]}>{formatMoney(amount, currency)}</Text>;
}

export function SectionHeader({
  title,
  icon,
  style,
}: {
  title: string;
  icon?: keyof typeof Ionicons.glyphMap;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.sectionHeader, style]}>
      {icon ? <Ionicons name={icon} size={iconSize.sm} color={colors.textFaint} /> : null}
      <Text style={styles.sectionTitle}>{title}</Text>
    </View>
  );
}

export function Divider({ style }: { style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.divider, style]} />;
}

export function IconButton({
  icon,
  onPress,
  color = colors.text,
  accessibilityLabel,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  onPress?: () => void;
  color?: string;
  accessibilityLabel?: string;
}) {
  return (
    <Tappable
      onPress={onPress}
      style={styles.iconBtn}
      accessibilityLabel={accessibilityLabel}
      hitSlop={hitSlop}
    >
      <Ionicons name={icon} size={iconSize.md} color={color} />
    </Tappable>
  );
}

export function EmptyState({
  icon = "file-tray-outline",
  title,
  message,
  actionLabel,
  onAction,
  style,
}: {
  icon?: keyof typeof Ionicons.glyphMap;
  title?: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.empty, style]}>
      <View style={styles.emptyIcon}>
        <Ionicons name={icon} size={iconSize.xl} color={colors.textFaint} />
      </View>
      {title ? <Text style={styles.emptyTitle}>{title}</Text> : null}
      <Text style={styles.emptyText}>{message}</Text>
      {actionLabel && onAction ? (
        <PrimaryButton label={actionLabel} onPress={onAction} />
      ) : null}
    </View>
  );
}

export function LoadingState({ label }: { label?: string }) {
  return (
    <View style={styles.loading}>
      <ActivityIndicator color={colors.accent} />
      {label ? <Text style={styles.loadingLabel}>{label}</Text> : null}
    </View>
  );
}

export function ErrorBanner({
  message,
  onRetry,
  style,
}: {
  message: string;
  onRetry?: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.errorBanner, style]}>
      <Ionicons name="alert-circle-outline" size={iconSize.sm} color={colors.avoid} />
      <Text style={styles.errorText}>{message}</Text>
      {onRetry ? (
        <Tappable onPress={onRetry} accessibilityLabel="Retry">
          <Text style={styles.retryText}>Retry</Text>
        </Tappable>
      ) : null}
    </View>
  );
}

export function Field(props: TextInputProps) {
  return (
    <TextInput
      placeholderTextColor={colors.textFaint}
      {...props}
      style={[styles.field, props.style]}
    />
  );
}

export function PrimaryButton({
  label,
  onPress,
  disabled,
}: {
  label: string;
  onPress?: () => void;
  disabled?: boolean;
}) {
  return (
    <Tappable
      onPress={onPress}
      disabled={disabled}
      style={[styles.btnWrap, disabled && styles.disabled, elevation.soft]}
      accessibilityLabel={label}
    >
      <LinearGradient colors={ctaGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.btn}>
        <Text style={styles.btnText}>{label}</Text>
      </LinearGradient>
    </Tappable>
  );
}

export function SecondaryButton({
  label,
  onPress,
  disabled,
}: {
  label: string;
  onPress?: () => void;
  disabled?: boolean;
}) {
  return (
    <Tappable
      onPress={onPress}
      disabled={disabled}
      style={[styles.secondaryBtn, disabled && styles.disabled]}
      accessibilityLabel={label}
    >
      <Text style={styles.secondaryText}>{label}</Text>
    </Tappable>
  );
}

export function GhostButton({
  label,
  onPress,
  disabled,
}: {
  label: string;
  onPress?: () => void;
  disabled?: boolean;
}) {
  return (
    <Tappable
      onPress={onPress}
      disabled={disabled}
      style={[styles.ghostBtn, disabled && styles.disabled]}
      accessibilityLabel={label}
    >
      <Text style={styles.ghostText}>{label}</Text>
    </Tappable>
  );
}

export function PillButton({
  label,
  onPress,
  active,
  icon,
  disabled,
}: {
  label: string;
  onPress?: () => void;
  active?: boolean;
  icon?: keyof typeof Ionicons.glyphMap;
  disabled?: boolean;
}) {
  return (
    <Tappable
      onPress={onPress}
      disabled={disabled}
      style={[styles.pill, active && styles.pillActive, disabled && styles.disabled]}
      accessibilityLabel={label}
    >
      {icon ? (
        <Ionicons name={icon} size={iconSize.sm} color={active ? colors.onAccent : colors.textMuted} />
      ) : null}
      <Text style={[styles.pillText, active && styles.pillTextActive]}>{label}</Text>
    </Tappable>
  );
}

export function SheetHeader({
  eyebrow,
  title,
  onClose,
  closeLabel = "Close",
}: {
  eyebrow?: string;
  title: string;
  onClose: () => void;
  closeLabel?: string;
}) {
  return (
    <View style={styles.sheetHeader}>
      <View style={{ flex: 1, minWidth: 0 }}>
        {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
        <Text style={styles.sheetTitle} numberOfLines={1}>
          {title}
        </Text>
      </View>
      <PillButton label={closeLabel} onPress={onClose} active icon="arrow-down" />
    </View>
  );
}

export function TabBar<T extends string>({
  tabs,
  value,
  onChange,
}: {
  tabs: { id: T; label: string; icon?: keyof typeof Ionicons.glyphMap; disabled?: boolean }[];
  value: T;
  onChange: (id: T) => void;
}) {
  return (
    <View style={styles.tabs}>
      {tabs.map((t) => (
        <PillButton
          key={t.id}
          label={t.label}
          icon={t.icon}
          active={value === t.id}
          disabled={t.disabled}
          onPress={() => !t.disabled && onChange(t.id)}
        />
      ))}
    </View>
  );
}

export function Stagger({
  children,
  index = 0,
}: {
  children: React.ReactNode;
  index?: number;
}) {
  return (
    <MotiView
      from={{ opacity: 0, translateY: 10 }}
      animate={{ opacity: 1, translateY: 0 }}
      transition={{ type: "timing", duration: motion.normal, delay: index * 50 }}
    >
      {children}
    </MotiView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  screenHeader: { flexDirection: "row", alignItems: "center", gap: space(3), marginBottom: space(4) },
  screenHeaderSpacer: { width: space(9), height: space(9) },
  screenHeaderTextWrap: { flex: 1, minWidth: 0 },
  screenHeaderTitle: { ...font.h2, fontFamily: fonts.serif, fontSize: 22, color: colors.text },
  screenHeaderSubtitle: { ...font.caption, fontFamily: fonts.sansSemiBold, color: colors.textMuted, marginTop: space(0.5) },
  surface: {
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: radius.lg,
    ...elevation.card,
  },
  surfacePadded: { padding: space(4) },
  label: { ...font.label, color: colors.textMuted, textTransform: "uppercase" },
  body: { ...font.body, color: colors.text },
  title: { ...font.h2, color: colors.text },
  money: { ...font.mono, color: colors.text },
  sectionHeader: { flexDirection: "row", alignItems: "center", gap: space(1.5), marginBottom: space(2) },
  sectionTitle: { ...font.label, color: colors.textFaint, textTransform: "uppercase" },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginVertical: space(2) },
  iconBtn: {
    width: space(9),
    height: space(9),
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  empty: { alignItems: "center", justifyContent: "center", paddingVertical: space(10), gap: space(3), paddingHorizontal: space(4) },
  emptyIcon: {
    width: space(16),
    height: space(16),
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceMuted,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyTitle: { ...font.h3, color: colors.text, textAlign: "center" },
  emptyText: { ...font.body, color: colors.textMuted, textAlign: "center", maxWidth: 280 },
  loading: { flex: 1, alignItems: "center", justifyContent: "center", gap: space(3) },
  loadingLabel: { ...font.small, fontFamily: fonts.sans, color: colors.textMuted },
  errorBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: space(2),
    padding: space(3),
    borderRadius: radius.md,
    backgroundColor: colors.avoidSoft,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.avoid,
  },
  errorText: { flex: 1, ...font.small, fontFamily: fonts.sans, color: colors.avoid },
  retryText: { ...font.small, fontFamily: fonts.sansBold, color: colors.accent },
  field: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    paddingHorizontal: space(3.5),
    paddingVertical: space(3),
    color: colors.text,
    ...font.body,
  },
  btnWrap: { borderRadius: radius.md, overflow: "hidden" },
  btn: { paddingVertical: space(3.5), alignItems: "center", borderRadius: radius.md },
  btnText: { ...font.bodyMedium, fontFamily: fonts.sansBold, color: colors.onAccent },
  secondaryBtn: {
    alignItems: "center",
    paddingVertical: space(3),
    paddingHorizontal: space(4),
    borderRadius: radius.md,
    backgroundColor: colors.accentSoft,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  secondaryText: { ...font.small, fontFamily: fonts.sansSemiBold, color: colors.accent },
  ghostBtn: { alignItems: "center", paddingVertical: space(2.5), paddingHorizontal: space(3) },
  ghostText: { ...font.small, fontFamily: fonts.sansSemiBold, color: colors.textMuted },
  disabled: { opacity: 0.45 },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: space(1),
    paddingHorizontal: space(3),
    paddingVertical: space(2),
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceMuted,
  },
  pillActive: { backgroundColor: colors.accent },
  pillText: { ...font.caption, fontFamily: fonts.sansMedium, color: colors.textMuted },
  pillTextActive: { color: colors.onAccent },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: space(3),
    paddingHorizontal: space(4),
    paddingBottom: space(2),
  },
  eyebrow: { ...font.monoSm, color: colors.accent, textTransform: "uppercase" },
  sheetTitle: { fontFamily: fonts.serif, fontSize: 22, lineHeight: 28, color: colors.text },
  tabs: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: space(1.5),
    paddingHorizontal: space(3),
    paddingBottom: space(2.5),
  },
});
