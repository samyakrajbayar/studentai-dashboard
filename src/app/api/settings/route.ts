import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { createClient } from "@libsql/client";

const client = createClient({
  url: process.env.TURSO_CONNECTION_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN!,
});

async function ensure() {
  await client.execute(`CREATE TABLE IF NOT EXISTS settings (
    user_id TEXT PRIMARY KEY,
    accent TEXT DEFAULT '#7c3aed',
    dark INTEGER DEFAULT 0
  );`);
}

export async function GET() {
  await ensure();
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const r = await client.execute({ sql: `SELECT * FROM settings WHERE user_id = ?`, args: [session.user.id] });
  const row = r.rows[0] as any;
  return NextResponse.json(row || { user_id: session.user.id, accent: "#7c3aed", dark: 0 });
}

export async function POST(req: NextRequest) {
  await ensure();
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { accent, dark } = await req.json();
  await client.execute({ sql: `INSERT INTO settings (user_id, accent, dark) VALUES(?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET accent = excluded.accent, dark = excluded.dark`, args: [session.user.id, accent, dark ? 1 : 0] });
  return NextResponse.json({ ok: true });
}