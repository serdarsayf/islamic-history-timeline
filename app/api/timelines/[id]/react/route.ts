import { NextResponse } from "next/server";
import { requireUser } from "../../../../../lib/supabase/server";

type Context = { params: Promise<{ id: string }> };

export async function POST(_request: Request, context: Context) {
  const { supabase, user } = await requireUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const { id } = await context.params;
  const { error } = await supabase.from("timeline_likes").upsert({ timeline_id: id, user_id: user.id });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ liked: true });
}

export async function DELETE(_request: Request, context: Context) {
  const { supabase, user } = await requireUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const { id } = await context.params;
  const { error } = await supabase.from("timeline_likes").delete().eq("timeline_id", id).eq("user_id", user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ liked: false });
}
