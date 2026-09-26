import AsyncStorage from "@react-native-async-storage/async-storage";
import { Directory, File, Paths } from "expo-file-system";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import type { OutboxEntry } from "./types";

const KEY = "verdict.outbox.v1";
const dir = new Directory(Paths.document, "outbox");

/**
 * Shares the server hasn't accepted yet. Written *before* the upload starts,
 * so a share is never lost to a bad connection or the app being closed.
 */
export async function readOutbox(): Promise<OutboxEntry[]> {
  try {
    return JSON.parse((await AsyncStorage.getItem(KEY)) ?? "[]");
  } catch {
    return [];
  }
}

async function write(entries: OutboxEntry[]) {
  await AsyncStorage.setItem(KEY, JSON.stringify(entries));
}

/** Screenshots are resized to 1280px JPEG: plenty for OCR, ~10x smaller to upload. */
export async function addToOutbox(clientId: string, text: string | null, imageUri: string | null): Promise<OutboxEntry> {
  let imagePath: string | null = null;
  if (imageUri) {
    const rendered = await ImageManipulator.manipulate(imageUri).resize({ width: 1280 }).renderAsync();
    const small = await rendered.saveAsync({ compress: 0.7, format: SaveFormat.JPEG });
    if (!dir.exists) dir.create({ intermediates: true });
    const file = new File(dir, `${clientId}.jpg`);
    new File(small.uri).copy(file);
    imagePath = file.uri;
  }
  const entry = { clientId, text, imagePath };
  await write([...(await readOutbox()).filter((e) => e.clientId !== clientId), entry]);
  return entry;
}

export async function removeFromOutbox(clientId: string) {
  const entries = await readOutbox();
  const entry = entries.find((e) => e.clientId === clientId);
  const file = entry?.imagePath ? new File(entry.imagePath) : null;
  if (file?.exists) file.delete();
  await write(entries.filter((e) => e.clientId !== clientId));
}

export async function imageBase64(entry: OutboxEntry): Promise<string | undefined> {
  return entry.imagePath ? new File(entry.imagePath).base64() : undefined;
}
