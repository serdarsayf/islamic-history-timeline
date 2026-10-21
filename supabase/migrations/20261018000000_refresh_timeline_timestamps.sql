create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.touch_timeline_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then
    update public.timelines set updated_at = now() where id = old.timeline_id;
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    update public.timelines set updated_at = now() where id = new.timeline_id;
  end if;
  return null;
end;
$$;

create or replace function public.touch_timeline_from_item_tag()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  affected_timeline_id uuid;
begin
  if tg_op in ('UPDATE', 'DELETE') then
    select timeline_id into affected_timeline_id
    from public.timeline_items where id = old.item_id;
    update public.timelines set updated_at = now() where id = affected_timeline_id;
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    select timeline_id into affected_timeline_id
    from public.timeline_items where id = new.item_id;
    update public.timelines set updated_at = now() where id = affected_timeline_id;
  end if;
  return null;
end;
$$;

drop trigger if exists timelines_set_updated_at on public.timelines;
create trigger timelines_set_updated_at
  before update on public.timelines
  for each row execute function public.set_updated_at();

drop trigger if exists timeline_items_set_updated_at on public.timeline_items;
create trigger timeline_items_set_updated_at
  before update on public.timeline_items
  for each row execute function public.set_updated_at();

drop trigger if exists timeline_items_touch_timeline on public.timeline_items;
create trigger timeline_items_touch_timeline
  after insert or update or delete on public.timeline_items
  for each row execute function public.touch_timeline_updated_at();

drop trigger if exists timeline_tags_touch_timeline on public.timeline_tags;
create trigger timeline_tags_touch_timeline
  after insert or update or delete on public.timeline_tags
  for each row execute function public.touch_timeline_updated_at();

drop trigger if exists timeline_item_tags_touch_timeline on public.timeline_item_tags;
create trigger timeline_item_tags_touch_timeline
  after insert or update or delete on public.timeline_item_tags
  for each row execute function public.touch_timeline_from_item_tag();