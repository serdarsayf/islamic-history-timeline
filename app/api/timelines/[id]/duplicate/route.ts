import { NextResponse } from "next/server";
import { requireUser } from "../../../../../lib/supabase/server";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context) {
  const { supabase, user } = await requireUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const { id } = await context.params;
  const parsedBody: unknown = await request.json().catch(() => null);
  const body = parsedBody && typeof parsedBody === "object" && !Array.isArray(parsedBody)
    ? parsedBody as Record<string, unknown>
    : {};
  const requestedTitle = typeof body.title === "string" ? body.title.trim() : "";

  const { data, error } = await supabase.rpc("duplicate_timeline", {
    source_id: id,
    new_title: requestedTitle || null,
  });
  if (error) {
    // P0002 is raised by duplicate_timeline when the source is missing or not visible to the caller.
    return NextResponse.json(
      { error: error.code === "P0002" ? "Timeline not found." : error.message },
      { status: error.code === "P0002" ? 404 : 400 }
    );
  }
  return NextResponse.json({ timeline: data }, { status: 201 });
}
