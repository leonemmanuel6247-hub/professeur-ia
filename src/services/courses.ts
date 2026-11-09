import { getDb, isFtsAvailable, uid } from "../db/database";
import {
  ChunkRow,
  Course,
  CourseIdentity,
  CoursePlanSection,
  ExperienceRow,
  ExerciseRow,
  LessonRow,
  MasteryRow,
  PageRow,
} from "../types";

function courseFrom(r: Record<string, unknown>): Course {
  return {
    id: String(r.id),
    title: String(r.title),
    subject: String(r.subject),
    level: String(r.level),
    school: String(r.school ?? ""),
    createdAt: Number(r.created_at),
    progress: Number(r.progress),
    identityJson: String(r.identity_json),
    planJson: String(r.plan_json),
    sourceKind: r.source_kind as Course["sourceKind"],
    sourceName: String(r.source_name),
  };
}

export async function listCourses(): Promise<Course[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<Record<string, unknown>>(
    "SELECT * FROM courses ORDER BY created_at DESC"
  );
  return rows.map(courseFrom);
}

export async function getCourse(id: string): Promise<Course | null> {
  const db = await getDb();
  const r = await db.getFirstAsync<Record<string, unknown>>("SELECT * FROM courses WHERE id = ?", [id]);
  return r ? courseFrom(r) : null;
}

export async function createCourse(partial: Partial<Course>): Promise<Course> {
  const c: Course = {
    id: await uid("crs"),
    title: partial.title || "Nouveau cours",
    subject: partial.subject || "",
    level: partial.level || "",
    school: partial.school || "",
    createdAt: Date.now(),
    progress: 0,
    identityJson: partial.identityJson || "{}",
    planJson: partial.planJson || "[]",
    sourceKind: partial.sourceKind || "pdf",
    sourceName: partial.sourceName || "",
  };
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO courses (id, title, subject, level, school, created_at, progress, identity_json, plan_json, source_kind, source_name)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      c.id,
      c.title,
      c.subject,
      c.level,
      c.school,
      c.createdAt,
      c.progress,
      c.identityJson,
      c.planJson,
      c.sourceKind,
      c.sourceName,
    ]
  );
  return c;
}

export async function updateCourse(id: string, patch: Partial<Course>) {
  const cur = await getCourse(id);
  if (!cur) return;
  const next = { ...cur, ...patch };
  const db = await getDb();
  await db.runAsync(
    `UPDATE courses SET title=?, subject=?, level=?, school=?, progress=?, identity_json=?, plan_json=?, source_name=? WHERE id=?`,
    [
      next.title,
      next.subject,
      next.level,
      next.school,
      next.progress,
      next.identityJson,
      next.planJson,
      next.sourceName,
      id,
    ]
  );
}

export async function deleteCourse(id: string) {
  const db = await getDb();
  if (isFtsAvailable()) {
    try {
      await db.runAsync("DELETE FROM chunks_fts WHERE course_id = ?", [id]);
    } catch {
      /* fts optional */
    }
  }
  await db.runAsync("DELETE FROM chunks WHERE course_id = ?", [id]);
  await db.runAsync("DELETE FROM pages WHERE course_id = ?", [id]);
  await db.runAsync("DELETE FROM lessons WHERE course_id = ?", [id]);
  await db.runAsync("DELETE FROM conversations WHERE course_id = ?", [id]);
  await db.runAsync("DELETE FROM exercises WHERE course_id = ?", [id]);
  await db.runAsync("DELETE FROM mastery WHERE course_id = ?", [id]);
  await db.runAsync("DELETE FROM experiences WHERE course_id = ?", [id]);
  await db.runAsync("DELETE FROM courses WHERE id = ?", [id]);
}

export async function addPage(courseId: string, number: number, text: string, imageUri = "", quality = 1) {
  const db = await getDb();
  const id = await uid("pg");
  await db.runAsync(
    "INSERT INTO pages (id, course_id, number, text, image_uri, quality) VALUES (?, ?, ?, ?, ?, ?)",
    [id, courseId, number, text, imageUri, quality]
  );
  return id;
}

export async function countChunks(courseId: string): Promise<number> {
  const db = await getDb();
  const r = await db.getFirstAsync<{ n: number }>(
    "SELECT COUNT(*) as n FROM chunks WHERE course_id = ?",
    [courseId]
  );
  return r?.n ?? 0;
}

export async function listPages(courseId: string): Promise<PageRow[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<Record<string, unknown>>(
    "SELECT * FROM pages WHERE course_id = ? ORDER BY number ASC",
    [courseId]
  );
  return rows.map((r) => ({
    id: String(r.id),
    courseId: String(r.course_id),
    number: Number(r.number),
    text: String(r.text),
    imageUri: String(r.image_uri),
    quality: Number(r.quality),
  }));
}

