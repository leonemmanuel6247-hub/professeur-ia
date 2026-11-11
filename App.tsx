import React, { useEffect, useState } from "react";
import { StatusBar, Text, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import * as SplashScreen from "expo-splash-screen";
import { Navigation } from "./src/navigation";
import { useAppStore } from "./src/store/useAppStore";
import { SplashOverlay } from "./src/components/SplashOverlay";

SplashScreen.preventAutoHideAsync().catch(() => undefined);

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (this.state.error) {
      return (
        <View style={{ flex: 1, backgroundColor: "#040615", padding: 24, justifyContent: "center" }}>
          <Text style={{ color: "#FF5C86", fontSize: 18, fontWeight: "700", marginBottom: 12 }}>
            Erreur de chargement
          </Text>
          <Text style={{ color: "#F4F6FF", fontSize: 14, lineHeight: 20 }}>
            {this.state.error.message}
          </Text>
        </View>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  const init = useAppStore((s) => s.init);
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
        <ErrorBoundary>
          <Navigation />
        </ErrorBoundary>
        {!introDone ? <SplashOverlay onDone={() => setIntroDone(true)} /> : null}
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}