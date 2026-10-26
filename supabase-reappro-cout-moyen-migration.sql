-- ============================================================
-- COÛT MOYEN PONDÉRÉ (CMUP) — appliqué automatiquement à chaque
-- réapprovisionnement : le prix d'achat et les frais annexes par unité
-- de l'article deviennent la moyenne pondérée entre le stock réel actuel
-- (à son coût actuel) et la quantité reçue (à son coût de lot), calculée
-- séparément pour chaque champ. Si le stock réel actuel est nul ou
-- négatif, le nouveau coût s'applique directement (rien à pondérer).
--
-- Calcul entièrement côté base de données (trigger SECURITY DEFINER sur
-- reappros), jamais confié au client : la seule chose que l'app envoie
-- désormais est le coût du nouveau lot (quantité, prix d'achat, frais
-- annexes) — elle ne touche plus elle-même articles.stock/prix_achat/
-- frais_annexes, qui restent entièrement calculés par le trigger. Ceci
-- n'élargit aucun droit d'écriture : articles.prix_achat/frais_annexes
-- n'a jamais été restreint par colonne (contrairement à businesses, voir
-- supabase-businesses-colonnes-restreintes-migration.sql) — la
-- modification manuelle directe via « Modifier l'article » doit rester
-- possible et écraser le coût moyen, c'est la seule correction directe
-- autorisée (voir app/(app)/articles/[id]/page.js, validerEdition,
-- inchangée par cette migration).
--
-- Les commandes déjà créées ne sont jamais affectées : commande_lignes
-- (et les agrégats commandes.ca/marge) capturent déjà prix_achat/
-- frais_annexes au moment de la création de la commande (voir
-- app/(app)/nouvelle/page.js, valider()) — jamais recalculés à la
-- livraison (marquerLivree() ne touche qu'au stock, voir README). Le
-- coût retenu pour une commande reste donc toujours celui en vigueur au
-- moment où elle a été PASSÉE, jamais celui du jour de sa livraison, que
-- le coût moyen de l'article ait entre-temps changé ou non — comportement
-- déjà en place, confirmé et documenté ici plutôt que modifié.
--
-- À exécuter une fois dans l'éditeur SQL Supabase. Rejouable sans risque
-- (CREATE OR REPLACE / DROP TRIGGER IF EXISTS / ADD COLUMN IF NOT
-- EXISTS). N'exécute aucun backfill ni recalcul rétroactif : les
-- articles déjà existants conservent leur coût actuel tel quel, qui
-- devient simplement le point de départ du premier réappro suivant.
-- ============================================================

-- Coût moyen obtenu après calcul pour CETTE entrée précisément (distinct
-- de prix_achat/frais_annexes ci-dessus, qui restent le coût du LOT reçu,
-- tel que saisi) — nullable : les réappros déjà existants avant cette
-- migration n'ont jamais eu ce calcul, et ne sont jamais recalculés
-- rétroactivement (on ne peut pas reconstituer de façon fiable le stock
-- exact au moment exact d'un réappro passé). Seuls les réappros créés
-- après cette migration (via le trigger ci-dessous) renseignent ces deux
-- colonnes.
alter table reappros add column if not exists prix_achat_moyen numeric;
alter table reappros add column if not exists frais_annexes_moyen numeric;

-- ------------------------------------------------------------
-- appliquer_cout_moyen_pondere() : BEFORE INSERT sur reappros.
--   1. Verrouille la ligne articles concernée (select ... for update) --
--      sérialise deux réappros quasi simultanés pour le même article
--      (le second attend la fin de la transaction du premier avant de
--      lire, et lit alors le stock/coût déjà mis à jour par le premier),
--      sans quoi deux calculs fondés sur le même stock de départ
--      produiraient une moyenne incohérente (perte d'une des deux mises
--      à jour).
--   2. Calcule la moyenne pondérée, séparément pour prix_achat et
--      frais_annexes :
--        (stock_actuel × coût_actuel + quantité_reçue × coût_du_lot)
--        ÷ (stock_actuel + quantité_reçue)
--      -- directement le coût du lot si stock_actuel <= 0 (rien à
--      pondérer avec un stock vide ou négatif).
--   3. Arrondit à 2 décimales (round(..., 2)) : arrondi identique à
--      chaque réapprovisionnement, jamais une précision qui varierait
--      d'un calcul à l'autre -- les montants FCFA affichés (toujours à
--      l'entier le plus proche, voir lib/format.js) restent cohérents
--      avec ce qui est stocké, sans dérive d'arrondi cumulée au fil des
--      réappros successifs.
--   4. Met à jour articles (stock += quantité, prix_achat/frais_annexes
--      = moyenne pondérée calculée) et renseigne
--      new.prix_achat_moyen/new.frais_annexes_moyen avant l'insertion
--      elle-même, pour que la ligne reappros conserve une trace exacte
--      du résultat obtenu à cette date précise.
-- SECURITY DEFINER : exécute ce calcul de façon fiable quel que soit
-- l'appelant, même principe que les autres triggers/fonctions de calcul
-- automatique de ce dépôt (ex. gerer_code_article(), voir
-- supabase-articles-code-migration.sql).
-- ------------------------------------------------------------
create or replace function appliquer_cout_moyen_pondere()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_stock_actuel integer;
  v_prix_achat_actuel numeric;
  v_frais_annexes_actuel numeric;
  v_nouveau_prix_achat numeric;
  v_nouveaux_frais_annexes numeric;
begin
  select stock, prix_achat, frais_annexes
    into v_stock_actuel, v_prix_achat_actuel, v_frais_annexes_actuel
    from articles
    where id = new.article_id
    for update;

  if not found then
    raise exception 'Article introuvable pour ce réapprovisionnement';
  end if;

  if v_stock_actuel > 0 then
    v_nouveau_prix_achat := round(
      (v_stock_actuel * v_prix_achat_actuel + new.quantite * new.prix_achat)
      / (v_stock_actuel + new.quantite), 2);
    v_nouveaux_frais_annexes := round(
      (v_stock_actuel * v_frais_annexes_actuel + new.quantite * new.frais_annexes)
      / (v_stock_actuel + new.quantite), 2);
  else
    v_nouveau_prix_achat := round(new.prix_achat, 2);
    v_nouveaux_frais_annexes := round(new.frais_annexes, 2);
  end if;

  update articles
    set stock = stock + new.quantite,
        prix_achat = v_nouveau_prix_achat,
        frais_annexes = v_nouveaux_frais_annexes
    where id = new.article_id;

  new.prix_achat_moyen := v_nouveau_prix_achat;
  new.frais_annexes_moyen := v_nouveaux_frais_annexes;

  return new;
end;
$$;

drop trigger if exists trg_reappro_cout_moyen on reappros;
create trigger trg_reappro_cout_moyen
  before insert on reappros
  for each row
  execute function appliquer_cout_moyen_pondere();
