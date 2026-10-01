import { Alert } from "react-native";
import * as WebBrowser from "expo-web-browser";
import { colors } from "../theme";

/** Opens a source or product page in an in-app browser sheet, so the shopper never loses their place. */
export async function openLink(url: string): Promise<void> {
  try {
    await WebBrowser.openBrowserAsync(url, {
      toolbarColor: colors.surface,
      controlsColor: colors.primary,
      presentationStyle: WebBrowser.WebBrowserPresentationStyle.PAGE_SHEET,
    });
  } catch {
    Alert.alert("Couldn't open this link", "Check your connection and try again.");
  }
}
