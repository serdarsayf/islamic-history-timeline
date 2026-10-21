drop policy if exists "timeline owners read assets" on storage.objects;
create policy "timeline owners read assets" on storage.objects for select to authenticated
  using (
    bucket_id = 'timeline-assets'
    and (storage.foldername(name))[1] = auth.uid()::text
    and exists (
      select 1 from public.timelines
      where id::text = (storage.foldername(name))[2] and owner_id = auth.uid()
    )
  );

drop policy if exists "timeline owners delete assets" on storage.objects;
create policy "timeline owners delete assets" on storage.objects for delete to authenticated
  using (
    bucket_id = 'timeline-assets'
    and (storage.foldername(name))[1] = auth.uid()::text
    and exists (
      select 1 from public.timelines
      where id::text = (storage.foldername(name))[2] and owner_id = auth.uid()
    )
  );