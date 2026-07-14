import { FlatList, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { GlassCard } from "../components/GlassCard";
import { Tappable } from "../components/Tappable";
import { Badge } from "../components/Badge";
import { CategoryIcon } from "../components/Icons";
import { EmptyState, IconButton, Screen, ScreenHeader } from "../components/ui";
import { colors, fonts, space, verdictColor, verdictLabel } from "../theme";
import type { SavedReport } from "../types";

function timeAgo(ts: number): string {
  const diffMs = Date.now() - ts;
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(ts).toLocaleDateString();
}

export function LibraryScreen({
  items,
  onOpen,
  onDelete,
  onHome,
}: {
  items: SavedReport[];
  onOpen: (entry: SavedReport) => void;
  onDelete: (id: string) => void;
  onHome: () => void;
}) {
  return (
    <Screen>
      <ScreenHeader
        title="Saved reports"
        subtitle={`${items.length} product${items.length === 1 ? "" : "s"}`}
        right={<IconButton icon="home-outline" onPress={onHome} accessibilityLabel="Home" />}
      />

      {items.length === 0 ? (
        <EmptyState icon="bookmark-outline" message="Reports you save will show up here." />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          initialNumToRender={8}
          windowSize={7}
          removeClippedSubviews
          renderItem={({ item }) => {
            const color = verdictColor[item.report.verdict];
            return (
              <Tappable onPress={() => onOpen(item)}>
                <GlassCard style={styles.card}>
                  <CategoryIcon category={item.product.category} size={18} />
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={styles.name} numberOfLines={1}>
                      {item.product.name}
                    </Text>
                    <View style={styles.metaRow}>
                      <Badge label={verdictLabel[item.report.verdict]} color={color} />
                      <Text style={styles.score}>{item.report.score}/100</Text>
                      <Text style={styles.time}>{timeAgo(item.savedAt)}</Text>
                    </View>
                  </View>
                  <Tappable onPress={() => onDelete(item.id)} style={styles.deleteBtn}>
                    <Ionicons name="trash-outline" size={16} color={colors.textMuted} />
                  </Tappable>
                </GlassCard>
              </Tappable>
            );
          }}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { gap: 10, paddingBottom: space(20) },
  card: { flexDirection: "row", alignItems: "center", padding: 14 },
  name: { fontFamily: fonts.sansBold, color: colors.text, fontSize: 15 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 6 },
  score: { fontFamily: fonts.monoBold, color: colors.textMuted, fontSize: 12 },
  time: { fontFamily: fonts.sansSemiBold, color: colors.textFaint, fontSize: 11.5 },
  deleteBtn: { padding: 8 },
});
