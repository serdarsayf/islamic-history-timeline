-- Atomic timeline copy. SECURITY INVOKER keeps RLS in force: the caller must be able to read the source
-- and becomes the owner of the copy. Each step is its own statement so later RLS checks see earlier rows.
create or replace function public.duplicate_timeline(source_id uuid, new_title text default null)
returns public.timelines
language plpgsql
security invoker
set search_path = public
as $$
declare
  source public.timelines;
  copy public.timelines;
  copy_title text;
  slug_base text;
  item_map jsonb;
begin
  select * into source from public.timelines where id = source_id;
  if not found then
    raise exception 'Timeline not found.' using errcode = 'P0002';
  end if;

  copy_title := coalesce(nullif(btrim(new_title), ''), source.title || ' Copy');
  slug_base := coalesce(
    nullif(trim(both '-' from regexp_replace(lower(copy_title), '[^a-z0-9]+', '-', 'g')), ''),
    'timeline-copy'
  );

  insert into public.timelines (owner_id, slug, title, description, calendar, is_public)
  values (
    (select auth.uid()),
    slug_base || '-' || substr(gen_random_uuid()::text, 1, 8),
    copy_title,
    source.description,
    source.calendar,
    false
  )
  returning * into copy;

  insert into public.timeline_tags (timeline_id, name, color)
  select copy.id, name, color from public.timeline_tags where timeline_id = source_id;

  select coalesce(jsonb_object_agg(id::text, gen_random_uuid()), '{}'::jsonb)
  into item_map
  from public.timeline_items where timeline_id = source_id;

  insert into public.timeline_items (
    id, timeline_id, type, name, description, box_color, text_color,
    start_year, start_era, end_year, end_era, text_position
  )
  select
    (item_map ->> item.id::text)::uuid, copy.id, item.type, item.name, item.description, item.box_color, item.text_color,
    item.start_year, item.start_era, item.end_year, item.end_era, item.text_position
  from public.timeline_items item
  where item.timeline_id = source_id;

  insert into public.timeline_item_tags (item_id, tag_id)
  select (item_map ->> link.item_id::text)::uuid, copied_tag.id
  from public.timeline_item_tags link
  join public.timeline_tags source_tag on source_tag.id = link.tag_id and source_tag.timeline_id = source_id
  join public.timeline_tags copied_tag on copied_tag.timeline_id = copy.id and copied_tag.name = source_tag.name
  where item_map ? link.item_id::text;

  return copy;
end;
$$;

revoke all on function public.duplicate_timeline(uuid, text) from public, anon;
grant execute on function public.duplicate_timeline(uuid, text) to authenticated;
