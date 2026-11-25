-- Prerequisites:
-- 1. Configure Firebase as a Supabase Third-Party Auth provider.
-- 2. Set actas-evidencias to private in the Supabase Dashboard.
-- 3. Store objects as: <Firebase UID>/<recinto ID>/<filename>.
-- 4. The Angular Supabase client sends a freshly refreshed Firebase ID token.
-- The first path segment must match the verified Firebase JWT sub claim.
-- These policies target PUBLIC because third-party JWTs may not use the
-- Supabase "authenticated" database role. A missing sub claim is rejected.
-- Cross-user signed URLs are issued by the trusted Firebase Function using
-- its server-only service_role key; do not broaden Storage RLS for that flow.

drop policy if exists "actas_evidencias_owner_access" on storage.objects;
drop policy if exists "actas_evidencias_owner_insert" on storage.objects;
drop policy if exists "actas_evidencias_owner_update" on storage.objects;
drop policy if exists "actas_evidencias_owner_guard" on storage.objects;
drop policy if exists "actas_evidencias_no_delete" on storage.objects;

create policy "actas_evidencias_owner_access"
on storage.objects
as permissive
for select
to public
using (
  bucket_id = 'actas-evidencias'
  and (select auth.jwt() ->> 'sub') is not null
  and cardinality(storage.foldername(name)) >= 2
  and (storage.foldername(name))[1] = (select auth.jwt() ->> 'sub')
);

create policy "actas_evidencias_owner_insert"
on storage.objects
as permissive
for insert
to public
with check (
  bucket_id = 'actas-evidencias'
  and (select auth.jwt() ->> 'sub') is not null
  and cardinality(storage.foldername(name)) >= 2
  and (storage.foldername(name))[1] = (select auth.jwt() ->> 'sub')
);

create policy "actas_evidencias_owner_update"
on storage.objects
as permissive
for update
to public
using (
  bucket_id = 'actas-evidencias'
  and (select auth.jwt() ->> 'sub') is not null
  and cardinality(storage.foldername(name)) >= 2
  and (storage.foldername(name))[1] = (select auth.jwt() ->> 'sub')
)
with check (
  bucket_id = 'actas-evidencias'
  and (select auth.jwt() ->> 'sub') is not null
  and cardinality(storage.foldername(name)) >= 2
  and (storage.foldername(name))[1] = (select auth.jwt() ->> 'sub')
);

-- A restrictive guard also denies anonymous/public access if an older
-- permissive policy exists on storage.objects.
create policy "actas_evidencias_owner_guard"
on storage.objects
as restrictive
for all
to public
using (
  bucket_id <> 'actas-evidencias'
  or (
    (auth.jwt() ->> 'sub') is not null
    and cardinality(storage.foldername(name)) >= 2
    and (storage.foldername(name))[1] = (select auth.jwt() ->> 'sub')
  )
)
with check (
  bucket_id <> 'actas-evidencias'
  or (
    (auth.jwt() ->> 'sub') is not null
    and cardinality(storage.foldername(name)) >= 2
    and (storage.foldername(name))[1] = (select auth.jwt() ->> 'sub')
  )
);

create policy "actas_evidencias_no_delete"
on storage.objects
as restrictive
for delete
to public
using (bucket_id <> 'actas-evidencias');
