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
import { colors, font, fonts, iconSize, radius, space } from "../theme";
import { useLayout } from "../layout";
import { supabase, supabaseConfigured } from "../lib/supabase";
import { track } from "../analytics/posthog";

export function LoginScreen({ onLogin }: { onLogin: (email: string) => void }) {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState<string | null>(null);
  const { gutter } = useLayout();

  async function submit() {
    setError(null);
    setInfo(null);
    const e = email.trim().toLowerCase();
    if (!e || !password) {
      setError("Enter your email and password.");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }

    if (!supabaseConfigured || !supabase) {
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
      setError((err as Error).message || "Could not sign in");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen padded={false}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={[styles.center, { paddingHorizontal: gutter * 1.5 }]}>
          <Stagger index={0}>
            <View style={styles.brandMark}>
              <Ionicons name="flash" size={iconSize.md} color={colors.accent} />
            </View>
          </Stagger>
          <Stagger index={1}>
            <Text style={styles.wordmark}>Verdict</Text>
            <Text style={styles.tagline}>Know before you buy — across Flipkart, Amazon and more.</Text>
          </Stagger>

          <Stagger index={2}>
            <View style={styles.form}>
              <View style={styles.modeRow}>
                <PillButton label="Sign in" active={mode === "signin"} onPress={() => setMode("signin")} />
                <PillButton label="Sign up" active={mode === "signup"} onPress={() => setMode("signup")} />
              </View>

              <View style={styles.inputWrap}>
                <Ionicons name="mail-outline" size={iconSize.sm} color={colors.textFaint} />
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
                <Ionicons name="lock-closed-outline" size={iconSize.sm} color={colors.textFaint} />
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
                label={busy ? "Please wait…" : mode === "signin" ? "Sign in" : "Create account"}
                disabled={busy}
                onPress={submit}
              />

              {!supabaseConfigured && (
                <Text style={styles.note}>Dev mode — local sign-in (Supabase not configured).</Text>
              )}
            </View>
          </Stagger>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  brandMark: {
    width: space(12),
    height: space(12),
    borderRadius: radius.pill,
    backgroundColor: colors.accentSoft,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: space(3),
  },
  wordmark: { ...font.display, color: colors.text, textAlign: "center" },
  tagline: {
    ...font.body,
    color: colors.textMuted,
    marginTop: space(2),
    marginBottom: space(8),
    textAlign: "center",
    maxWidth: 300,
  },
  form: { width: "100%", gap: space(3) },
  modeRow: { flexDirection: "row", gap: space(2), marginBottom: space(1) },
  inputWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: space(2.5),
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: space(3.5),
    paddingVertical: space(3.5),
  },
  input: { flex: 1, color: colors.text, ...font.body, padding: 0 },
  info: { ...font.small, color: colors.buy },
  note: { ...font.caption, color: colors.textFaint, textAlign: "center", marginTop: space(1) },
});
