import { useState } from "react";
import { KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { Tappable } from "../components/Tappable";
import { colors, fonts, goldGradient, radius } from "../theme";

export function LoginScreen({ onLogin }: { onLogin: (username: string) => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  function submit() {
    if (!username.trim() || !password.trim()) {
      setError("Enter a username and password to continue.");
      return;
    }
    setError(null);
    onLogin(username.trim());
  }

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View style={styles.center}>
        <Ionicons name="flash" size={22} color={colors.accent} style={{ marginBottom: 6 }} />
        <Text style={styles.wordmark}>Verdict</Text>
        <Text style={styles.tagline}>Internet consensus, in seconds.</Text>

        <View style={styles.form}>
          <View style={styles.inputWrap}>
            <Ionicons name="person-outline" size={16} color={colors.textFaint} />
            <TextInput
              style={styles.input}
              placeholder="Username"
              placeholderTextColor={colors.textFaint}
              autoCapitalize="none"
              autoCorrect={false}
              value={username}
              onChangeText={setUsername}
            />
          </View>
          <View style={styles.inputWrap}>
            <Ionicons name="lock-closed-outline" size={16} color={colors.textFaint} />
            <TextInput
              style={styles.input}
              placeholder="Password"
              placeholderTextColor={colors.textFaint}
              secureTextEntry
              value={password}
              onChangeText={setPassword}
              onSubmitEditing={submit}
            />
          </View>

          {error && <Text style={styles.error}>{error}</Text>}

          <Tappable onPress={submit} style={styles.btnWrap}>
            <LinearGradient colors={goldGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.btn}>
              <Text style={styles.btnText}>Log in</Text>
              <Ionicons name="arrow-forward" size={16} color={colors.onAccent} />
            </LinearGradient>
          </Tappable>

          <Text style={styles.note}>Demo login - any username and password works.</Text>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 32 },
  wordmark: { fontFamily: fonts.serif, fontSize: 46, color: colors.accent, lineHeight: 50 },
  tagline: { fontFamily: fonts.sansSemiBold, fontSize: 13, color: colors.textMuted, marginTop: 6, marginBottom: 40 },
  form: { width: "100%", gap: 12 },
  inputWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  input: { flex: 1, color: colors.text, fontFamily: fonts.sans, fontSize: 14.5, padding: 0 },
  error: { fontFamily: fonts.sansSemiBold, color: colors.avoid, fontSize: 12.5 },
  btnWrap: { borderRadius: radius.md, overflow: "hidden", marginTop: 8 },
  btn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 15,
    borderRadius: radius.md,
  },
  btnText: { fontFamily: fonts.sansBold, fontSize: 15, color: colors.onAccent },
  note: { fontFamily: fonts.sans, fontSize: 11.5, color: colors.textFaint, textAlign: "center", marginTop: 6 },
});
