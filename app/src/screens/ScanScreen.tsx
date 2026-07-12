import { useRef, useState } from "react";
import { ActivityIndicator, LayoutAnimation, Platform, StyleSheet, Text, UIManager, View } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { LinearGradient } from "expo-linear-gradient";
import { BlurView } from "expo-blur";
import { Ionicons } from "@expo/vector-icons";
import { Tappable } from "../components/Tappable";
import { ProductThumb, type ThumbStatus } from "../components/ProductThumb";
import { FadeIn } from "../components/FadeIn";
import { ScannerFrame } from "../components/ScannerFrame";
import { ResearchingScreen } from "../components/ResearchingScreen";
import { colors, fonts, goldGradient, radius } from "../theme";
import { getProductImage, identify, research } from "../api/client";
import type { BuyLink, ConsensusReport, ProductIdentity } from "../types";

if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

type Stage = "idle" | "identifying" | "confirm" | "researching";

export function ScanScreen({
  onReport,
  onHome,
}: {
  onReport: (r: ConsensusReport, p: ProductIdentity, buyLinks: BuyLink[]) => void;
  onHome: () => void;
}) {
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);
  const [stage, setStage] = useState<Stage>("idle");
  const [product, setProduct] = useState<ProductIdentity | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [capturedUri, setCapturedUri] = useState<string | null>(null);
  const [thumbStatus, setThumbStatus] = useState<ThumbStatus>("loading");
  const [productImageUrl, setProductImageUrl] = useState<string | null>(null);

  if (!permission) {
    return (
      <Center>
        <ActivityIndicator color={colors.accent} />
      </Center>
    );
  }

  if (!permission.granted) {
    return (
      <Center>
        <Ionicons name="camera-outline" size={40} color={colors.textMuted} />
        <Text style={styles.info}>Camera access is needed to scan products.</Text>
        <Tappable onPress={requestPermission} style={styles.primaryBtn}>
          <LinearGradient
            colors={goldGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.primaryBtnFill}
          >
            <Text style={styles.primaryBtnText}>Grant permission</Text>
          </LinearGradient>
        </Tappable>
      </Center>
    );
  }

  function goTo(next: Stage) {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setStage(next);
  }

  async function capture() {
    setError(null);
    try {
      const photo = await cameraRef.current?.takePictureAsync({ base64: true, quality: 0.6 });
      if (!photo?.base64) throw new Error("Could not capture image");
      setCapturedUri(photo.uri ?? null);
      goTo("identifying");
      const p = await identify(photo.base64);
      setProduct(p);
      goTo("confirm");

      setThumbStatus("loading");
      setProductImageUrl(null);
      getProductImage(p).then((url) => {
        setProductImageUrl(url);
        setThumbStatus(url ? "loaded" : "empty");
      });
    } catch (e) {
      setError((e as Error).message);
      goTo("idle");
    }
  }

  async function confirm() {
    if (!product) return;
    goTo("researching");
    setError(null);
    try {
      const { report, buyLinks } = await research(product);
      onReport(report, product, buyLinks);
      goTo("idle");
      setProduct(null);
    } catch (e) {
      setError((e as Error).message);
      goTo("confirm");
    }
  }

  const busy = stage === "identifying";

  return (
    <View style={styles.flex}>
      <CameraView ref={cameraRef} style={styles.flex} facing="back" />

      {stage === "idle" && (
        <View pointerEvents="none" style={styles.finderWrap}>
          <ScannerFrame />
          <Text style={styles.finderHint}>Center the product in frame</Text>
        </View>
      )}

      <View style={styles.topBar} pointerEvents="box-none">
        <View style={styles.brandPillWrap}>
          <BlurView intensity={45} tint="dark" style={StyleSheet.absoluteFill} />
          <Ionicons name="flash" size={12} color={colors.accent} />
          <Text style={styles.brand}>Verdict</Text>
        </View>
        <Tappable onPress={onHome} style={styles.homeBtnWrap}>
          <BlurView intensity={45} tint="dark" style={StyleSheet.absoluteFill} />
          <Ionicons name="home-outline" size={18} color={colors.text} />
        </Tappable>
      </View>

      <View style={styles.sheetWrap}>
        <BlurView intensity={55} tint="dark" style={StyleSheet.absoluteFill} />
        <View style={styles.sheetHandle} />

        {error && (
          <FadeIn>
            <View style={styles.errorRow}>
              <Ionicons name="alert-circle-outline" size={16} color={colors.avoid} />
              <Text style={styles.error}>{error}</Text>
            </View>
          </FadeIn>
        )}

        {(stage === "idle" || busy) && (
          <FadeIn style={styles.captureArea}>
            <Tappable onPress={stage === "idle" ? capture : undefined} style={styles.shutterOuter}>
              <LinearGradient
                colors={busy ? ["rgba(255,215,109,0.35)", "rgba(255,215,109,0.2)"] : goldGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.shutterInner}
              >
                {busy ? (
                  <ActivityIndicator color={colors.onAccent} />
                ) : (
                  <Ionicons name="scan-outline" size={26} color={colors.onAccent} />
                )}
              </LinearGradient>
            </Tappable>
            <Text style={styles.captureLabel}>{stage === "idle" ? "Tap to scan" : "Identifying product..."}</Text>
          </FadeIn>
        )}

        {stage === "confirm" && product && (
          <FadeIn style={{ gap: 16 }}>
            <View style={styles.confirmHeader}>
              <ProductThumb
                category={product.category}
                status={thumbStatus}
                imageUrl={productImageUrl}
                fallbackUri={capturedUri}
              />
              <View style={styles.confirmTextWrap}>
                <Text style={styles.productName} numberOfLines={2}>
                  {product.name}
                </Text>
                <Text style={styles.productMeta} numberOfLines={1}>
                  {[product.brand, product.category].filter(Boolean).join(" - ")}
                </Text>
              </View>
              <View style={styles.confidencePill}>
                <Text style={styles.confidenceText}>{Math.round(product.confidence * 100)}%</Text>
              </View>
            </View>

            <View style={styles.row}>
              <Tappable onPress={() => goTo("idle")} style={[styles.secondaryBtn, styles.flexBtn]}>
                <Ionicons name="camera-reverse-outline" size={15} color={colors.text} />
                <Text style={styles.secondaryBtnText} numberOfLines={1}>
                  Retake
                </Text>
              </Tappable>
              <Tappable onPress={confirm} style={styles.flexBtn}>
                <LinearGradient
                  colors={goldGradient}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.primaryBtnFill}
                >
                  <Ionicons name="search-outline" size={15} color={colors.onAccent} />
                  <Text style={styles.primaryBtnText} numberOfLines={1}>
                    Research
                  </Text>
                </LinearGradient>
              </Tappable>
            </View>
          </FadeIn>
        )}
      </View>

      {stage === "researching" && product && (
        <ResearchingScreen
          product={product}
          thumbStatus={thumbStatus}
          imageUrl={productImageUrl}
          fallbackUri={capturedUri}
        />
      )}
    </View>
  );
}

