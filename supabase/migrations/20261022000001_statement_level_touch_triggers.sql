-- Transition tables are allowed only on single-event triggers, so each table gets one trigger per event.
-- Each statement now updates every affected timeline once instead of once per child row.

create or replace function public.touch_timelines_from_inserted_rows()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  update public.timelines set updated_at = now()
  where id in (select timeline_id from new_rows);
  return null;
end;
$$;

create or replace function public.touch_timelines_from_deleted_rows()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  update public.timelines set updated_at = now()
  where id in (select timeline_id from old_rows);
  return null;
end;
$$;

create or replace function public.touch_timelines_from_updated_rows()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  update public.timelines set updated_at = now()
  where id in (
    select timeline_id from new_rows
    union
    select timeline_id from old_rows
  );
  return null;
end;
$$;

create or replace function public.touch_timelines_from_inserted_item_tags()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  update public.timelines set updated_at = now()
  where id in (
    select item.timeline_id
    from public.timeline_items item
    where item.id in (select item_id from new_rows)
  );
  return null;
end;
$$;

create or replace function public.touch_timelines_from_deleted_item_tags()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  update public.timelines set updated_at = now()
  where id in (
    select item.timeline_id
    from public.timeline_items item
    where item.id in (select item_id from old_rows)
  );
  return null;
end;
$$;

create or replace function public.touch_timelines_from_updated_item_tags()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  update public.timelines set updated_at = now()
  where id in (
    select item.timeline_id
    from public.timeline_items item
    where item.id in (select item_id from new_rows union select item_id from old_rows)
  );
  return null;
end;
$$;

drop trigger if exists timeline_items_touch_timeline on public.timeline_items;
drop trigger if exists timeline_tags_touch_timeline on public.timeline_tags;
drop trigger if exists timeline_item_tags_touch_timeline on public.timeline_item_tags;
drop function if exists public.touch_timeline_updated_at();
drop function if exists public.touch_timeline_from_item_tag();

create trigger timeline_items_touch_timeline_insert
  after insert on public.timeline_items
  referencing new table as new_rows
  for each statement execute function public.touch_timelines_from_inserted_rows();
create trigger timeline_items_touch_timeline_update
  after update on public.timeline_items
  referencing old table as old_rows new table as new_rows
  for each statement execute function public.touch_timelines_from_updated_rows();
create trigger timeline_items_touch_timeline_delete
  after delete on public.timeline_items
  referencing old table as old_rows
  for each statement execute function public.touch_timelines_from_deleted_rows();

create trigger timeline_tags_touch_timeline_insert
  after insert on public.timeline_tags
  referencing new table as new_rows
  for each statement execute function public.touch_timelines_from_inserted_rows();
create trigger timeline_tags_touch_timeline_update
  after update on public.timeline_tags
  referencing old table as old_rows new table as new_rows
  for each statement execute function public.touch_timelines_from_updated_rows();
create trigger timeline_tags_touch_timeline_delete
  after delete on public.timeline_tags
  referencing old table as old_rows
  for each statement execute function public.touch_timelines_from_deleted_rows();

create trigger timeline_item_tags_touch_timeline_insert
  after insert on public.timeline_item_tags
  referencing new table as new_rows
  for each statement execute function public.touch_timelines_from_inserted_item_tags();
create trigger timeline_item_tags_touch_timeline_update
  after update on public.timeline_item_tags
  referencing old table as old_rows new table as new_rows
  for each statement execute function public.touch_timelines_from_updated_item_tags();
create trigger timeline_item_tags_touch_timeline_delete
  after delete on public.timeline_item_tags
  referencing old table as old_rows
  for each statement execute function public.touch_timelines_from_deleted_item_tags();
