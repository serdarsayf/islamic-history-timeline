import { NextResponse } from "next/server";
import { requireUser } from "../../../../../lib/supabase/server";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context) {
  const { supabase, user } = await requireUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const { id } = await context.params;
  const { data: timeline } = await supabase.from("timelines").select("id").eq("id", id).eq("owner_id", user.id).maybeSingle();
  if (!timeline) return NextResponse.json({ error: "Timeline not found." }, { status: 404 });
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "A valid multipart upload is required." }, { status: 400 });
  }
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return NextResponse.json({ error: "A file is required." }, { status: 400 });
  if (file.size > 10 * 1024 * 1024) return NextResponse.json({ error: "Files must be 10 MB or smaller." }, { status: 400 });

  const path = `${user.id}/${id}/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
  const { error: uploadError } = await supabase.storage.from("timeline-assets").upload(path, file, { contentType: file.type, upsert: false });
  if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 400 });

  const { data, error } = await supabase.from("timeline_assets").insert({ timeline_id: id, owner_id: user.id, storage_path: path, file_name: file.name, mime_type: file.type || "application/octet-stream" }).select().single();
  if (error) {
    const { error: cleanupError } = await supabase.storage.from("timeline-assets").remove([path]);
    return NextResponse.json({
      error: cleanupError
        ? `${error.message} Uploaded file cleanup failed: ${cleanupError.message}`
        : error.message,
    }, { status: 400 });
  }
  return NextResponse.json({ asset: data }, { status: 201 });
}
