import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { CompareDealsSection } from "../components/CompareDealsSection";
import {
  EmptyState,
  ErrorBanner,
  Field,
  IconButton,
  LoadingState,
  PrimaryButton,
  Screen,
  ScreenHeader,
} from "../components/ui";
import { directSearch } from "../api/client";
import { track } from "../analytics/posthog";
import { colors, font, fonts, iconSize, space } from "../theme";
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
    <Screen edges={["top"]} padded>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScreenHeader
          title="Search & compare"
          subtitle="Type any product, compare prices across marketplaces"
          right={<IconButton icon="home-outline" onPress={onHome} accessibilityLabel="Home" />}
        />

        <View style={styles.searchRow}>
          <Field
            value={query}
            onChangeText={setQuery}
            placeholder="e.g. Sony WH-1000XM5 headphones"
            returnKeyType="search"
            autoCorrect={false}
            onSubmitEditing={runSearch}
          />
          <PrimaryButton label="Search" onPress={runSearch} disabled={query.trim().length < 2} />
        </View>

        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.bodyContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {stage === "idle" && (
            <EmptyState
              icon="search-outline"
              title="Find a better deal"
              message="Type a product name to compare prices on Amazon, Flipkart, Blinkit, Zepto and more."
            />
          )}

          {stage === "searching" && <LoadingState label="Searching marketplaces…" />}

          {stage === "error" && error && <ErrorBanner message={error} onRetry={runSearch} />}

          {stage === "results" && result && (
            <View style={styles.results}>
              <View style={styles.resultHeader}>
                <Ionicons name="pricetag-outline" size={iconSize.sm} color={colors.accent} />
                <Text style={styles.resultTitle} numberOfLines={1}>
                  {result.product.name}
                </Text>
              </View>
              <CompareDealsSection
                product={result.product}
                preloaded={{ offers: result.offers, deals: result.deals }}
              />
              {result.offers.length === 0 && (
                <EmptyState
                  icon="file-tray-outline"
                  title="No offers yet"
                  message="No offers found for this search. Try a different name or spelling."
                />
              )}
              <PrimaryButton label="Search again" onPress={reset} />
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  searchRow: { gap: space(2.5), marginBottom: space(2) },
  bodyContent: { gap: space(3), paddingBottom: space(20) },
  results: { gap: space(3) },
  resultHeader: { flexDirection: "row", alignItems: "center", gap: space(1.5) },
  resultTitle: { ...font.small, fontFamily: fonts.sansSemiBold, color: colors.text, flexShrink: 1 },
});
