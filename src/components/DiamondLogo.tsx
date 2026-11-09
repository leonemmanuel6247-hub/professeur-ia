import React, { useEffect, useRef } from "react";
import { Animated, Easing, View } from "react-native";
import Svg, { Defs, LinearGradient, Stop, Polygon, G, Circle } from "react-native-svg";

type Props = {
  size?: number;
  animate?: boolean;
  tint?: string;
};

export function DiamondLogo({ size = 160, animate = true, tint = "#7FE7FF" }: Props) {
  const float = useRef(new Animated.Value(0)).current;
  const glow = useRef(new Animated.Value(0.4)).current;
  const glare = useRef(new Animated.Value(0)).current;
  const sparkle = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!animate) return;
    const loops = [
      Animated.loop(
        Animated.sequence([
          Animated.timing(float, { toValue: 1, duration: 2400, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
          Animated.timing(float, { toValue: 0, duration: 2400, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        ])
      ),
      Animated.loop(
        Animated.sequence([
          Animated.timing(glow, { toValue: 1, duration: 1400, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.timing(glow, { toValue: 0.45, duration: 1400, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        ])
      ),
      Animated.loop(
        Animated.sequence([
          Animated.timing(glare, { toValue: 1, duration: 2100, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.delay(1100),
        ])
      ),
      Animated.loop(
        Animated.sequence([
          Animated.delay(300),
          Animated.timing(sparkle, { toValue: 1, duration: 900, easing: Easing.out(Easing.ease), useNativeDriver: true }),
          Animated.timing(sparkle, { toValue: 0, duration: 900, easing: Easing.in(Easing.ease), useNativeDriver: true }),
        ])
      ),
    ];
    loops.forEach((l) => l.start());
    return () => loops.forEach((l) => l.stop());
  }, [animate, float, glare, glow, sparkle]);

  const W = size;
  const H = size * 0.9;

  const c = W / 2;
  const tableY = H * 0.1;
  const tableHalf = W * 0.22;
  const girdleY = H * 0.4;
  const girdleHalf = W * 0.5;
  const culetY = H * 0.97;

  const tL = { x: c - tableHalf, y: tableY };
  const tR = { x: c + tableHalf, y: tableY };
  const tm = { x: c, y: tableY };
  const gL = { x: c - girdleHalf, y: girdleY };
  const gR = { x: c + girdleHalf, y: girdleY };
  const gML = { x: c - girdleHalf * 0.5, y: girdleY };
  const gMR = { x: c + girdleHalf * 0.5, y: girdleY };
  const gc = { x: c, y: girdleY };
  const culet = { x: c, y: culetY };

  const pts = (a: { x: number; y: number }[]) => a.map((p) => `${p.x},${p.y}`).join(" ");

  const translateY = float.interpolate({ inputRange: [0, 1], outputRange: [-size * 0.03, size * 0.03] });
  const scale = glow.interpolate({ inputRange: [0.45, 1], outputRange: [1, 1.035] });
  const glareX = glare.interpolate({ inputRange: [0, 1], outputRange: [-W * 0.6, W * 0.85] });
  const sparkleScale = sparkle.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.6, 1.1, 0.6] });

  return (
    <Animated.View
      style={{
        width: W,
        height: H,
        alignItems: "center",
        justifyContent: "center",
        transform: [{ translateY }, { scale }],
      }}
    >
      <Animated.View
        style={{
          position: "absolute",
          bottom: 0,
          width: W * 0.72,
          height: size * 0.1,
          borderRadius: size,
          backgroundColor: tint,
          opacity: glow.interpolate({ inputRange: [0.45, 1], outputRange: [0.12, 0.3] }),
          transform: [{ scaleX: glow.interpolate({ inputRange: [0.45, 1], outputRange: [0.8, 1.06] }) }],
        }}
      />

      <Svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
        <Defs>
          <LinearGradient id="faceTopL" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor="#FFFFFF" stopOpacity="1" />
            <Stop offset="0.5" stopColor="#E9F6FF" stopOpacity="1" />
            <Stop offset="1" stopColor="#BFE4FF" stopOpacity="1" />
          </LinearGradient>
          <LinearGradient id="faceTopR" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#F4FBFF" stopOpacity="1" />
            <Stop offset="1" stopColor="#9FC7F5" stopOpacity="1" />
          </LinearGradient>
          <LinearGradient id="faceTable" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor="#FFFFFF" stopOpacity="1" />
            <Stop offset="1" stopColor="#DCEFFF" stopOpacity="1" />
          </LinearGradient>
          <LinearGradient id="crownC" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor="#FFFFFF" stopOpacity="1" />
            <Stop offset="1" stopColor="#CDE8FF" stopOpacity="1" />
          </LinearGradient>
          <LinearGradient id="crownL" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor="#EAF6FF" stopOpacity="1" />
            <Stop offset="1" stopColor="#A9D4FF" stopOpacity="1" />
          </LinearGradient>
          <LinearGradient id="crownR" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor="#D5ECFF" stopOpacity="1" />
            <Stop offset="1" stopColor="#7FB4EC" stopOpacity="1" />
          </LinearGradient>
          <LinearGradient id="pavL" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor="#E8F6FF" stopOpacity="1" />
            <Stop offset="1" stopColor="#9CCBF7" stopOpacity="1" />
          </LinearGradient>
          <LinearGradient id="pavC" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#F2FAFF" stopOpacity="1" />
            <Stop offset="1" stopColor="#8EC0F0" stopOpacity="1" />
          </LinearGradient>
          <LinearGradient id="pavR" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor="#CDE9FF" stopOpacity="1" />
            <Stop offset="1" stopColor="#6AA0DF" stopOpacity="1" />
          </LinearGradient>
          <LinearGradient id="glare" x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor="#FFFFFF" stopOpacity="0" />
            <Stop offset="0.5" stopColor="#FFFFFF" stopOpacity="0.85" />
            <Stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
          </LinearGradient>
          <LinearGradient id="rainbow" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor="#00F0FF" stopOpacity="0.5" />
            <Stop offset="0.4" stopColor="#C24DFF" stopOpacity="0.35" />
            <Stop offset="0.7" stopColor="#FF3DD6" stopOpacity="0.3" />
            <Stop offset="1" stopColor="#4DFF9E" stopOpacity="0.28" />
          </LinearGradient>
        </Defs>

        <G>
          <Polygon points={pts([tL, tm, gML, gL])} fill="url(#crownL)" />
          <Polygon points={pts([tm, tR, gR, gML])} fill="url(#crownR)" />
          <Polygon points={pts([gL, gML, gc])} fill="url(#crownL)" opacity={0.92} />
          <Polygon points={pts([gML, gR, gc])} fill="url(#crownC)" opacity={0.9} />
          <Polygon points={pts([tL, tm, tR])} fill="url(#faceTable)" />
          <Polygon points={pts([tL, tm, tR])} fill="url(#rainbow)" opacity={0.35} />

          <Polygon points={pts([gL, gML, culet])} fill="url(#pavL)" />
          <Polygon points={pts([gML, gc, culet])} fill="url(#pavC)" />
          <Polygon points={pts([gc, gMR, culet])} fill="url(#pavR)" />
          <Polygon points={pts([gMR, gR, culet])} fill="url(#pavL)" opacity={0.95} />
          <Polygon points={pts([gc, gMR, culet])} fill="url(#rainbow)" opacity={0.22} />

          <Polygon points={pts([tL, tR, gR, gL])} fill="none" stroke="rgba(255,255,255,0.75)" strokeWidth={1.2} />
          <Polygon points={pts([gL, gR, culet])} fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth={0.8} />
          <Polygon points={pts([tL, tR, tm])} fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth={0.8} />
        </G>
      </Svg>

      <Animated.View
        pointerEvents="none"
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: W,
          height: H,
          transform: [{ translateX: glareX }],
          opacity: glare.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, 0.7, 0] }),
        }}
      >
        <Svg width={W * 0.26} height={H}>
          <Polygon points={`0,0 ${W * 0.26},0 ${W * 0.26 - 22},${H} 22,${H}`} fill="url(#glare)" />
        </Svg>
      </Animated.View>

      <Animated.View
        pointerEvents="none"
        style={{
          position: "absolute",
          top: H * 0.30,
          left: c + W * 0.06,
          transform: [{ scale: sparkleScale }],
          opacity: sparkle,
        }}
      >
        <Svg width={22} height={22}>
          <Polygon points="11,0 13,9 22,11 13,13 11,22 9,13 0,11 9,9" fill="#FFFFFF" />
        </Svg>
      </Animated.View>
    </Animated.View>
  );
}