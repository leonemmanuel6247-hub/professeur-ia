import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import { uid } from "../db/database";
import { AiProfile, Course, CoursePlanSection } from "../types";
import { LlmMessage } from "../llm/types";
import { chatWithFallback } from "../llm/router";
import { fillPrompt } from "../prompts/defaults";
import { addChunk, addPage, createCourse, updateCourse, listPages, getCourse } from "./courses";
import {
  assertSize,
  chunkText,
  extractPdfTextHeuristic,
  guessMime,
  readAsBase64,
  splitIntoPages,
} from "./pdf";

export type IngestProgress = (step: string, ratio: number) => void;

export interface IngestResult {
  course: Course;
  pageCount: number;
  usedVision: boolean;
}

function extractJson(text: string): Record<string, unknown> | null {
  const trimmed = text.trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fence ? fence[1] : trimmed;
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(raw.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

async function analyzeStructure(
  pages: { number: number; text: string }[],
  profiles: AiProfile[],
  promptTpl: string,
  onToken?: (s: string) => void
) {
  const MAX_PAGES = 40;
  const PER_PAGE = 900;
  let sampled = pages;
  if (pages.length > MAX_PAGES) {
    const step = pages.length / MAX_PAGES;
    sampled = Array.from({ length: MAX_PAGES }, (_, i) => pages[Math.floor(i * step)]);
  }
  const sample = sampled
    .map((p) => `--- PAGE ${p.number} ---\n${p.text.slice(0, PER_PAGE)}`)
    .join("\n\n");
  const prompt = fillPrompt(promptTpl, {
    pages: sample || "(document sans texte extractible)",
    totalPages: String(pages.length),
  });
  const messages: LlmMessage[] = [
    { role: "system", content: "Tu reponds uniquement en JSON valide." },
    { role: "user", content: prompt },
  ];
  const res = await chatWithFallback(profiles, messages, { temperature: 0.1, onToken });
  const json = extractJson(res.text);
  return json;
}

export async function ingestPickedFiles(
  profiles: AiProfile[],
  promptTpl: string,
  onProgress: IngestProgress
): Promise<IngestResult> {
  const picked = await DocumentPicker.getDocumentAsync({
    type: ["application/pdf", "image/*"],
    multiple: true,
    copyToCacheDirectory: true,
  });
  if (picked.canceled || !picked.assets?.length) {
    throw new Error("Import annule.");
  }
  for (const a of picked.assets) {
    if (a.uri) await assertSize(a.uri);
  }
  const pdfs = picked.assets.filter((a) => (a.mimeType || a.name || "").toLowerCase().includes("pdf"));
  const images = picked.assets.filter((a) => !pdfs.includes(a));
  if (pdfs.length) {
    return ingestPdf(pdfs[0].uri, pdfs[0].name || "cours.pdf", profiles, promptTpl, onProgress);
  }
  return ingestImages(
    images.map((a) => ({ uri: a.uri, name: a.name || "page.jpg" })),
    profiles,
    promptTpl,
    onProgress
  );
}

export async function ingestFromCamera(
  profiles: AiProfile[],
  promptTpl: string,
  onProgress: IngestProgress
): Promise<IngestResult> {
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  if (!perm.granted) throw new Error("Permission camera refusee.");
  const shot = await ImagePicker.launchCameraAsync({
    quality: 0.8,
    base64: false,
  });
  if (shot.canceled || !shot.assets?.[0]) throw new Error("Photo annulee.");
  return ingestImages(
    [{ uri: shot.assets[0].uri, name: "photo.jpg" }],
    profiles,
    promptTpl,
    onProgress
  );
}

export async function ingestFromLibrary(
  profiles: AiProfile[],
  promptTpl: string,
  onProgress: IngestProgress
): Promise<IngestResult> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) throw new Error("Permission photos refusee.");
  const shot = await ImagePicker.launchImageLibraryAsync({
    quality: 0.8,
    allowsMultipleSelection: true,
  });
  if (shot.canceled || !shot.assets?.length) throw new Error("Selection annulee.");
  return ingestImages(
    shot.assets.map((a, i) => ({ uri: a.uri, name: `page-${i + 1}.jpg` })),
    profiles,
    promptTpl,
    onProgress
  );
}

