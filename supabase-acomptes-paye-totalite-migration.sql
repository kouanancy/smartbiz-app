-- ============================================================
-- ACOMPTES (REFONTE) : PAYÉ EN TOTALITÉ, SOLDE, MODE DE PAIEMENT CODÉ
-- À exécuter une fois dans l'éditeur SQL Supabase, après
-- supabase-commande-acomptes-migration.sql (dont elle complète le
-- schéma). Rejouable sans risque (alter table ... add column if not
-- exists, create or replace function, drop trigger/constraint if exists
-- avant chaque create).
-- ============================================================

-- commandes.paiement_mode ('livraison' | 'mobile_money') ne décrit
-- désormais plus QUAND/SI la commande est payée, seulement le moyen de
-- paiement utilisé (choisir Mobile Money ne marque plus automatiquement
-- "déjà payé", voir app/(app)/nouvelle/page.js) — un indicateur explicite
-- et volontaire porte seule cette information :
--   paye_totalite : cochée à la création (uniquement si aucun acompte,
--     les deux étant mutuellement exclusifs côté app), fait afficher
--     "Déjà payé" sur les articles (le reste dû se limite alors aux frais
--     de livraison, comme l'ancien comportement Mobile Money).
--   solde : vrai une fois la commande soldée (voir trigger de
--     remboursement plus bas et le bouton "Solder la commande" côté app),
--     condition du bouton "Livré" pour toute commande qui a au moins un
--     acompte — remplace le calcul "reste à payer <= 0" direct par un
--     indicateur persistant, pour qu'une commande ne soit jamais
--     considérée soldée sans une action explicite (voir
--     app/(app)/commandes/[id]/page.js, solderCommande()).
alter table commandes add column if not exists paye_totalite boolean not null default false;
alter table commandes add column if not exists solde boolean not null default false;

-- Historique : avant cette refonte, Mobile Money impliquait déjà "Déjà
-- payé" (articles réglés, frais de livraison restant dus) — cette ligne
-- fait porter cette même information par paye_totalite pour toutes les
-- commandes déjà existantes, afin que leur affichage ne change pas (voir
-- Receipt.js/ResumeCommandeTotaux.js, qui lisent désormais paye_totalite
-- plutôt que paiement_mode). Aucune commande existante n'a d'acompte à ce
-- stade (la table commande_acomptes vient d'être créée), donc aucun
-- risque de conflit avec la règle "payée en totalité implique aucun
-- acompte" ci-dessous.
update commandes set paye_totalite = true where paiement_mode = 'mobile_money' and not paye_totalite;

-- commande_acomptes.mode_paiement passe d'une liste de libellés (Espèces,
-- Orange Money, MTN Mobile Money, Moov Money, Wave — voir l'ancien
-- MODES_PAIEMENT_ACOMPTE dans lib/constants.js) à deux valeurs codées
-- seulement, cohérentes avec commandes.paiement_mode : l'acompte n'a plus
-- besoin de savoir QUEL opérateur Mobile Money a été utilisé, seulement
-- Mobile Money ou Espèces. Les lignes déjà enregistrées avec un ancien
-- libellé sont normalisées d'abord, pour que la contrainte posée juste
-- après ne les bloque pas.
update commande_acomptes set mode_paiement = 'mobile_money'
  where mode_paiement in ('Orange Money', 'MTN Mobile Money', 'Moov Money', 'Wave');
update commande_acomptes set mode_paiement = 'especes'
  where mode_paiement = 'Espèces';

alter table commande_acomptes drop constraint if exists commande_acomptes_mode_paiement_check;
-- not valid : la contrainte s'applique à toute nouvelle ligne dès
-- maintenant, sans exiger la revalidation immédiate des lignes déjà
-- présentes (filet de sécurité si une valeur imprévue restait malgré la
-- normalisation ci-dessus — jamais bloquant pour l'existant).
alter table commande_acomptes add constraint commande_acomptes_mode_paiement_check
  check (mode_paiement in ('mobile_money', 'especes')) not valid;

-- ------------------------------------------------------------
-- verifier_stock_theorique_acompte() (déjà posée par
-- supabase-commande-acomptes-migration.sql) étendue : refuse aussi
-- l'insertion d'un acompte (statut 'verse') si la commande est payée en
-- totalité — une commande payée en totalité n'a jamais d'acompte, ni à la
-- création (empêché côté app) ni à la modification, et cette règle est
-- reprise ici pour ne pas dépendre uniquement du contrôle côté client.
-- Le contrôle du stock théorique qui suit est inchangé.
-- ------------------------------------------------------------
create or replace function verifier_stock_theorique_acompte()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_article record;
  v_paye_totalite boolean;
begin
  if new.statut <> 'verse' then
    return new;
  end if;

  select paye_totalite into v_paye_totalite from commandes where id = new.commande_id;
  if v_paye_totalite then
    raise exception 'Cette commande est payée en totalité : aucun acompte ne peut y être enregistré.';
  end if;

  for v_article in
    select
      a.id,
      a.nom,
      a.stock - coalesce(sum(cl.quantite) filter (where c.statut = 'en_attente'), 0) as theorique
    from commande_lignes cl
    join commandes c on c.id = cl.commande_id
    join articles a on a.id = cl.article_id
    where cl.article_id in (
      select cl2.article_id from commande_lignes cl2 where cl2.commande_id = new.commande_id
    )
    group by a.id, a.nom, a.stock
  loop
    if v_article.theorique < 0 then
      raise exception 'Stock théorique insuffisant pour « % » : cet acompte ne peut pas être enregistré.', v_article.nom;
    end if;
  end loop;

  return new;
end;
$$;
