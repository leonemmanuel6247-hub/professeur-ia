export type RootStackParamList = {
  Chat: { courseId?: string; conversationId?: string; sectionId?: string; mode?: "lesson" | "free" | "free-new" };
  NewConversation: { courseId: string; sectionId?: string; mode?: "lesson" | "free" };
  Library: undefined;
  Import: undefined;
  Course: { courseId: string };
  Experience: undefined;
  Progress: undefined;
  Settings: undefined;
  Exercises: { courseId: string; sectionId?: string };
  Flashcards: { courseId: string };
  Profiles: undefined;
  Prompts: undefined;
  About: undefined;
};