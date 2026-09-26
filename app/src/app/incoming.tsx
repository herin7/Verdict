import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, BackHandler, StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { useShareIntentContext } from "expo-share-intent";
import Animated, { ZoomIn } from "react-native-reanimated";
import { Icon } from "@/components/icons";
import { Press, Text } from "@/components/ui";
import { useInbox } from "@/features/inbox/inbox";
import { sharedPayload } from "@/features/inbox/prepare";
import { registerForPush } from "@/features/notifications/push";
import { colors, radius, space } from "@/theme";

type Phase = "saving" | "sent" | "queued" | "failed";

const COPY: Record<Phase, { title: string; body: string }> = {
  saving: { title: "Adding to Verdict…", body: "" },
  sent: { title: "Added to Verdict", body: "Investigating… I'll let you know when it's ready." },
  queued: { title: "Saved", body: "Saved — will send when you're back online." },
  failed: { title: "Couldn't add this", body: "Nothing we can read was shared. Try sharing a link or a screenshot." },
};

/**
 * The share-sheet landing: confirm, upload, then hand the user straight back to
 * the app they came from. The share is in the outbox before anything else happens.
 */
export default function Incoming() {
  const router = useRouter();
  const inbox = useInbox();
  const { isReady, hasShareIntent, shareIntent, resetShareIntent } = useShareIntentContext();
  const [phase, setPhase] = useState<Phase>("saving");
  const handled = useRef(false);
  const exitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stay = useRef(false);

  useEffect(() => {
    if (!isReady || handled.current) return;
    if (!hasShareIntent) {
      router.replace("/");
      return;
    }
    handled.current = true;
    const payload = sharedPayload(shareIntent);
    resetShareIntent();

    void (async () => {
      let next: Phase = "failed";
      if (payload) {
        try {
          next = (await inbox.add(payload)).sent ? "sent" : "queued";
        } catch {
          next = "failed";
        }
      }
      setPhase(next);
      void Haptics.notificationAsync(
        next === "failed" ? Haptics.NotificationFeedbackType.Error : Haptics.NotificationFeedbackType.Success
      );
      if (next !== "failed") await registerForPush({ ask: true }).catch(() => {});
      if (!stay.current) exitTimer.current = setTimeout(() => BackHandler.exitApp(), next === "sent" ? 1200 : 2500);
    })();
  }, [isReady, hasShareIntent, shareIntent, resetShareIntent, inbox, router]);

  useEffect(() => () => void (exitTimer.current && clearTimeout(exitTimer.current)), []);

  function openVerdict() {
    stay.current = true;
    if (exitTimer.current) clearTimeout(exitTimer.current);
    router.replace("/");
  }

  const copy = COPY[phase];
  const Glyph = phase === "failed" ? Icon.WarningCircle : phase === "queued" ? Icon.CloudSlash : Icon.Check;
  return (
    <View style={styles.screen}>
      <View style={styles.badge}>
        {phase === "saving" ? (
          <ActivityIndicator color={colors.primary} />
        ) : (
          <Animated.View entering={ZoomIn.springify().damping(14)}>
            <Glyph size={40} color={phase === "failed" ? colors.avoid : colors.primary} weight="bold" />
          </Animated.View>
        )}
      </View>
      <Text variant="title" style={styles.center} accessibilityLiveRegion="polite">
        {copy.title}
      </Text>
      {copy.body ? (
        <Text variant="subhead" style={styles.center}>
          {copy.body}
        </Text>
      ) : null}
      <Press onPress={openVerdict} style={styles.open} accessibilityRole="link">
        <Text variant="subhead" style={styles.link}>
          Open Verdict
        </Text>
      </Press>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, alignItems: "center", justifyContent: "center", gap: space(3), padding: space(8), backgroundColor: colors.bg },
  badge: {
    width: 80,
    height: 80,
    borderRadius: radius.full,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primarySoft,
    marginBottom: space(2),
  },
  center: { textAlign: "center" },
  open: { marginTop: space(6), padding: space(2) },
  link: { color: colors.primary },
});
