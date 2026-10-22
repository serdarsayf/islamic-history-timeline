import { NextResponse } from "next/server";
import { requireUser } from "../../../../../../lib/supabase/server";
import { isCalendarEra, isChronologicalRange, isPositiveWholeYear } from "../../../../../../lib/timeline/validation";

type Context = { params: Promise<{ id: string; itemId: string }> };

export async function PATCH(request: Request, context: Context) {
  const { supabase, user } = await requireUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const { id, itemId } = await context.params;
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "A valid item update is required." }, { status: 400 });
  }

  // RLS limits updates and deletes to the owner, so there is no separate ownership lookup.
  const { data: existing, error: readError } = await supabase.from("timeline_items").select("type, start_year, start_era, end_year, end_era").eq("id", itemId).eq("timeline_id", id).maybeSingle();
  if (readError || !existing) return NextResponse.json({ error: "Item not found." }, { status: 404 });

  const updates: Record<string, unknown> = {};
  const stringFields = [
    ["name", "name"],
    ["description", "description"],
    ["boxColor", "box_color"],
    ["textColor", "text_color"],
  ] as const;
  for (const [input, column] of stringFields) {
    if (body[input] !== undefined) {
      if (typeof body[input] !== "string") return NextResponse.json({ error: `${input} must be text.` }, { status: 400 });
      updates[column] = input === "name" ? body[input].trim() : body[input];
    }
  }
  if (body.name !== undefined && !String(updates.name).trim()) {
    return NextResponse.json({ error: "Item name is required." }, { status: 400 });
  }
  if (body.type !== undefined) {
    if (body.type !== "event" && body.type !== "period") return NextResponse.json({ error: "Item type must be event or period." }, { status: 400 });
    updates.type = body.type;
  }
  for (const [input, column] of [["startYear", "start_year"], ["endYear", "end_year"]] as const) {
    if (body[input] !== undefined) {
      if (body[input] !== null && !isPositiveWholeYear(body[input])) return NextResponse.json({ error: `${input} must be a positive whole year.` }, { status: 400 });
      updates[column] = body[input];
    }
  }
  for (const [input, column] of [["startEra", "start_era"], ["endEra", "end_era"]] as const) {
    if (body[input] !== undefined) {
      if (body[input] !== null && !isCalendarEra(body[input])) return NextResponse.json({ error: `${input} must be BC or CE.` }, { status: 400 });
      updates[column] = body[input];
    }
  }
  if (body.textPosition !== undefined) {
    if (body.textPosition !== "above" && body.textPosition !== "below") return NextResponse.json({ error: "Text position must be above or below." }, { status: 400 });
    updates.text_position = body.textPosition;
  }
  if (Object.keys(updates).length === 0) return NextResponse.json({ error: "No item fields to update." }, { status: 400 });

  const next = { ...existing, ...updates };
  if (next.type === "period") {
    if (!isPositiveWholeYear(next.end_year) || !isCalendarEra(next.end_era)) {
      return NextResponse.json({ error: "Periods require a positive whole end year and valid era." }, { status: 400 });
    }
    if (!isChronologicalRange(next.start_year, next.start_era, next.end_year, next.end_era)) {
      return NextResponse.json({ error: "End date must not come before the start date." }, { status: 400 });
    }
  } else {
    updates.end_year = null;
    updates.end_era = null;
  }

  const { data, error } = await supabase.from("timeline_items").update(updates).eq("id", itemId).eq("timeline_id", id).select().maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (!data) return NextResponse.json({ error: "Item not found." }, { status: 404 });
  return NextResponse.json({ item: data });
}

export async function DELETE(_request: Request, context: Context) {
  const { supabase, user } = await requireUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const { id, itemId } = await context.params;
  const { data, error } = await supabase.from("timeline_items").delete().eq("id", itemId).eq("timeline_id", id).select("id");
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (data.length === 0) return NextResponse.json({ error: "Item not found." }, { status: 404 });
  return NextResponse.json({ ok: true });
}