import { NextResponse } from "next/server";
import { createSupabaseServerClient, requireUser } from "../../../../../lib/supabase/server";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context) {
  const supabase = await createSupabaseServerClient();
  const { id } = await context.params;
  const { data, error } = await supabase.from("timeline_comments").select("id, timeline_id, parent_id, body, created_at").eq("timeline_id", id).order("created_at");
  if (error) return NextResponse.json({ error: error.message }, { status: 404 });
  return NextResponse.json({ comments: data });
}

export async function POST(request: Request, context: Context) {
  const { supabase, user } = await requireUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const { id } = await context.params;
  const body = await request.json().catch(() => null);
  if (!body || typeof body.body !== "string" || !body.body.trim()) {
    return NextResponse.json({ error: "Comment text is required." }, { status: 400 });
  }
  const commentBody = body.body.trim();
  if (Array.from(commentBody).length > 5000) {
    return NextResponse.json({ error: "Comments must be 5000 characters or fewer." }, { status: 400 });
  }

  const { data: timeline } = await supabase.from("timelines").select("id").eq("id", id).maybeSingle();
  if (!timeline) return NextResponse.json({ error: "Timeline not found." }, { status: 404 });

  const parentId = body.parentId ?? null;
  if (parentId !== null) {
    if (typeof parentId !== "string") {
      return NextResponse.json({ error: "Invalid parent comment." }, { status: 400 });
    }
    const { data: parent } = await supabase.from("timeline_comments").select("id, timeline_id").eq("id", parentId).maybeSingle();
    if (!parent || parent.timeline_id !== id) {
      return NextResponse.json({ error: "Parent comment must belong to this timeline." }, { status: 400 });
    }
  }

  const { data, error } = await supabase.from("timeline_comments").insert({ timeline_id: id, author_id: user.id, parent_id: parentId, body: commentBody }).select("id, timeline_id, parent_id, body, created_at").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ comment: data }, { status: 201 });
}
