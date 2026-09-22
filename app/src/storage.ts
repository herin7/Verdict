import AsyncStorage from "@react-native-async-storage/async-storage";

const ONBOARDING_KEY = "verdict.onboarding.done.v1";

export async function getOnboardingDone(): Promise<boolean> {
  return (await AsyncStorage.getItem(ONBOARDING_KEY)) === "1";
}

export async function setOnboardingDone(): Promise<void> {
  await AsyncStorage.setItem(ONBOARDING_KEY, "1");
}