export async function addChunk(courseId: string, pageId: string, sectionId: string, text: string) {
  const db = await getDb();
  const id = await uid("chk");
  await db.runAsync(
    "INSERT INTO chunks (id, course_id, page_id, section_id, text) VALUES (?, ?, ?, ?, ?)",
    [id, courseId, pageId, sectionId, text]
  );
  if (isFtsAvailable()) {
    try {
      await db.runAsync("INSERT INTO chunks_fts (text, chunk_id, course_id) VALUES (?, ?, ?)", [
        text,
        id,
        courseId,
      ]);
    } catch {
      /* fts optional */
    }
  }
  return id;
}

export async function searchChunks(courseId: string, query: string, k = 5): Promise<ChunkRow[]> {
  const db = await getDb();
  const safe = query.replace(/["']/g, " ").replace(/[^\p{L}\p{N}\s]/gu, " ").trim();
  if (!safe) {
    const rows = await db.getAllAsync<Record<string, unknown>>(
      "SELECT * FROM chunks WHERE course_id = ? LIMIT ?",
      [courseId, k]
    );
    return rows.map(chunkFrom);
  }
  if (isFtsAvailable()) {
    try {
      const ftsQuery = safe
        .split(/\s+/)
        .filter((w) => w.length > 2)
        .map((w) => `${w}*`)
        .join(" OR ");
      if (ftsQuery) {
        const rows = await db.getAllAsync<Record<string, unknown>>(
          `SELECT c.* FROM chunks_fts f JOIN chunks c ON c.id = f.chunk_id
           WHERE f.course_id = ? AND chunks_fts MATCH ? ORDER BY rank LIMIT ?`,
          [courseId, ftsQuery, k]
        );
        if (rows.length) return rows.map(chunkFrom);
      }
    } catch {
      /* fallback */
    }
  }
  const words = safe.split(/\s+/).filter(Boolean).slice(0, 5);
  if (words.length) {
    const like = `%${words.join("%")}%`;
    const rows = await db.getAllAsync<Record<string, unknown>>(
      "SELECT * FROM chunks WHERE course_id = ? AND text LIKE ? LIMIT ?",
      [courseId, like, k]
    );
    if (rows.length) return rows.map(chunkFrom);
    const any = await db.getAllAsync<Record<string, unknown>>(
      "SELECT * FROM chunks WHERE course_id = ? AND (" +
        words.map(() => "text LIKE ?").join(" OR ") +
        ") LIMIT ?",
      [courseId, ...words.map((w) => `%${w}%`), k]
    );
    if (any.length) return any.map(chunkFrom);
  }
  const rows = await db.getAllAsync<Record<string, unknown>>(
    "SELECT * FROM chunks WHERE course_id = ? LIMIT ?",
    [courseId, k]
  );
  return rows.map(chunkFrom);
}

function chunkFrom(r: Record<string, unknown>): ChunkRow {
  return {
    id: String(r.id),
    courseId: String(r.course_id),
    pageId: String(r.page_id),
    sectionId: String(r.section_id),
    text: String(r.text),
  };
}

export function parseIdentity(json: string): CourseIdentity {
  try {
    const o = JSON.parse(json);
    return {
      notations: o.notations ?? [],
      definitions: o.definitions ?? [],
      theorems: o.theorems ?? [],
      formulas: o.formulas ?? [],
      prerequisites: o.prerequisites ?? [],
      restrictions: o.restrictions ?? [],
      summary: o.summary ?? "",
    };
  } catch {
    return {
      notations: [],
      definitions: [],
      theorems: [],
      formulas: [],
      prerequisites: [],
      restrictions: [],
      summary: "",
    };
  }
}

export function parsePlan(json: string): CoursePlanSection[] {
  try {
    return JSON.parse(json) as CoursePlanSection[];
  } catch {
    return [];
  }
}

export async function saveLesson(row: LessonRow) {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO lessons (id, course_id, section_id, content, status) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET content=excluded.content, status=excluded.status`,
    [row.id, row.courseId, row.sectionId, row.content, row.status]
  );
}

export async function getLesson(courseId: string, sectionId: string): Promise<LessonRow | null> {
  const db = await getDb();
  const r = await db.getFirstAsync<Record<string, unknown>>(
    "SELECT * FROM lessons WHERE course_id = ? AND section_id = ?",
    [courseId, sectionId]
  );
  if (!r) return null;
  return {
    id: String(r.id),
    courseId: String(r.course_id),
    sectionId: String(r.section_id),
    content: String(r.content),
    status: r.status as LessonRow["status"],
  };
}

export async function listLessons(courseId: string): Promise<LessonRow[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<Record<string, unknown>>(
    "SELECT * FROM lessons WHERE course_id = ?",
    [courseId]
  );
  return rows.map((r) => ({
    id: String(r.id),
    courseId: String(r.course_id),
    sectionId: String(r.section_id),
    content: String(r.content),
    status: r.status as LessonRow["status"],
  }));
}

export async function saveExercise(e: ExerciseRow) {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO exercises (id, course_id, section_id, prompt, difficulty, kind, hints_json, solution, result)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET result=excluded.result`,
    [e.id, e.courseId, e.sectionId, e.prompt, e.difficulty, e.kind, e.hintsJson, e.solution, e.result]
  );
}

export async function listExercises(courseId: string): Promise<ExerciseRow[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<Record<string, unknown>>(
    "SELECT * FROM exercises WHERE course_id = ? ORDER BY rowid DESC",
    [courseId]
  );
  return rows.map((r) => ({
    id: String(r.id),
    courseId: String(r.course_id),
    sectionId: String(r.section_id),
    prompt: String(r.prompt),
    difficulty: Number(r.difficulty),
    kind: r.kind as ExerciseRow["kind"],
    hintsJson: String(r.hints_json),
    solution: String(r.solution),
    result: String(r.result),
  }));
}

export async function upsertMastery(m: MasteryRow) {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO mastery (id, course_id, notion, score, next_review, interval_days)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET score=excluded.score, next_review=excluded.next_review, interval_days=excluded.interval_days`,
    [m.id, m.courseId, m.notion, m.score, m.nextReview, m.intervalDays]
  );
}

export async function listMastery(courseId?: string): Promise<MasteryRow[]> {
  const db = await getDb();
  const rows = courseId
    ? await db.getAllAsync<Record<string, unknown>>("SELECT * FROM mastery WHERE course_id = ?", [
        courseId,
      ])
    : await db.getAllAsync<Record<string, unknown>>("SELECT * FROM mastery");
  return rows.map((r) => ({
    id: String(r.id),
    courseId: String(r.course_id),
    notion: String(r.notion),
    score: Number(r.score),
    nextReview: Number(r.next_review),
    intervalDays: Number(r.interval_days),
  }));
}

export async function saveExperience(e: ExperienceRow) {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO experiences (id, course_id, title, spec_json, html, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET html=excluded.html, status=excluded.status, spec_json=excluded.spec_json`,
    [e.id, e.courseId, e.title, e.specJson, e.html, e.status, e.createdAt]
  );
}

