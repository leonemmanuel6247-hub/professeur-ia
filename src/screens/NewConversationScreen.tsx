import React, { useState } from "react";
import { KeyboardAvoidingView, Platform, Text, TextInput, View } from "react-native";
import { useNavigation, useRoute } from "@react-navigation/native";
import type { RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Btn, Card, P, Screen } from "../components/ui";
import type { RootStackParamList } from "../nav-types";
import { createConversation } from "../services/conversations";
import { useAppStore } from "../store/useAppStore";
import { spacing } from "../theme";

export function NewConversationScreen() {
  const theme = useAppStore((s) => s.theme);
  const scale = useAppStore((s) => s.settings.fontScale);
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<RootStackParamList, "NewConversation">>();
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);

  const create = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const clean = title.trim() || `Discussion du ${new Date().toLocaleString("fr-FR", {
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      })}`;
      const conv = await createConversation(route.params.courseId, clean);
      nav.replace("Chat", {
        courseId: route.params.courseId,
        conversationId: conv.id,
        sectionId: route.params.sectionId,
        mode: route.params.mode ?? "free",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={{ padding: spacing.lg, gap: 14 }}>
          <P muted>
            Donne un nom a cette conversation pour la retrouver plus tard dans la fiche du cours.
          </P>
          <Card>
            <Text
              style={{
                color: theme.textMuted,
                fontSize: 12,
                fontWeight: "600",
                letterSpacing: 0.6,
                textTransform: "uppercase",
                marginBottom: 8,
              }}
            >
              Titre
            </Text>
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder="Ex. Revision conductivite"
              placeholderTextColor={theme.textMuted}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={create}
              style={{
                backgroundColor: theme.input,
                color: theme.text,
                borderRadius: 12,
                paddingHorizontal: 14,
                paddingVertical: 13,
                fontSize: 16 * scale,
                borderWidth: 1,
                borderColor: theme.border,
              }}
            />
          </Card>
          <View style={{ flexDirection: "row", gap: 10 }}>
            <Btn
              title="Annuler"
              variant="ghost"
              onPress={() => nav.goBack()}
              style={{ flex: 1 }}
            />
            <Btn
              title="Creer et discuter"
              onPress={create}
              loading={busy}
              style={{ flex: 2 }}
            />
          </View>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}
