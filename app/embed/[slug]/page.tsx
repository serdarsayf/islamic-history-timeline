import { notFound } from "next/navigation";
import PublicTimelineView from "../../../components/PublicTimelineView";
import RecordTimelineView from "../../../components/RecordTimelineView";
import { createSupabaseServerClient } from "../../../lib/supabase/server";

export default async function EmbeddedTimelinePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const supabase = await createSupabaseServerClient();
  const { slug } = await params;
  const { data: timeline } = await supabase
    .from("timelines")
    .select("id, title, description, calendar, timeline_items(id, type, name, description, start_year, start_era, end_year, end_era, box_color, text_color)")
    .eq("slug", slug)
    .eq("is_public", true)
    .single();

  if (!timeline) notFound();

  return (
    <>
      <PublicTimelineView
        title={timeline.title}
        description={timeline.description}
        calendar={timeline.calendar}
        items={timeline.timeline_items ?? []}
        compact
      />
      <RecordTimelineView timelineId={timeline.id} />
    </>
  );
}
