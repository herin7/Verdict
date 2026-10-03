import { ScrollView, StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon } from "@/components/icons";
import { Button, Text } from "@/components/ui";
import { useSession } from "@/features/auth/session";
import { BuyerDna } from "@/features/profile/BuyerDna";
import { CALIBRATION, labelOf } from "@/features/profile/questions";
import { colors, space } from "@/theme";

/** The buyer profile, read back, with a way to retake it. */
export default function Profile() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { profile } = useSession();
  if (!profile) return null;

  const learned = CALIBRATION.filter((q) => profile.calibration[q.id]);

  return (
    <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + space(8) }]}>
      <View style={styles.intro}>
        <Text variant="overline">Your buyer DNA</Text>
        <Text variant="subhead">Every verdict is weighed against this. The same product can be a buy for you and a skip for someone else.</Text>
      </View>
      <BuyerDna profile={profile} animate={false} />

      {learned.length ? (
        <View style={styles.learned}>
          <Text variant="overline">Learned since</Text>
          {learned.map((q) => (
            <View key={q.id} style={styles.row}>
              <Text variant="subhead" style={styles.flex}>
                {q.title}
              </Text>
              <Text variant="bodyStrong">{q.options.find((o) => o.key === profile.calibration[q.id])?.label ?? labelOf(profile.calibration[q.id]!)}</Text>
            </View>
          ))}
        </View>
      ) : null}

      <Button label="Retake the questions" variant="secondary" icon={Icon.ArrowClockwise} onPress={() => router.push("/retake")} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scroll: { padding: space(6), gap: space(10), backgroundColor: colors.bg },
  intro: { gap: space(2) },
  learned: { gap: space(3) },
  row: { flexDirection: "row", alignItems: "center", gap: space(4) },
});
