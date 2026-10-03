import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import * as Haptics from "expo-haptics";
import { FadeIn } from "../../components/FadeIn";
import { Chip, Press, Text } from "../../components/ui";
import { colors, radius, space } from "../../theme";
import { useSession } from "../auth/session";
import { CALIBRATION } from "./questions";
import { calibrationDue, markCalibrationAsked } from "./store";

/**
 * One optional question under a finished verdict, at most every few days,
 * until there are none left. Answers go into the buyer profile, so the next
 * verdict already uses them.
 */
export function CalibrationCard() {
  const { profile, saveProfile } = useSession();
  const [due, setDue] = useState(false);
  const [thanks, setThanks] = useState(false);
  const question = profile ? CALIBRATION.find((q) => !profile.calibration[q.id]) : undefined;

  useEffect(() => {
    void calibrationDue().then(setDue);
  }, []);

  if (thanks) {
    return (
      <FadeIn style={styles.card}>
        <Text variant="bodyStrong">Got it. Your next verdicts will use that.</Text>
      </FadeIn>
    );
  }
  if (!profile || !question || !due) return null;

  async function answer(key: string) {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    await markCalibrationAsked();
    await saveProfile({ ...profile!, calibration: { ...profile!.calibration, [question!.id]: key } });
    setThanks(true);
  }

  return (
    <FadeIn style={styles.card}>
      <View style={styles.head}>
        <Text variant="overline" style={styles.flex}>
          Tune your verdicts
        </Text>
        <Press
          hitSlop={8}
          accessibilityLabel="Not now"
          onPress={() => {
            void markCalibrationAsked();
            setDue(false);
          }}
        >
          <Text variant="subhead">Not now</Text>
        </Press>
      </View>
      <Text variant="headline">{question.title}</Text>
      <View style={styles.options}>
        {question.options.map((o) => (
          <Chip key={o.key} label={o.label} onPress={() => void answer(o.key)} />
        ))}
      </View>
    </FadeIn>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  card: {
    gap: space(3),
    padding: space(5),
    borderRadius: radius.lg,
    borderCurve: "continuous",
    backgroundColor: colors.primarySoft,
  },
  head: { flexDirection: "row", alignItems: "center" },
  options: { flexDirection: "row", flexWrap: "wrap", gap: space(2) },
});
