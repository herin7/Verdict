import { useEffect } from "react";
import { Platform } from "react-native";
import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import { useRouter } from "expo-router";
import { registerDevice } from "../inbox/api";

// Show verdicts that land while the app is open, too.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

/**
 * Registers this device for "your verdict is ready" pushes. Only prompts for
 * permission when `ask` is set (right after the first share), so a plain app
 * launch never nags. Silently does nothing without an EAS projectId.
 */
export async function registerForPush({ ask }: { ask: boolean }): Promise<void> {
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("verdicts", {
      name: "Verdicts",
      importance: Notifications.AndroidImportance.HIGH,
    });
  }
  const current = await Notifications.getPermissionsAsync();
  const granted =
    current.granted || (ask && current.canAskAgain && (await Notifications.requestPermissionsAsync()).granted);
  if (!granted) return;

  const projectId: string | undefined = Constants.expoConfig?.extra?.eas?.projectId;
  if (!projectId) return;
  const { data } = await Notifications.getExpoPushTokenAsync({ projectId });
  await registerDevice(data, Platform.OS);
}

/** `verdict://item/<id>` → `<id>`. */
export function itemIdFromUrl(url: unknown): string | null {
  return typeof url === "string" ? (url.match(/item\/([^/?#]+)/)?.[1] ?? null) : null;
}

/** Opens the item a tapped notification points at, including the one that cold-started the app. */
export function usePushNavigation() {
  const router = useRouter();
  useEffect(() => {
    const open = (response: Notifications.NotificationResponse | null) => {
      const id = itemIdFromUrl(response?.notification.request.content.data?.url);
      if (id) router.push(`/item/${id}`);
    };
    Notifications.getLastNotificationResponseAsync().then(open).catch(() => {});
    registerForPush({ ask: false }).catch(() => {});
    const sub = Notifications.addNotificationResponseReceivedListener(open);
    return () => sub.remove();
  }, [router]);
}
