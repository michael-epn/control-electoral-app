-- Prerequisites:
-- 1. Configure Firebase as a Supabase Third-Party Auth provider.
-- 2. Set actas-evidencias to private in the Supabase Dashboard.
-- 3. Store objects as: <Firebase UID>/<acta ID>/<filename>.
-- The Angular Supabase client must send the Firebase ID token.
-- Use the JWT sub claim as text: Firebase UIDs are not necessarily UUIDs.

drop policy if exists "actas_evidencias_owner_access" on storage.objects;
drop policy if exists "actas_evidencias_owner_insert" on storage.objects;
drop policy if exists "actas_evidencias_owner_update" on storage.objects;
drop policy if exists "actas_evidencias_owner_guard" on storage.objects;
drop policy if exists "actas_evidencias_no_delete" on storage.objects;

create policy "actas_evidencias_owner_access"
on storage.objects
as permissive
for select
to authenticated
using (
  bucket_id = 'actas-evidencias'
  and (storage.foldername(name))[1] = (select auth.jwt() ->> 'sub')
);

create policy "actas_evidencias_owner_insert"
on storage.objects
as permissive
for insert
to authenticated
with check (
  bucket_id = 'actas-evidencias'
  and (storage.foldername(name))[1] = (select auth.jwt() ->> 'sub')
);

create policy "actas_evidencias_owner_update"
on storage.objects
as permissive
for update
to authenticated
using (
  bucket_id = 'actas-evidencias'
  and (storage.foldername(name))[1] = (select auth.jwt() ->> 'sub')
)
with check (
  bucket_id = 'actas-evidencias'
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
    and (storage.foldername(name))[1] = (select auth.jwt() ->> 'sub')
  )
)
with check (
  bucket_id <> 'actas-evidencias'
  or (
    (auth.jwt() ->> 'sub') is not null
    and (storage.foldername(name))[1] = (select auth.jwt() ->> 'sub')
  )
);

create policy "actas_evidencias_no_delete"
on storage.objects
as restrictive
for delete
to public
using (bucket_id <> 'actas-evidencias');
