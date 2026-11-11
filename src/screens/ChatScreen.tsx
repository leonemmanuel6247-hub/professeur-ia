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
import * as DocumentPicker from "expo-document-picker";
import * as Clipboard from "expo-clipboard";
import { useAppStore } from "../store/useAppStore";
import { Btn, Chip, Screen, ProgressBar } from "../components/ui";
import { DiamondLogo } from "../components/DiamondLogo";
import { MarkdownView } from "../components/MarkdownView";
import { ExperienceWeb } from "../components/ExperienceWeb";
import type { RootStackParamList } from "../nav-types";
import { ChatMessage, Course, SchemaSpec } from "../types";
import { countChunks, getCourse, parsePlan, saveExperience, saveLesson, updateCourse, listLessons, ensureFreeChatCourse, isFreeChatCourse } from "../services/courses";
import { ingestIntoCourse } from "../services/ingest";
import {
  addMessage,
  createConversation,
  listConversations,
  listMessages,
} from "../services/conversations";
import { buildProfessorMessages, extractSchemaBlocks, stripFinishMarker, stripSchemaFromText } from "../services/context";
import { chatUntilFinished } from "../llm/router";
import { orderedForRole } from "../services/providers";
import { uid, logError } from "../db/database";
import { guessMime, readAsBase64, fileSize } from "../services/pdf";
import { LlmMessage } from "../llm/types";

