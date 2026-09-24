import { useRef, useState } from "react";
import { StyleSheet, TextInput, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon } from "@/components/icons";
import { Button, ErrorBanner, Field, Press, Text } from "@/components/ui";
import { authenticate, type AuthMode } from "@/features/auth/authenticate";
import { demoCredentials } from "@/features/auth/demoAuth";
import { useSession } from "@/features/auth/session";
import { supabaseConfigured } from "@/lib/supabase";
import { colors, fonts, radius, space } from "@/theme";

export default function SignIn() {
  const insets = useSafeAreaInsets();
  const { signIn } = useSession();
  const [mode, setMode] = useState<AuthMode>("signin");
  const [email, setEmail] = useState(demoCredentials?.email ?? "");
  const [password, setPassword] = useState(demoCredentials?.password ?? "");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const passwordRef = useRef<TextInput>(null);

  async function submit() {
    setError(null);
    setInfo(null);
    setBusy(true);
    try {
      const result = await authenticate(mode, email, password);
      if ("email" in result) {
        await signIn(result.email); // the router guard takes over from here
        return;
      }
      setInfo("Check your inbox to confirm your email, then sign in.");
      setMode("signin");
    } catch (e) {
      setError((e as Error).message || "Couldn't sign you in.");
    }
    setBusy(false);
  }

  return (
    <KeyboardAwareScrollView
      style={styles.screen}
      contentContainerStyle={styles.scroll}
      keyboardShouldPersistTaps="handled"
      bottomOffset={space(24)}
      bounces={false}
    >
      <View style={[styles.band, { paddingTop: insets.top + space(10) }]}>
        <View style={styles.mark}>
          <Icon.SealCheck size={32} color={colors.onAccent} weight="fill" />
        </View>
        <Text variant="display" style={styles.onPrimary}>
          Verdict
        </Text>
        <Text variant="body" style={styles.tagline}>
          Know if it's worth it before you buy.
        </Text>
      </View>

      <View style={[styles.sheet, { paddingBottom: insets.bottom + space(6) }]}>
        <View style={styles.segment} accessibilityRole="tablist">
          {(["signin", "signup"] as const).map((m) => (
            <Press
              key={m}
              onPress={() => setMode(m)}
              accessibilityRole="tab"
              accessibilityState={{ selected: mode === m }}
              style={[styles.segmentItem, mode === m && styles.segmentItemOn]}
            >
              <Text variant="bodyStrong" style={mode === m ? styles.segmentTextOn : styles.segmentText}>
                {m === "signin" ? "Sign in" : "Create account"}
              </Text>
            </Press>
          ))}
        </View>

        {demoCredentials && mode === "signin" ? (
          <View style={styles.demo}>
            <Icon.Lightning size={18} color={colors.onAccent} weight="fill" />
            <Text variant="caption" style={styles.demoText}>
              Dev build: demo account filled in ({demoCredentials.email})
            </Text>
          </View>
        ) : null}

        <Field
          icon={Icon.Envelope}
          placeholder="Email"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          autoComplete="email"
          textContentType="emailAddress"
          returnKeyType="next"
          accessibilityLabel="Email"
          value={email}
          onChangeText={setEmail}
          onSubmitEditing={() => passwordRef.current?.focus()}
        />
        <Field
          ref={passwordRef}
          icon={Icon.Lock}
          placeholder="Password"
          secureTextEntry
          autoComplete={mode === "signin" ? "current-password" : "new-password"}
          textContentType={mode === "signin" ? "password" : "newPassword"}
          returnKeyType="go"
          accessibilityLabel="Password"
          value={password}
          onChangeText={setPassword}
          onSubmitEditing={submit}
        />

        {error ? <ErrorBanner message={error} /> : null}
        {info ? <Text variant="subhead" style={{ color: colors.buy }}>{info}</Text> : null}

        <Button label={mode === "signin" ? "Sign in" : "Create account"} size="lg" loading={busy} onPress={submit} />

        {!supabaseConfigured ? (
          <Text variant="caption" style={styles.center}>
            Supabase isn't configured, so any email signs in locally.
          </Text>
        ) : null}
      </View>
    </KeyboardAwareScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  scroll: { flexGrow: 1 },
  center: { textAlign: "center" },
  onPrimary: { color: colors.onPrimary },
  band: {
    alignItems: "center",
    gap: space(2),
    paddingBottom: space(14),
    experimental_backgroundImage: `linear-gradient(160deg, ${colors.primary} 0%, ${colors.primaryDeep} 100%)`,
  },
  mark: {
    width: 64,
    height: 64,
    borderRadius: radius.lg,
    borderCurve: "continuous",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.accent,
    marginBottom: space(2),
  },
  tagline: { color: colors.onPrimary, opacity: 0.8 },
  sheet: {
    flex: 1,
    marginTop: -space(8),
    padding: space(5),
    gap: space(4),
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    backgroundColor: colors.surface,
  },
  segment: { flexDirection: "row", padding: 4, borderRadius: radius.md, backgroundColor: colors.surfaceMuted },
  segmentItem: { flex: 1, minHeight: 40, alignItems: "center", justifyContent: "center", borderRadius: radius.sm },
  segmentItemOn: { backgroundColor: colors.surface },
  segmentText: { color: colors.textMuted, fontFamily: fonts.semibold },
  segmentTextOn: { color: colors.primary },
  demo: {
    flexDirection: "row",
    alignItems: "center",
    gap: space(2),
    padding: space(3),
    borderRadius: radius.md,
    backgroundColor: colors.accent,
  },
  demoText: { flex: 1, color: colors.onAccent },
});
