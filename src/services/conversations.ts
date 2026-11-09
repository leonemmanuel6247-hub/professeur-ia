import { getDb, uid } from "../db/database";
import { ChatMessage, Conversation } from "../types";

export async function listConversations(courseId?: string): Promise<Conversation[]> {
  const db = await getDb();
  const rows = courseId
    ? await db.getAllAsync<Record<string, unknown>>(
        "SELECT * FROM conversations WHERE course_id = ? ORDER BY updated_at DESC",
        [courseId]
      )
    : await db.getAllAsync<Record<string, unknown>>("SELECT * FROM conversations ORDER BY updated_at DESC");
  return rows.map((r) => ({
    id: String(r.id),
    courseId: String(r.course_id),
    title: String(r.title),
    updatedAt: Number(r.updated_at),
  }));
}

export async function createConversation(courseId: string, title: string): Promise<Conversation> {
  const c: Conversation = {
    id: await uid("cv"),
    courseId,
    title,
    updatedAt: Date.now(),
  };
  const db = await getDb();
  await db.runAsync(
    "INSERT INTO conversations (id, course_id, title, updated_at) VALUES (?, ?, ?, ?)",
    [c.id, c.courseId, c.title, c.updatedAt]
  );
  return c;
}

export async function searchConversations(q: string): Promise<Conversation[]> {
  const db = await getDb();
  const like = `%${q}%`;
  const rows = await db.getAllAsync<Record<string, unknown>>(
    `SELECT DISTINCT c.* FROM conversations c
     LEFT JOIN messages m ON m.conversation_id = c.id
     WHERE c.title LIKE ? OR m.content LIKE ?
     ORDER BY c.updated_at DESC LIMIT 50`,
    [like, like]
  );
  return rows.map((r) => ({
    id: String(r.id),
    courseId: String(r.course_id),
    title: String(r.title),
    updatedAt: Number(r.updated_at),
  }));
}

export async function listMessages(conversationId: string): Promise<ChatMessage[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<Record<string, unknown>>(
    "SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC",
    [conversationId]
  );
  return rows.map((r) => ({
    id: String(r.id),
    conversationId: String(r.conversation_id),
    role: r.role as ChatMessage["role"],
    content: String(r.content),
    tokens: Number(r.tokens),
    createdAt: Number(r.created_at),
    extraJson: String(r.extra_json ?? ""),
  }));
}

export async function addMessage(msg: Omit<ChatMessage, "id" | "createdAt"> & { id?: string }): Promise<ChatMessage> {
  const m: ChatMessage = {
    id: msg.id || (await uid("msg")),
    conversationId: msg.conversationId,
    role: msg.role,
    content: msg.content,
    tokens: msg.tokens,
    createdAt: Date.now(),
    extraJson: msg.extraJson,
  };
  const db = await getDb();
  await db.runAsync(
    "INSERT INTO messages (id, conversation_id, role, content, tokens, created_at, extra_json) VALUES (?, ?, ?, ?, ?, ?, ?)",
    [m.id, m.conversationId, m.role, m.content, m.tokens, m.createdAt, m.extraJson ?? ""]
  );
  await db.runAsync("UPDATE conversations SET updated_at = ? WHERE id = ?", [m.createdAt, m.conversationId]);
  return m;
}

export async function updateMessageContent(id: string, content: string) {
  const db = await getDb();
  await db.runAsync("UPDATE messages SET content = ? WHERE id = ?", [content, id]);
}

export async function deleteLastUserAndAfter(conversationId: string, userMessageId: string) {
  const db = await getDb();
  const row = await db.getFirstAsync<{ created_at: number }>(
    "SELECT created_at FROM messages WHERE id = ?",
    [userMessageId]
  );
  if (!row) return;
  await db.runAsync("DELETE FROM messages WHERE conversation_id = ? AND created_at >= ?", [
    conversationId,
    row.created_at,
  ]);
}
