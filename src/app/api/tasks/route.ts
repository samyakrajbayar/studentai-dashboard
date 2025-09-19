import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { createClient } from "@libsql/client";

const client = createClient({
  url: process.env.TURSO_CONNECTION_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN!,
});

async function ensure() {
  await client.execute(`CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    title TEXT NOT NULL,
    done INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL DEFAULT (unixepoch('subsec'))
  );`);
}

export async function GET() {
  await ensure();
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const r = await client.execute({ sql: `SELECT * FROM tasks WHERE user_id = ? ORDER BY id DESC`, args: [session.user.id] });
  return NextResponse.json(r.rows);
}

export async function POST(req: NextRequest) {
  await ensure();
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { title } = await req.json();
  const r = await client.execute({ sql: `INSERT INTO tasks (user_id, title, done) VALUES(?, ?, 0)`, args: [session.user.id, title] });
  return NextResponse.json({ id: r.lastInsertRowid, title, done: 0 });
}

export async function PUT(req: NextRequest) {
  await ensure();
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id, done, title } = await req.json();
  await client.execute({ sql: `UPDATE tasks SET done = COALESCE(?, done), title = COALESCE(?, title) WHERE id = ? AND user_id = ?`, args: [done, title, id, session.user.id] });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  await ensure();
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  await client.execute({ sql: `DELETE FROM tasks WHERE id = ? AND user_id = ?`, args: [id, session.user.id] });
  return NextResponse.json({ ok: true });
}