import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { createClient } from "@libsql/client";

const client = createClient({
  url: process.env.TURSO_CONNECTION_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN!,
});

async function ensure() {
  await client.execute(`CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    title TEXT NOT NULL,
    start INTEGER NOT NULL,
    end INTEGER NOT NULL
  );`);
}

export async function GET() {
  await ensure();
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const r = await client.execute({ sql: `SELECT * FROM events WHERE user_id = ? ORDER BY start ASC`, args: [session.user.id] });
  return NextResponse.json(r.rows);
}

export async function POST(req: NextRequest) {
  await ensure();
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { title, start, end } = await req.json();
  const r = await client.execute({ sql: `INSERT INTO events (user_id, title, start, end) VALUES(?, ?, ?, ?)`, args: [session.user.id, title, start, end] });
  return NextResponse.json({ id: r.lastInsertRowid, title, start, end });
}

export async function PUT(req: NextRequest) {
  await ensure();
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id, title, start, end } = await req.json();
  await client.execute({ sql: `UPDATE events SET title = COALESCE(?, title), start = COALESCE(?, start), end = COALESCE(?, end) WHERE id = ? AND user_id = ?`, args: [title, start, end, id, session.user.id] });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  await ensure();
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  await client.execute({ sql: `DELETE FROM events WHERE id = ? AND user_id = ?`, args: [id, session.user.id] });
  return NextResponse.json({ ok: true });
}