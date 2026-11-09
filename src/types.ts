export type ProviderType = "openai" | "gemini";

export type ProviderRole = "default" | "documents" | "schemas";

export interface AiProfile {
  id: string;
  name: string;
  type: ProviderType;
  baseUrl: string;
  model: string;
  supportsVision: boolean;
  supportsNativePdf: boolean;
  maxContext: number;
  role: ProviderRole;
  order: number;
  tokensToday: number;
  tokensDay: string;
}

export interface Course {
  id: string;
  title: string;
  subject: string;
  level: string;
  school: string;
  createdAt: number;
  progress: number;
  identityJson: string;
  planJson: string;
  sourceKind: "pdf" | "images" | "camera";
  sourceName: string;
}

export interface CourseIdentity {
  notations: string[];
  definitions: string[];
  theorems: string[];
  formulas: string[];
  prerequisites: string[];
  restrictions: string[];
  summary: string;
}

export interface CoursePlanSection {
  id: string;
  title: string;
  pageStart: number;
  pageEnd: number;
  children?: CoursePlanSection[];
}

export interface PageRow {
  id: string;
  courseId: string;
  number: number;
  text: string;
  imageUri: string;
  quality: number;
}

export interface ChunkRow {
  id: string;
  courseId: string;
  pageId: string;
  sectionId: string;
  text: string;
}

export interface LessonRow {
  id: string;
  courseId: string;
  sectionId: string;
  content: string;
  status: "pending" | "seen" | "understood";
}

export interface Conversation {
  id: string;
  courseId: string;
  title: string;
  updatedAt: number;
}

export interface ChatMessage {
  id: string;
  conversationId: string;
  role: "user" | "assistant" | "system";
  content: string;
  tokens: number;
  createdAt: number;
  extraJson?: string;
}

export interface ExerciseRow {
  id: string;
  courseId: string;
  sectionId: string;
  prompt: string;
  difficulty: number;
  kind: "calcul" | "demonstration" | "qcm" | "probleme";
  hintsJson: string;
  solution: string;
  result: string;
}

export interface MasteryRow {
  id: string;
  courseId: string;
  notion: string;
  score: number;
  nextReview: number;
  intervalDays: number;
}

export interface ExperienceRow {
  id: string;
  courseId: string;
  title: string;
  specJson: string;
  html: string;
  status: "pending" | "valid" | "failed";
  createdAt: number;
}

export interface AppSettings {
  theme: "light" | "dark" | "system";
  fontScale: number;
  horsCoursEnabled: boolean;
  prompts: Record<string, string>;
  defaultProviderId: string;
  documentsProviderId: string;
  schemasProviderId: string;
}

export interface SchemaSpec {
  titre: string;
  objets: { id: string; type: string; label: string }[];
  parametres: {
    id: string;
    label: string;
    min: number;
    max: number;
    defaut: number;
    unite: string;
  }[];
  relations: string[];
  interactions: string[];
}

export interface ChatStreamChunk {
  text: string;
  done: boolean;
  promptTokens?: number;
  completionTokens?: number;
}
