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
  const { data: source, error: sourceError } = await supabase
    .from("timelines")
    .select("title, description, calendar, timeline_tags(id, name, color), timeline_items(id, type, name, description, box_color, text_color, start_year, start_era, end_year, end_era, text_position, timeline_item_tags(tag_id))")
    .eq("id", id)
    .single();
  if (sourceError || !source) return NextResponse.json({ error: "Timeline not found." }, { status: 404 });
  const requestedTitle = typeof body.title === "string" ? body.title.trim() : "";
  const title = requestedTitle || `${source.title} Copy`;
  const slugBase = `${title}`.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "timeline-copy";
  const slug = `${slugBase}-${crypto.randomUUID().slice(0, 8)}`;
  const { data: duplicate, error } = await supabase.from("timelines").insert({
    owner_id: user.id,
    slug,
    title,
    description: source.description,
    calendar: source.calendar,
    is_public: false,
  }).select().single();
  if (error || !duplicate) return NextResponse.json({ error: error?.message ?? "Could not create timeline copy." }, { status: 400 });

  const removePartialCopy = async () => {
    await supabase.from("timelines").delete().eq("id", duplicate.id).eq("owner_id", user.id);
  };

  const sourceTags = source.timeline_tags ?? [];
  const { data: copiedTags, error: tagsError } = sourceTags.length
    ? await supabase.from("timeline_tags").insert(sourceTags.map((tag) => ({
        timeline_id: duplicate.id,
        name: tag.name,
        color: tag.color,
      }))).select("id, name")
    : { data: [], error: null };
  if (tagsError || !copiedTags) {
    await removePartialCopy();
    return NextResponse.json({ error: tagsError?.message ?? "Could not copy timeline tags." }, { status: 400 });
  }

  const tagIdByName = new Map(copiedTags.map((tag) => [tag.name, tag.id]));
  const sourceItems = source.timeline_items ?? [];
  const newIdByOldId = new Map(sourceItems.map((item) => [item.id, crypto.randomUUID()]));
  const itemRows = sourceItems.map((item) => ({
    id: newIdByOldId.get(item.id),
    timeline_id: duplicate.id,
    type: item.type,
    name: item.name,
    description: item.description,
    box_color: item.box_color,
    text_color: item.text_color,
    start_year: item.start_year,
    start_era: item.start_era,
    end_year: item.end_year,
    end_era: item.end_era,
    text_position: item.text_position,
  }));
  const { error: itemsError } = itemRows.length
    ? await supabase.from("timeline_items").insert(itemRows)
    : { error: null };
  if (itemsError) {
    await removePartialCopy();
    return NextResponse.json({ error: itemsError.message }, { status: 400 });
  }

  const itemTagRows = sourceItems.flatMap((item) =>
    (item.timeline_item_tags ?? []).flatMap(({ tag_id }) => {
      const newItemId = newIdByOldId.get(item.id);
      const tagName = sourceTags.find((tag) => tag.id === tag_id)?.name;
      const newTagId = tagName ? tagIdByName.get(tagName) : undefined;
      return newItemId && newTagId ? [{ item_id: newItemId, tag_id: newTagId }] : [];
    })
  );
  const { error: itemTagsError } = itemTagRows.length
    ? await supabase.from("timeline_item_tags").insert(itemTagRows)
    : { error: null };
  if (itemTagsError) {
    await removePartialCopy();
    return NextResponse.json({ error: itemTagsError.message }, { status: 400 });
  }

  return NextResponse.json({ timeline: duplicate }, { status: 201 });
}
