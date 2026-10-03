import { useState } from "react";
import { Alert, FlatList, RefreshControl, StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon } from "@/components/icons";
import { EmptyState, Field, IconButton, Text } from "@/components/ui";
import { useSession } from "@/features/auth/session";
import { useInbox } from "@/features/inbox/inbox";
import { InboxRow } from "@/features/inbox/InboxRow";
import { itemTitle, type InboxItem } from "@/features/inbox/types";
import { colors, space } from "@/theme";

/** The inbox: everything you've shared, newest first. */
export default function Inbox() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const inbox = useInbox();
  const { signOut } = useSession();
  const [draft, setDraft] = useState("");

  async function submit() {
    const text = draft.trim();
    if (!text) return;
    setDraft("");
    await inbox.add({ text, imageUri: null }).catch(() => Alert.alert("Couldn't add that", "Please try again."));
  }

  function open(item: InboxItem) {
    if (item.server?.status === "failed") void inbox.retry(item).catch(() => {});
    router.push(`/item/${item.server?.id ?? item.clientId}`);
  }

  function confirmDelete(item: InboxItem) {
    Alert.alert("Delete this?", itemTitle(item), [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => void inbox.remove(item) },
    ]);
  }

  function confirmSignOut() {
    Alert.alert("Sign out?", undefined, [
      { text: "Cancel", style: "cancel" },
      { text: "Sign out", style: "destructive", onPress: () => void signOut() },
    ]);
  }

  return (
    <FlatList
      style={styles.screen}
      contentContainerStyle={{ paddingTop: insets.top + space(3), paddingBottom: insets.bottom + space(8) }}
      data={inbox.items}
      keyExtractor={(item) => item.clientId}
      keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={inbox.refreshing} onRefresh={inbox.refresh} tintColor={colors.primary} />}
      ListHeaderComponent={
        <View style={styles.header}>
          <View style={styles.titleRow}>
            <Text variant="display" accessibilityRole="header" style={styles.title}>
              Verdict
            </Text>
            <View style={styles.actions}>
              <IconButton icon={Icon.Fingerprint} label="Your buyer DNA" onPress={() => router.push("/profile")} />
              <IconButton icon={Icon.SignOut} label="Sign out" onPress={confirmSignOut} />
            </View>
          </View>
          <Field
            icon={Icon.LinkSimple}
            placeholder="Paste a link or type a product"
            accessibilityLabel="Paste a link or type a product"
            returnKeyType="send"
            autoCapitalize="none"
            value={draft}
            onChangeText={setDraft}
            onSubmitEditing={submit}
          />
        </View>
      }
      ItemSeparatorComponent={() => <View style={styles.separator} />}
      renderItem={({ item }) => (
        <InboxRow item={item} onPress={() => open(item)} onLongPress={() => confirmDelete(item)} />
      )}
      ListEmptyComponent={
        inbox.loaded ? (
          <EmptyState
            icon={Icon.ShareNetwork}
            title="Share anything you're thinking of buying"
            message="In any shopping app, tap Share and pick Verdict. We'll read the reviews and let you know whether to buy it."
          />
        ) : null
      }
    />
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: { gap: space(4), paddingHorizontal: space(4), paddingBottom: space(3) },
  titleRow: { flexDirection: "row", alignItems: "center" },
  actions: { flexDirection: "row", gap: space(2) },
  title: { flex: 1, fontSize: 34, lineHeight: 40 },
  separator: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginLeft: space(4) + 56 + space(3) },
});
