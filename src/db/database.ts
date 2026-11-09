import * as SQLite from "expo-sqlite";

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

export function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = SQLite.openDatabaseAsync("professeur-ia.db").then(async (db) => {
      await db.execAsync("PRAGMA journal_mode = WAL;");
      await db.execAsync("PRAGMA foreign_keys = ON;");
      await migrate(db);
      return db;
    });
  }
  return dbPromise;
}

async function migrate(db: SQLite.SQLiteDatabase) {
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS providers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      base_url TEXT NOT NULL,
      model TEXT NOT NULL,
      supports_vision INTEGER NOT NULL DEFAULT 0,
      supports_native_pdf INTEGER NOT NULL DEFAULT 0,
      max_context INTEGER NOT NULL DEFAULT 128000,
      role TEXT NOT NULL DEFAULT 'default',
      sort_order INTEGER NOT NULL DEFAULT 0,
      tokens_today INTEGER NOT NULL DEFAULT 0,
      tokens_day TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS courses (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      subject TEXT NOT NULL DEFAULT '',
      level TEXT NOT NULL DEFAULT '',
      school TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL,
      progress REAL NOT NULL DEFAULT 0,
      identity_json TEXT NOT NULL DEFAULT '{}',
      plan_json TEXT NOT NULL DEFAULT '[]',
      source_kind TEXT NOT NULL DEFAULT 'pdf',
      source_name TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS pages (
      id TEXT PRIMARY KEY,
      course_id TEXT NOT NULL,
      number INTEGER NOT NULL,
      text TEXT NOT NULL DEFAULT '',
      image_uri TEXT NOT NULL DEFAULT '',
      quality REAL NOT NULL DEFAULT 1,
      FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS chunks (
      id TEXT PRIMARY KEY,
      course_id TEXT NOT NULL,
      page_id TEXT NOT NULL,
      section_id TEXT NOT NULL DEFAULT '',
      text TEXT NOT NULL,
      FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS lessons (
      id TEXT PRIMARY KEY,
      course_id TEXT NOT NULL,
      section_id TEXT NOT NULL,
      content TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'pending',
      FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      course_id TEXT NOT NULL,
      title TEXT NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      tokens INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      extra_json TEXT NOT NULL DEFAULT '',
      FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS exercises (
      id TEXT PRIMARY KEY,
      course_id TEXT NOT NULL,
      section_id TEXT NOT NULL DEFAULT '',
      prompt TEXT NOT NULL,
      difficulty INTEGER NOT NULL DEFAULT 1,
      kind TEXT NOT NULL DEFAULT 'calcul',
      hints_json TEXT NOT NULL DEFAULT '[]',
      solution TEXT NOT NULL DEFAULT '',
      result TEXT NOT NULL DEFAULT '',
      FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS mastery (
      id TEXT PRIMARY KEY,
      course_id TEXT NOT NULL,
      notion TEXT NOT NULL,
      score REAL NOT NULL DEFAULT 0,
      next_review INTEGER NOT NULL DEFAULT 0,
      interval_days REAL NOT NULL DEFAULT 1,
      FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS experiences (
      id TEXT PRIMARY KEY,
      course_id TEXT NOT NULL,
      title TEXT NOT NULL,
      spec_json TEXT NOT NULL,
      html TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at INTEGER NOT NULL,
      FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS error_log (
      id TEXT PRIMARY KEY,
      created_at INTEGER NOT NULL,
      message TEXT NOT NULL
    );
  `);

  ftsAvailable = await ensureFts(db);
}

let ftsAvailable = false;

export function isFtsAvailable(): boolean {
  return ftsAvailable;
}

async function ensureFts(db: SQLite.SQLiteDatabase): Promise<boolean> {
  try {
    await db.execAsync(`
      CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(
        text,
        chunk_id UNINDEXED,
        course_id UNINDEXED
      );
    `);
    return true;
  } catch {
    return false;
  }
}

export async function uid(prefix = ""): Promise<string> {
  const t = Date.now().toString(36);
  const r = Math.random().toString(36).slice(2, 10);
  return prefix ? `${prefix}_${t}${r}` : `${t}${r}`;
}

export async function logError(message: string) {
  const db = await getDb();
  await db.runAsync(
    "INSERT INTO error_log (id, created_at, message) VALUES (?, ?, ?)",
    [await uid("err"), Date.now(), message.slice(0, 4000)]
  );
}

export async function getErrorLog(): Promise<{ createdAt: number; message: string }[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ created_at: number; message: string }>(
    "SELECT created_at, message FROM error_log ORDER BY created_at DESC LIMIT 100"
  );
  return rows.map((r) => ({ createdAt: r.created_at, message: r.message }));
}
