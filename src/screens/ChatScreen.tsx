import React, { useEffect, useRef, useState } from "react";
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import { useNavigation, useRoute } from "@react-navigation/native";
import type { NavigationProp } from "@react-navigation/native";
import { go } from "../nav";
import * as ImagePicker from "expo-image-picker";
import * as Clipboard from "expo-clipboard";
import { useAppStore } from "../store/useAppStore";
import { Btn, Chip, Screen } from "../components/ui";
import { DiamondLogo } from "../components/DiamondLogo";
import { KatexBubble } from "../components/KatexBubble";
import { ExperienceWeb } from "../components/ExperienceWeb";
import { RootStackParamList } from "../navigation";
import { ChatMessage, Course, SchemaSpec } from "../types";
import { countChunks, getCourse, parsePlan, saveExperience, saveLesson, updateCourse, listLessons } from "../services/courses";
import {
  addMessage,
  createConversation,
  listConversations,
  listMessages,
} from "../services/conversations";
import { buildProfessorMessages, extractSchemaBlocks, stripSchemaFromText } from "../services/context";
import { chatWithFallback } from "../llm/router";
import { orderedForRole } from "../services/providers";
import { uid, logError } from "../db/database";
import { guessMime, readAsBase64 } from "../services/pdf";
import { LlmMessage } from "../llm/types";

const ACTIONS = ["Plus simple", "Plus detaille", "Un autre exemple", "Pourquoi ?", "Montre-moi un schema", "Suivant"];

