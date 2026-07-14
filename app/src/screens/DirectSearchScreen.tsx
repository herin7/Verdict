import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { CompareDealsSection } from "../components/CompareDealsSection";
import { EmptyState, ErrorBanner, Field, IconButton, LoadingState, PrimaryButton } from "../components/ui";
import { directSearch } from "../api/client";
import { track } from "../analytics/posthog";
import { colors, fonts } from "../theme";
import type { MarketplaceOffer, ProductIdentity, RankedDeal } from "../types";

type Stage = "idle" | "searching" | "results" | "error";

/**
 * Manual product search entry point - lets the user type a product name/query
 * directly instead of scanning a screenshot, then reuses the existing
 * compare/deals UI (CompareDealsSection) across every supported platform.
 */
export function DirectSearchScreen({ onHome }: { onHome: () => void }) {
  const [query, setQuery] = useState("");
  const [stage, setStage] = useState<Stage>("idle");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    product: ProductIdentity;
    offers: MarketplaceOffer[];
    deals: RankedDeal[];
  } | null>(null);

  async function runSearch() {
    const q = query.trim();
    if (q.length < 2) return;
    setStage("searching");
    setError(null);
    track("direct_search_performed", { queryLength: q.length });
    try {
      const res = await directSearch(q);
      setResult({ product: res.product, offers: res.offers, deals: res.deals });
      setStage("results");
      track("direct_search_result_viewed", {
        category: res.product.category,
        offerCount: res.offers.length,
        dealCount: res.deals.length,
      });
    } catch (e) {
      setError((e as Error).message);
      setStage("error");
    }
  }

  function reset() {
    setResult(null);
    setStage("idle");
    setError(null);
  }

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Direct Search</Text>
          <Text style={styles.subtitle}>Search any product, compare instantly</Text>
        </View>
        <IconButton icon="home-outline" onPress={onHome} />
      </View>

      <View style={styles.searchRow}>
        <Field
          value={query}
          onChangeText={setQuery}
          placeholder="e.g. Sony WH-1000XM5 headphones"
          returnKeyType="search"
          autoCorrect={false}
          onSubmitEditing={runSearch}
          style={styles.field}
        />
        <PrimaryButton label="Search" onPress={runSearch} disabled={query.trim().length < 2} />
      </View>

      <ScrollView
        style={styles.body}
        contentContainerStyle={styles.bodyContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {stage === "idle" && (
          <EmptyState
            icon="search-outline"
            message="Type a product name to compare prices and deals across Amazon, Flipkart, Blinkit, Zepto and more."
          />
        )}

        {stage === "searching" && <LoadingState label="Searching marketplaces..." />}

        {stage === "error" && error && <ErrorBanner message={error} onRetry={runSearch} />}

        {stage === "results" && result && (
          <View style={{ gap: 12 }}>
            <View style={styles.resultHeader}>
              <Ionicons name="pricetag-outline" size={15} color={colors.accent} />
              <Text style={styles.resultTitle} numberOfLines={1}>
                {result.product.name}
              </Text>
            </View>
            <CompareDealsSection
              product={result.product}
              preloaded={{ offers: result.offers, deals: result.deals }}
            />
            {result.offers.length === 0 && (
              <EmptyState icon="file-tray-outline" message="No offers found for this search yet." />
            )}
            <PrimaryButton label="Search again" onPress={reset} />
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg, paddingTop: 60, paddingHorizontal: 20 },
  header: { flexDirection: "row", alignItems: "flex-start", marginBottom: 16, gap: 12 },
  title: { fontFamily: fonts.serif, fontSize: 30, color: colors.text },
  subtitle: { fontFamily: fonts.sansSemiBold, color: colors.textMuted, fontSize: 13, marginTop: 4 },
  searchRow: { gap: 10, marginBottom: 8 },
  field: { fontSize: 15 },
  body: { flex: 1 },
  bodyContent: { paddingBottom: 100, gap: 12 },
  resultHeader: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 2 },
  resultTitle: { fontFamily: fonts.sansSemiBold, fontSize: 14, color: colors.text, flexShrink: 1 },
});
