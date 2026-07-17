import { Component, type ErrorInfo, type ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import { PrimaryButton } from "./ui";
import { colors, font, fonts, space } from "../theme";

type Props = { children: ReactNode; onReset?: () => void };
type State = { error: Error | null };

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.warn("[ErrorBoundary]", error.message, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <View style={styles.wrap}>
        <Text style={styles.title}>Something went wrong</Text>
        <Text style={styles.body}>{this.state.error.message || "Unexpected error"}</Text>
        <PrimaryButton
          label="Try again"
          onPress={() => {
            this.setState({ error: null });
            this.props.onReset?.();
          }}
        />
      </View>
    );
  }
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: "center",
    justifyContent: "center",
    padding: space(8),
    gap: space(3),
  },
  title: { ...font.h1, fontFamily: fonts.serif, color: colors.text },
  body: { ...font.small, fontFamily: fonts.sans, color: colors.textMuted, textAlign: "center", marginBottom: space(2) },
});
