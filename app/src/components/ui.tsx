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
import { colors, font, fonts, goldGradient, motion, radius, space } from "../theme";

/**
 * Every screen's root container. Applies real safe-area insets (never a hardcoded
 * marginTop/paddingTop guess) plus the standard horizontal gutter and background,
 * so status-bar/notch overlap can't silently reappear on a new screen.
 *
 * - `edges`: which sides get inset padding. Defaults to top+bottom (the two that
 *   matter for a normal vertical screen). Pass `["top"]` etc. for screens that
 *   manage their own bottom spacing (e.g. a scroll view with extra content padding).
 * - `padded`: applies the standard horizontal gutter. Set to false when a child
 *   (FlatList/ScrollView contentContainerStyle) already owns horizontal padding,
 *   to avoid doubling it up.
 */
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
  return (
    <View
      style={[
        styles.screen,
        {
          paddingTop: edges.includes("top") ? insets.top : 0,
          paddingBottom: edges.includes("bottom") ? insets.bottom : 0,
          paddingLeft: (padded ? space(5) : 0) + (edges.includes("left") ? insets.left : 0),
          paddingRight: (padded ? space(5) : 0) + (edges.includes("right") ? insets.right : 0),
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

/**
 * Consistent sub-screen header: back button + title (+ optional subtitle/right
 * accessory). Use inside a `Screen` for every pushed screen so back navigation,
 * spacing, and typography stay uniform instead of each screen hand-rolling one.
 */
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

export function Card({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Label({ children, style }: { children: React.ReactNode; style?: StyleProp<TextStyle> }) {
  return <Text style={[styles.label, style]}>{children}</Text>;
}

export function Body({ children, style }: { children: React.ReactNode; style?: StyleProp<TextStyle> }) {
  return <Text style={[styles.body, style]}>{children}</Text>;
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
      {icon ? <Ionicons name={icon} size={14} color={colors.textFaint} /> : null}
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
  color = colors.accent,
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
      hitSlop={8}
    >
      <Ionicons name={icon} size={18} color={color} />
    </Tappable>
  );
}

export function EmptyState({
  icon = "file-tray-outline",
  message,
  style,
}: {
  icon?: keyof typeof Ionicons.glyphMap;
  message: string;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.empty, style]}>
      <Ionicons name={icon} size={36} color={colors.textFaint} />
      <Text style={styles.emptyText}>{message}</Text>
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
      <Ionicons name="alert-circle-outline" size={16} color={colors.avoid} />
      <Text style={styles.errorText}>{message}</Text>
      {onRetry ? (
        <Tappable onPress={onRetry}>
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
    <Tappable onPress={onPress} disabled={disabled} style={styles.btnWrap}>
      <LinearGradient colors={goldGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.btn}>
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
    <Tappable onPress={onPress} disabled={disabled} style={[styles.secondaryBtn, disabled && { opacity: 0.5 }]}>
      <Text style={styles.secondaryText}>{label}</Text>
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
      style={[styles.pill, active && styles.pillActive, disabled && { opacity: 0.45 }]}
    >
      {icon ? (
        <Ionicons name={icon} size={14} color={active ? colors.onAccent : colors.textMuted} />
      ) : null}
      <Text style={[styles.pillText, active && styles.pillTextActive]}>{label}</Text>
    </Tappable>
  );
}

export function SheetHeader({
  eyebrow,
  title,
  onClose,
  closeLabel = "Back",
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
      from={{ opacity: 0, translateY: 12 }}
      animate={{ opacity: 1, translateY: 0 }}
      transition={{ type: "timing", duration: motion.normal, delay: index * 60 }}
    >
      {children}
    </MotiView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  screenHeader: { flexDirection: "row", alignItems: "center", gap: space(3), marginBottom: space(4) },
  screenHeaderSpacer: { width: 36, height: 36 },
  screenHeaderTextWrap: { flex: 1, minWidth: 0 },
  screenHeaderTitle: { fontFamily: fonts.serif, fontSize: 22, color: colors.text },
  screenHeaderSubtitle: { fontFamily: fonts.sansSemiBold, fontSize: 12.5, color: colors.textMuted, marginTop: 2 },
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    borderRadius: radius.lg,
    padding: space(4),
    gap: space(1.5),
  },
  label: { ...font.label, color: colors.textMuted },
  body: { ...font.body, color: colors.text },
  sectionHeader: { flexDirection: "row", alignItems: "center", gap: space(1.5), marginBottom: space(1) },
  sectionTitle: {
    fontFamily: fonts.sansBold,
    fontSize: 11.5,
    letterSpacing: 0.8,
    color: colors.textFaint,
    textTransform: "uppercase",
  },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: "rgba(255,255,255,0.08)", marginVertical: space(2) },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  empty: { alignItems: "center", justifyContent: "center", paddingVertical: space(10), gap: space(3) },
  emptyText: { fontFamily: fonts.sans, fontSize: 14, color: colors.textFaint, textAlign: "center", maxWidth: 260 },
  loading: { flex: 1, alignItems: "center", justifyContent: "center", gap: space(3) },
  loadingLabel: { fontFamily: fonts.sans, fontSize: 13, color: colors.textMuted },
  errorBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: space(2),
    padding: space(3),
    borderRadius: radius.md,
    backgroundColor: "rgba(251,113,133,0.1)",
    borderWidth: 1,
    borderColor: "rgba(251,113,133,0.28)",
  },
  errorText: { flex: 1, fontFamily: fonts.sans, fontSize: 13, color: colors.avoid },
  retryText: { fontFamily: fonts.sansBold, fontSize: 12, color: colors.accent },
  field: {
    backgroundColor: colors.bgElevated,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    paddingHorizontal: space(3),
    paddingVertical: space(2.5),
    color: colors.text,
    fontFamily: fonts.sans,
    fontSize: 15,
  },
  btnWrap: { borderRadius: radius.md, overflow: "hidden" },
  btn: { paddingVertical: space(3.75), alignItems: "center", borderRadius: radius.md },
  btnText: { fontFamily: fonts.sansBold, fontSize: 15, color: colors.onAccent },
  secondaryBtn: {
    alignItems: "center",
    paddingVertical: space(3),
    paddingHorizontal: space(4),
    borderRadius: radius.md,
    backgroundColor: colors.accentSoft,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  secondaryText: { fontFamily: fonts.sansSemiBold, fontSize: 14, color: colors.accent },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: space(1),
    paddingHorizontal: space(2.5),
    paddingVertical: space(2),
    borderRadius: radius.pill,
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  pillActive: { backgroundColor: colors.accent },
  pillText: { fontFamily: fonts.sansMedium, fontSize: 12, color: colors.textMuted },
  pillTextActive: { color: colors.onAccent },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: space(3),
    paddingHorizontal: space(4),
    paddingBottom: space(2),
  },
  eyebrow: {
    fontFamily: fonts.mono,
    fontSize: 10,
    color: colors.accent,
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  sheetTitle: { fontFamily: fonts.serif, fontSize: 20, color: colors.text },
  tabs: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: space(1.5),
    paddingHorizontal: space(3),
    paddingBottom: space(2.5),
  },
});
