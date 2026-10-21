alter table public.timeline_comments
  drop constraint if exists timeline_comments_parent_id_fkey;

update public.timeline_comments child
set parent_id = null
from public.timeline_comments parent
where child.parent_id = parent.id
  and child.timeline_id <> parent.timeline_id;

alter table public.timeline_comments
  add constraint timeline_comments_id_timeline_id_key unique (id, timeline_id),
  add constraint timeline_comments_parent_timeline_fkey
    foreign key (parent_id, timeline_id)
    references public.timeline_comments(id, timeline_id) on delete cascade;

drop policy if exists "public comments are readable" on public.timeline_comments;
drop policy if exists "users manage own comments" on public.timeline_comments;
drop policy if exists "users add comments to accessible timelines" on public.timeline_comments;
drop policy if exists "users update own comments on accessible timelines" on public.timeline_comments;
drop policy if exists "users delete own comments on accessible timelines" on public.timeline_comments;
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

drop policy if exists "likes are readable" on public.timeline_likes;
drop policy if exists "users manage own likes" on public.timeline_likes;
drop policy if exists "users read own likes" on public.timeline_likes;
drop policy if exists "users manage likes on accessible timelines" on public.timeline_likes;
create policy "users read own likes" on public.timeline_likes for select to authenticated
  using (user_id = auth.uid());
create policy "users manage likes on accessible timelines" on public.timeline_likes for all to authenticated
  using (user_id = auth.uid() and exists (
    select 1 from public.timelines where id = timeline_id and (is_public or owner_id = auth.uid())
  ))
  with check (user_id = auth.uid() and exists (
    select 1 from public.timelines where id = timeline_id and (is_public or owner_id = auth.uid())
  ));

drop policy if exists "views are readable" on public.timeline_views;
drop policy if exists "authenticated users record views" on public.timeline_views;
drop policy if exists "timeline owners read views" on public.timeline_views;
drop policy if exists "public timelines record views" on public.timeline_views;
create policy "timeline owners read views" on public.timeline_views for select to authenticated
  using (exists (select 1 from public.timelines where id = timeline_id and owner_id = auth.uid()));
create policy "public timelines record views" on public.timeline_views for insert
  with check (exists (select 1 from public.timelines where id = timeline_id and is_public));

drop policy if exists "owners manage assets" on public.timeline_assets;
create policy "owners manage assets" on public.timeline_assets for all to authenticated
  using (owner_id = auth.uid() and exists (
    select 1 from public.timelines where id = timeline_id and owner_id = auth.uid()
  ))
  with check (owner_id = auth.uid() and exists (
    select 1 from public.timelines where id = timeline_id and owner_id = auth.uid()
  ));

drop policy if exists "timeline owners upload assets" on storage.objects;
create policy "timeline owners upload assets" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'timeline-assets'
    and (storage.foldername(name))[1] = auth.uid()::text
    and exists (
      select 1 from public.timelines
      where id::text = (storage.foldername(name))[2] and owner_id = auth.uid()
    )
  );