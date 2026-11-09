import React, { useEffect, useState } from "react";
import { StatusBar } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import * as SplashScreen from "expo-splash-screen";
import { Navigation } from "./src/navigation";
import { useAppStore } from "./src/store/useAppStore";
import { SplashOverlay } from "./src/components/SplashOverlay";

SplashScreen.preventAutoHideAsync().catch(() => undefined);

export default function App() {
  const init = useAppStore((s) => s.init);
  const ready = useAppStore((s) => s.ready);
  const theme = useAppStore((s) => s.theme);
  const isDark = useAppStore((s) => s.isDark);
  const [introDone, setIntroDone] = useState(false);

  useEffect(() => {
    init();
    SplashScreen.hideAsync().catch(() => undefined);
  }, [init]);

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: "#040615" }}>
      <SafeAreaProvider>
        <StatusBar barStyle={isDark || !introDone ? "light-content" : "dark-content"} backgroundColor={theme.bg} />
        <Navigation />
        {!introDone ? <SplashOverlay onDone={() => setIntroDone(true)} /> : null}
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}