-- 1. RLS policies: wrap auth.uid() in a scalar subquery so it is evaluated once per statement.

drop policy if exists "public timelines are readable" on public.timelines;
drop policy if exists "owners manage timelines" on public.timelines;
create policy "public timelines are readable" on public.timelines for select
  using (is_public or owner_id = (select auth.uid()));
create policy "owners manage timelines" on public.timelines for all
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

drop policy if exists "timeline children are readable" on public.timeline_items;
drop policy if exists "owners manage timeline items" on public.timeline_items;
create policy "timeline children are readable" on public.timeline_items for select
  using (exists (select 1 from public.timelines where id = timeline_id and (is_public or owner_id = (select auth.uid()))));
create policy "owners manage timeline items" on public.timeline_items for all
  using (exists (select 1 from public.timelines where id = timeline_id and owner_id = (select auth.uid())))
  with check (exists (select 1 from public.timelines where id = timeline_id and owner_id = (select auth.uid())));

drop policy if exists "timeline tags are readable" on public.timeline_tags;
drop policy if exists "owners manage timeline tags" on public.timeline_tags;
create policy "timeline tags are readable" on public.timeline_tags for select
  using (exists (select 1 from public.timelines where id = timeline_id and (is_public or owner_id = (select auth.uid()))));
create policy "owners manage timeline tags" on public.timeline_tags for all
  using (exists (select 1 from public.timelines where id = timeline_id and owner_id = (select auth.uid())))
  with check (exists (select 1 from public.timelines where id = timeline_id and owner_id = (select auth.uid())));

drop policy if exists "item tags follow item access" on public.timeline_item_tags;
drop policy if exists "owners manage item tags" on public.timeline_item_tags;
create policy "item tags follow item access" on public.timeline_item_tags for select
  using (exists (select 1 from public.timeline_items item join public.timelines timeline on timeline.id = item.timeline_id where item.id = item_id and (timeline.is_public or timeline.owner_id = (select auth.uid()))));
create policy "owners manage item tags" on public.timeline_item_tags for all
  using (exists (select 1 from public.timeline_items item join public.timelines timeline on timeline.id = item.timeline_id where item.id = item_id and timeline.owner_id = (select auth.uid())));

drop policy if exists "public comments are readable" on public.timeline_comments;
drop policy if exists "users add comments to accessible timelines" on public.timeline_comments;
drop policy if exists "users update own comments on accessible timelines" on public.timeline_comments;
drop policy if exists "users delete own comments on accessible timelines" on public.timeline_comments;
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

drop policy if exists "users read own likes" on public.timeline_likes;
drop policy if exists "users manage likes on accessible timelines" on public.timeline_likes;
create policy "users read own likes" on public.timeline_likes for select to authenticated
  using (user_id = (select auth.uid()));
create policy "users manage likes on accessible timelines" on public.timeline_likes for all to authenticated
  using (user_id = (select auth.uid()) and exists (
    select 1 from public.timelines where id = timeline_id and (is_public or owner_id = (select auth.uid()))
  ))
  with check (user_id = (select auth.uid()) and exists (
    select 1 from public.timelines where id = timeline_id and (is_public or owner_id = (select auth.uid()))
  ));

drop policy if exists "timeline owners read views" on public.timeline_views;
create policy "timeline owners read views" on public.timeline_views for select to authenticated
  using (exists (select 1 from public.timelines where id = timeline_id and owner_id = (select auth.uid())));

drop policy if exists "owners manage assets" on public.timeline_assets;
create policy "owners manage assets" on public.timeline_assets for all to authenticated
  using (owner_id = (select auth.uid()) and exists (
    select 1 from public.timelines where id = timeline_id and owner_id = (select auth.uid())
  ))
  with check (owner_id = (select auth.uid()) and exists (
    select 1 from public.timelines where id = timeline_id and owner_id = (select auth.uid())
  ));

-- 5. Storage policies compare uuids so timelines' primary key index is usable. The CASE guarantees the regex
-- check runs before the cast, so a malformed path yields NULL (no match) instead of an error.

drop policy if exists "timeline owners upload assets" on storage.objects;
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

drop policy if exists "timeline owners read assets" on storage.objects;
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

drop policy if exists "timeline owners delete assets" on storage.objects;
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

-- 4. Era-aware ordering position: BC years count down from 0 (1 BC = 0), CE years keep their value.

alter table public.timeline_items
  add column if not exists start_pos integer generated always as (
    case when start_era = 'BC' then 1 - start_year else start_year end
  ) stored;

-- 2. Missing foreign key and lookup indexes.

create index if not exists timelines_owner_id_idx on public.timelines (owner_id);
create index if not exists timeline_item_tags_tag_id_idx on public.timeline_item_tags (tag_id);
create index if not exists timeline_comments_parent_id_timeline_id_idx on public.timeline_comments (parent_id, timeline_id);
create index if not exists timeline_comments_author_id_idx on public.timeline_comments (author_id);
create index if not exists timeline_comments_timeline_id_created_at_idx on public.timeline_comments (timeline_id, created_at);
create index if not exists timeline_likes_user_id_idx on public.timeline_likes (user_id);
create index if not exists timeline_assets_timeline_id_idx on public.timeline_assets (timeline_id);
create index if not exists timeline_assets_owner_id_idx on public.timeline_assets (owner_id);
create index if not exists timeline_items_timeline_id_start_pos_idx on public.timeline_items (timeline_id, start_pos);

-- 3. Redundant indexes.

drop index if exists public.timeline_items_timeline_id_idx;
drop index if exists public.timeline_tags_timeline_id_idx;
drop index if exists public.timeline_comments_timeline_id_idx;
drop index if exists public.timeline_items_timeline_id_start_year_idx;
