import { useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { identify, research } from "../api/client";
import type { ConsensusReport, ProductIdentity } from "../types";

type Stage = "idle" | "identifying" | "confirm" | "researching";

export function ScanScreen({ onReport }: { onReport: (r: ConsensusReport, p: ProductIdentity) => void }) {
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);
  const [stage, setStage] = useState<Stage>("idle");
  const [product, setProduct] = useState<ProductIdentity | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!permission) return <Center><ActivityIndicator color="#fff" /></Center>;
  if (!permission.granted) {
    return (
      <Center>
        <Text style={styles.info}>Camera access is needed to scan products.</Text>
        <Pressable style={styles.btn} onPress={requestPermission}>
          <Text style={styles.btnText}>Grant permission</Text>
        </Pressable>
      </Center>
    );
  }

  async function capture() {
    setError(null);
    try {
      const photo = await cameraRef.current?.takePictureAsync({ base64: true, quality: 0.6 });
      if (!photo?.base64) throw new Error("Could not capture image");
      setStage("identifying");
      const p = await identify(photo.base64);
      setProduct(p);
      setStage("confirm");
    } catch (e) {
      setError((e as Error).message);
      setStage("idle");
    }
  }

  async function confirm() {
    if (!product) return;
    setStage("researching");
    setError(null);
    try {
      const report = await research(product);
      onReport(report, product);
      setStage("idle");
      setProduct(null);
    } catch (e) {
      setError((e as Error).message);
      setStage("confirm");
    }
  }

  return (
    <View style={styles.flex}>
      <CameraView ref={cameraRef} style={styles.flex} facing="back" />
      <View style={styles.overlay}>
        {error && <Text style={styles.error}>{error}</Text>}

        {stage === "idle" && (
          <Pressable style={styles.shutter} onPress={capture}>
            <Text style={styles.shutterText}>Scan product</Text>
          </Pressable>
        )}

        {stage === "identifying" && <Busy label="Identifying product..." />}

        {stage === "confirm" && product && (
          <View style={styles.card}>
            <Text style={styles.productName}>{product.name}</Text>
            <Text style={styles.productMeta}>
              {[product.brand, product.category].filter(Boolean).join(" - ")}
              {"  "}({Math.round(product.confidence * 100)}%)
            </Text>
            <View style={styles.row}>
              <Pressable style={[styles.btn, styles.ghost]} onPress={() => setStage("idle")}>
                <Text style={styles.btnText}>Retake</Text>
              </Pressable>
              <Pressable style={styles.btn} onPress={confirm}>
                <Text style={styles.btnText}>Research this</Text>
              </Pressable>
            </View>
          </View>
        )}

        {stage === "researching" && <Busy label="Reading the internet's consensus..." />}
      </View>
    </View>
  );
}

function Busy({ label }: { label: string }) {
  return (
    <View style={styles.card}>
      <ActivityIndicator color="#fff" />
      <Text style={styles.info}>{label}</Text>
    </View>
  );
}

function Center({ children }: { children: React.ReactNode }) {
  return <View style={[styles.flex, styles.center]}>{children}</View>;
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: "#000" },
  center: { alignItems: "center", justifyContent: "center", padding: 24 },
  overlay: { position: "absolute", bottom: 0, left: 0, right: 0, padding: 20, gap: 12 },
  shutter: { backgroundColor: "#3b82f6", padding: 18, borderRadius: 16, alignItems: "center" },
  shutterText: { color: "#fff", fontSize: 18, fontWeight: "700" },
  card: { backgroundColor: "rgba(17,24,39,0.95)", padding: 18, borderRadius: 16, gap: 12, alignItems: "center" },
  productName: { color: "#fff", fontSize: 20, fontWeight: "700", textAlign: "center" },
  productMeta: { color: "#9ca3af", fontSize: 14 },
  row: { flexDirection: "row", gap: 12 },
  btn: { backgroundColor: "#3b82f6", paddingVertical: 12, paddingHorizontal: 20, borderRadius: 12 },
  ghost: { backgroundColor: "#374151" },
  btnText: { color: "#fff", fontWeight: "600" },
  info: { color: "#e5e7eb", textAlign: "center", fontSize: 15 },
  error: { color: "#f87171", textAlign: "center", marginBottom: 4 },
});
