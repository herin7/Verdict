import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, LayoutAnimation, Platform, StyleSheet, Text, TextInput, UIManager, View } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { LinearGradient } from "expo-linear-gradient";
import { BlurView } from "expo-blur";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Tappable } from "../components/Tappable";
import { ProductThumb, type ThumbStatus } from "../components/ProductThumb";
import { FadeIn } from "../components/FadeIn";
import { ScannerFrame } from "../components/ScannerFrame";
import { ResearchingScreen } from "../components/ResearchingScreen";
import { LoadingState } from "../components/ui";
import { colors, font, fonts, ctaGradient, iconSize, radius, space } from "../theme";
import { getProductImage, identify, identifyScreen, identifyUrl, research } from "../api/client";
import { track } from "../analytics/posthog";
import type { BuyLink, ConsensusReport, ProductIdentity } from "../types";

if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

type Stage = "idle" | "identifying" | "identifyFailed" | "confirm" | "researching" | "paste";

export function ScanScreen({
  onReport,
  onHome,
  initialUrl,
  initialImageBase64,
  initialScreenText,
}: {
  onReport: (r: ConsensusReport, p: ProductIdentity, buyLinks: BuyLink[], productId?: string | null) => void;
  onHome: () => void;
  initialUrl?: string | null;
  initialImageBase64?: string | null;
  initialScreenText?: { text: string; packageName: string } | null;
}) {
  const [permission, requestPermission] = useCameraPermissions();
  const insets = useSafeAreaInsets();
  const cameraRef = useRef<CameraView>(null);
  const [stage, setStage] = useState<Stage>("idle");
  const [product, setProduct] = useState<ProductIdentity | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [capturedUri, setCapturedUri] = useState<string | null>(null);
  const [capturedBase64, setCapturedBase64] = useState<string | null>(null);
  const [thumbStatus, setThumbStatus] = useState<ThumbStatus>("loading");
  const [productImageUrl, setProductImageUrl] = useState<string | null>(null);
  const [pasteUrl, setPasteUrl] = useState(initialUrl ?? "");
  const [screenTextForRetry, setScreenTextForRetry] = useState<{ text: string; packageName: string } | null>(
    null
  );
  const imageRequestId = useRef(0);

  useEffect(() => {
    return () => {
      // Invalidate any in-flight image lookup when the screen unmounts.
      imageRequestId.current += 1;
    };
  }, []);

  useEffect(() => {
    if (initialImageBase64?.trim()) {
      setCapturedBase64(initialImageBase64);
      setError(null);
      setStage("identifying");
      void (async () => {
        try {
          const p = await identify(initialImageBase64);
          setProduct(p);
          setStage("confirm");
          setThumbStatus("loading");
          setProductImageUrl(null);
          const requestId = ++imageRequestId.current;
          getProductImage(p).then((url) => {
            if (imageRequestId.current !== requestId) return;
            setProductImageUrl(url);
            setThumbStatus(url ? "loaded" : "empty");
          });
        } catch (e) {
          setError((e as Error).message);
          setStage("identifyFailed");
        }
      })();
    }
  }, [initialImageBase64]);

  useEffect(() => {
    if (initialScreenText?.text?.trim()) {
      setScreenTextForRetry(initialScreenText);
      void runIdentifyFromScreen(initialScreenText);
    }
  }, [initialScreenText]);

  useEffect(() => {
    if (initialUrl?.trim()) {
      setPasteUrl(initialUrl);
      setStage("paste");
      track("scan_started", { method: "share" });
      void (async () => {
        setError(null);
        setStage("identifying");
        try {
          const { product: p } = await identifyUrl(initialUrl.trim());
          setProduct(p);
          setStage("confirm");
          setThumbStatus("loading");
          setProductImageUrl(null);
          track("scan_identify_success", { method: "share", category: p.category });
          const requestId = ++imageRequestId.current;
          getProductImage(p).then((u) => {
            if (imageRequestId.current !== requestId) return;
            setProductImageUrl(u);
            setThumbStatus(u ? "loaded" : "empty");
          });
        } catch (e) {
          setError((e as Error).message);
          setStage("paste");
          track("scan_identify_failed", { method: "share" });
        }
      })();
    }
  }, [initialUrl]);

  if (!permission && stage !== "paste" && stage !== "identifying" && stage !== "confirm" && stage !== "identifyFailed" && stage !== "researching") {
    return (
      <Center>
        <LoadingState label="Checking camera…" />
      </Center>
    );
  }

  if (
    permission &&
    !permission.granted &&
    stage !== "paste" &&
    stage !== "identifying" &&
    stage !== "confirm" &&
    stage !== "identifyFailed" &&
    stage !== "researching"
  ) {
    return (
      <Center>
        <Ionicons name="camera-outline" size={40} color={colors.textMuted} />
        <Text style={styles.info}>Camera access is needed to scan products.</Text>
        <Tappable onPress={requestPermission} style={styles.primaryBtn}>
          <LinearGradient
            colors={ctaGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.primaryBtnFill}
          >
            <Text style={styles.primaryBtnText}>Grant permission</Text>
          </LinearGradient>
        </Tappable>
        <Tappable onPress={() => setStage("paste")} style={styles.linkBtn}>
          <Text style={styles.linkBtnText}>Or paste a product link</Text>
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
    track("scan_started", { method: "camera" });
    // React the instant the shutter is tapped - don't wait on takePictureAsync to resolve.
    goTo("identifying");
    let base64: string | null = null;
    try {
      const photo = await cameraRef.current?.takePictureAsync({ base64: true, quality: 0.6 });
      if (!photo?.base64) throw new Error("Could not capture image");
      base64 = photo.base64;
      setCapturedUri(photo.uri ?? null);
      setCapturedBase64(photo.base64);
    } catch (e) {
      setError((e as Error).message);
      goTo("idle");
      return;
    }
    await runIdentify(base64);
  }

  async function runIdentify(base64: string) {
    setError(null);
    goTo("identifying");
    try {
      const p = await identify(base64);
      setProduct(p);
      goTo("confirm");
      track("scan_identify_success", { method: "camera", category: p.category });

      setThumbStatus("loading");
      setProductImageUrl(null);
      const requestId = ++imageRequestId.current;
      getProductImage(p).then((url) => {
        // Ignore stale responses from a retake/re-identify that happened while this was in flight.
        if (imageRequestId.current !== requestId) return;
        setProductImageUrl(url);
        setThumbStatus(url ? "loaded" : "empty");
      });
    } catch (e) {
      setError((e as Error).message);
      goTo("identifyFailed");
      track("scan_identify_failed", { method: "camera" });
    }
  }

  async function runIdentifyFromScreen(payload: { text: string; packageName: string }) {
    setError(null);
    goTo("identifying");
    track("scan_started", { method: "overlay" });
    try {
      const { product: p } = await identifyScreen(payload.text, payload.packageName);
      setProduct(p);
      setCapturedUri(null);
      setCapturedBase64(null);
      goTo("confirm");
      track("scan_identify_success", { method: "overlay", category: p.category });
      setThumbStatus("loading");
      setProductImageUrl(null);
      const requestId = ++imageRequestId.current;
      getProductImage(p).then((u) => {
        if (imageRequestId.current !== requestId) return;
        setProductImageUrl(u);
        setThumbStatus(u ? "loaded" : "empty");
      });
    } catch (e) {
      setError((e as Error).message);
      goTo("identifyFailed");
      track("scan_identify_failed", { method: "overlay" });
    }
  }

  async function runIdentifyUrl(url: string) {
    setError(null);
    goTo("identifying");
    track("scan_started", { method: "paste" });
    try {
      const { product: p } = await identifyUrl(url.trim());
      setProduct(p);
      setCapturedUri(null);
      setCapturedBase64(null);
      goTo("confirm");
      track("scan_identify_success", { method: "paste", category: p.category });
      setThumbStatus("loading");
      setProductImageUrl(null);
      const requestId = ++imageRequestId.current;
      getProductImage(p).then((u) => {
        if (imageRequestId.current !== requestId) return;
        setProductImageUrl(u);
        setThumbStatus(u ? "loaded" : "empty");
      });
    } catch (e) {
      setError((e as Error).message);
      goTo("paste");
      track("scan_identify_failed", { method: "paste" });
    }
  }

  async function confirm() {
    if (!product) return;
    goTo("researching");
    setError(null);
    try {
      const { report, buyLinks, productId } = await research(product);
      onReport(report, product, buyLinks, productId);
      goTo("idle");
      setProduct(null);
      setCapturedBase64(null);
    } catch (e) {
      setError((e as Error).message);
      goTo("confirm");
    }
  }

  function retakePhoto() {
    imageRequestId.current += 1;
    setError(null);
    setCapturedUri(null);
    setCapturedBase64(null);
    setProductImageUrl(null);
    setScreenTextForRetry(null);
    goTo("idle");
  }

  const busy = stage === "identifying";
  const showCamera = stage !== "paste" && Boolean(permission?.granted);

  return (
    <View style={styles.flex}>
      {showCamera ? (
        <CameraView ref={cameraRef} style={styles.flex} facing="back" />
      ) : (
        <View style={[styles.flex, { backgroundColor: colors.bg }]} />
      )}

      {stage === "idle" && showCamera && (
        <View pointerEvents="none" style={styles.finderWrap}>
          <ScannerFrame />
          <Text style={styles.finderHint}>Center the product in frame</Text>
        </View>
      )}

      <View style={[styles.topBar, { paddingTop: insets.top + space(3) }]} pointerEvents="box-none">
        <View style={styles.brandPillWrap}>
          {showCamera ? <BlurView intensity={45} tint="dark" style={StyleSheet.absoluteFill} /> : null}
          <Ionicons name="flash" size={iconSize.sm} color={colors.accent} />
          <Text style={styles.brand}>Verdict</Text>
        </View>
        <Tappable onPress={onHome} style={styles.homeBtnWrap} hitSlop={6} accessibilityLabel="Home">
          {showCamera ? <BlurView intensity={45} tint="dark" style={StyleSheet.absoluteFill} /> : null}
          <Ionicons name="home-outline" size={iconSize.md} color={showCamera ? colors.onAccent : colors.text} />
        </Tappable>
      </View>

      <View style={[styles.sheetWrap, { paddingBottom: insets.bottom + space(6) }]}>
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
                colors={busy ? [colors.accentSoft, colors.surfaceMuted] : ctaGradient}
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
            <Text style={styles.captureLabel}>{stage === "idle" ? "Tap to scan" : "Identifying product…"}</Text>
            {stage === "idle" && (
              <Tappable onPress={() => goTo("paste")} style={styles.linkBtn}>
                <Ionicons name="link-outline" size={14} color={colors.accent} />
                <Text style={styles.linkBtnText}>Paste product link</Text>
              </Tappable>
            )}
          </FadeIn>
        )}

        {stage === "paste" && (
          <FadeIn style={{ gap: 12 }}>
            <Text style={styles.pasteTitle}>Paste a product link</Text>
            <TextInput
              value={pasteUrl}
              onChangeText={setPasteUrl}
              placeholder="https://www.amazon.in/..."
              placeholderTextColor={colors.textFaint}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              style={styles.pasteInput}
            />
            <View style={styles.row}>
              <Tappable onPress={() => goTo("idle")} style={[styles.secondaryBtn, styles.flexBtn]}>
                <Text style={styles.secondaryBtnText}>Camera</Text>
              </Tappable>
              <Tappable
                onPress={() => pasteUrl.trim() && runIdentifyUrl(pasteUrl)}
                style={styles.flexBtn}
              >
                <LinearGradient
                  colors={ctaGradient}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.primaryBtnFill}
                >
                  <Text style={styles.primaryBtnText}>Identify</Text>
                </LinearGradient>
              </Tappable>
            </View>
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
              <Tappable onPress={retakePhoto} style={[styles.secondaryBtn, styles.flexBtn]}>
                <Ionicons name="camera-reverse-outline" size={15} color={colors.text} />
                <Text style={styles.secondaryBtnText} numberOfLines={1}>
                  Retake
                </Text>
              </Tappable>
              <Tappable onPress={confirm} style={styles.flexBtn}>
                <LinearGradient
                  colors={ctaGradient}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.primaryBtnFill}
                >
                  <Ionicons name={error ? "refresh-outline" : "search-outline"} size={15} color={colors.onAccent} />
                  <Text style={styles.primaryBtnText} numberOfLines={1}>
                    {error ? "Retry" : "Research"}
                  </Text>
                </LinearGradient>
              </Tappable>
            </View>
          </FadeIn>
        )}

        {stage === "identifyFailed" && (
          <FadeIn style={{ gap: 16 }}>
            <View style={styles.confirmHeader}>
              <ProductThumb category="generic" status="empty" imageUrl={null} fallbackUri={capturedUri} />
              <View style={styles.confirmTextWrap}>
                <Text style={styles.productName} numberOfLines={2}>
                  Couldn't identify this
                </Text>
                <Text style={styles.productMeta} numberOfLines={2}>
                  {screenTextForRetry
                    ? "Same screen text is ready - try again, or go back."
                    : "Same photo is still ready to go - try again, or retake."}
                </Text>
              </View>
            </View>

            <View style={styles.row}>
              <Tappable onPress={retakePhoto} style={[styles.secondaryBtn, styles.flexBtn]}>
                <Ionicons name="camera-reverse-outline" size={15} color={colors.text} />
                <Text style={styles.secondaryBtnText} numberOfLines={1}>
                  {screenTextForRetry ? "Back" : "Retake"}
                </Text>
              </Tappable>
              <Tappable
                onPress={() => {
                  if (screenTextForRetry) void runIdentifyFromScreen(screenTextForRetry);
                  else if (capturedBase64) void runIdentify(capturedBase64);
                }}
                style={styles.flexBtn}
              >
                <LinearGradient
                  colors={ctaGradient}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.primaryBtnFill}
                >
                  <Ionicons name="refresh-outline" size={15} color={colors.onAccent} />
                  <Text style={styles.primaryBtnText} numberOfLines={1}>
                    Retry
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
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: space(6), gap: space(3.5), backgroundColor: colors.bg },

  topBar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: space(5),
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  brandPillWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: space(1.5),
    paddingVertical: space(2),
    paddingHorizontal: space(3.5),
    borderRadius: radius.pill,
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.overlayScrim,
  },
  brand: { ...font.small, fontFamily: fonts.sansBold, color: colors.onAccent },
  homeBtnWrap: {
    width: space(9.5),
    height: space(9.5),
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.overlayScrim,
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
    ...font.small,
    fontFamily: fonts.sansSemiBold,
    color: colors.onAccent,
    marginTop: space(5.5),
    textShadowColor: colors.overlayScrim,
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },

  sheetWrap: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    overflow: "hidden",
    paddingTop: space(3),
    paddingHorizontal: space(5),
    gap: space(3.5),
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  sheetHandle: {
    alignSelf: "center",
    width: space(9),
    height: space(1),
    borderRadius: radius.pill,
    backgroundColor: colors.border,
    marginBottom: space(0.5),
  },

  captureArea: { alignItems: "center", gap: space(2.5), paddingVertical: space(1) },
  shutterOuter: {
    width: space(18.5),
    height: space(18.5),
    borderRadius: radius.pill,
    borderWidth: 3,
    borderColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface,
    padding: space(1),
  },
  shutterInner: {
    flex: 1,
    width: "100%",
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  captureLabel: { ...font.small, fontFamily: fonts.sansSemiBold, color: colors.textMuted },

  errorRow: { flexDirection: "row", alignItems: "center", gap: space(2) },
  error: { ...font.small, fontFamily: fonts.sansSemiBold, color: colors.avoid, flex: 1 },

  confirmHeader: { flexDirection: "row", alignItems: "center", gap: space(3) },
  confirmTextWrap: { flex: 1, minWidth: 0 },
  productName: { fontFamily: fonts.serif, color: colors.text, fontSize: 20, lineHeight: 24 },
  productMeta: { ...font.caption, fontFamily: fonts.sansSemiBold, color: colors.textMuted, marginTop: space(0.75) },
  confidencePill: {
    flexShrink: 0,
    backgroundColor: colors.accentSoft,
    paddingVertical: space(1.25),
    paddingHorizontal: space(2.5),
    borderRadius: radius.pill,
  },
  confidenceText: { ...font.monoSm, fontFamily: fonts.monoBold, color: colors.accent },

  row: { flexDirection: "row", gap: space(2.5) },
  flexBtn: { flex: 1, borderRadius: radius.md, overflow: "hidden", minWidth: 0 },
  secondaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space(1.5),
    paddingVertical: space(3.5),
    paddingHorizontal: space(2.5),
    borderRadius: radius.md,
    backgroundColor: colors.surfaceMuted,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  secondaryBtnText: { ...font.small, fontFamily: fonts.sansBold, color: colors.text, flexShrink: 1 },

  primaryBtn: { borderRadius: radius.md, overflow: "hidden", marginTop: space(1) },
  primaryBtnFill: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space(1.5),
    paddingVertical: space(3.5),
    paddingHorizontal: space(2.5),
    borderRadius: radius.md,
  },
  primaryBtnText: { ...font.small, fontFamily: fonts.sansBold, color: colors.onAccent, flexShrink: 1 },

  info: { ...font.bodyMedium, fontFamily: fonts.sansSemiBold, color: colors.text },
  linkBtn: { flexDirection: "row", alignItems: "center", gap: space(1.5), marginTop: space(2), padding: space(2) },
  linkBtnText: { ...font.small, fontFamily: fonts.sansSemiBold, color: colors.accent },
  pasteTitle: { fontFamily: fonts.serif, color: colors.text, fontSize: 20, lineHeight: 24 },
  pasteInput: {
    backgroundColor: colors.surfaceMuted,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: space(3.5),
    paddingVertical: space(3),
    color: colors.text,
    ...font.small,
    fontFamily: fonts.sans,
  },
});