export function ChatScreen() {
  const theme = useAppStore((s) => s.theme);
  const scale = useAppStore((s) => s.settings.fontScale);
  const settings = useAppStore((s) => s.settings);
  const profiles = useAppStore((s) => s.profiles);
  const storeCourseId = useAppStore((s) => s.activeCourseId);
  const setStreaming = useAppStore((s) => s.setStreaming);
  const streaming = useAppStore((s) => s.streaming);
  const setExp = useAppStore((s) => s.setActiveExperience);
  const route = useRoute();
  const params = ((route.params || {}) as RootStackParamList["Chat"]);
  const courseId = params.courseId || storeCourseId || "";

  const [course, setCourse] = useState<Course | null>(null);
  const [convId, setConvId] = useState(params.conversationId || "");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const abortRef = useRef<AbortController | null>(null);
  const listRef = useRef<FlatList>(null);
  const nav = useNavigation<NavigationProp<RootStackParamList>>();

  const planSections = course && params.mode === "lesson" ? flattenPlan(parsePlan(course.planJson)) : [];
  const currentIdx = params.sectionId ? planSections.findIndex((s) => s.id === params.sectionId) : -1;

  const goToSection = (idx: number) => {
    const target = planSections[idx];
    if (!target) return;
    setMessages([]);
    setInput("");
    nav.setParams({ sectionId: target.id, mode: "lesson" } as any);
  };

  useEffect(() => {
    (async () => {
      if (!courseId) return;
      const c = await getCourse(courseId);
      setCourse(c);
      let cid = params.conversationId;
      if (!cid && params.mode === "lesson" && params.sectionId && c) {
        const plan = parsePlan(c.planJson);
        const section = findSection(plan, params.sectionId);
        const convs = await listConversations(courseId);
        const existing = convs.find((x) => x.title === `Lecon: ${section?.title || params.sectionId}`);
        cid = existing ? existing.id : (await createConversation(courseId, `Lecon: ${section?.title || params.sectionId}`)).id;
      }
      if (!cid) {
        const convs = await listConversations(courseId);
        if (convs[0]) cid = convs[0].id;
        else cid = (await createConversation(courseId, c?.title || "Lecon")).id;
      }
      setConvId(cid!);
      setMessages(await listMessages(cid!));
      if (params.mode === "lesson" && params.sectionId && c) {
        const plan = parsePlan(c.planJson);
        const section = findSection(plan, params.sectionId);
        if (section) {
          setInput(`Commence la lecon : ${section.title} (pages ${section.pageStart}-${section.pageEnd}).`);
        }
      }
    })();
  }, [courseId, params.conversationId, params.sectionId]);

  const send = async (text: string, extra?: string, imageUri?: string) => {
    if (!course || !convId) {
      Alert.alert("Pas de cours", "Ouvre d'abord un cours depuis la bibliotheque.");
      return;
    }
    if (!profiles.length) {
      Alert.alert("Profil IA", "Ajoute une cle dans Profils IA.");
      return;
    }
    const userText = text.trim();
    if (!userText && !imageUri) return;
    if (streaming) return;
    try {
      const n = await countChunks(course.id);
      if (n === 0) {
        Alert.alert(
          "Cours vide",
          "Ce cours ne contient aucun extrait de texte. Reimporte le document (PDF ou photos) depuis Importer, puis rouvre la lecon."
        );
      }
    } catch {
      /* ignore */
    }
    setInput("");
    const um = await addMessage({ conversationId: convId, role: "user", content: userText, tokens: 0 });
    setMessages((m) => [...m, um]);
    const assistantId = await uid("msg");
    const placeholder: ChatMessage = {
      id: assistantId,
      conversationId: convId,
      role: "assistant",
      content: "",
      tokens: 0,
      createdAt: Date.now(),
    };
    setMessages((m) => [...m, placeholder]);
    const ac = new AbortController();
    abortRef.current = ac;
    setStreaming(true);
    try {
      const history = [...messages, um]
        .filter((x) => x.role !== "system")
        .slice(-12)
        .map((x) => ({ role: x.role as "user" | "assistant", content: x.content }));
      const tpl =
        params.mode === "lesson"
          ? settings.prompts.lecon || settings.prompts.professeur
          : settings.prompts.professeur;
      const activeProfile =
        profiles.find((p) => p.id === settings.defaultProviderId) || profiles[0];
      let built = await buildProfessorMessages({
        systemTpl: tpl,
        course,
        userText: userText || "(image jointe)",
        history,
        maxContext: Math.max(4096, activeProfile?.maxContext || 128000),
        horsCours: settings.horsCoursEnabled,
        extraInstruction: extra,
      });
      if (imageUri) {
        const b64 = await readAsBase64(imageUri);
        const mime = await guessMime(imageUri, "image/jpeg");
        built = built.map((msg, idx) =>
          idx === built.length - 1
            ? {
                role: "user" as const,
                content: [
                  { type: "text" as const, text: userText || "Transcris et resous cet exercice dans le cadre du cours." },
                  { type: "image_url" as const, image_url: { url: `data:${mime};base64,${b64}` } },
                ],
              }
            : msg
        ) as LlmMessage[];
      }
      const ordered = orderedForRole(profiles, "default", settings.defaultProviderId);
      const res = await chatWithFallback(ordered, built, {
        abortSignal: ac.signal,
        maxTokens: Math.min(4096, Math.floor((activeProfile?.maxContext || 128000) * 0.25)),
        onToken: (chunk) => {
          setMessages((ms) =>
            ms.map((x) => (x.id === assistantId ? { ...x, content: (x.content || "") + chunk } : x))
          );
        },
      });
      await addMessage({
        id: assistantId,
        conversationId: convId,
        role: "assistant",
        content: res.text,
        tokens: res.completionTokens,
      });
      setMessages((ms) => ms.map((x) => (x.id === assistantId ? { ...x, content: res.text, tokens: res.completionTokens } : x)));
      const blocks = extractSchemaBlocks(res.text);
      if (blocks.spec || blocks.html) {
        await maybeSaveSchema(course.id, blocks.spec, blocks.html, setExp);
      }
      if (params.mode === "lesson" && params.sectionId) {
        await saveLesson({
          id: `${course.id}_${params.sectionId}`,
          courseId: course.id,
          sectionId: params.sectionId,
          content: res.text,
          status: "seen",
        });
        const lessons = await listLessons(course.id);
        const planLen = Math.max(1, flattenCount(parsePlan(course.planJson)));
        await updateCourse(course.id, { progress: Math.min(1, lessons.length / planLen) });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await logError(msg);
      setMessages((ms) =>
        ms.map((x) => (x.id === assistantId ? { ...x, content: x.content || `Erreur : ${msg}` } : x))
      );
      Alert.alert("Generation", msg);
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  };

  if (!courseId) {
    return (
      <Screen>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 28 }}>
          <DiamondLogo size={128} />
          <Text style={{ color: theme.text, fontSize: 24, fontWeight: "800", letterSpacing: -0.5, marginTop: 24, textAlign: "center" }}>
            Professeur IA
          </Text>
          <Text style={{ color: theme.textMuted, fontSize: 14, marginTop: 10, textAlign: "center", lineHeight: 21 }}>
            Choisis un cours pour discuter ou importe un PDF pour commencer.
          </Text>
          <View style={{ flexDirection: "row", gap: 10, marginTop: 28 }}>
            <Btn title="Mes cours" variant="ghost" onPress={() => go(nav, "Library")} />
            <Btn title="+ Importer" onPress={() => go(nav, "Import")} />
          </View>
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        {planSections.length > 0 && currentIdx >= 0 ? (
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              paddingHorizontal: 10,
              paddingVertical: 8,
              gap: 8,
              borderBottomWidth: 1,
              borderColor: theme.border,
              backgroundColor: theme.surface,
            }}
          >
            <Chip label="Precedent" onPress={() => goToSection(currentIdx - 1)} />
            <Text
              numberOfLines={1}
              style={{ flex: 1, textAlign: "center", color: theme.text, fontSize: 13 * scale }}
            >
              {planSections[currentIdx]?.title} ({currentIdx + 1}/{planSections.length})
            </Text>
            <Chip label="Suivant" onPress={() => goToSection(currentIdx + 1)} />
          </View>
        ) : null}
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(m) => m.id}
          contentContainerStyle={{ padding: 12, paddingBottom: 32, gap: 4 }}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
          renderItem={({ item }) => (
            <Bubble
              msg={item}
              onCopy={() => {
                Clipboard.setStringAsync(item.content).catch(() => undefined);
              }}
            />
          )}
        />
        <View style={{ flexDirection: "row", flexWrap: "wrap", paddingHorizontal: 8 }}>
          {ACTIONS.map((a) => (
            <Chip
              key={a}
              label={a}
              onPress={() =>
                a === "Suivant"
                  ? goToSection(currentIdx + 1)
                  : a === "Montre-moi un schema"
                    ? send(
                        "Montre-moi un schema.",
                        "GENERE UN VRAI SCHEMA DESSINE. INTERDIT de decrire la figure en texte. Apres une phrase d'intro, ecris un bloc ```json court puis un bloc ```html contenant OBLIGATOIREMENT un <svg> ou un <canvas> avec des formes (axes, points, vecteurs, courbes). Un HTML sans svg/canvas est refuse."
                      )
                    : send(a)
              }
            />
          ))}
        </View>
        <View
          style={{
            flexDirection: "row",
            alignItems: "flex-end",
            padding: 8,
            gap: 8,
            borderTopWidth: 1,
            borderColor: theme.border,
            backgroundColor: theme.surface,
          }}
        >
          <Pressable
            accessibilityLabel="Joindre une photo"
            onPress={async () => {
              const perm = await ImagePicker.requestCameraPermissionsAsync();
              if (!perm.granted) return;
              const shot = await ImagePicker.launchCameraAsync({ quality: 0.7 });
              if (!shot.canceled && shot.assets[0]) send(input, undefined, shot.assets[0].uri);
            }}
            style={{ minHeight: 48, minWidth: 48, alignItems: "center", justifyContent: "center" }}
          >
            <Text style={{ color: theme.primary, fontWeight: "700" }}>Photo</Text>
          </Pressable>
          <TextInput
            value={input}
            onChangeText={setInput}
            placeholder="Pose une question sur le cours…"
            placeholderTextColor={theme.textMuted}
            multiline
            style={{
              flex: 1,
              minHeight: 48,
              maxHeight: 120,
              backgroundColor: theme.input,
              color: theme.text,
              borderRadius: 12,
              paddingHorizontal: 12,
              paddingVertical: 10,
              fontSize: 15 * scale,
            }}
          />
          {streaming ? (
            <Btn title="Stop" variant="danger" onPress={() => abortRef.current?.abort()} />
          ) : (
            <>
              <Btn
                title="Regen"
                variant="ghost"
                onPress={() => {
                  const lastUser = [...messages].reverse().find((m) => m.role === "user");
                  if (lastUser) send("Regénère ta dernière réponse, plus claire.");
                }}
              />
              <Btn title="Envoyer" onPress={() => send(input)} />
            </>
          )}
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

