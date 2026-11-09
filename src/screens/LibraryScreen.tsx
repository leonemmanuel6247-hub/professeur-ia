import React, { useCallback } from "react";
import { Alert, FlatList, Pressable, Text, View } from "react-native";
import { NavigationProp, useFocusEffect, useNavigation } from "@react-navigation/native";
import { useAppStore } from "../store/useAppStore";
import { Badge, Btn, Card, Empty, H1, P, ProgressBar, Screen } from "../components/ui";
import { deleteCourse } from "../services/courses";
import { Course } from "../types";
import { RootStackParamList } from "../navigation";
import { go } from "../nav";
import { spacing } from "../theme";

export function LibraryScreen() {
  const theme = useAppStore((s) => s.theme);
  const courses = useAppStore((s) => s.courses);
  const refresh = useAppStore((s) => s.refresh);
  const setActive = useAppStore((s) => s.setActiveCourse);
  const nav = useNavigation<NavigationProp<RootStackParamList>>();

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  const onDelete = (c: Course) => {
    Alert.alert("Supprimer le cours", `Supprimer « ${c.title} » ?`, [
      { text: "Annuler", style: "cancel" },
      {
        text: "Supprimer",
        style: "destructive",
        onPress: async () => {
          await deleteCourse(c.id);
          await refresh();
        },
      },
    ]);
  };

  return (
    <Screen>
      <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.lg, flex: 1 }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <View>
            <Badge label="PROFESSEUR IA" tone="accent" />
            <View style={{ height: 10 }} />
            <H1>Bibliotheque</H1>
            <Text style={{ color: theme.textMuted, marginTop: 4, fontSize: 14 }}>
              {courses.length} cours · stockes sur l'appareil
            </Text>
          </View>
        </View>

        <View style={{ flexDirection: "row", gap: 10, marginVertical: 20 }}>
          <Btn title="+ Importer" onPress={() => go(nav, "Import")} style={{ flex: 1 }} />
        </View>

        <FlatList
          data={courses}
          keyExtractor={(c) => c.id}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 40 }}
          ListEmptyComponent={
            <Empty title="Aucun cours" subtitle="Importe un PDF ou photographie une page pour commencer." />
          }
          renderItem={({ item }) => {
            const pct = Math.round(item.progress * 100);
            return (
              <Pressable
                onPress={() => {
                  setActive(item.id);
                  go(nav, "Course", { courseId: item.id });
                }}
                onLongPress={() => onDelete(item)}
                accessibilityRole="button"
                style={({ pressed }) => ({ marginBottom: 14, opacity: pressed ? 0.9 : 1 })}
              >
                <Card style={{ overflow: "hidden" }}>
                  <View
                    style={{
                      position: "absolute",
                      left: 0,
                      top: 0,
                      bottom: 0,
                      width: 4,
                      backgroundColor: pct >= 100 ? theme.success : theme.primary,
                    }}
                  />
                  <View style={{ paddingLeft: 8 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                      <Text
                        numberOfLines={1}
                        style={{ color: theme.text, fontSize: 17, fontWeight: "700", flex: 1, letterSpacing: -0.3 }}
                      >
                        {item.title}
                      </Text>
                      <View
                        style={{
                          paddingHorizontal: 10,
                          paddingVertical: 4,
                          borderRadius: 999,
                          backgroundColor: theme.surfaceAlt,
                          borderWidth: 1,
                          borderColor: pct >= 100 ? theme.success : theme.border,
                          marginLeft: 8,
                        }}
                      >
                        <Text style={{ color: pct >= 100 ? theme.success : theme.primary, fontSize: 11, fontWeight: "700" }}>
                          {pct}%
                        </Text>
                      </View>
                    </View>
                    <Text style={{ color: theme.textMuted, marginTop: 6, fontSize: 13 }}>
                      {[item.subject, item.level].filter(Boolean).join(" · ") || "Matiere non renseignee"}
                    </Text>
                    <View style={{ marginTop: 12 }}>
                      <ProgressBar value={item.progress} />
                      <Text style={{ color: theme.textMuted, fontSize: 11, marginTop: 6 }}>
                        Modifie le {new Date(item.createdAt).toLocaleDateString("fr-FR")}
                      </Text>
                    </View>
                  </View>
                </Card>
              </Pressable>
            );
          }}
        />
      </View>
    </Screen>
  );
}