import { DetectDocumentTextCommand, TextractClient } from "@aws-sdk/client-textract";
import { config } from "../config.js";

const textract = new TextractClient({ region: config.awsRegion });

/**
 * Screenshot → plain text, top to bottom. Textract's synchronous API takes the
 * bytes directly (up to 5 MB) and answers in ~1-2 s for a phone screenshot.
 */
export async function readText(image: Uint8Array): Promise<string> {
  const res = await textract.send(new DetectDocumentTextCommand({ Document: { Bytes: image } }));
  return (res.Blocks ?? [])
    .filter((b) => b.BlockType === "LINE" && b.Text && (b.Confidence ?? 0) >= 60)
    .map((b) => b.Text!.trim())
    .join("\n");
}
