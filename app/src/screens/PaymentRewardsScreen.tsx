import { useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Tappable } from "../components/Tappable";
import { FadeIn } from "../components/FadeIn";
import { colors, fonts, radius } from "../theme";
import { getDealsCatalog, getPaymentProfile, savePaymentProfile } from "../api/client";
import { getLocalPaymentMethods, setLocalPaymentMethods } from "../storage";
import type { PaymentCatalogItem, PaymentMethodId } from "../types";

const FALLBACK_CATALOG: PaymentCatalogItem[] = [
  { id: "hdfc_cc", label: "HDFC Credit Card", kind: "card" },
  { id: "sbi_cc", label: "SBI Credit Card", kind: "card" },
  { id: "icici_cc", label: "ICICI Credit Card", kind: "card" },
  { id: "axis_cc", label: "Axis Credit Card", kind: "card" },
  { id: "amex", label: "American Express", kind: "card" },
  { id: "amazon_pay", label: "Amazon Pay", kind: "wallet" },
  { id: "flipkart_axis", label: "Flipkart Axis Card", kind: "card" },
  { id: "gpay", label: "Google Pay", kind: "wallet" },
  { id: "phonepe", label: "PhonePe", kind: "wallet" },
  { id: "paytm", label: "Paytm", kind: "wallet" },
  { id: "cred", label: "CRED", kind: "wallet" },
  { id: "amazon_prime", label: "Amazon Prime", kind: "membership" },
  { id: "flipkart_plus", label: "Flipkart Plus", kind: "membership" },
];

export function PaymentRewardsScreen({ onBack }: { onBack: () => void }) {
  const [catalog, setCatalog] = useState<PaymentCatalogItem[]>(FALLBACK_CATALOG);
  const [selected, setSelected] = useState<Set<PaymentMethodId>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const remote = await getPaymentProfile();
        setCatalog(remote.catalog?.length ? remote.catalog : FALLBACK_CATALOG);
        setSelected(new Set(remote.methods));
      } catch {
        try {
          const cat = await getDealsCatalog();
          if (cat.methods?.length) setCatalog(cat.methods);
        } catch {
          /* use fallback */
        }
        const local = await getLocalPaymentMethods();
        setSelected(new Set(local as PaymentMethodId[]));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  function toggle(id: PaymentMethodId) {
    setSaved(false);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function save() {
    setSaving(true);
    const methods = Array.from(selected);
    await setLocalPaymentMethods(methods);
    try {
      await savePaymentProfile(methods);
    } catch {
      /* local already saved */
    }
    setSaving(false);
    setSaved(true);
  }

  const groups: { kind: PaymentCatalogItem["kind"]; title: string }[] = [
    { kind: "card", title: "Cards" },
    { kind: "wallet", title: "Wallets" },
    { kind: "membership", title: "Memberships" },
  ];

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Tappable onPress={onBack} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={20} color={colors.text} />
        </Tappable>
        <Text style={styles.title}>Payment & Rewards</Text>
        <View style={{ width: 36 }} />
      </View>

      <Text style={styles.sub}>
        Pick cards, wallets, and memberships you own. We never ask for numbers or balances - only what you have.
      </Text>

      {loading ? (
        <ActivityIndicator color={colors.accent} style={{ marginTop: 40 }} />
      ) : (
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          {groups.map((g) => {
            const items = catalog.filter((c) => c.kind === g.kind);
            if (!items.length) return null;
            return (
              <FadeIn key={g.kind} style={styles.group}>
                <Text style={styles.groupTitle}>{g.title}</Text>
                {items.map((item) => {
                  const on = selected.has(item.id);
                  return (
                    <Tappable key={item.id} onPress={() => toggle(item.id)} style={[styles.row, on && styles.rowOn]}>
                      <Ionicons
                        name={on ? "checkbox" : "square-outline"}
                        size={20}
                        color={on ? colors.accent : colors.textFaint}
                      />
                      <Text style={[styles.rowLabel, on && styles.rowLabelOn]}>{item.label}</Text>
                    </Tappable>
                  );
                })}
              </FadeIn>
            );
          })}
        </ScrollView>
      )}

      <Tappable onPress={save} style={styles.saveBtn} disabled={saving}>
        {saving ? (
          <ActivityIndicator color={colors.onAccent} />
        ) : (
          <Text style={styles.saveText}>{saved ? "Saved" : "Save preferences"}</Text>
        )}
      </Tappable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: 20, paddingTop: 8 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface,
  },
  title: { fontFamily: fonts.serif, fontSize: 22, color: colors.text },
  sub: { fontFamily: fonts.sans, fontSize: 13, color: colors.textMuted, lineHeight: 18, marginBottom: 16 },
  scroll: { paddingBottom: 100, gap: 8 },
  group: { marginBottom: 16, gap: 8 },
  groupTitle: {
    fontFamily: fonts.sansSemiBold,
    fontSize: 12,
    color: colors.textFaint,
    letterSpacing: 1,
    textTransform: "uppercase",
    marginBottom: 4,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: "transparent",
  },
  rowOn: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  rowLabel: { fontFamily: fonts.sans, fontSize: 15, color: colors.textMuted, flex: 1 },
  rowLabelOn: { color: colors.text, fontFamily: fonts.sansSemiBold },
  saveBtn: {
    position: "absolute",
    left: 20,
    right: 20,
    bottom: 24,
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
    paddingVertical: 16,
    alignItems: "center",
  },
  saveText: { fontFamily: fonts.sansSemiBold, fontSize: 15, color: colors.onAccent },
});
