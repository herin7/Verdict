export function formatMoney(amount: number, currency: string = "INR"): string {
  if (!Number.isFinite(amount)) return "Check manually";
  const code = currency === "USD" ? "USD" : "INR";
  const glyph = code === "USD" ? "$" : "₹";
  try {
    const n = new Intl.NumberFormat(code === "USD" ? "en-US" : "en-IN", {
      maximumFractionDigits: 0,
    }).format(Math.round(amount));
    return `${glyph} ${n}`;
  } catch {
    return code === "USD" ? `$ ${Math.round(amount)}` : `₹ ${Math.round(amount)}`;
  }
}
