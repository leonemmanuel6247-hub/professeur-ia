import React, { useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet, Text, View } from "react-native";
import { DiamondLogo } from "./DiamondLogo";

export function SplashOverlay({ onDone }: { onDone: () => void }) {
  const fade = useRef(new Animated.Value(1)).current;
  const titleOpacity = useRef(new Animated.Value(0)).current;
  const titleY = useRef(new Animated.Value(16)).current;
  const ring1 = useRef(new Animated.Value(0)).current;
  const ring2 = useRef(new Animated.Value(0)).current;
  const hue = useRef(new Animated.Value(0)).current;
  const doneRef = useRef(false);

  const finish = React.useCallback(() => {
    if (doneRef.current) return;
    doneRef.current = true;
    onDone();
  }, [onDone]);

  useEffect(() => {
    const safety = setTimeout(finish, 6000);

    Animated.parallel([
      Animated.loop(
        Animated.timing(ring1, { toValue: 1, duration: 2400, easing: Easing.out(Easing.cubic), useNativeDriver: true })
      ),
      Animated.sequence([
        Animated.delay(600),
        Animated.loop(
          Animated.timing(ring2, { toValue: 1, duration: 2400, easing: Easing.out(Easing.cubic), useNativeDriver: true })
        ),
      ]),
      Animated.loop(
        Animated.timing(hue, { toValue: 1, duration: 5000, easing: Easing.linear, useNativeDriver: true })
      ),
    ]).start();

    Animated.sequence([
      Animated.delay(700),
      Animated.parallel([
        Animated.timing(titleOpacity, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(titleY, { toValue: 0, duration: 700, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      ]),
      Animated.delay(3000),
      Animated.timing(fade, { toValue: 0, duration: 650, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
    ]).start(() => finish());

    return () => clearTimeout(safety);
  }, [fade, titleOpacity, titleY, ring1, ring2, hue, finish]);

  const ringStyle = (v: Animated.Value, c: string) => ({
    position: "absolute" as const,
    width: 220,
    height: 220,
    borderRadius: 110,
    borderWidth: 2,
    borderColor: c,
    opacity: v.interpolate({ inputRange: [0, 1], outputRange: [0.6, 0] }),
    transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1.9] }) }],
  });

  return (
    <Animated.View style={[StyleSheet.absoluteFill, styles.root, { opacity: fade }]}>
      <View style={styles.glowA} />
      <View style={styles.glowB} />
      <Animated.View style={ringStyle(ring1, "#2EE9FF")} />
      <Animated.View style={ringStyle(ring2, "#C77BFF")} />

      <DiamondLogo size={180} />

      <Animated.View style={{ opacity: titleOpacity, transform: [{ translateY: titleY }], alignItems: "center" }}>
        <Text style={styles.title}>Professeur IA</Text>
        <Text style={styles.tag}>L'intelligence au service de l'apprentissage</Text>
        <Text style={styles.studio}>cree par AsTARTE STUDIO</Text>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: {
    backgroundColor: "#040615",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 999,
  },
  glowA: {
    position: "absolute",
    width: 380,
    height: 380,
    borderRadius: 380,
    backgroundColor: "rgba(122,114,255,0.24)",
    top: "18%",
  },
  glowB: {
    position: "absolute",
    width: 300,
    height: 300,
    borderRadius: 300,
    backgroundColor: "rgba(46,233,255,0.18)",
    bottom: "16%",
  },
  title: {
    color: "#F4F6FF",
    fontSize: 28,
    fontWeight: "800",
    letterSpacing: 1,
    marginTop: 30,
  },
  tag: {
    color: "#9AA6DA",
    fontSize: 13,
    marginTop: 8,
    letterSpacing: 0.4,
  },
  studio: {
    color: "#6E7BB0",
    fontSize: 12,
    marginTop: 22,
    letterSpacing: 2,
    fontWeight: "700",
    textTransform: "uppercase",
  },
});