export async function listExperiences(courseId?: string): Promise<ExperienceRow[]> {
  const db = await getDb();
  const rows = courseId
    ? await db.getAllAsync<Record<string, unknown>>(
        "SELECT * FROM experiences WHERE course_id = ? ORDER BY created_at DESC",
        [courseId]
      )
    : await db.getAllAsync<Record<string, unknown>>("SELECT * FROM experiences ORDER BY created_at DESC");
  return rows.map((r) => ({
    id: String(r.id),
    courseId: String(r.course_id),
    title: String(r.title),
    specJson: String(r.spec_json),
    html: String(r.html),
    status: r.status as ExperienceRow["status"],
    createdAt: Number(r.created_at),
  }));
}

export async function getExperience(id: string): Promise<ExperienceRow | null> {
  const db = await getDb();
  const r = await db.getFirstAsync<Record<string, unknown>>("SELECT * FROM experiences WHERE id = ?", [
    id,
  ]);
  if (!r) return null;
  return {
    id: String(r.id),
    courseId: String(r.course_id),
    title: String(r.title),
    specJson: String(r.spec_json),
    html: String(r.html),
    status: r.status as ExperienceRow["status"],
    createdAt: Number(r.created_at),
  };
}

export const FREE_CHAT_COURSE_ID = "crs_discussion_libre";

export function isFreeChatCourse(id?: string | null): boolean {
  return !!id && id === FREE_CHAT_COURSE_ID;
}

export async function ensureFreeChatCourse(): Promise<Course> {
  const existing = await getCourse(FREE_CHAT_COURSE_ID);
  if (existing) return existing;
  const db = await getDb();
  const now = Date.now();
  const identity = JSON.stringify({
    notations: [],
    definitions: [],
    theorems: [],
    formulas: [],
    prerequisites: [],
    restrictions: [],
    summary:
      "Discussion libre : aucun cours n'est charge. L'eleve enverra ses documents (PDF ou photos) directement dans la conversation. Reponds en professeur de sciences, comme d'habitude.",
  });
  await db.runAsync(
    `INSERT OR IGNORE INTO courses (id, title, subject, level, school, created_at, progress, identity_json, plan_json, source_kind, source_name)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [FREE_CHAT_COURSE_ID, "Discussion libre", "Sans cours", "", "", now, 0, identity, "[]", "libre", "Sans PDF"]
  );
  return (await getCourse(FREE_CHAT_COURSE_ID))!;
}
