-- ============================================================
-- BUSINESSES — un compte = une seule boutique (owner_id unique)
-- À exécuter une fois dans l'éditeur SQL Supabase.
-- ============================================================

-- Avant de contraindre owner_id, fusionne les doublons déjà existants :
-- pour chaque compte ayant plusieurs lignes businesses, on garde la plus
-- ancienne (celle que l'app choisit déjà via
-- .order("created_at", { ascending: true }).limit(1) dans
-- lib/AuthProvider.js) et on rattache toutes les données des doublons
-- (catégories, zones de livraison, clients, articles, commandes,
-- réappros, paiements d'abonnement) à cette boutique canonique avant de
-- supprimer les lignes en trop — aucune donnée commerçant n'est perdue.
-- Idempotent : sans doublon, la boucle ne trouve rien à faire.
do $$
declare
  r record;
  dup record;
begin
  for r in
    select owner_id, (array_agg(id order by created_at asc, id asc))[1] as canonical_id
    from businesses
    group by owner_id
    having count(*) > 1
  loop
    for dup in
      select id from businesses
      where owner_id = r.owner_id and id <> r.canonical_id
    loop
      -- Catégories : contrainte unique(business_id, nom), donc on ne peut
      -- pas juste réattribuer business_id si le nom existe déjà côté
      -- canonique. On supprime alors le doublon de catégorie plutôt que la
      -- catégorie canonique ; les articles qui la référençaient retombent à
      -- categorie_id = null (on delete set null) sans jamais être supprimés.
      delete from categories
      where business_id = dup.id
        and nom in (select nom from categories where business_id = r.canonical_id);

      update categories set business_id = r.canonical_id where business_id = dup.id;
      update zones_livraison set business_id = r.canonical_id where business_id = dup.id;
      update clients set business_id = r.canonical_id where business_id = dup.id;
      update articles set business_id = r.canonical_id where business_id = dup.id;
      update commandes set business_id = r.canonical_id where business_id = dup.id;
      update reappros set business_id = r.canonical_id where business_id = dup.id;
      update paiements_abonnement set business_id = r.canonical_id where business_id = dup.id;

      delete from businesses where id = dup.id;
    end loop;
  end loop;
end $$;

alter table businesses drop constraint if exists businesses_owner_id_key;
alter table businesses add constraint businesses_owner_id_key unique (owner_id);