function looksLikeRealText(text: string): boolean {
  const t = text.trim();
  if (t.length < 200) return false;
  const letters = (t.match(/[\p{L}]/gu) || []).length;
  const spaces = (t.match(/\s/g) || []).length;
  const symbols = (t.match(/[^\p{L}\p{N}\s.,;:!?'"()\-+*/=<>%°]/gu) || []).length;
  if (letters < 120) return false;
  if (spaces < t.length * 0.05) return false;
  if (symbols > letters * 0.5) return false;
  const words = t.split(/\s+/).filter((w) => /[\p{L}]{2,}/u.test(w)).length;
  return words > 30;
}

async function extractPdfPages(
  uri: string,
  name: string,
  profiles: AiProfile[],
  onProgress: IngestProgress
): Promise<{ pages: { number: number; text: string }[]; usedVision: boolean }> {
  onProgress("Lecture du PDF…", 0.1);
  const b64 = await readAsBase64(uri);
  const readers = profiles.filter((p) => p.supportsNativePdf);
  let pages: { number: number; text: string }[] = [];
  let usedVision = false;

  const heuristic = extractPdfTextHeuristic(b64);
  const heuristicOk = looksLikeRealText(heuristic);
  if (readers.length) {
    onProgress("Envoi du PDF au fournisseur...", 0.2);
    usedVision = true;
    const mime = await guessMime(name, "application/pdf");
    const res = await chatWithFallback(readers, [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: "Extrais tout le texte du document, page par page, sous la forme:\n===PAGE n===\ntexte",
          },
          { type: "file", mimeType: mime, dataBase64: b64, fileName: name },
        ],
      },
    ]);
    pages = parsePageMarkers(res.text);
    if (!pages.length && heuristicOk) {
      pages = splitIntoPages(heuristic).map((t, i) => ({ number: i + 1, text: t }));
    }
  } else if (heuristicOk) {
    onProgress("Texte natif detecte", 0.25);
    pages = splitIntoPages(heuristic).map((t, i) => ({ number: i + 1, text: t }));
  } else {
    const vision = profiles.filter((p) => p.supportsVision);
    if (!vision.length) {
      throw new Error(
        "PDF sans texte extractible. Ajoute un profil avec lecture PDF ou vision dans Profils IA."
      );
    }
    onProgress("PDF scanne : lecture par vision...", 0.2);
    usedVision = true;
    const res = await chatWithFallback(vision, [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: "Ce PDF n'a pas de texte natif exploitable. Analyse le document fourni et transcris son contenu page par page sous la forme:\n===PAGE n===\ntexte.\nSi vraiment illisible, reponds DOCUMENT_ILLISIBLE.",
          },
          { type: "file", mimeType: "application/pdf", dataBase64: b64, fileName: name },
        ],
      },
    ]);
    if (/DOCUMENT_ILLISIBLE/i.test(res.text) || res.text.length < 40) {
      throw new Error("Document illisible. Photographie les pages une par une.");
    }
pages = splitIntoPages(res.text).map((t, i) => ({ number: i + 1, text: t }));
  }

  if (!pages.length) throw new Error("Aucune page extraite.");
  const totalChars = pages.reduce((s, p) => s + p.text.trim().length, 0);
  if (totalChars < 200) {
    throw new Error(
      "Le texte extrait du PDF est quasiment vide. Le document est probablement scanne sans couche texte. Utilise un profil Gemini (lecture PDF native) ou photographie les pages."
    );
  }
  return { pages, usedVision };
}

async function ingestPdf(
  uri: string,
  name: string,
  profiles: AiProfile[],
  promptTpl: string,
  onProgress: IngestProgress
): Promise<IngestResult> {
  const { pages, usedVision } = await extractPdfPages(uri, name, profiles, onProgress);
  return persistCourse(name, "pdf", pages, profiles, promptTpl, onProgress, usedVision);
}

async function extractImagePages(
  files: { uri: string; name: string }[],
  vision: AiProfile[],
  onProgress: IngestProgress
): Promise<{ number: number; text: string }[]> {
  if (!vision.length) throw new Error("Aucun profil avec vision. Ajoute Gemini ou un modele vision.");
  const pages: { number: number; text: string }[] = [];
  for (let i = 0; i < files.length; i++) {
    onProgress(`Lecture image ${i + 1}/${files.length}…`, 0.1 + (0.5 * i) / files.length);
    const b64 = await readAsBase64(files[i].uri);
    const mime = await guessMime(files[i].name, "image/jpeg");
    const res = await chatWithFallback(vision, [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: "Transcris integralement cette page de cours (texte + formules LaTeX). Indique [illisible] si une zone est floue.",
          },
          { type: "image_url", image_url: { url: `data:${mime};base64,${b64}` } },
        ],
      },
    ]);
    pages.push({ number: i + 1, text: res.text });
  }
  const totalChars = pages.reduce((s, p) => s + p.text.trim().length, 0);
  if (totalChars < 50) {
    throw new Error(
      "La transcription des images est vide. Verifie que le profil image est bien un modele vision (Gemini) et que les photos sont nettes."
    );
  }
  return pages;
}

async function ingestImages(
  files: { uri: string; name: string }[],
  profiles: AiProfile[],
  promptTpl: string,
  onProgress: IngestProgress
): Promise<IngestResult> {
  const vision = profiles.filter((p) => p.supportsVision);
  const pages = await extractImagePages(files, vision, onProgress);
  return persistCourse(
    files.length > 1 ? "Cours (images)" : files[0].name,
    "images",
    pages,
    profiles,
    promptTpl,
    onProgress,
    true
  );
}

function parsePageMarkers(text: string): { number: number; text: string }[] {
  const parts = text.split(/===PAGE\s+(\d+)===/i);
  if (parts.length < 3) return splitIntoPages(text).map((t, i) => ({ number: i + 1, text: t }));
  const out: { number: number; text: string }[] = [];
  for (let i = 1; i < parts.length; i += 2) {
    out.push({ number: Number(parts[i]) || out.length + 1, text: (parts[i + 1] || "").trim() });
  }
  return out.filter((p) => p.text);
}

