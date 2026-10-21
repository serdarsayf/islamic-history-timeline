create index if not exists timeline_items_timeline_id_start_year_idx
on public.timeline_items (timeline_id, start_year);

create index if not exists timelines_slug_idx
on public.timelines (slug);
