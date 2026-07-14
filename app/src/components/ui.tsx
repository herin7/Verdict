import { StyleSheet, Text, View, type StyleProp, type TextStyle, type ViewStyle } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { MotiView } from "moti";
import { Ionicons } from "@expo/vector-icons";
import { Tappable } from "./Tappable";
import { colors, font, fonts, goldGradient, motion, radius, space } from "../theme";

export function Screen({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.screen, style]}>{children}</View>;
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