async function persistCourse(
  sourceName: string,
  kind: Course["sourceKind"],
  pages: { number: number; text: string }[],
  profiles: AiProfile[],
  promptTpl: string,
  onProgress: IngestProgress,
  usedVision: boolean
): Promise<IngestResult> {
  onProgress("Creation du cours…", 0.65);
  let course = await createCourse({
    title: sourceName.replace(/\.[^.]+$/, "") || "Nouveau cours",
    sourceKind: kind,
    sourceName,
  });
  for (const p of pages) {
    const pageId = await addPage(course.id, p.number, p.text, "", p.text.length > 80 ? 1 : 0.4);
    const chunks = chunkText(p.text);
    for (const c of chunks) {
      await addChunk(course.id, pageId, "", c);
    }
  }
  course = await analyzeAndUpdate(course, pages, profiles, promptTpl, onProgress);
  onProgress("Termine", 1);
  return { course, pageCount: pages.length, usedVision };
}

async function analyzeAndUpdate(
  course: Course,
  pages: { number: number; text: string }[],
  profiles: AiProfile[],
  promptTpl: string,
  onProgress: IngestProgress
): Promise<Course> {
  onProgress("Analyse structure (plan, notations)…", 0.8);
  try {
    const json = await analyzeStructure(pages, profiles, promptTpl);
    if (json) {
      const identity = json.identity ?? {};
      const plan = (json.plan as CoursePlanSection[]) || fallbackPlan(pages.length);
      const title = String(json.title || course.title);
      const subject = String(json.subject || "");
      const level = String(json.level || "");
      await updateCourse(course.id, {
        title,
        subject,
        level,
        identityJson: JSON.stringify(identity),
        planJson: JSON.stringify(plan),
      });
      return {
        ...course,
        title,
        subject,
        level,
        identityJson: JSON.stringify(identity),
        planJson: JSON.stringify(plan),
      };
    }
  } catch {
    /* analyse impossible : plan de secours */
  }
  const planJson = JSON.stringify(fallbackPlan(Math.max(1, pages.length)));
  await updateCourse(course.id, { planJson });
  return { ...course, planJson };
}

/**
 * Ingest a PDF or image into an EXISTING course (used by the "discussion libre"
 * button: the document attached in the chat is processed exactly like a normal
 * import — extraction, chunks FTS, fiche d'identite, plan — then the course
 * becomes a regular course like any other).
 */
export async function ingestIntoCourse(
  courseId: string,
  asset: { uri: string; name: string; mimeType?: string },
  profiles: AiProfile[],
  promptTpl: string,
  onProgress: IngestProgress
): Promise<IngestResult> {
  await assertSize(asset.uri);
  const isPdf = /pdf/i.test(asset.mimeType || asset.name || "");
  const kind: Course["sourceKind"] = isPdf ? "pdf" : "images";
  const assetName = asset.name || (isPdf ? "document.pdf" : "page.jpg");
  const baseName = assetName.replace(/\.[^.]+$/, "") || (isPdf ? "Document" : "Page");

  const already = await listPages(courseId);
  const offset = already.length;

  let fresh: { number: number; text: string }[] = [];
  let usedVision = false;
  if (isPdf) {
    const extracted = await extractPdfPages(asset.uri, assetName, profiles, onProgress);
    fresh = extracted.pages;
    usedVision = extracted.usedVision;
  } else {
    const vision = profiles.filter((p) => p.supportsVision);
    fresh = await extractImagePages([{ uri: asset.uri, name: assetName }], vision, onProgress);
    usedVision = true;
  }

  const pages = fresh.map((p, i) => ({ ...p, number: offset + i + 1 }));
  onProgress("Creation du cours…", 0.65);
  for (const p of pages) {
    const pageId = await addPage(courseId, p.number, p.text, "", p.text.length > 80 ? 1 : 0.4);
    const chunks = chunkText(p.text);
    for (const c of chunks) {
      await addChunk(courseId, pageId, "", c);
    }
  }

  const allPages = [...already.map((r) => ({ number: r.number, text: r.text })), ...pages];
  let course = await getCourse(courseId);
  if (!course) throw new Error("Cours introuvable.");
  const shouldRename = course.title === "Discussion libre" || course.sourceName === "Sans PDF";
  const patch: Partial<Course> = {
    sourceKind: kind,
    sourceName: assetName,
    ...(shouldRename ? { title: baseName } : {}),
  };
  await updateCourse(courseId, patch);
  course = { ...course, ...patch };
  course = await analyzeAndUpdate(course, allPages, profiles, promptTpl, onProgress);
  onProgress("Termine", 1);
  return { course, pageCount: pages.length, usedVision };
}

function fallbackPlan(n: number): CoursePlanSection[] {
  return [{ id: "s1", title: "Document entier", pageStart: 1, pageEnd: n }];
}

export async function dummyId() {
  return uid("tmp");
}
