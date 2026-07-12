import { StyleSheet, Text, View, type StyleProp, type TextStyle, type ViewStyle } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { MotiView } from "moti";
import { Tappable } from "./Tappable";
import { colors, fonts, goldGradient, motion, radius, space } from "../theme";

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
  },
  label: { fontFamily: fonts.sansBold, fontSize: 11.5, letterSpacing: 0.8, color: colors.textMuted },
  body: { fontFamily: fonts.sans, fontSize: 14.5, lineHeight: 21, color: colors.text },
  btnWrap: { borderRadius: radius.md, overflow: "hidden" },
  btn: { paddingVertical: 15, alignItems: "center", borderRadius: radius.md },
  btnText: { fontFamily: fonts.sansBold, fontSize: 15, color: colors.onAccent },
});
