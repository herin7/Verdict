import { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { MotiView } from "moti";
import { Tappable } from "../components/Tappable";
import { colors, fonts, goldGradient, motion, radius, space } from "../theme";
import { supabase, supabaseConfigured } from "../lib/supabase";

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
      onLogin(e);
      return;
    }

    setBusy(true);
    try {
      if (mode === "signin") {
        const { data, error: err } = await supabase.auth.signInWithPassword({ email: e, password });
        if (err) throw err;
        onLogin(data.user?.email ?? e);
      } else {
        const { data, error: err } = await supabase.auth.signUp({ email: e, password });
        if (err) throw err;
        if (data.session) {
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
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View style={styles.center}>
        <MotiView
          from={{ opacity: 0, translateY: 16 }}
          animate={{ opacity: 1, translateY: 0 }}
          transition={{ type: "timing", duration: motion.normal }}
        >
          <Ionicons name="flash" size={22} color={colors.accent} style={{ marginBottom: 6 }} />
        </MotiView>
        <MotiView
          from={{ opacity: 0, translateY: 12 }}
          animate={{ opacity: 1, translateY: 0 }}
          transition={{ type: "timing", duration: motion.normal, delay: 80 }}
        >
          <Text style={styles.wordmark}>Verdict</Text>
          <Text style={styles.tagline}>Internet consensus, in seconds.</Text>
        </MotiView>

        <MotiView
          from={{ opacity: 0, translateY: 18 }}
          animate={{ opacity: 1, translateY: 0 }}
          transition={{ type: "timing", duration: motion.normal, delay: 140 }}
          style={styles.form}
        >
          <View style={styles.modeRow}>
            <Tappable onPress={() => setMode("signin")} style={[styles.modeChip, mode === "signin" && styles.modeChipOn]}>
              <Text style={[styles.modeText, mode === "signin" && styles.modeTextOn]}>Sign in</Text>
            </Tappable>
            <Tappable onPress={() => setMode("signup")} style={[styles.modeChip, mode === "signup" && styles.modeChipOn]}>
              <Text style={[styles.modeText, mode === "signup" && styles.modeTextOn]}>Sign up</Text>
            </Tappable>
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

          {error && <Text style={styles.error}>{error}</Text>}
          {info && <Text style={styles.info}>{info}</Text>}

          <Tappable onPress={busy ? undefined : submit} style={styles.btnWrap} disabled={busy}>
            <LinearGradient colors={goldGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.btn}>
              {busy ? (
                <ActivityIndicator color={colors.onAccent} />
              ) : (
                <>
                  <Text style={styles.btnText}>{mode === "signin" ? "Sign in" : "Create account"}</Text>
                  <Ionicons name="arrow-forward" size={16} color={colors.onAccent} />
                </>
              )}
            </LinearGradient>
          </Tappable>

          {!supabaseConfigured && (
            <Text style={styles.note}>Dev mode - Supabase env missing, local soft-login on.</Text>
          )}
        </MotiView>
      </View>
    </KeyboardAvoidingView>
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
  modeChip: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 10,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    backgroundColor: colors.surface,
  },
  modeChipOn: { backgroundColor: colors.accentSoft, borderColor: "rgba(255,215,109,0.4)" },
  modeText: { fontFamily: fonts.sansSemiBold, color: colors.textMuted, fontSize: 13 },
  modeTextOn: { color: colors.accent },
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
  info: { fontFamily: fonts.sansSemiBold, color: colors.buy, fontSize: 12.5 },
  btnWrap: { borderRadius: radius.md, overflow: "hidden", marginTop: 8 },
  btn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 15,
    borderRadius: radius.md,
    minHeight: 52,
  },
  btnText: { fontFamily: fonts.sansBold, fontSize: 15, color: colors.onAccent },
  note: { fontFamily: fonts.sans, fontSize: 11.5, color: colors.textFaint, textAlign: "center", marginTop: 6 },
});
