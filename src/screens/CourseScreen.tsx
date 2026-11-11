import React, { useCallback, useState } from "react";
import { Alert, ScrollView, Text, TextInput, View } from "react-native";
import { NavigationProp, RouteProp, useFocusEffect, useNavigation, useRoute } from "@react-navigation/native";
import { Btn, Card, Chip, H1, H2, P, ProgressBar, Screen } from "../components/ui";
import type { RootStackParamList } from "../nav-types";
import {
  countChunks,
  getCourse,
  listExperiences,
  listLessons,
  listPages,
  parseIdentity,
  parsePlan,
  updateCourse,
} from "../services/courses";
import { deleteConversation, listConversationSummaries, ConversationSummary } from "../services/conversations";
import { exportCourseMarkdown } from "../services/export";
import { Course, CoursePlanSection, ExperienceRow } from "../types";
import { ExperienceWeb } from "../components/ExperienceWeb";
import { useAppStore } from "../store/useAppStore";
import { spacing } from "../theme";

export function CourseScreen() {
  const theme = useAppStore((s) => s.theme);
  const route = useRoute<RouteProp<RootStackParamList, "Course">>();
  const nav = useNavigation<NavigationProp<RootStackParamList>>();
  const [course, setCourse] = useState<Course | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [chunkCount, setChunkCount] = useState(0);
  const [seen, setSeen] = useState(0);
  const [experiences, setExperiences] = useState<ExperienceRow[]>([]);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [activeExp, setActiveExp] = useState<ExperienceRow | null>(null);
  const [preview, setPreview] = useState("");

  const load = async () => {
    const c = await getCourse(route.params.courseId);
    setCourse(c);
    if (c) {
      const pages = await listPages(c.id);
      setPageCount(pages.length);
      setPreview(pages[0]?.text?.slice(0, 600) ?? "");
      setChunkCount(await countChunks(c.id));
      const lessons = await listLessons(c.id);
      setSeen(lessons.filter((l) => l.status !== "pending").length);
      const exp = await listExperiences(c.id);
      setExperiences(exp);
      setConversations(await listConversationSummaries(c.id));
      setActiveExp((prev) => {
        if (prev && exp.some((e) => e.id === prev.id)) return prev;
        return exp[0] ?? null;
      });
    }
  };

  useFocusEffect(
    useCallback(() => {
      load();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [route.params.courseId])
  );

  const removeConversation = (conv: ConversationSummary) => {
    Alert.alert("Supprimer la conversation", `Supprimer « ${conv.title} » et ses messages ?`, [
      { text: "Annuler", style: "cancel" },
      {
        text: "Supprimer",
        style: "destructive",
        onPress: async () => {
          await deleteConversation(conv.id);
          await load();
        },
      },
    ]);
  };

  if (!course) {
    return (
      <Screen>
        <P>Chargement…</P>
      </Screen>
    );
  }

  const identity = parseIdentity(course.identityJson);
  const plan = parsePlan(course.planJson);
  const flat = flatten(plan);

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: 12, paddingBottom: 48 }}>
        <H1>{course.title}</H1>
        <P muted>
          {course.subject} · {course.level} · {pageCount} pages · {chunkCount} extraits
        </P>
        {chunkCount === 0 ? (
          <Text style={{ color: theme.horsCours }}>
            Aucun extrait de texte: le document n'a pas pu etre lu. Reimporte-le depuis Importer.
          </Text>
        ) : null}
        {preview ? (
          <Card>
            <H2>Extrait du document</H2>
            <P muted>{preview}</P>
          </Card>
        ) : null}
        <ProgressBar value={course.progress} />
        <View style={{ flexDirection: "row", flexWrap: "wrap", marginTop: 8 }}>
          <Chip label="Chat libre" onPress={() => nav.navigate("Chat", { courseId: course.id, mode: "free" })} />          <Chip label="Exercices" onPress={() => nav.navigate("Exercises", { courseId: course.id })} />
          <Chip label="Flashcards" onPress={() => nav.navigate("Flashcards", { courseId: course.id })} />
          <Chip
            label="Exporter MD"
            onPress={async () => {
              try {
                await exportCourseMarkdown(course);
              } catch (e) {
                Alert.alert("Export", e instanceof Error ? e.message : "echec");
              }
            }}
          />
          <Chip
            label="Fiche revision"
            onPress={async () => {
              try {
                await exportCourseMarkdown(course);
              } catch (e) {
                Alert.alert("Fiche", e instanceof Error ? e.message : "echec");
              }
            }}
          />
        </View>

        <Card>
          <H2>Fiche d'identite</H2>
          <P muted>{identity.summary || "Pas encore de resume."}</P>
          <FieldEdit
            label="Titre"
            value={course.title}
            onSave={(v) => updateCourse(course.id, { title: v }).then(load)}
          />
          <FieldEdit
            label="Matiere"
            value={course.subject}
            onSave={(v) => updateCourse(course.id, { subject: v }).then(load)}
          />
          <FieldEdit
            label="Niveau"
            value={course.level}
            onSave={(v) => updateCourse(course.id, { level: v }).then(load)}
          />
          <Text style={{ color: theme.textMuted, marginTop: 8 }}>Notations</Text>
          {identity.notations.map((n, i) => (
            <Text key={i} style={{ color: theme.text }}>
              · {n}
            </Text>
          ))}
          <Text style={{ color: theme.textMuted, marginTop: 8 }}>Restrictions</Text>
          {identity.restrictions.map((n, i) => (
            <Text key={i} style={{ color: theme.horsCours }}>
              · {n}
            </Text>
          ))}
        </Card>

        <Card>
          <H2>Plan ({flat.length} sections, {seen} vues)</H2>
          {flat.map((s, idx) => (
            <View
              key={s.id}
              style={{
                paddingVertical: 10,
                borderBottomWidth: 1,
                borderBottomColor: theme.border,
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <View style={{ flex: 1, paddingRight: 8 }}>
                <Text style={{ color: theme.text, fontWeight: "600" }}>
                  {idx + 1}. {s.title}
                </Text>
                <Text style={{ color: theme.textMuted, fontSize: 12 }}>
                  p.{s.pageStart}–{s.pageEnd}
                </Text>
              </View>
              <Btn
                title="Lecon"
                onPress={() =>
                  nav.navigate("Chat", { courseId: course.id, sectionId: s.id, mode: "lesson" })
                }
              />
            </View>
          ))}
        </Card>

        <Card>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <H2>Conversations ({conversations.length})</H2>
            <Btn
              title="+ Nouvelle"
              onPress={() =>
                nav.navigate("NewConversation", { courseId: course.id, mode: "free" })
              }
            />
          </View>
          {conversations.length === 0 ? (
            <P muted>
              Aucune conversation. Lance une discussion libre ou une lecon pour la retrouver ici.
            </P>
          ) : null}
          {conversations.map((conv) => (
            <View
              key={conv.id}
              style={{
                paddingVertical: 10,
                borderBottomWidth: 1,
                borderBottomColor: theme.border,
              }}
            >
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                <Text style={{ color: theme.text, fontWeight: "600", flex: 1, paddingRight: 8 }} numberOfLines={1}>
                  {conv.title}
                </Text>
                <Text style={{ color: theme.textMuted, fontSize: 11 }}>
                  {new Date(conv.updatedAt).toLocaleDateString("fr-FR")}
                </Text>
              </View>
              <Text style={{ color: theme.textMuted, fontSize: 12, marginTop: 4 }} numberOfLines={2}>
                {conv.messageCount} message{conv.messageCount > 1 ? "s" : ""}
                {conv.preview ? ` · ${conv.preview}` : ""}
              </Text>
              <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
                <Btn
                  title="Ouvrir"
                  onPress={() =>
                    nav.navigate("Chat", {
                      courseId: course.id,
                      conversationId: conv.id,
                      mode: "free",
                    })
                  }
                  style={{ flex: 1 }}
                />
                <Btn
                  title="Supprimer"
                  variant="danger"
                  onPress={() => removeConversation(conv)}
                  style={{ flex: 1 }}
                />
              </View>
            </View>
          ))}
        </Card>

        {experiences.length ? (
          <Card>
            <H2>Schemas ({experiences.length})</H2>
            <View style={{ flexDirection: "row", flexWrap: "wrap", marginBottom: 8 }}>
              {experiences.map((e, i) => (
                <Chip
                  key={e.id}
                  label={e.title || `Schema ${i + 1}`}
                  active={activeExp?.id === e.id}
                  onPress={() => setActiveExp(e)}
                />
              ))}
            </View>
            {activeExp ? (
              <View style={{ height: 420, borderRadius: 12, overflow: "hidden", borderWidth: 1, borderColor: theme.border }}>
                <ExperienceWeb html={activeExp.html} spec={parseSpec(activeExp.specJson)} />
              </View>
            ) : null}
          </Card>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

function parseSpec(json: string): import("../types").SchemaSpec | null {
  try {
    return JSON.parse(json) as import("../types").SchemaSpec;
  } catch {
    return null;
  }
}

function flatten(plan: CoursePlanSection[], acc: CoursePlanSection[] = []): CoursePlanSection[] {
  for (const s of plan) {
    acc.push(s);
    if (s.children) flatten(s.children, acc);
  }
  return acc;
}

function FieldEdit({ label, value, onSave }: { label: string; value: string; onSave: (v: string) => void }) {
  const theme = useAppStore((s) => s.theme);
  const [v, setV] = useState(value);
  return (
    <View style={{ marginTop: 8 }}>
      <Text style={{ color: theme.textMuted, fontSize: 12 }}>{label}</Text>
      <TextInput
        value={v}
        onChangeText={setV}
        onEndEditing={() => onSave(v)}
        style={{
          color: theme.text,
          borderBottomWidth: 1,
          borderBottomColor: theme.border,
          minHeight: 40,
          fontSize: 16,
        }}
      />
    </View>
  );
}
