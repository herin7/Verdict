import { Component, type ErrorInfo, type ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { Button, Text } from "./ui";
import { colors, space } from "../theme";

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
        <Text variant="display" style={styles.center}>
          Something went wrong
        </Text>
        <Text variant="subhead" style={styles.center}>
          {__DEV__ ? this.state.error.message : "Verdict hit an unexpected problem. Everything you've shared is safe."}
        </Text>
        <Button
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
  center: { textAlign: "center" },
});
