import React from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  ViewStyle,
} from "react-native";
import { radius, shadow, spacing } from "../theme";
import { useAppStore } from "../store/useAppStore";

export function Screen({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  const theme = useAppStore((s) => s.theme);
  return (
    <View style={[{ flex: 1, backgroundColor: theme.bg }, style]}>
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <View style={{ flex: 1, backgroundColor: theme.bg }} />
        <View
          style={{
            position: "absolute",
            top: -120,
            right: -80,
            width: 340,
            height: 340,
            borderRadius: 170,
            backgroundColor: theme.glow,
          }}
        />
        <View
          style={{
            position: "absolute",
            bottom: -140,
            left: -90,
            width: 300,
            height: 300,
            borderRadius: 150,
            backgroundColor: theme.glowAccent,
            opacity: 0.8,
          }}
        />
        <View
          style={{
            position: "absolute",
            top: "40%",
            left: "-20%",
            width: 260,
            height: 260,
            borderRadius: 130,
            backgroundColor: theme.glowViolet,
            opacity: 0.6,
          }}
        />
      </View>
      {children}
    </View>
  );
}

export function H1({ children }: { children: React.ReactNode }) {
  const theme = useAppStore((s) => s.theme);
  const scale = useAppStore((s) => s.settings.fontScale);
  return (
    <Text style={{ color: theme.text, fontSize: 28 * scale, fontWeight: "800", letterSpacing: -0.8 }}>
      {children}
    </Text>
  );
}

export function H2({ children }: { children: React.ReactNode }) {
  const theme = useAppStore((s) => s.theme);
  const scale = useAppStore((s) => s.settings.fontScale);
  return (
    <Text style={{ color: theme.text, fontSize: 18 * scale, fontWeight: "700", letterSpacing: -0.3 }}>
      {children}
    </Text>
  );
}

export function P({ children, muted }: { children: React.ReactNode; muted?: boolean }) {
  const theme = useAppStore((s) => s.theme);
  const scale = useAppStore((s) => s.settings.fontScale);
  return (
    <Text
      style={{
        color: muted ? theme.textMuted : theme.text,
        fontSize: 15 * scale,
        lineHeight: 23 * scale,
      }}
    >
      {children}
    </Text>
  );
}

export function Card({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  const theme = useAppStore((s) => s.theme);
  return (
    <View
      style={[
        {
          backgroundColor: theme.surface,
          borderRadius: radius.lg,
          padding: spacing.lg,
          borderWidth: 1,
          borderColor: theme.border,
          overflow: "hidden",
        },
        shadow.soft,
        style,
      ]}
    >
      <View
        pointerEvents="none"
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: 1.5,
          backgroundColor: theme.borderStrong,
          opacity: 0.5,
        }}
      />
      {children}
    </View>
  );
}

export function Btn({
  title,
  onPress,
  variant = "primary",
  disabled,
  loading,
  style,
}: {
  title: string;
  onPress?: () => void;
  variant?: "primary" | "ghost" | "danger" | "accent";
  disabled?: boolean;
  loading?: boolean;
  style?: ViewStyle;
}) {
  const theme = useAppStore((s) => s.theme);
  const isPrimary = variant === "primary";
  const isAccent = variant === "accent";
  const isDanger = variant === "danger";
  const bg = isPrimary
    ? theme.primary
    : isDanger
      ? theme.danger
      : isAccent
        ? theme.accent
        : "transparent";
  const color = variant === "ghost" ? theme.primary : "#fff";
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [
        {
          minHeight: 50,
          paddingHorizontal: 20,
          borderRadius: radius.md,
          backgroundColor: bg,
          alignItems: "center",
          justifyContent: "center",
          opacity: disabled ? 0.45 : pressed ? 0.82 : 1,
          borderWidth: variant === "ghost" ? 1.5 : 0,
          borderColor: theme.primarySoft,
          flexDirection: "row",
          gap: 8,
          transform: [{ scale: pressed ? 0.985 : 1 }],
        },
        isPrimary || isDanger || isAccent ? shadow.glow : null,
        style,
      ]}
    >
      {loading ? <ActivityIndicator color={color} /> : null}
      <Text style={{ color, fontWeight: "700", fontSize: 15, letterSpacing: 0.2 }}>{title}</Text>
    </Pressable>
  );
}