function Bubble({ msg, onCopy }: { msg: ChatMessage; onCopy: () => void }) {
  const theme = useAppStore((s) => s.theme);
  const mine = msg.role === "user";
  const [schemaOpen, setSchemaOpen] = React.useState(false);
  const [schemaHidden, setSchemaHidden] = React.useState(false);
  const schema = React.useMemo(() => {
    if (mine) return null;
    const blocks = extractSchemaBlocks(msg.content || "");
    return blocks.html;
  }, [msg.content, mine]);
  const textContent = React.useMemo(() => {
    if (mine) return msg.content || "";
    return stripSchemaFromText(msg.content || "");
  }, [msg.content, mine]);
  return (
    <Pressable
      onLongPress={onCopy}
      style={{
        alignSelf: mine ? "flex-end" : "flex-start",
        backgroundColor: mine ? theme.bubbleUser : theme.bubbleAi,
        padding: 14,
        borderRadius: 16,
        marginVertical: 10,
        maxWidth: "94%",
        borderWidth: mine ? 0 : 1,
        borderColor: theme.border,
      }}
    >
      {mine ? (
        <Text style={{ color: "#fff", fontSize: 15 }}>{msg.content}</Text>
      ) : (
        <>
          {textContent ? <KatexBubble content={textContent} /> : null}
          {schema && !schemaHidden ? (
            <View style={{ marginTop: 12 }}>
              <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
                <Pressable
                  onPress={() => setSchemaOpen((v) => !v)}
                  style={{
                    flex: 1,
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                    borderWidth: 1,
                    borderColor: theme.primary,
                    borderRadius: 12,
                    paddingVertical: 10,
                    paddingHorizontal: 12,
                    backgroundColor: theme.surface,
                  }}
                >
                  <Text
                    style={{
                      color: theme.primary,
                      fontSize: 13,
                      fontWeight: "700",
                      letterSpacing: 0.5,
                    }}
                  >
                    {schemaOpen ? "Masquer le schema" : "Afficher le schema"}
                  </Text>
                  <Text style={{ color: theme.primary, fontSize: 14, fontWeight: "700" }}>
                    {schemaOpen ? "\u25B2" : "\u25BC"}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    setSchemaOpen(false);
                    setSchemaHidden(true);
                  }}
                  style={{
                    borderWidth: 1,
                    borderColor: theme.danger || theme.border,
                    borderRadius: 12,
                    paddingVertical: 10,
                    paddingHorizontal: 12,
                    backgroundColor: theme.surface,
                  }}
                >
                  <Text style={{ color: theme.text, fontSize: 13, fontWeight: "700" }}>Fermer</Text>
                </Pressable>
              </View>
              {schemaOpen ? (
                <View
                  style={{
                    height: 460,
                    marginTop: 8,
                    borderRadius: 14,
                    overflow: "hidden",
                    borderWidth: 1,
                    borderColor: theme.primary,
                    backgroundColor: theme.bg,
                    shadowColor: theme.primary,
                    shadowOpacity: 0.35,
                    shadowRadius: 12,
                    shadowOffset: { width: 0, height: 0 },
                    elevation: 6,
                  }}
                >
                  <ExperienceWeb html={schema} spec={null} />
                </View>
              ) : null}
            </View>
          ) : null}
        </>
      )}
    </Pressable>
  );
}

