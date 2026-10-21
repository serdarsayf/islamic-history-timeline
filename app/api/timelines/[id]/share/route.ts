import { NextResponse } from "next/server";
import { requireUser } from "../../../../../lib/supabase/server";

type Context = { params: Promise<{ id: string }> };

export async function POST(_request: Request, context: Context) {
  const { supabase, user } = await requireUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const { id } = await context.params;
  const { data, error } = await supabase.from("timelines").update({ is_public: true }).eq("id", id).eq("owner_id", user.id).select("slug, is_public").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ url: `${new URL("/", _request.url).origin}/timeline/${data.slug}`, timeline: data });
}
