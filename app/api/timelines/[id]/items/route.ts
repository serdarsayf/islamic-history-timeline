import { NextResponse } from "next/server";
import { requireUser } from "../../../../../lib/supabase/server";
import { isCalendarEra, isChronologicalRange, isPositiveWholeYear } from "../../../../../lib/timeline/validation";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context) {
  const { supabase } = await requireUser();
  const { id } = await context.params;
  const { data, error } = await supabase.from("timeline_items").select("*, timeline_item_tags(tag_id)").eq("timeline_id", id).order("start_year");
  if (error) return NextResponse.json({ error: error.message }, { status: 404 });
  return NextResponse.json({ items: data });
}

export async function POST(request: Request, context: Context) {
  const { supabase, user } = await requireUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const { id } = await context.params;
  const body = await request.json().catch(() => null);
  if (!body || typeof body.name !== "string" || !body.name.trim()) {
    return NextResponse.json({ error: "Item name is required." }, { status: 400 });
  }
  if (body.type !== "event" && body.type !== "period") {
    return NextResponse.json({ error: "Item type must be event or period." }, { status: 400 });
  }
  if (!isPositiveWholeYear(body.startYear) || !isCalendarEra(body.startEra)) {
    return NextResponse.json({ error: "A positive whole start year and valid era are required." }, { status: 400 });
  }
  if (body.type === "period" && (!isPositiveWholeYear(body.endYear) || !isCalendarEra(body.endEra))) {
    return NextResponse.json({ error: "Periods require a positive whole end year and valid era." }, { status: 400 });
  }
  if (body.type === "period" && !isChronologicalRange(body.startYear, body.startEra, body.endYear, body.endEra)) {
    return NextResponse.json({ error: "End date must not come before the start date." }, { status: 400 });
  }
  if (body.textPosition !== undefined && body.textPosition !== "above" && body.textPosition !== "below") {
    return NextResponse.json({ error: "Text position must be above or below." }, { status: 400 });
  }
  const { data, error } = await supabase.from("timeline_items").insert({
    timeline_id: id,
    type: body.type,
    name: body.name.trim(),
    description: typeof body.description === "string" ? body.description : "",
    box_color: typeof body.boxColor === "string" ? body.boxColor : "#dddddd",
    text_color: typeof body.textColor === "string" ? body.textColor : "#ffffff",
    start_year: body.startYear,
    start_era: body.startEra,
    end_year: body.type === "period" ? body.endYear : null,
    end_era: body.type === "period" ? body.endEra : null,
    text_position: body.textPosition ?? "above",
  }).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ item: data }, { status: 201 });
}
