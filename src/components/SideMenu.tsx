import React, { useEffect, useRef } from "react";
import {
  Animated,
  Easing,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useAppStore } from "../store/useAppStore";
import { DiamondLogo } from "./DiamondLogo";
import type { RootStackParamList } from "../nav-types";
import { navigationRef } from "../nav";

const ITEMS: { label: string; route: keyof RootStackParamList; desc: string }[] = [
  { label: "Chat", route: "Chat", desc: "Le professeur" },
  { label: "Bibliotheque", route: "Library", desc: "Tes cours" },
  { label: "Importer", route: "Import", desc: "PDF ou photos" },
  { label: "Progres", route: "Progress", desc: "Maitrise" },
  { label: "Reglages", route: "Settings", desc: "Theme, polices" },
  { label: "Profils IA", route: "Profiles", desc: "Cles et modeles" },
  { label: "Prompts", route: "Prompts", desc: "Personnalisation" },
  { label: "A propos", route: "About", desc: "Version" },
];

export function SideMenu() {
  const theme = useAppStore((s) => s.theme);
  const open = useAppStore((s) => s.menuOpen);
  const setOpen = useAppStore((s) => s.setMenuOpen);
  const anim = useRef(new Animated.Value(0)).current;
  const items = useRef(ITEMS.map(() => new Animated.Value(0))).current;

  useEffect(() => {
    Animated.timing(anim, {
      toValue: open ? 1 : 0,
      duration: 280,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
    if (open) {
      items.forEach((v) => v.setValue(0));
      Animated.stagger(
        55,
        items.map((v) =>
          Animated.timing(v, { toValue: 1, duration: 260, easing: Easing.out(Easing.cubic), useNativeDriver: true })
        )
      ).start();
    }
  }, [open, anim, items]);

  if (!open) return null;

  const translateX = anim.interpolate({ inputRange: [0, 1], outputRange: [-320, 0] });

  const goTo = (route: keyof RootStackParamList) => {
    setOpen(false);
    if (navigationRef.isReady()) {
      navigationRef.navigate(route as never);
    }
  };

  return (
    <View style={[StyleSheet.absoluteFill, { zIndex: 900 }]}>
      <Animated.View
        style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(3,5,14,0.62)", opacity: anim }]}
      />
      <Pressable style={StyleSheet.absoluteFill} onPress={() => setOpen(false)} />
      <Animated.View
        style={{
          position: "absolute",
          top: 0,
          bottom: 0,
          left: 0,
          width: 300,
          backgroundColor: theme.surface,
          borderRightWidth: 1,
          borderRightColor: theme.border,
          paddingTop: 64,
          paddingHorizontal: 20,
          transform: [{ translateX }],
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 28 }}>
          <DiamondLogo size={44} />
          <View>
            <Text style={{ color: theme.text, fontSize: 18, fontWeight: "800", letterSpacing: -0.3 }}>
              Professeur IA
            </Text>
            <Text style={{ color: theme.textMuted, fontSize: 11, letterSpacing: 0.4 }}>MENU</Text>
          </View>
        </View>
        <ScrollView showsVerticalScrollIndicator={false}>
          {ITEMS.map((it, i) => (
            <Animated.View
              key={it.route}
              style={{
                opacity: items[i],
                transform: [{ translateX: items[i].interpolate({ inputRange: [0, 1], outputRange: [-16, 0] }) }],
              }}
            >
              <Pressable
                onPress={() => goTo(it.route)}
                style={({ pressed }) => ({
                  paddingVertical: 14,
                  paddingHorizontal: 12,
                  borderRadius: 14,
                  marginBottom: 6,
                  backgroundColor: pressed ? theme.surfaceAlt : "transparent",
                  borderWidth: 1,
                  borderColor: "transparent",
                })}
              >
                <Text style={{ color: theme.text, fontSize: 16, fontWeight: "700" }}>{it.label}</Text>
                <Text style={{ color: theme.textMuted, fontSize: 12, marginTop: 2 }}>{it.desc}</Text>
              </Pressable>
            </Animated.View>
          ))}
        </ScrollView>
      </Animated.View>
    </View>
  );
}

export function MenuButton({ floating }: { floating?: boolean }) {
  const theme = useAppStore((s) => s.theme);
  const setOpen = useAppStore((s) => s.setMenuOpen);
  const scale = useAppStore((s) => s.settings.fontScale);
  void scale;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Ouvrir le menu"
      onPress={() => setOpen(true)}
      hitSlop={10}
      style={({ pressed }) => ({
        width: 44,
        height: 44,
        borderRadius: 14,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: floating ? theme.surface : "transparent",
        borderWidth: floating ? 1 : 0,
        borderColor: theme.border,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <View style={{ width: 20, height: 2, backgroundColor: theme.text, borderRadius: 2, marginBottom: 5 }} />
      <View style={{ width: 20, height: 2, backgroundColor: theme.text, borderRadius: 2, marginBottom: 5 }} />
      <View style={{ width: 13, height: 2, backgroundColor: theme.primary, borderRadius: 2, alignSelf: "flex-start", marginLeft: 12 }} />
    </Pressable>
  );
}