import { FlatList, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Tappable } from "../components/Tappable";
import { Badge } from "../components/Badge";
import { CategoryIcon } from "../components/Icons";
import { EmptyState, IconButton, Screen, ScreenHeader, Surface } from "../components/ui";
import { colors, font, fonts, iconSize, space, verdictColor, verdictLabel } from "../theme";
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
        <EmptyState
          icon="bookmark-outline"
          title="Nothing saved yet"
          message="Reports you save will show up here."
        />
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
              <Tappable onPress={() => onOpen(item)} accessibilityLabel={item.product.name}>
                <Surface style={styles.card} padded={false}>
                  <CategoryIcon category={item.product.category} size={iconSize.md} />
                  <View style={styles.cardBody}>
                    <Text style={styles.name} numberOfLines={1}>
                      {item.product.name}
                    </Text>
                    <View style={styles.metaRow}>
                      <Badge label={verdictLabel[item.report.verdict]} color={color} />
                      <Text style={styles.score}>{item.report.score}/100</Text>
                      <Text style={styles.time}>{timeAgo(item.savedAt)}</Text>
                    </View>
                  </View>
                  <Tappable
                    onPress={() => onDelete(item.id)}
                    style={styles.deleteBtn}
                    accessibilityLabel="Delete report"
                  >
                    <Ionicons name="trash-outline" size={iconSize.sm} color={colors.textMuted} />
                  </Tappable>
                </Surface>
              </Tappable>
            );
          }}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { gap: space(2.5), paddingBottom: space(20) },
  card: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: space(3.5),
    paddingHorizontal: space(3.5),
    gap: space(3),
  },
  cardBody: { flex: 1, minWidth: 0 },
  name: { ...font.bodyMedium, fontFamily: fonts.sansBold, color: colors.text },
  metaRow: { flexDirection: "row", alignItems: "center", gap: space(2), marginTop: space(1.5) },
  score: { ...font.monoSm, fontFamily: fonts.monoBold, color: colors.textMuted },
  time: { ...font.caption, fontFamily: fonts.sansSemiBold, color: colors.textFaint },
  deleteBtn: { padding: space(2) },
});
