export function formatMoney(amount: number, currency: string = "INR"): string {
  if (!Number.isFinite(amount)) return "—";
  const code = currency === "USD" ? "USD" : "INR";
  try {
    return new Intl.NumberFormat(code === "USD" ? "en-US" : "en-IN", {
      style: "currency",
      currency: code,
      maximumFractionDigits: 0,
    }).format(Math.round(amount));
  } catch {
    return code === "USD" ? `$${Math.round(amount)}` : `₹${Math.round(amount)}`;
  }
}
