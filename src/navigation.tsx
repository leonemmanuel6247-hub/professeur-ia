import React from "react";
import { NavigationContainer, DefaultTheme, DarkTheme } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { Platform, View } from "react-native";
import { navigationRef } from "./nav";
import { useAppStore } from "./store/useAppStore";
import { LibraryScreen } from "./screens/LibraryScreen";
import { ImportScreen } from "./screens/ImportScreen";
import { CourseScreen } from "./screens/CourseScreen";
import { ChatScreen } from "./screens/ChatScreen";
import { NewConversationScreen } from "./screens/NewConversationScreen";
import { ExperienceScreen } from "./screens/ExperienceScreen";
import { ProgressScreen } from "./screens/ProgressScreen";
import { SettingsScreen } from "./screens/SettingsScreen";
import { ProfilesScreen } from "./screens/ProfilesScreen";
import { ExercisesScreen } from "./screens/ExercisesScreen";
import { AboutScreen } from "./screens/AboutScreen";
import { PromptsScreen } from "./screens/PromptsScreen";
import { FlashcardsScreen } from "./screens/FlashcardsScreen";
import { SideMenu, MenuButton } from "./components/SideMenu";
import type { RootStackParamList } from "./nav-types";

export type { RootStackParamList } from "./nav-types";

const Stack = createNativeStackNavigator<RootStackParamList>();

export function Navigation() {
  const isDark = useAppStore((s) => s.isDark);
  const theme = useAppStore((s) => s.theme);
  const navTheme = {
    ...(isDark ? DarkTheme : DefaultTheme),
    colors: {
      ...(isDark ? DarkTheme.colors : DefaultTheme.colors),
      background: theme.bg,
      card: theme.surface,
      text: theme.text,
      border: theme.border,
      primary: theme.primary,
    },
  };
  return (
    <NavigationContainer ref={navigationRef} theme={navTheme}>
      <View style={{ flex: 1 }}>
        <Stack.Navigator
          initialRouteName="Chat"
          screenOptions={{
            headerTintColor: theme.text,
            headerStyle: { backgroundColor: theme.surface },
            headerTitleStyle: { fontWeight: "700", color: theme.text },
            headerShadowVisible: false,
            headerBackTitle: "",
            contentStyle: { backgroundColor: theme.bg },
            headerLeft: () => <MenuButton />,
            animation: Platform.OS === "web" ? "none" : "default",
          }}
        >
          <Stack.Screen name="Chat" component={ChatScreen} options={{ title: "Professeur IA" }} />
          <Stack.Screen
            name="NewConversation"
            component={NewConversationScreen}
            options={{ title: "Nouvelle conversation" }}
          />
          <Stack.Screen name="Library" component={LibraryScreen} options={{ title: "Bibliotheque" }} />
          <Stack.Screen name="Import" component={ImportScreen} options={{ title: "Importer un cours" }} />
          <Stack.Screen name="Course" component={CourseScreen} options={{ title: "Fiche du cours" }} />
          <Stack.Screen name="Experience" component={ExperienceScreen} options={{ title: "Experience" }} />
          <Stack.Screen name="Progress" component={ProgressScreen} options={{ title: "Progres" }} />
          <Stack.Screen name="Settings" component={SettingsScreen} options={{ title: "Reglages" }} />
          <Stack.Screen name="Exercises" component={ExercisesScreen} options={{ title: "Exercices" }} />
          <Stack.Screen name="Flashcards" component={FlashcardsScreen} options={{ title: "Cartes memoire" }} />
          <Stack.Screen name="Profiles" component={ProfilesScreen} options={{ title: "Profils IA" }} />
          <Stack.Screen name="Prompts" component={PromptsScreen} options={{ title: "Prompts" }} />
          <Stack.Screen name="About" component={AboutScreen} options={{ title: "A propos" }} />
        </Stack.Navigator>
        <SideMenu />
      </View>
    </NavigationContainer>
  );
}