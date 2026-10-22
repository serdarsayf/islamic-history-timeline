create extension if not exists "pgcrypto";

create table public.timelines (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  slug text not null unique,
  title text not null default 'Untitled timeline',
  description text not null default '',
  calendar text not null default 'gregorian' check (calendar in ('gregorian', 'hijri')),
  is_public boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.timeline_tags (
  id uuid primary key default gen_random_uuid(),
  timeline_id uuid not null references public.timelines(id) on delete cascade,
  name text not null,
  color text not null default '#ef4444',
  unique (timeline_id, name)
);

create table public.timeline_items (
  id uuid primary key default gen_random_uuid(),
  timeline_id uuid not null references public.timelines(id) on delete cascade,
  type text not null check (type in ('event', 'period')),
  name text not null,
  description text not null default '',
  box_color text not null default '#dddddd',
  text_color text not null default '#ffffff',
  start_year integer not null check (start_year > 0),
  start_era text not null check (start_era in ('BC', 'CE')),
  end_year integer check (end_year is null or end_year > 0),
  end_era text check (end_era is null or end_era in ('BC', 'CE')),
  text_position text not null default 'above' check (text_position in ('above', 'below')),
  start_pos integer generated always as (
    case when start_era = 'BC' then 1 - start_year else start_year end
  ) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (type = 'event' or (end_year is not null and end_era is not null))
);

create table public.timeline_item_tags (
  item_id uuid not null references public.timeline_items(id) on delete cascade,
  tag_id uuid not null references public.timeline_tags(id) on delete cascade,
  primary key (item_id, tag_id)
);

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

drop trigger if exists timelines_set_updated_at on public.timelines;
create trigger timelines_set_updated_at
  before update on public.timelines
  for each row execute function public.set_updated_at();

drop trigger if exists timeline_items_set_updated_at on public.timeline_items;
create trigger timeline_items_set_updated_at
  before update on public.timeline_items
  for each row execute function public.set_updated_at();

-- Transition tables are allowed only on single-event triggers, so there is one trigger per event.
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

create table public.timeline_comments (
  id uuid primary key default gen_random_uuid(),
  timeline_id uuid not null references public.timelines(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  parent_id uuid,
  body text not null check (char_length(body) between 1 and 5000),
  created_at timestamptz not null default now(),
  unique (id, timeline_id),
  foreign key (parent_id, timeline_id)
    references public.timeline_comments(id, timeline_id) on delete cascade
);

create table public.timeline_likes (
  timeline_id uuid not null references public.timelines(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (timeline_id, user_id)
);

create table public.timeline_views (
  timeline_id uuid not null references public.timelines(id) on delete cascade,
  viewer_key text not null,
  viewed_at timestamptz not null default now(),
  primary key (timeline_id, viewer_key)
);

create table public.timeline_assets (
  id uuid primary key default gen_random_uuid(),
  timeline_id uuid not null references public.timelines(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  storage_path text not null,
  file_name text not null,
  mime_type text not null,
  created_at timestamptz not null default now()
);

create index timelines_owner_id_idx on public.timelines (owner_id);
create index timeline_item_tags_tag_id_idx on public.timeline_item_tags (tag_id);
create index timeline_comments_parent_id_timeline_id_idx on public.timeline_comments (parent_id, timeline_id);
create index timeline_comments_author_id_idx on public.timeline_comments (author_id);
create index timeline_comments_timeline_id_created_at_idx on public.timeline_comments (timeline_id, created_at);
create index timeline_likes_user_id_idx on public.timeline_likes (user_id);
create index timeline_assets_timeline_id_idx on public.timeline_assets (timeline_id);
create index timeline_assets_owner_id_idx on public.timeline_assets (owner_id);
create index timeline_items_timeline_id_start_pos_idx on public.timeline_items (timeline_id, start_pos);

alter table public.timelines enable row level security;
alter table public.timeline_tags enable row level security;
alter table public.timeline_items enable row level security;
alter table public.timeline_item_tags enable row level security;
alter table public.timeline_comments enable row level security;
alter table public.timeline_likes enable row level security;
alter table public.timeline_views enable row level security;
alter table public.timeline_assets enable row level security;

create policy "public timelines are readable" on public.timelines for select using (is_public or owner_id = (select auth.uid()));
create policy "owners manage timelines" on public.timelines for all using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy "timeline children are readable" on public.timeline_items for select using (exists (select 1 from public.timelines where id = timeline_id and (is_public or owner_id = (select auth.uid()))));
create policy "owners manage timeline items" on public.timeline_items for all using (exists (select 1 from public.timelines where id = timeline_id and owner_id = (select auth.uid()))) with check (exists (select 1 from public.timelines where id = timeline_id and owner_id = (select auth.uid())));
create policy "timeline tags are readable" on public.timeline_tags for select using (exists (select 1 from public.timelines where id = timeline_id and (is_public or owner_id = (select auth.uid()))));
create policy "owners manage timeline tags" on public.timeline_tags for all using (exists (select 1 from public.timelines where id = timeline_id and owner_id = (select auth.uid()))) with check (exists (select 1 from public.timelines where id = timeline_id and owner_id = (select auth.uid())));
create policy "item tags follow item access" on public.timeline_item_tags for select using (exists (select 1 from public.timeline_items item join public.timelines timeline on timeline.id = item.timeline_id where item.id = item_id and (timeline.is_public or timeline.owner_id = (select auth.uid()))));
create policy "owners manage item tags" on public.timeline_item_tags for all using (exists (select 1 from public.timeline_items item join public.timelines timeline on timeline.id = item.timeline_id where item.id = item_id and timeline.owner_id = (select auth.uid())));
create policy "public comments are readable" on public.timeline_comments for select
  using (exists (select 1 from public.timelines where id = timeline_id and (is_public or owner_id = (select auth.uid()))));
create policy "users add comments to accessible timelines" on public.timeline_comments for insert to authenticated
  with check (author_id = (select auth.uid()) and exists (
    select 1 from public.timelines where id = timeline_id and (is_public or owner_id = (select auth.uid()))
  ));
create policy "users update own comments on accessible timelines" on public.timeline_comments for update to authenticated
  using (author_id = (select auth.uid()) and exists (
    select 1 from public.timelines where id = timeline_id and (is_public or owner_id = (select auth.uid()))
  ))
  with check (author_id = (select auth.uid()) and exists (
    select 1 from public.timelines where id = timeline_id and (is_public or owner_id = (select auth.uid()))
  ));
create policy "users delete own comments on accessible timelines" on public.timeline_comments for delete to authenticated
  using (author_id = (select auth.uid()) and exists (
    select 1 from public.timelines where id = timeline_id and (is_public or owner_id = (select auth.uid()))
  ));
create policy "users read own likes" on public.timeline_likes for select to authenticated
  using (user_id = (select auth.uid()));
create policy "users manage likes on accessible timelines" on public.timeline_likes for all to authenticated
  using (user_id = (select auth.uid()) and exists (
    select 1 from public.timelines where id = timeline_id and (is_public or owner_id = (select auth.uid()))
  ))
  with check (user_id = (select auth.uid()) and exists (
    select 1 from public.timelines where id = timeline_id and (is_public or owner_id = (select auth.uid()))
  ));
create policy "timeline owners read views" on public.timeline_views for select to authenticated
  using (exists (select 1 from public.timelines where id = timeline_id and owner_id = (select auth.uid())));
create policy "public timelines record views" on public.timeline_views for insert
  with check (exists (select 1 from public.timelines where id = timeline_id and is_public));
create policy "owners manage assets" on public.timeline_assets for all to authenticated
  using (owner_id = (select auth.uid()) and exists (
    select 1 from public.timelines where id = timeline_id and owner_id = (select auth.uid())
  ))
  with check (owner_id = (select auth.uid()) and exists (
    select 1 from public.timelines where id = timeline_id and owner_id = (select auth.uid())
  ));

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

insert into storage.buckets (id, name, public) values ('timeline-assets', 'timeline-assets', false) on conflict (id) do nothing;

create policy "timeline owners upload assets" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'timeline-assets'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and exists (
      select 1 from public.timelines
      where id = (case
          when (storage.foldername(name))[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          then ((storage.foldername(name))[2])::uuid
        end)
        and owner_id = (select auth.uid())
    )
  );

create policy "timeline owners read assets" on storage.objects for select to authenticated
  using (
    bucket_id = 'timeline-assets'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and exists (
      select 1 from public.timelines
      where id = (case
          when (storage.foldername(name))[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          then ((storage.foldername(name))[2])::uuid
        end)
        and owner_id = (select auth.uid())
    )
  );

create policy "timeline owners delete assets" on storage.objects for delete to authenticated
  using (
    bucket_id = 'timeline-assets'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and exists (
      select 1 from public.timelines
      where id = (case
          when (storage.foldername(name))[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          then ((storage.foldername(name))[2])::uuid
        end)
        and owner_id = (select auth.uid())
    )
  );
