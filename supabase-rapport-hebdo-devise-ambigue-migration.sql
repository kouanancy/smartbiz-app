-- ============================================================
-- CORRECTIF — boutiques_dues_rapport_hebdo() : "column reference
-- devise is ambiguous" (erreur PostgreSQL 42702).
--
-- Cause : `returns table (business_id uuid, business_name text, devise
-- text, langue text)` déclare implicitement une variable PL/pgSQL par
-- colonne de sortie — dont une nommée `devise` et une nommée `langue`,
-- qui portent EXACTEMENT le même nom que les colonnes `businesses.devise`
-- et `businesses.langue` lues par le `returning` de la requête interne.
-- PostgreSQL ne peut alors pas savoir si `devise`/`langue` dans
-- `returning id, name, devise, langue` désignent la colonne de la table
-- mise à jour ou la variable de sortie de la fonction — d'où l'erreur.
-- (`business_id`/`business_name` échappent au problème car la requête
-- renvoie `id`/`name`, pas `business_id`/`business_name`.)
--
-- Correction : qualifier explicitement `businesses.devise` et
-- `businesses.langue` dans le `returning` pour lever l'ambiguïté — le nom
-- de la table cible d'un `update` reste utilisable comme qualificatif
-- dans son propre `returning`. Signature de retour inchangée, donc
-- `create or replace function` suffit (pas besoin de `drop function`
-- comme pour supabase-rapport-hebdo-push-uniquement-migration.sql, qui
-- changeait le nombre de colonnes renvoyées).
--
-- À exécuter une fois dans l'éditeur SQL Supabase, après
-- supabase-rapport-hebdo-push-uniquement-migration.sql.
-- ============================================================

create or replace function boutiques_dues_rapport_hebdo()
returns table (business_id uuid, business_name text, devise text, langue text)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
    update businesses
    set rapport_hebdo_dernier_envoi = current_date
    where rapport_hebdo_actif = true
      and rapport_hebdo_jour_semaine = extract(dow from now())::smallint
      and (rapport_hebdo_dernier_envoi is null or rapport_hebdo_dernier_envoi < current_date)
    returning id, name, businesses.devise, businesses.langue;
end;
$$;
