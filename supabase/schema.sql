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

create index timeline_items_timeline_id_idx on public.timeline_items(timeline_id);
create index timeline_tags_timeline_id_idx on public.timeline_tags(timeline_id);
create index timeline_comments_timeline_id_idx on public.timeline_comments(timeline_id);

alter table public.timelines enable row level security;
alter table public.timeline_tags enable row level security;
alter table public.timeline_items enable row level security;
alter table public.timeline_item_tags enable row level security;
alter table public.timeline_comments enable row level security;
alter table public.timeline_likes enable row level security;
alter table public.timeline_views enable row level security;
alter table public.timeline_assets enable row level security;

create policy "public timelines are readable" on public.timelines for select using (is_public or owner_id = auth.uid());
create policy "owners manage timelines" on public.timelines for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "timeline children are readable" on public.timeline_items for select using (exists (select 1 from public.timelines where id = timeline_id and (is_public or owner_id = auth.uid())));
create policy "owners manage timeline items" on public.timeline_items for all using (exists (select 1 from public.timelines where id = timeline_id and owner_id = auth.uid())) with check (exists (select 1 from public.timelines where id = timeline_id and owner_id = auth.uid()));
create policy "timeline tags are readable" on public.timeline_tags for select using (exists (select 1 from public.timelines where id = timeline_id and (is_public or owner_id = auth.uid())));
create policy "owners manage timeline tags" on public.timeline_tags for all using (exists (select 1 from public.timelines where id = timeline_id and owner_id = auth.uid())) with check (exists (select 1 from public.timelines where id = timeline_id and owner_id = auth.uid()));
create policy "item tags follow item access" on public.timeline_item_tags for select using (exists (select 1 from public.timeline_items item join public.timelines timeline on timeline.id = item.timeline_id where item.id = item_id and (timeline.is_public or timeline.owner_id = auth.uid())));
create policy "owners manage item tags" on public.timeline_item_tags for all using (exists (select 1 from public.timeline_items item join public.timelines timeline on timeline.id = item.timeline_id where item.id = item_id and timeline.owner_id = auth.uid()));
create policy "public comments are readable" on public.timeline_comments for select
  using (exists (select 1 from public.timelines where id = timeline_id and (is_public or owner_id = auth.uid())));
create policy "users add comments to accessible timelines" on public.timeline_comments for insert to authenticated
  with check (author_id = auth.uid() and exists (
    select 1 from public.timelines where id = timeline_id and (is_public or owner_id = auth.uid())
  ));
create policy "users update own comments on accessible timelines" on public.timeline_comments for update to authenticated
  using (author_id = auth.uid() and exists (
    select 1 from public.timelines where id = timeline_id and (is_public or owner_id = auth.uid())
  ))
  with check (author_id = auth.uid() and exists (
    select 1 from public.timelines where id = timeline_id and (is_public or owner_id = auth.uid())
  ));
create policy "users delete own comments on accessible timelines" on public.timeline_comments for delete to authenticated
  using (author_id = auth.uid() and exists (
    select 1 from public.timelines where id = timeline_id and (is_public or owner_id = auth.uid())
  ));
create policy "users read own likes" on public.timeline_likes for select to authenticated
  using (user_id = auth.uid());
create policy "users manage likes on accessible timelines" on public.timeline_likes for all to authenticated
  using (user_id = auth.uid() and exists (
    select 1 from public.timelines where id = timeline_id and (is_public or owner_id = auth.uid())
  ))
  with check (user_id = auth.uid() and exists (
    select 1 from public.timelines where id = timeline_id and (is_public or owner_id = auth.uid())
  ));
create policy "timeline owners read views" on public.timeline_views for select to authenticated
  using (exists (select 1 from public.timelines where id = timeline_id and owner_id = auth.uid()));
create policy "public timelines record views" on public.timeline_views for insert
  with check (exists (select 1 from public.timelines where id = timeline_id and is_public));
create policy "owners manage assets" on public.timeline_assets for all to authenticated
  using (owner_id = auth.uid() and exists (
    select 1 from public.timelines where id = timeline_id and owner_id = auth.uid()
  ))
  with check (owner_id = auth.uid() and exists (
    select 1 from public.timelines where id = timeline_id and owner_id = auth.uid()
  ));

insert into storage.buckets (id, name, public) values ('timeline-assets', 'timeline-assets', false) on conflict (id) do nothing;

create policy "timeline owners upload assets" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'timeline-assets'
    and (storage.foldername(name))[1] = auth.uid()::text
    and exists (
      select 1 from public.timelines
      where id::text = (storage.foldername(name))[2] and owner_id = auth.uid()
    )
  );

create policy "timeline owners read assets" on storage.objects for select to authenticated
  using (
    bucket_id = 'timeline-assets'
    and (storage.foldername(name))[1] = auth.uid()::text
    and exists (
      select 1 from public.timelines
      where id::text = (storage.foldername(name))[2] and owner_id = auth.uid()
    )
  );

create policy "timeline owners delete assets" on storage.objects for delete to authenticated
  using (
    bucket_id = 'timeline-assets'
    and (storage.foldername(name))[1] = auth.uid()::text
    and exists (
      select 1 from public.timelines
      where id::text = (storage.foldername(name))[2] and owner_id = auth.uid()
    )
  );