function Center({ children }: { children: React.ReactNode }) {
  return <View style={[styles.flex, styles.center]}>{children}</View>;
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  center: { alignItems: "center", justifyContent: "center", padding: 24, gap: 14 },

  topBar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    paddingTop: 58,
    paddingHorizontal: 20,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  brandPillWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 9,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  brand: { fontFamily: fonts.sansBold, color: colors.text, fontSize: 13.5 },
  homeBtnWrap: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },

  finderWrap: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  finderHint: {
    fontFamily: fonts.sansSemiBold,
    color: "rgba(255,255,255,0.75)",
    fontSize: 13,
    marginTop: 22,
  },

  sheetWrap: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    overflow: "hidden",
    paddingTop: 12,
    paddingHorizontal: 20,
    paddingBottom: 40,
    gap: 14,
    borderTopWidth: 1,
    borderColor: "rgba(255,215,109,0.14)",
  },
  sheetHandle: {
    alignSelf: "center",
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.22)",
    marginBottom: 2,
  },

  captureArea: { alignItems: "center", gap: 10, paddingVertical: 4 },
  shutterOuter: {
    width: 74,
    height: 74,
    borderRadius: 37,
    padding: 5,
    borderWidth: 2,
    borderColor: "rgba(255,215,109,0.45)",
  },
  shutterInner: {
    flex: 1,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  captureLabel: { fontFamily: fonts.sansSemiBold, color: colors.textMuted, fontSize: 13 },

  errorRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  error: { fontFamily: fonts.sansSemiBold, color: colors.avoid, fontSize: 13.5, flex: 1 },

  confirmHeader: { flexDirection: "row", alignItems: "center", gap: 12 },
  confirmTextWrap: { flex: 1, minWidth: 0 },
  productName: { fontFamily: fonts.serif, color: colors.text, fontSize: 20, lineHeight: 23 },
  productMeta: { fontFamily: fonts.sansSemiBold, color: colors.textMuted, fontSize: 12.5, marginTop: 3 },
  confidencePill: {
    flexShrink: 0,
    backgroundColor: colors.accentSoft,
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: radius.pill,
  },
  confidenceText: { fontFamily: fonts.monoBold, color: colors.accent, fontSize: 12 },

  row: { flexDirection: "row", gap: 10 },
  flexBtn: { flex: 1, borderRadius: radius.md, overflow: "hidden", minWidth: 0 },
  secondaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 14,
    paddingHorizontal: 10,
    borderRadius: radius.md,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  secondaryBtnText: { fontFamily: fonts.sansBold, color: colors.text, fontSize: 14, flexShrink: 1 },

  primaryBtn: { borderRadius: radius.md, overflow: "hidden", marginTop: 4 },
  primaryBtnFill: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 14,
    paddingHorizontal: 10,
    borderRadius: radius.md,
  },
  primaryBtnText: { fontFamily: fonts.sansBold, color: colors.onAccent, fontSize: 14, flexShrink: 1 },

  info: { fontFamily: fonts.sansSemiBold, color: colors.text, fontSize: 14.5 },
});
