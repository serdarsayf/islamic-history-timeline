import { NextResponse } from "next/server";
import { createSupabaseServerClient, requireUser } from "../../../../lib/supabase/server";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const supabase = await createSupabaseServerClient();
  const { id } = await context.params;
  const { data, error } = await supabase.from("timelines").select("*, timeline_items(*, timeline_item_tags(tag_id)), timeline_tags(*)").eq("id", id).single();
  if (error) return NextResponse.json({ error: error.message }, { status: 404 });
  return NextResponse.json({ timeline: data });
}

export async function PATCH(request: Request, context: RouteContext) {
  const { supabase, user } = await requireUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const { id } = await context.params;
  const parsedBody: unknown = await request.json().catch(() => null);
  if (!parsedBody || typeof parsedBody !== "object" || Array.isArray(parsedBody)) {
    return NextResponse.json({ error: "A valid timeline update is required." }, { status: 400 });
  }
  const body = parsedBody as Record<string, unknown>;
  const updates = Object.fromEntries(Object.entries({ title: body.title, description: body.description, calendar: body.calendar, is_public: body.isPublic }).filter(([, value]) => value !== undefined));
  const { data, error } = await supabase.from("timelines").update(updates).eq("id", id).eq("owner_id", user.id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ timeline: data });
}

export async function DELETE(_request: Request, context: RouteContext) {
  const { supabase, user } = await requireUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const { id } = await context.params;
  const { error } = await supabase.from("timelines").delete().eq("id", id).eq("owner_id", user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
