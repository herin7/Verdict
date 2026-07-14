import { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ErrorBanner, PillButton, PrimaryButton, Screen, Stagger } from "../components/ui";
import { colors, fonts, radius, space } from "../theme";
import { supabase, supabaseConfigured } from "../lib/supabase";
import { track } from "../analytics/posthog";

export function LoginScreen({ onLogin }: { onLogin: (email: string) => void }) {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState<string | null>(null);

  async function submit() {
    setError(null);
    setInfo(null);
    const e = email.trim().toLowerCase();
    if (!e || !password) {
      setError("Email and password required.");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }

    if (!supabaseConfigured || !supabase) {
      // Soft mode when Supabase env missing - keep local demos working.
      track(mode === "signin" ? "auth_login" : "auth_signup");
      onLogin(e);
      return;
    }

    setBusy(true);
    try {
      if (mode === "signin") {
        const { data, error: err } = await supabase.auth.signInWithPassword({ email: e, password });
        if (err) throw err;
        track("auth_login");
        onLogin(data.user?.email ?? e);
      } else {
        const { data, error: err } = await supabase.auth.signUp({ email: e, password });
        if (err) throw err;
        if (data.session) {
          track("auth_signup");
          onLogin(data.user?.email ?? e);
        } else {
          setInfo("Check your inbox to confirm email, then sign in.");
          setMode("signin");
        }
      }
    } catch (err) {
      setError((err as Error).message || "Auth failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen padded={false}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={styles.center}>
          <Stagger index={0}>
            <Ionicons name="flash" size={22} color={colors.accent} style={{ marginBottom: 6 }} />
          </Stagger>
          <Stagger index={1}>
            <Text style={styles.wordmark}>Verdict</Text>
            <Text style={styles.tagline}>Internet consensus, in seconds.</Text>
          </Stagger>

          <Stagger index={2}>
            <View style={styles.form}>
              <View style={styles.modeRow}>
                <PillButton
                  label="Sign in"
                  active={mode === "signin"}
                  onPress={() => setMode("signin")}
                />
                <PillButton
                  label="Sign up"
                  active={mode === "signup"}
                  onPress={() => setMode("signup")}
                />
              </View>

              <View style={styles.inputWrap}>
                <Ionicons name="mail-outline" size={16} color={colors.textFaint} />
                <TextInput
                  style={styles.input}
                  placeholder="Email"
                  placeholderTextColor={colors.textFaint}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="email-address"
                  value={email}
                  onChangeText={setEmail}
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

              {error ? <ErrorBanner message={error} /> : null}
              {info ? <Text style={styles.info}>{info}</Text> : null}

              <PrimaryButton
                label={busy ? "…" : mode === "signin" ? "Sign in" : "Create account"}
                disabled={busy}
                onPress={submit}
              />

              {!supabaseConfigured && (
                <Text style={styles.note}>Dev mode - Supabase env missing, local soft-login on.</Text>
              )}
            </View>
          </Stagger>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: space(8) },
  wordmark: { fontFamily: fonts.serif, fontSize: 46, color: colors.accent, lineHeight: 50, textAlign: "center" },
  tagline: {
    fontFamily: fonts.sansSemiBold,
    fontSize: 13,
    color: colors.textMuted,
    marginTop: 6,
    marginBottom: 36,
    textAlign: "center",
  },
  form: { width: "100%", gap: 12 },
  modeRow: { flexDirection: "row", gap: 8, marginBottom: 4 },
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
  info: { fontFamily: fonts.sansSemiBold, color: colors.buy, fontSize: 12.5 },
  note: { fontFamily: fonts.sans, fontSize: 11.5, color: colors.textFaint, textAlign: "center", marginTop: 6 },
});
