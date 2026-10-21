import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { requireUser } from "../../../../../lib/supabase/server";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context) {
  const { supabase } = await requireUser();
  const { id } = await context.params;
  const cookieStore = await cookies();
  const existingViewerKey = cookieStore.get("timeline-viewer")?.value;
  const viewerKey = existingViewerKey ?? randomUUID();
  const { error } = await supabase.from("timeline_views").upsert(
    { timeline_id: id, viewer_key: viewerKey },
    { onConflict: "timeline_id,viewer_key", ignoreDuplicates: true }
  );
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const response = NextResponse.json({ recorded: true });
  if (!existingViewerKey) {
    response.cookies.set("timeline-viewer", viewerKey, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 60 * 60 * 24 * 365,
      path: "/",
    });
  }
  return response;
}
