/** First http(s) URL in shared text ("Look at this https://amzn.in/d/x!"), trailing punctuation trimmed. */
export function extractProductUrl(value: string | null | undefined): string | null {
  const match = value?.match(/https?:\/\/[^\s<>"']+/i)?.[0];
  if (!match) return null;
  try {
    const url = new URL(match.replace(/[),.;!?]+$/, ""));
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}
