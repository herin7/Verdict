import { useEffect, useState } from "react";
import { Share, StyleSheet, View } from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { Icon } from "@/components/icons";
import { Button, ErrorBanner, Field, IconButton, LoadingState, Text } from "@/components/ui";
import { useInbox } from "@/features/inbox/inbox";
import { itemTitle, type InboxItem } from "@/features/inbox/types";
import { CalibrationCard } from "@/features/profile/CalibrationCard";
import { ReportView } from "@/features/report/ReportView";
import { colors, radius, space, verdictLabel } from "@/theme";

const STEPS = [
  "Reading what you shared",
  "Working out the product",
  "Finding reviews and owner reports",
  "Reading what owners say",
  "Writing the verdict",
  "Matching it to your priorities",
];

/**
 * Which step is running. The server's `stage` is free text for humans, so this
 * is a keyword guess.
 * ponytail: keyword match on stage text; switch to a numeric step if the API ever sends one.
 */
function currentStep(item: InboxItem): number {
  const share = item.server;
  if (!share || share.status === "queued") return 0;
  if (share.status === "identifying") return 1;
  const stage = share.stage?.toLowerCase() ?? "";
  if (/match|priorit/.test(stage)) return 5;
  if (/writ|verdict|summar/.test(stage)) return 4;
  if (/read|owner|analy/.test(stage)) return 3;
  return 2;
}

export default function ItemScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const inbox = useInbox();
  const item = inbox.get(id);

  // Opened from a push before this device has synced the row.
  useEffect(() => {
    if (!item && inbox.loaded) void inbox.refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Boolean(item), inbox.loaded]);

  if (!item) return <LoadingState label="Finding this share…" />;

  const share = item.server;
  if (share?.status === "ready" && share.report) {
    const report = share.report;
    const personal = share.personal;
    const product = share.product ?? {
      name: itemTitle(item),
      brand: null,
      category: "",
      model: null,
      confidence: 0,
      searchTerm: itemTitle(item),
    };
    return (
      <>
        <Stack.Screen
          options={{
            headerRight: () => (
              <IconButton
                icon={Icon.ShareNetwork}
                label="Share verdict"
                onPress={() =>
                  void Share.share({
                    message: personal
                      ? `${product.name}: ${verdictLabel[personal.verdict]} for me. ${personal.headline}`
                      : `${product.name}: ${verdictLabel[report.verdict]}. ${report.verdictLine}`,
                  })
                }
              />
            ),
          }}
        />
        <ReportView product={product} report={report} personal={personal} footer={<CalibrationCard />} />
      </>
    );
  }
  if (share?.status === "needs_input") return <NeedsInput item={item} />;
  if (share?.status === "failed") return <Failed item={item} />;
  return <Working item={item} />;
}

function Working({ item }: { item: InboxItem }) {
  const step = currentStep(item);
  return (
    <View style={styles.screen}>
      <Text variant="display">{itemTitle(item)}</Text>
      <Text variant="subhead">
        {item.pending ? "Waiting to send…" : (item.server?.stage ?? "Investigating…")} I'll let you know when it's ready.
      </Text>
      <View style={styles.steps}>
        {STEPS.map((label, i) => {
          const done = i < step;
          const active = i === step;
          return (
            <View key={label} style={styles.step} accessibilityState={{ selected: active }}>
              <View style={[styles.stepDot, done && styles.stepDone, active && styles.stepActive]}>
                {done ? <Icon.Check size={12} color={colors.onPrimary} weight="bold" /> : null}
              </View>
              <Text variant={active ? "bodyStrong" : "body"} style={!active && !done ? styles.faint : undefined}>
                {label}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

function NeedsInput({ item }: { item: InboxItem }) {
  const inbox = useInbox();
  const [product, setProduct] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!product.trim()) return;
    setBusy(true);
    setError(null);
    await inbox.retry(item, product.trim()).catch((e: Error) => setError(e.message));
    setBusy(false);
  }

  return (
    <KeyboardAwareScrollView contentContainerStyle={styles.screen} keyboardShouldPersistTaps="handled">
      <Text variant="display">Which product is this?</Text>
      <Text variant="subhead">
        {item.server?.error ?? "We couldn't tell exactly what you shared."} Type its name and we'll take it from there.
      </Text>
      <Field
        placeholder="e.g. Sony WH-1000XM5"
        accessibilityLabel="Product name"
        value={product}
        onChangeText={setProduct}
        onSubmitEditing={submit}
        returnKeyType="go"
        autoFocus
      />
      {error ? <ErrorBanner message={error} /> : null}
      <Button label="Find the verdict" onPress={submit} loading={busy} disabled={!product.trim()} />
    </KeyboardAwareScrollView>
  );
}

function Failed({ item }: { item: InboxItem }) {
  const inbox = useInbox();
  const [busy, setBusy] = useState(false);
  return (
    <View style={styles.screen}>
      <Text variant="display">{itemTitle(item)}</Text>
      <ErrorBanner message={item.server?.error ?? "We couldn't finish this one."} />
      <Button
        label="Retry"
        icon={Icon.ArrowClockwise}
        loading={busy}
        onPress={() => {
          setBusy(true);
          inbox
            .retry(item)
            .catch(() => {})
            .finally(() => setBusy(false));
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { padding: space(5), gap: space(4) },
  faint: { color: colors.textFaint },
  steps: { gap: space(4), marginTop: space(4) },
  step: { flexDirection: "row", alignItems: "center", gap: space(3) },
  stepDot: {
    width: 20,
    height: 20,
    borderRadius: radius.full,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  stepDone: { backgroundColor: colors.buy, borderColor: colors.buy },
  stepActive: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
});
