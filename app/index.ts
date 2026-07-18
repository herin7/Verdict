import "react-native-reanimated";
import { AppRegistry } from "react-native";
import { registerRootComponent } from "expo";
import App from "./App";
import { VerdictPanelRoot } from "./src/screens/VerdictPanelRoot";

registerRootComponent(App);

// A SEPARATE ReactSurface from the main "main" surface above - hosted
// directly in its own WindowManager overlay window by
// VerdictOverlayService.showPanel, not inside App's tree, so the floating
// product panel can appear over another app without ever launching
// MainActivity. Both registrations live in the same JS bundle/instance.
AppRegistry.registerComponent("VerdictPanel", () => VerdictPanelRoot);
