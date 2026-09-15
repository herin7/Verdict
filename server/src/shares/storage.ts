import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { config } from "../config.js";

const s3 = new S3Client({ region: config.awsRegion });

function bucket(): string {
  if (!config.sharesBucket) throw new Error("SHARES_BUCKET is not set");
  return config.sharesBucket;
}

/** Shared screenshots live at shares/<userId>/<shareId>.jpg. */
export function imageKeyFor(userId: string, clientId: string): string {
  return `shares/${encodeURIComponent(userId)}/${clientId}.jpg`;
}

export async function putImage(key: string, bytes: Buffer): Promise<void> {
  await s3.send(new PutObjectCommand({ Bucket: bucket(), Key: key, Body: bytes, ContentType: "image/jpeg" }));
}

export async function getImage(key: string): Promise<Uint8Array> {
  const res = await s3.send(new GetObjectCommand({ Bucket: bucket(), Key: key }));
  return res.Body!.transformToByteArray();
}

/** Short-lived URL so the app can show the original screenshot. */
export function imageUrl(key: string): Promise<string> {
  return getSignedUrl(s3, new GetObjectCommand({ Bucket: bucket(), Key: key }), { expiresIn: 60 * 60 });
}
