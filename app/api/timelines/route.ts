import { NextResponse } from "next/server";
import { requireUser } from "../../../lib/supabase/server";

export async function GET() {
  const { supabase, user } = await requireUser();
  const query = supabase.from("timelines").select("*").order("updated_at", { ascending: false });
  const { data, error } = user ? await query.eq("owner_id", user.id) : await query.eq("is_public", true);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ timelines: data });
}

export async function POST(request: Request) {
  const { supabase, user } = await requireUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const parsedBody: unknown = await request.json().catch(() => null);
  if (!parsedBody || typeof parsedBody !== "object" || Array.isArray(parsedBody)) {
    return NextResponse.json({ error: "A valid timeline request is required." }, { status: 400 });
  }
  const body = parsedBody as Record<string, unknown>;
  const title = typeof body.title === "string" ? body.title.trim() : "";
  const slug = typeof body.slug === "string" ? body.slug.trim() : "";
  if (!title || !/^[a-z0-9-]+$/.test(slug)) return NextResponse.json({ error: "Title and a URL-safe slug are required." }, { status: 400 });
  const { data, error } = await supabase.from("timelines").insert({ owner_id: user.id, title, slug, description: body.description ?? "", is_public: Boolean(body.isPublic) }).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ timeline: data }, { status: 201 });
}
