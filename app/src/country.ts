import * as Localization from "expo-localization";
import { getCountryOverride, setCountryOverride } from "./storage";

export type Country = "IN" | "US";

export function detectCountry(): Country {
  const locales = Localization.getLocales?.() ?? [];
  const region = locales[0]?.regionCode?.toUpperCase() || "";
  return region === "US" ? "US" : "IN";
}

export async function getCountry(): Promise<Country> {
  const override = await getCountryOverride();
  if (override === "IN" || override === "US") return override;
  return detectCountry();
}

export async function setCountry(country: Country): Promise<void> {
  await setCountryOverride(country);
}

export function currencyFor(country: Country): "INR" | "USD" {
  return country === "US" ? "USD" : "INR";
}