function findSection(plan: ReturnType<typeof parsePlan>, id: string) {
  const stack = [...plan];
  while (stack.length) {
    const s = stack.pop()!;
    if (s.id === id) return s;
    s.children?.forEach((c) => stack.push(c));
  }
  return null;
}

function flattenCount(plan: ReturnType<typeof parsePlan>): number {
  let n = 0;
  const walk = (xs: typeof plan) => {
    for (const s of xs) {
      n += 1;
      if (s.children) walk(s.children);
    }
  };
  walk(plan);
  return n;
}

function flattenPlan(plan: ReturnType<typeof parsePlan>): ReturnType<typeof parsePlan> {
  const out: ReturnType<typeof parsePlan> = [];
  const walk = (xs: typeof plan) => {
    for (const s of xs) {
      out.push(s);
      if (s.children) walk(s.children);
    }
  };
  walk(plan);
  return out;
}

async function maybeSaveSchema(
  courseId: string,
  spec: string | null,
  html: string | null,
  setExp: (e: import("../types").ExperienceRow) => void
) {
  let parsed: SchemaSpec | null = null;
  if (spec) {
    try {
      parsed = JSON.parse(spec) as SchemaSpec;
    } catch {
      parsed = null;
    }
  }
  const row = {
    id: await uid("xp"),
    courseId,
    title: parsed?.titre || "Schema",
    specJson: spec || "{}",
    html: html || "<p>Specification uniquement</p>",
    status: "pending" as const,
    createdAt: Date.now(),
  };
  await saveExperience(row);
  setExp(row);
}