export function Chip({
  label,
  onPress,
  active,
}: {
  label: string;
  onPress?: () => void;
  active?: boolean;
}) {
  const theme = useAppStore((s) => s.theme);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => ({
        minHeight: 36,
        paddingHorizontal: 14,
        borderRadius: radius.full,
        backgroundColor: active ? theme.primary : theme.surfaceAlt,
        borderWidth: 1,
        borderColor: active ? theme.primary : theme.border,
        justifyContent: "center",
        marginRight: 8,
        marginBottom: 8,
        opacity: pressed ? 0.8 : 1,
      })}
    >
      <Text
        style={{
          color: active ? "#fff" : theme.text,
          fontSize: 13,
          fontWeight: "600",
          letterSpacing: 0.2,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export function Field({
  label,
  value,
  onChangeText,
  secure,
  placeholder,
  multiline,
  keyboardType,
}: {
  label: string;
  value: string;
  onChangeText: (t: string) => void;
  secure?: boolean;
  placeholder?: string;
  multiline?: boolean;
  keyboardType?: "default" | "url" | "numeric";
}) {
  const theme = useAppStore((s) => s.theme);
  return (
    <View style={{ marginBottom: spacing.md }}>
      <Text
        style={{
          color: theme.textMuted,
          marginBottom: 8,
          fontSize: 12,
          fontWeight: "600",
          letterSpacing: 0.6,
          textTransform: "uppercase",
        }}
      >
        {label}
      </Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        secureTextEntry={secure}
        placeholder={placeholder}
        placeholderTextColor={theme.textMuted}
        multiline={multiline}
        keyboardType={keyboardType}
        autoCapitalize="none"
        autoCorrect={false}
        style={{
          backgroundColor: theme.input,
          color: theme.text,
          borderRadius: radius.md,
          paddingHorizontal: 14,
          paddingVertical: 13,
          minHeight: multiline ? 96 : 50,
          fontSize: 15,
          borderWidth: 1,
          borderColor: theme.border,
          textAlignVertical: multiline ? "top" : "center",
        }}
      />
    </View>
  );
}

export function ProgressBar({ value }: { value: number }) {
  const theme = useAppStore((s) => s.theme);
  const v = Math.max(0, Math.min(1, value));
  return (
    <View
      style={{
        height: 8,
        backgroundColor: theme.surfaceAlt,
        borderRadius: 8,
        overflow: "hidden",
        borderWidth: 1,
        borderColor: theme.border,
      }}
    >
      <View
        style={{
          width: `${v * 100}%`,
          height: "100%",
          backgroundColor: theme.primary,
          borderRadius: 8,
        }}
      />
    </View>
  );
}

export function Empty({ title, subtitle }: { title: string; subtitle?: string }) {
  const theme = useAppStore((s) => s.theme);
  return (
    <View style={{ padding: 40, alignItems: "center" }}>
      <View
        style={{
          width: 72,
          height: 72,
          borderRadius: 36,
          backgroundColor: theme.surfaceAlt,
          borderWidth: 1,
          borderColor: theme.border,
          alignItems: "center",
          justifyContent: "center",
          marginBottom: 16,
        }}
      >
        <View
          style={{
            width: 28,
            height: 28,
            borderRadius: 8,
            borderWidth: 2,
            borderColor: theme.primarySoft,
          }}
        />
      </View>
      <Text
        style={{
          color: theme.text,
          fontSize: 18,
          fontWeight: "700",
          textAlign: "center",
          letterSpacing: -0.3,
        }}
      >
        {title}
      </Text>
      {subtitle ? (
        <Text style={{ color: theme.textMuted, marginTop: 8, textAlign: "center", lineHeight: 21 }}>
          {subtitle}
        </Text>
      ) : null}
    </View>
  );
}

export function Badge({ label, tone = "primary" }: { label: string; tone?: "primary" | "accent" | "success" | "danger" }) {
  const theme = useAppStore((s) => s.theme);
  const map = {
    primary: theme.primary,
    accent: theme.accent,
    success: theme.success,
    danger: theme.danger,
  } as const;
  const c = map[tone];
  return (
    <View
      style={{
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: radius.full,
        backgroundColor: theme.surfaceAlt,
        borderWidth: 1,
        borderColor: c,
        alignSelf: "flex-start",
      }}
    >
      <Text style={{ color: c, fontSize: 11, fontWeight: "700", letterSpacing: 0.4 }}>{label}</Text>
    </View>
  );
}

export const ui = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center" },
  pad: { padding: spacing.lg },
});