type Attachment = { uri: string; mimeType: string; kind: "image" | "file"; fileName?: string };

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
  const setActiveCourse = useAppStore((s) => s.setActiveCourse);
  const refresh = useAppStore((s) => s.refresh);
  const route = useRoute();
  const params = ((route.params || {}) as RootStackParamList["Chat"]);
  const courseId = params.courseId || storeCourseId || "";

  const [course, setCourse] = useState<Course | null>(null);
  const [convId, setConvId] = useState(params.conversationId || "");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const abortRef = useRef<AbortController | null>(null);
  const sendStartRef = useRef(0);
  const runIdRef = useRef(0);
  const messagesRef = useRef<ChatMessage[]>([]);
  const listRef = useRef<FlatList>(null);
  const convIdRef = useRef(params.conversationId || "");
  const sendingRef = useRef(false);
  const [ingesting, setIngesting] = useState<{ step: string; ratio: number } | null>(null);
  const [pendingIntro, setPendingIntro] = useState(false);
  const nav = useNavigation<NavigationProp<RootStackParamList>>();

  const planSections = course && params.mode === "lesson" ? flattenPlan(parsePlan(course.planJson)) : [];
  const currentIdx = params.sectionId ? planSections.findIndex((s) => s.id === params.sectionId) : -1;

  const goToSection = (idx: number) => {
    const target = planSections[idx];
    if (!target) return;
    messagesRef.current = [];
    setMessages([]);
    setInput("");
    nav.setParams({ sectionId: target.id, mode: "lesson" } as any);
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!courseId) return;
      const c = await getCourse(courseId);
      if (cancelled) return;
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
      if (cancelled || sendingRef.current) return;
      const conversationChanged = cid !== convIdRef.current;
      if (conversationChanged) {
        convIdRef.current = cid!;
        setConvId(cid!);
        const loaded = await listMessages(cid!);
        if (cancelled || sendingRef.current) return;
        messagesRef.current = loaded;
        setMessages(loaded);
      }
      if (params.mode === "lesson" && params.sectionId && c && !sendingRef.current) {
        const plan = parsePlan(c.planJson);
        const section = findSection(plan, params.sectionId);
        if (section && messagesRef.current.length === 0) {
          setInput(`Commence la lecon : ${section.title} (pages ${section.pageStart}-${section.pageEnd}).`);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseId, params.conversationId, params.sectionId]);

  const send = async (text: string, extra?: string, attachment?: Attachment) => {
    if (!course || !(convIdRef.current || convId)) {
      Alert.alert("Pas de cours", "Ouvre d'abord un cours depuis la bibliotheque.");
      return;
    }
    if (!profiles.length) {
      Alert.alert("Profil IA", "Ajoute une cle dans Profils IA.");
      return;
    }
    const userText = text.trim();
    if (!userText && !attachment) return;
    if (ingesting) return;
    if (streaming) {
      try {
        abortRef.current?.abort();
      } catch {
        /* ignore */
      }
      setStreaming(false);
      sendStartRef.current = 0;
    }
    abortRef.current = null;
    sendingRef.current = true;
    const runId = ++runIdRef.current;
    const ac = new AbortController();
    abortRef.current = ac;
    let assistantId = "";
    try {
      if (!isFreeChatCourse(course)) {
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
      }
      setInput("");
      const activeConvId = convIdRef.current || convId;
      const joinedLabel = attachment?.kind === "file" ? "(PDF joint)" : "(image jointe)";
      const um = await addMessage({ conversationId: activeConvId, role: "user", content: userText || joinedLabel, tokens: 0 });
      messagesRef.current = [...messagesRef.current, um];
      setMessages([...messagesRef.current]);
      assistantId = await uid("msg");
      const placeholder: ChatMessage = {
        id: assistantId,
        conversationId: activeConvId,
        role: "assistant",
        content: "",
        tokens: 0,
        createdAt: Date.now(),
      };
      messagesRef.current = [...messagesRef.current, placeholder];
      setMessages([...messagesRef.current]);
      sendStartRef.current = Date.now();
      setStreaming(true);
      const history = messagesRef.current
        .filter((x) => x.role !== "system" && x.id !== assistantId && x.content)
        .slice(-12)
        .map((x) => ({ role: x.role as "user" | "assistant", content: x.content }));
      const tpl =
        params.mode === "lesson"
          ? settings.prompts.lecon || settings.prompts.professeur
          : settings.prompts.professeur;
      const freeNote = isFreeChatCourse(course)
        ? "MODE DISCUSSION LIBRE : aucun cours n'est charge. Si l'eleve a joint un document, appuie-toi dessus ; sinon reponds normalement comme professeur de sciences."
        : "";
      const mergedExtra = [extra, freeNote].filter(Boolean).join("\n") || undefined;
      const activeProfile =
        profiles.find((p) => p.id === settings.defaultProviderId) || profiles[0];
      let built = await buildProfessorMessages({
        systemTpl: tpl,
        course,
        userText: userText || joinedLabel,
        history,
        maxContext: Math.max(4096, activeProfile?.maxContext || 128000),
        horsCours: settings.horsCoursEnabled,
        extraInstruction: mergedExtra,
      });
      if (attachment) {
        const b64 = await readAsBase64(attachment.uri);
        if (attachment.kind === "file") {
          built = built.map((msg, idx) =>
            idx === built.length - 1
              ? {
                  role: "user" as const,
                  content: [
                    { type: "text" as const, text: userText || "Voici le PDF. Lis-le puis reponds en professeur a mes questions." },
                    {
                      type: "file" as const,
                      mimeType: attachment.mimeType,
                      dataBase64: b64,
                      fileName: attachment.fileName ?? "document.pdf",
                    },
                  ],
                }
              : msg
          ) as LlmMessage[];
        } else {
          const mime = await guessMime(attachment.uri, attachment.mimeType || "image/jpeg");
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
      }
      const ordered = orderedForRole(profiles, "default", settings.defaultProviderId);
      let lastPaint = 0;
      const res = await chatUntilFinished(ordered, built, {
        abortSignal: ac.signal,
        maxTokens: Math.max(4096, Math.floor((activeProfile?.maxContext || 128000) * 0.5)),
        onToken: (chunk) => {
          messagesRef.current = messagesRef.current.map((x) =>
            x.id === assistantId ? { ...x, content: (x.content || "") + chunk } : x
          );
          // On accumule toujours dans messagesRef (source de verite), mais on ne
          // repeint l'ecran qu'au plus toutes les 80 ms : indispensable pour les
          // generations tres longues (aucune limite de duree cote provider).
          const now = Date.now();
          if (now - lastPaint >= 80) {
            lastPaint = now;
            setMessages([...messagesRef.current]);
          }
        },
      });
      const finalText = res.text && res.text.trim()
        ? stripFinishMarker(res.text)
        : "(Reponse vide recue du fournisseur. Verifie le modele et l'URL dans Profils IA.)";
      await addMessage({
        id: assistantId,
        conversationId: convIdRef.current || convId,
        role: "assistant",
        content: finalText,
        tokens: res.completionTokens,
      });
      messagesRef.current = messagesRef.current.map((x) =>
        x.id === assistantId ? { ...x, content: finalText, tokens: res.completionTokens } : x
      );
      setMessages([...messagesRef.current]);
      const blocks = extractSchemaBlocks(finalText);
      if (blocks.spec || blocks.html) {
        await maybeSaveSchema(course.id, blocks.spec, blocks.html, setExp);
      }
      if (params.mode === "lesson" && params.sectionId) {
        await saveLesson({
          id: `${course.id}_${params.sectionId}`,
          courseId: course.id,
          sectionId: params.sectionId,
          content: finalText,
          status: "seen",
        });
        const lessons = await listLessons(course.id);
        const planLen = Math.max(1, flattenCount(parsePlan(course.planJson)));
        await updateCourse(course.id, { progress: Math.min(1, lessons.length / planLen) });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await logError(msg);
      if (assistantId) {
        messagesRef.current = messagesRef.current.map((x) =>
          x.id === assistantId ? { ...x, content: x.content || `Erreur : ${msg}` } : x
        );
        setMessages([...messagesRef.current]);
      }
      const aborted = ac.signal.aborted || /arretee|aborted/i.test(msg);
      if (!aborted && runId === runIdRef.current) Alert.alert("Generation", msg);
    } finally {
      if (runId === runIdRef.current) {
        sendingRef.current = false;
        setStreaming(false);
        abortRef.current = null;
      }
    }
  };

  const handleAsset = async (asset: { uri: string; name: string; mimeType?: string }) => {
    if (!course || ingesting) return;
    const isPdf = /pdf/i.test(asset.mimeType || asset.name);
    if (!isFreeChatCourse(course)) {
      // Cours charge : piece jointe ponctuelle dans le message (comme avant).
      await send(input, undefined, {
        uri: asset.uri,
        mimeType: asset.mimeType || (isPdf ? "application/pdf" : "image/jpeg"),
        kind: isPdf ? "file" : "image",
        fileName: asset.name,
      });
      return;
    }
    // Discussion libre : le document est traite EXACTEMENT comme un import normal
    // (extraction -> fiche d'identite + plan par l'IA -> RAG), puis le cours
    // devient un cours ordinaire.
    const ordered = orderedForRole(profiles, "documents", settings.documentsProviderId || settings.defaultProviderId);
    if (!ordered.length) {
      Alert.alert("Profil IA", "Ajoute une cle dans Profils IA.");
      return;
    }
    setIngesting({ step: "Lecture du document…", ratio: 0.08 });
    setInput("");
    try {
      const res = await ingestIntoCourse(
        course.id,
        { uri: asset.uri, name: asset.name || (isPdf ? "document.pdf" : "page.jpg"), mimeType: asset.mimeType },
        ordered,
        settings.prompts.ingestion,
        (step, ratio) => setIngesting({ step, ratio })
      );
      const updated = await getCourse(course.id);
      if (updated) setCourse(updated);
      await refresh();
      setIngesting(null);
      go(nav, "Course", { courseId: course.id });
    } catch (e) {
      setIngesting(null);
      Alert.alert("Import impossible", e instanceof Error ? e.message : String(e));
    }
  };

  const pickPdf = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({ type: "application/pdf", copyToCacheDirectory: true });
      if (res.canceled || !res.assets?.[0]) return;
      const asset = res.assets[0];
      try {
        const size = await fileSize(asset.uri);
        if (size > 35 * 1024 * 1024) {
          Alert.alert("PDF trop grand", "Limite : 35 Mo.");
          return;
        }
      } catch {
        /* taille inconnue : on tente quand meme */
      }
      await handleAsset({ uri: asset.uri, name: asset.name || "document.pdf", mimeType: asset.mimeType || "application/pdf" });
    } catch (e) {
      Alert.alert("PDF", e instanceof Error ? e.message : String(e));
    }
  };

  const continueWithoutCourse = async () => {
    try {
      const c = await ensureFreeChatCourse();
      setActiveCourse(c.id);
      await refresh();
      setPendingIntro(true);
      nav.setParams({ courseId: c.id } as any);
    } catch (e) {
      Alert.alert("Erreur", e instanceof Error ? e.message : String(e));
    }
  };

  useEffect(() => {
    if (!pendingIntro || !convId || !course) return;
    if (messagesRef.current.length > 0) {
      setPendingIntro(false);
      return;
    }
    setPendingIntro(false);
    void send(
      "Nous allons commencer. Je vais t'envoyer un livre (document PDF) a etudier.",
      "ANNONCE D'ACCUEIL : l'eleve va t'envoyer un LIVRE (un long document PDF) a etudier. Reponds en professeur : dis que tu es pret a recevoir le livre, explique brievement que tu vas le lire, en extraire la fiche d'identite, construire un plan, puis l'enseigner chapitre par chapitre. Termine en demandant a l'eleve de joindre le PDF (bouton PDF). Reponse courte (5 lignes max), en francais, SANS schema."
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingIntro, convId, course]);

  if (!courseId) {
    return (
      <Screen>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 28 }}>
          <DiamondLogo size={128} />
          <Text style={{ color: theme.text, fontSize: 24, fontWeight: "800", letterSpacing: -0.5, marginTop: 24, textAlign: "center" }}>
            Professeur IA
          </Text>
          <Text style={{ color: theme.textMuted, fontSize: 14, marginTop: 10, textAlign: "center", lineHeight: 21 }}>
            Choisis un cours, importe un PDF, ou continue sans cours — tu pourras joindre ton PDF directement dans la conversation.
          </Text>
          <View style={{ flexDirection: "row", gap: 10, marginTop: 28 }}>
            <Btn title="Mes cours" variant="ghost" onPress={() => go(nav, "Library")} />
            <Btn title="+ Importer" onPress={() => go(nav, "Import")} />
          </View>
          <Btn title="Continuer sans PDF" variant="accent" onPress={continueWithoutCourse} style={{ marginTop: 14, minWidth: 260 }} />
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
          extraData={messages}
          keyExtractor={(m) => m.id}
          contentContainerStyle={{ padding: 12, paddingBottom: 32 }}
          keyboardShouldPersistTaps="handled"
          removeClippedSubviews={false}
          renderItem={({ item }) => (
            <Bubble
              msg={item}
              onCopy={() => {
                Clipboard.setStringAsync(item.content).catch(() => undefined);
              }}
            />
          )}
        />
        {ingesting ? (
          <View
            style={{
              marginHorizontal: 10,
              marginTop: 6,
              padding: 12,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: theme.border,
              backgroundColor: theme.surface,
              gap: 6,
            }}
          >
            <Text style={{ color: theme.text, fontWeight: "700", fontSize: 13 }}>{ingesting.step}</Text>
            <ProgressBar value={ingesting.ratio} />
            <Text style={{ color: theme.textMuted, fontSize: 11 }}>{Math.round(ingesting.ratio * 100)} %</Text>
          </View>
        ) : null}
        {course && isFreeChatCourse(course) && messages.length === 0 ? (
          <View
            style={{
              marginHorizontal: 12,
              marginTop: 12,
              padding: 14,
              borderRadius: 14,
              borderWidth: 1,
              borderStyle: "dashed",
              borderColor: theme.border,
              backgroundColor: theme.surface,
              gap: 6,
            }}
          >
            <Text style={{ color: theme.text, fontWeight: "700" }}>Discussion libre</Text>
            <Text style={{ color: theme.textMuted, lineHeight: 19 }}>
              Joins ton PDF avec le bouton « PDF » (ou photographie une page) : il sera lu exactement comme un
              import normal — fiche d'identite, plan, lecons. Ensuite, tout fonctionne pareil.
            </Text>
          </View>
        ) : null}
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
              const shot = await ImagePicker.launchCameraAsync({ quality: 0.8 });
              if (!shot.canceled && shot.assets[0])
                await handleAsset({ uri: shot.assets[0].uri, name: `page-${Date.now()}.jpg`, mimeType: "image/jpeg" });
            }}
            style={{ minHeight: 48, minWidth: 48, alignItems: "center", justifyContent: "center" }}
          >
            <Text style={{ color: ingesting ? theme.textMuted : theme.primary, fontWeight: "700" }}>Photo</Text>
          </Pressable>
          <Pressable
            accessibilityLabel="Joindre un PDF"
            onPress={() => { if (!ingesting) void pickPdf(); }}
            style={{ minHeight: 48, minWidth: 48, alignItems: "center", justifyContent: "center" }}
          >
            <Text style={{ color: ingesting ? theme.textMuted : theme.primary, fontWeight: "700" }}>PDF</Text>
          </Pressable>
          <TextInput
            value={input}
            onChangeText={setInput}
            placeholder={course && isFreeChatCourse(course) ? "Joins ton PDF, ou pose ta question…" : "Pose une question sur le cours…"}
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
            <Btn
              title="Regen"
              variant="ghost"
              onPress={() => {
                const lastUser = [...messages].reverse().find((m) => m.role === "user");
                if (lastUser) send("Regénère ta dernière réponse, plus claire.");
              }}
            />
          )}
          <Btn title="Envoyer" onPress={() => send(input)} />
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

function Bubble({ msg, onCopy }: { msg: ChatMessage; onCopy: () => void }) {
  const theme = useAppStore((s) => s.theme);
  const mine = msg.role === "user";
  const [schemaOpen, setSchemaOpen] = React.useState(true);
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
        width: mine ? undefined : "94%",
        borderWidth: mine ? 0 : 1,
        borderColor: theme.border,
      }}
    >
      {mine ? (
        <Text style={{ color: "#fff", fontSize: 15 }}>{msg.content}</Text>
      ) : (
        <>
          {textContent ? <MarkdownView content={textContent} /> : null}
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
                    height: 520,
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
