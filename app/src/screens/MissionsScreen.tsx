import { useCallback, useEffect, useState } from "react";
import { BackHandler, FlatList, Linking, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { FadeIn } from "../components/FadeIn";
import { Tappable } from "../components/Tappable";
import {
  EmptyState,
  ErrorBanner,
  Field,
  IconButton,
  LoadingState,
  PrimaryButton,
  Screen,
  ScreenHeader,
  SecondaryButton,
  Stagger,
  Surface,
} from "../components/ui";
import { RetailerMark } from "../components/RetailerMark";
import { colors, font, fonts, iconSize, space } from "../theme";
import { track } from "../analytics/posthog";
import {
  approveMission,
  cancelMission,
  createMission,
  fetchMissions,
  fetchMissionsStatus,
  rejectMission,
  runMission,
  type MissionDto,
} from "../api/client";

export function statusColor(status: string): string {
  if (status === "awaiting_approval") return colors.wait;
  if (status === "approved" || status === "monitoring") return colors.buy;
  if (status === "rejected" || status === "cancelled") return colors.avoid;
  return colors.textMuted;
}

function MissionRow({ item, onPress }: { item: MissionDto; onPress: () => void }) {
  return (
    <Tappable onPress={onPress} style={styles.listTap} accessibilityLabel={item.title}>
      <Surface style={styles.listCard} padded={false}>
        <View style={{ flex: 1 }}>
          <Text style={styles.listTitle}>{item.title}</Text>
          <Text style={styles.listGoal} numberOfLines={2}>
            {item.goal}
          </Text>
          <Text style={[styles.listStatus, { color: statusColor(item.status) }]}>
            {item.status.replace(/_/g, " ")}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={iconSize.sm} color={colors.textFaint} />
      </Surface>
    </Tappable>
  );
}

export function MissionsScreen({ onBack }: { onBack: () => void }) {
  const [items, setItems] = useState<MissionDto[]>([]);
  const [selected, setSelected] = useState<MissionDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [enabled, setEnabled] = useState(true);
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");
  const [goal, setGoal] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const status = await fetchMissionsStatus();
      setEnabled(status.enabled);
      if (!status.enabled) {
        setItems([]);
        return;
      }
      const res = await fetchMissions();
      setItems(res.items);
      setSelected((prev) => {
        if (!prev) return null;
        return res.items.find((m) => m.id === prev.id) ?? prev;
      });
    } catch (err) {
      setError((err as Error).message);
      setEnabled(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    track("missions_opened");
    refresh();
  }, [refresh]);

  // Intercept hardware back to close the detail view / new-mission form
  // first, before it bubbles up to the app-level navigator's onBack.
  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (selected) {
        setSelected(null);
        return true;
      }
      if (creating) {
        setCreating(false);
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [selected, creating]);

  async function handleCreate() {
    if (!title.trim() || !goal.trim()) {
      setError("Title and goal required");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const price = maxPrice.trim() ? Number(maxPrice) : undefined;
      const { mission } = await createMission({
        title: title.trim(),
        goal: goal.trim(),
        constraints: {
          ...(price && Number.isFinite(price) ? { maxPrice: price } : {}),
          autoMonitor: true,
        },
        runNow: false,
      });
      track("mission_created", { has_max_price: Boolean(price) });
      setCreating(false);
      setTitle("");
      setGoal("");
      setMaxPrice("");
      setSelected(mission);
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function withMission(
    action: (id: string) => Promise<{ mission: MissionDto }>,
    event: string
  ) {
    if (!selected) return;
    setBusy(true);
    setError(null);
    try {
      const { mission } = await action(selected.id);
      track(event, { status: mission.status, action: mission.proposal?.action ?? null });
      setSelected(mission);
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <Screen padded={false}>
        <LoadingState label="Loading price watches…" />
      </Screen>
    );
  }

  if (selected) {
    const p = selected.proposal;
    return (
      <Screen padded={false}>
        <FlatList
          data={p?.buyLinks.slice(0, 4) ?? []}
          keyExtractor={(link) => link.url}
          contentContainerStyle={styles.scroll}
          ListHeaderComponent={
            <Stagger index={0}>
              <ScreenHeader title={selected.title} onBack={() => setSelected(null)} />
              <Text style={[styles.status, { color: statusColor(selected.status) }]}>
                {selected.status.replace(/_/g, " ")}
              </Text>
              <Text style={styles.goal}>{selected.goal}</Text>
              {p ? (
                <Surface style={styles.card}>
                  <Text style={styles.cardLabel}>OUR TAKE</Text>
                  <Text style={styles.summary}>{p.summary}</Text>
                  <Text style={styles.meta}>
                    Action: {p.action} · Offers: {p.offersCount} · Deals: {p.dealsCount}
                    {p.verdict ? ` · Verdict: ${p.verdict}` : ""}
                  </Text>
                  <Text style={styles.approvalNote}>
                    You always approve before anything happens - Verdict never buys for you.
                  </Text>
                </Surface>
              ) : null}
              {error ? <ErrorBanner message={error} onRetry={refresh} /> : null}
            </Stagger>
          }
          renderItem={({ item: link }) => (
            <Tappable onPress={() => Linking.openURL(link.url)} style={styles.linkRow}>
              <RetailerMark retailerId={undefined} name={link.retailer} url={link.url} />
              <View style={{ flex: 1 }} />
              {link.price ? <Text style={styles.linkText}>{link.price}</Text> : null}
              <Ionicons name="open-outline" size={iconSize.sm} color={colors.accent} />
            </Tappable>
          )}
          ListFooterComponent={
            <View style={styles.actions}>
              {selected.status === "draft" ? (
                <PrimaryButton
                  label={busy ? "Running…" : "Run agent"}
                  disabled={busy}
                  onPress={() => withMission(runMission, "mission_run")}
                />
              ) : null}
              {selected.status === "awaiting_approval" ? (
                <>
                  <PrimaryButton
                    label={busy ? "…" : "Approve"}
                    disabled={busy}
                    onPress={() => withMission(approveMission, "mission_approved")}
                  />
                  <SecondaryButton
                    label="Reject"
                    disabled={busy}
                    onPress={() => withMission(rejectMission, "mission_rejected")}
                  />
                </>
              ) : null}
              {selected.status !== "cancelled" && selected.status !== "completed" ? (
                <Tappable
                  disabled={busy}
                  onPress={() => withMission(cancelMission, "mission_cancelled")}
                  style={styles.ghostBtn}
                >
                  <Text style={styles.ghostBtnText}>Cancel watch</Text>
                </Tappable>
              ) : null}
            </View>
          }
        />
      </Screen>
    );
  }

  return (
    <Screen padded={false}>
      <FlatList
        data={items}
        keyExtractor={(m) => m.id}
        contentContainerStyle={styles.scroll}
        ListHeaderComponent={
          <FadeIn>
            <ScreenHeader
              title="Price Watch"
              onBack={onBack}
              right={
                <IconButton
                  icon={creating ? "close" : "add"}
                  onPress={() => setCreating((v) => !v)}
                  accessibilityLabel={creating ? "Close" : "New price watch"}
                />
              }
            />

            {!enabled ? (
              <Surface style={styles.card}>
                <Text style={styles.summary}>
                  Price Watch needs a database. Set DATABASE_URL on the server (and keep
                  MISSIONS_ENABLED unset or true).
                </Text>
              </Surface>
            ) : null}

            {creating && enabled ? (
              <Surface style={styles.card}>
                <Text style={styles.cardLabel}>NEW PRICE WATCH</Text>
                <Field value={title} onChangeText={setTitle} placeholder="Title" />
                <Field
                  value={goal}
                  onChangeText={setGoal}
                  placeholder="Goal (e.g. buy AirPods under ₹15k when the deal hits)"
                  multiline
                  style={styles.inputMulti}
                />
                <Field
                  value={maxPrice}
                  onChangeText={setMaxPrice}
                  placeholder="Max price (optional)"
                  keyboardType="numeric"
                />
                <PrimaryButton
                  label={busy ? "Creating…" : "Create"}
                  disabled={busy}
                  onPress={handleCreate}
                />
              </Surface>
            ) : null}

            {error ? <ErrorBanner message={error} onRetry={refresh} /> : null}
          </FadeIn>
        }
        ListEmptyComponent={
          enabled ? (
            <EmptyState
              icon="notifications-outline"
              title="No watches yet"
              message="No price watches yet. Tap + to set one up."
            />
          ) : null
        }
        renderItem={({ item }) => <MissionRow item={item} onPress={() => setSelected(item)} />}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: space(5), paddingBottom: space(12), gap: space(3) },
  status: {
    ...font.label,
    fontFamily: fonts.sansBold,
    letterSpacing: 0.8,
    textTransform: "uppercase",
    marginBottom: space(2),
  },
  goal: { ...font.body, color: colors.textMuted, marginBottom: space(3) },
  card: { gap: space(2), marginBottom: space(2) },
  cardLabel: { ...font.label, color: colors.textFaint },
  summary: { ...font.body, color: colors.text },
  meta: { ...font.small, fontFamily: fonts.sans, color: colors.textMuted },
  approvalNote: { ...font.small, fontFamily: fonts.sansMedium, color: colors.accent },
  linkRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: space(2),
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  linkText: { flex: 1, ...font.small, fontFamily: fonts.sans, color: colors.text, marginRight: space(2) },
  actions: { gap: space(2.5), marginTop: space(2) },
  ghostBtn: { paddingVertical: space(2.5), alignItems: "center" },
  ghostBtnText: { ...font.small, fontFamily: fonts.sansMedium, color: colors.textFaint },
  inputMulti: { minHeight: space(18), textAlignVertical: "top" },
  listTap: { marginBottom: space(1) },
  listCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: space(3.5),
    gap: space(2),
  },
  listTitle: { ...font.h3, color: colors.text },
  listGoal: { ...font.small, fontFamily: fonts.sans, color: colors.textMuted, marginTop: space(0.5) },
  listStatus: {
    ...font.label,
    fontFamily: fonts.sansBold,
    letterSpacing: 0.6,
    textTransform: "uppercase",
    marginTop: space(1.5),
  },
});
