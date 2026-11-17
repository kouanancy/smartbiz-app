-- ============================================================
-- ARTICLES — statut actif / désactivé
-- À exécuter une fois dans l'éditeur SQL Supabase, après
-- supabase-achats-approvisionnement-migration.sql et
-- supabase-inventaire-migration.sql (dont elle redéfinit
-- creer_inventaire() pour y ajouter un filtre).
-- ============================================================

-- Même principe que supabase-clients-actif-migration.sql : un article
-- désactivé n'est plus proposé à la vente, au réapprovisionnement ni à
-- l'inventaire, mais sa ligne reste en base telle quelle (code, coût
-- moyen, stock conservés) — l'historique (commandes, réceptions,
-- inventaires déjà validés, trésorerie) continue de le référencer sans
-- rien casser, et il retrouve son état exact une fois réactivé.
alter table articles
  add column if not exists actif boolean not null default true;

-- ------------------------------------------------------------
-- Règle appliquée aussi côté base de données, pas seulement dans
-- l'interface : la création d'une ligne de commande ou d'une ligne de
-- réception sur un article désactivé est refusée, même par un appel
-- direct (API REST) qui contournerait l'écran de sélection. Ni l'un ni
-- l'autre trigger n'a besoin de SECURITY DEFINER : une simple lecture de
-- articles.actif, déjà couverte par la policy RLS existante pour le
-- propriétaire de la boutique.
-- ------------------------------------------------------------
create or replace function verifier_article_vendable_commande()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_actif boolean;
begin
  select actif into v_actif from articles where id = new.article_id;
  if v_actif is false then
    raise exception 'Cet article est désactivé : il ne peut plus être ajouté à une commande.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_verifier_article_vendable_commande on commande_lignes;
create trigger trg_verifier_article_vendable_commande
  before insert on commande_lignes
  for each row
  execute function verifier_article_vendable_commande();

-- article_id reste nullable sur reception_lignes (ligne "nouvel article"
-- d'un brouillon, voir supabase-achats-approvisionnement-migration.sql) :
-- ce cas ne peut évidemment pas référencer un article désactivé, seul le
-- cas "article existant" est concerné ici.
create or replace function verifier_article_receptionnable()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_actif boolean;
begin
  if new.article_id is null then
    return new;
  end if;
  select actif into v_actif from articles where id = new.article_id;
  if v_actif is false then
    raise exception 'Cet article est désactivé : il ne peut plus figurer dans une réception.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_verifier_article_receptionnable on reception_lignes;
create trigger trg_verifier_article_receptionnable
  before insert on reception_lignes
  for each row
  execute function verifier_article_receptionnable();

-- ------------------------------------------------------------
-- Désactivation d'un article (SECURITY DEFINER, vérifie elle-même la
-- boutique de l'appelant — comme valider_reception()) : refusée si
-- l'article figure encore dans au moins une commande en attente de
-- livraison (ni livrée, ni annulée) — qu'elle porte ou non un acompte
-- versé, un acompte ne fait qu'attester financièrement une réservation
-- déjà portée par le simple statut 'en_attente' (voir
-- supabase-commande-acomptes-migration.sql, verifier_stock_theorique_
-- acompte() : la réservation de stock théorique ne dépend que de ce
-- statut, jamais d'un acompte séparément). `for update` verrouille
-- l'article le temps de la vérification, comme valider_reception() sur
-- la réception. La réactivation, elle, ne nécessite aucune vérification
-- métier : un simple update côté client suffit (voir
-- app/(app)/articles/[id]/page.js), déjà couvert par la policy RLS
-- existante sur articles, même principe que clients.
-- ------------------------------------------------------------
create or replace function desactiver_article(p_article_id uuid)
returns articles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_article articles;
  v_numeros text;
begin
  select * into v_article from articles where id = p_article_id for update;
  if not found then
    raise exception 'Article introuvable';
  end if;

  if not exists (select 1 from businesses where id = v_article.business_id and owner_id = auth.uid()) then
    raise exception 'Boutique non autorisée pour cet article';
  end if;

  select string_agg(distinct c.numero, ', ' order by c.numero) into v_numeros
    from commande_lignes cl
    join commandes c on c.id = cl.commande_id
    where cl.article_id = p_article_id and c.statut = 'en_attente';

  if v_numeros is not null then
    raise exception 'Impossible de désactiver cet article : il figure dans la ou les commandes en attente % — livrez-les ou annulez-les d''abord.', v_numeros;
  end if;

  update articles set actif = false where id = p_article_id returning * into v_article;
  return v_article;
end;
$$;

grant execute on function desactiver_article(uuid) to authenticated;

-- ------------------------------------------------------------
-- Un article désactivé ne doit plus être proposé dans le périmètre d'un
-- nouvel inventaire — redéfinition de creer_inventaire() (supabase-
-- inventaire-migration.sql) à l'identique, seul le filtre sur
-- articles.actif est ajouté à la requête qui génère les lignes.
-- ------------------------------------------------------------
create or replace function creer_inventaire(p_categorie_ids uuid[] default null)
returns inventaires
language plpgsql
security definer
set search_path = public
as $$
declare
  v_business_id uuid;
  v_inventaire inventaires;
begin
  select id into v_business_id from businesses where owner_id = auth.uid();
  if v_business_id is null then
    raise exception 'Boutique introuvable pour ce compte';
  end if;

  if exists (select 1 from inventaires where business_id = v_business_id and statut = 'brouillon') then
    raise exception 'Un inventaire est déjà en brouillon pour cette boutique : terminez-le ou supprimez-le avant d''en créer un nouveau.';
  end if;

  insert into inventaires (business_id, perimetre_categorie_ids)
    values (v_business_id, p_categorie_ids)
    returning * into v_inventaire;

  insert into inventaire_lignes (inventaire_id, article_id, stock_debut)
    select v_inventaire.id, a.id, a.stock
    from articles a
    where a.business_id = v_business_id
      and a.actif
      and (p_categorie_ids is null or a.categorie_id = any(p_categorie_ids));

  return v_inventaire;
end;
$$;

grant execute on function creer_inventaire(uuid[]) to authenticated;
