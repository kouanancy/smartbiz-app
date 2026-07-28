-- ============================================================
-- SUPABASE STORAGE — photos d'articles
-- À exécuter une fois dans l'éditeur SQL Supabase (comme
-- smartbiz-schema.sql), après avoir appliqué le schéma principal.
-- ============================================================

-- 1. Bucket dédié aux photos d'articles. Public en lecture : les photos
--    de produits sont destinées à être vues (catalogue, confirmations de
--    commande) sans authentification.
insert into storage.buckets (id, name, public)
values ('article-photos', 'article-photos', true)
on conflict (id) do nothing;

-- 2. Sécurité : chaque commerçant ne peut écrire/modifier/supprimer que
--    dans son propre dossier. Les fichiers sont organisés en
--    "<business_id>/<uuid>.<ext>" côté application (voir
--    components/ImageUploadField.js) — (storage.foldername(name))[1]
--    correspond donc au business_id du dossier.

create policy "Lecture publique des photos d'articles"
  on storage.objects for select
  using (bucket_id = 'article-photos');

create policy "Le commerçant ajoute des photos dans sa boutique"
  on storage.objects for insert
  with check (
    bucket_id = 'article-photos'
    and (storage.foldername(name))[1] in (
      select id::text from businesses where owner_id = auth.uid()
    )
  );

create policy "Le commerçant modifie les photos de sa boutique"
  on storage.objects for update
  using (
    bucket_id = 'article-photos'
    and (storage.foldername(name))[1] in (
      select id::text from businesses where owner_id = auth.uid()
    )
  );

create policy "Le commerçant supprime les photos de sa boutique"
  on storage.objects for delete
  using (
    bucket_id = 'article-photos'
    and (storage.foldername(name))[1] in (
      select id::text from businesses where owner_id = auth.uid()
    )
  );
