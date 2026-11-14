-- ============================================================
-- ACHATS ET APPROVISIONNEMENT (réceptions de marchandise)
-- À exécuter une fois dans l'éditeur SQL Supabase, après
-- supabase-reappro-cout-moyen-migration.sql et
-- supabase-articles-code-migration.sql (dont elle réutilise la logique).
-- Rejouable sans risque (create table if not exists, create or replace
-- function, drop trigger/policy/constraint if exists avant chaque create).
-- ============================================================

-- ------------------------------------------------------------
-- 1. ACTIVATION PAR BOUTIQUE
-- module_achats_actif, comme subscription_status/is_admin, n'est jamais
-- accordée en écriture à `authenticated` (voir le GRANT UPDATE de
-- supabase-businesses-colonnes-restreintes-migration.sql, qui ne la liste
-- pas et ne doit jamais la lister) : seule admin_set_module_achats_actif()
-- plus bas, SECURITY DEFINER, peut la modifier. Activée tout de suite
-- pour les comptes admin, pour pouvoir tester le module sans dépendre
-- d'un aller-retour dans l'Administration.
alter table businesses add column if not exists module_achats_actif boolean not null default false;
update businesses set module_achats_actif = true where is_admin = true and not module_achats_actif;

-- Compteur de numérotation des réceptions, même principe que
-- next_code_article (supabase-articles-code-migration.sql) : jamais
-- accordé à authenticated, incrémenté uniquement par le trigger
-- SECURITY DEFINER gerer_numero_reception() plus bas.
alter table businesses add column if not exists next_numero_reception integer not null default 1;

-- ------------------------------------------------------------
-- 2. LOGIQUE DE COÛT MOYEN PONDÉRÉ PARTAGÉE
-- Extrait du calcul déjà posé par appliquer_cout_moyen_pondere()
-- (supabase-reappro-cout-moyen-migration.sql, déclenché par un INSERT
-- dans reappros -- ancien réapprovisionnement, module Achats inactif) pour
-- que valider_reception() plus bas applique exactement la même formule,
-- sans la dupliquer sous une autre forme : stock actuel > 0 -> moyenne
-- pondérée arrondie à 2 décimales, sinon le coût du lot s'applique
-- directement. appliquer_cout_moyen_pondere() est ensuite redéfinie pour
-- appeler cette fonction plutôt que de refaire le calcul elle-même --
-- comportement strictement inchangé, juste la formule mise en commun.
-- ------------------------------------------------------------
create or replace function calculer_cout_moyen_pondere(
  p_stock_actuel integer,
  p_cout_actuel numeric,
  p_quantite numeric,
  p_cout_lot numeric
) returns numeric
language sql
immutable
as $$
  select case
    when p_stock_actuel > 0 then
      round((p_stock_actuel * p_cout_actuel + p_quantite * p_cout_lot) / (p_stock_actuel + p_quantite), 2)
    else
      round(p_cout_lot, 2)
  end;
$$;

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

  v_nouveau_prix_achat := calculer_cout_moyen_pondere(v_stock_actuel, v_prix_achat_actuel, new.quantite, new.prix_achat);
  v_nouveaux_frais_annexes := calculer_cout_moyen_pondere(v_stock_actuel, v_frais_annexes_actuel, new.quantite, new.frais_annexes);

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

-- ------------------------------------------------------------
-- 3. TABLES
-- ------------------------------------------------------------
create table if not exists receptions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  numero text not null,
  date_reception date not null default current_date,
  fournisseur text,
  statut text not null default 'brouillon', -- 'brouillon' | 'validee' | 'annulee'
  frais_groupes boolean not null default false,
  frais_total numeric not null default 0 check (frais_total >= 0),
  taux_change_valeur numeric,
  taux_change_devise text,
  created_at timestamptz not null default now(),
  validated_at timestamptz,
  cancelled_at timestamptz
);

create index if not exists receptions_business_idx on receptions (business_id, created_at desc);

alter table receptions drop constraint if exists receptions_business_numero_unique;
alter table receptions add constraint receptions_business_numero_unique unique (business_id, numero);

alter table receptions enable row level security;
drop policy if exists "Accès limité à sa boutique" on receptions;
create policy "Accès limité à sa boutique" on receptions for all
  using (business_id in (select id from businesses where owner_id = auth.uid()));

-- article_id reste nullable tant que l'article n'est pas encore créé
-- (ligne "nouvel article" d'un brouillon) -- rempli par valider_reception()
-- à la validation. "on delete set null" plutôt que cascade : si l'article
-- est supprimé plus tard (supprimerArticle(), app/(app)/articles/[id]/page.js),
-- la ligne de réception reste comme pièce d'historique/impression, avec
-- son nom et ses montants déjà enregistrés en dur sur la ligne elle-même.
create table if not exists reception_lignes (
  id uuid primary key default gen_random_uuid(),
  reception_id uuid not null references receptions(id) on delete cascade,
  article_id uuid references articles(id) on delete set null,
  nom_nouvel_article text,
  categorie_id uuid references categories(id),
  unite text,
  image_url text,
  prix_vente numeric,
  quantite integer not null check (quantite > 0),
  cout_unitaire numeric not null default 0 check (cout_unitaire >= 0),
  frais_annexes numeric not null default 0 check (frais_annexes >= 0),
  frais_repartis numeric not null default 0,
  cout_revient_unitaire numeric,
  stock_avant integer,
  stock_apres integer,
  prix_achat_moyen_avant numeric,
  prix_achat_moyen_apres numeric,
  frais_annexes_moyen_avant numeric,
  frais_annexes_moyen_apres numeric,
  created_at timestamptz not null default now(),
  constraint reception_lignes_article_ou_nouveau
    check (article_id is not null or coalesce(trim(nom_nouvel_article), '') <> '')
);

create index if not exists reception_lignes_reception_idx on reception_lignes (reception_id);
create index if not exists reception_lignes_article_idx on reception_lignes (article_id);

alter table reception_lignes enable row level security;
drop policy if exists "Accès limité à sa boutique" on reception_lignes;
create policy "Accès limité à sa boutique" on reception_lignes for all
  using (reception_id in (
    select id from receptions where business_id in (
      select id from businesses where owner_id = auth.uid()
    )
  ));

-- ------------------------------------------------------------
-- 4. NUMÉROTATION REC-0001 — même principe que gerer_code_article()
-- (supabase-articles-code-migration.sql) : attribué par un trigger
-- SECURITY DEFINER qui verrouille et incrémente le compteur de la
-- boutique de façon atomique, jamais par le client ; numero redevient
-- immuable après coup (UPDATE force new.numero := old.numero).
-- ------------------------------------------------------------
create or replace function gerer_numero_reception()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_numero integer;
begin
  if tg_op = 'INSERT' then
    update businesses
      set next_numero_reception = next_numero_reception + 1
      where id = new.business_id
      returning next_numero_reception - 1 into v_numero;
    if not found then
      raise exception 'Boutique introuvable pour l''attribution du numéro de réception';
    end if;
    new.numero := 'REC-' || lpad(v_numero::text, 4, '0');
  elsif tg_op = 'UPDATE' then
    new.numero := old.numero;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_numero_reception_insert on receptions;
create trigger trg_numero_reception_insert
  before insert on receptions
  for each row
  execute function gerer_numero_reception();

drop trigger if exists trg_numero_reception_update on receptions;
create trigger trg_numero_reception_update
  before update on receptions
  for each row
  execute function gerer_numero_reception();

-- ------------------------------------------------------------
-- 5. VERROUILLAGE APRÈS VALIDATION/ANNULATION
-- "Un brouillon est modifiable et supprimable. Une réception validée ou
-- annulée n'est plus modifiable." current_user bascule sur le
-- propriétaire de la fonction à l'intérieur de valider_reception()/
-- annuler_reception() (SECURITY DEFINER, plus bas) -- jamais 'authenticated'
-- -- donc leurs propres écritures sur receptions/reception_lignes ne sont
-- jamais bloquées ici ; seul un appel direct du client (formulaire,
-- API REST) est concerné.
-- ------------------------------------------------------------
-- Ni l'une ni l'autre des trois fonctions de verrouillage ci-dessous
-- n'est SECURITY DEFINER (contrairement aux triggers d'écriture plus
-- haut) : c'est précisément ce qui leur permet de lire current_user tel
-- qu'il est réellement au moment de l'appel (le rôle qui a déclenché le
-- trigger) -- une fonction SECURITY DEFINER verrait toujours son propre
-- propriétaire, jamais 'authenticated', ce qui rendrait ce test inutile.
create or replace function verrouiller_reception_validee()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    if old.statut <> 'brouillon' then
      raise exception 'Seule une réception encore en brouillon peut être supprimée.';
    end if;
    return old;
  end if;

  if current_user = 'authenticated' and old.statut <> 'brouillon' then
    raise exception 'Une réception validée ou annulée n''est plus modifiable.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_verrouiller_reception_update on receptions;
create trigger trg_verrouiller_reception_update
  before update on receptions
  for each row
  execute function verrouiller_reception_validee();

drop trigger if exists trg_verrouiller_reception_delete on receptions;
create trigger trg_verrouiller_reception_delete
  before delete on receptions
  for each row
  execute function verrouiller_reception_validee();

create or replace function verrouiller_reception_ligne()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_statut text;
begin
  select statut into v_statut from receptions where id = coalesce(new.reception_id, old.reception_id);

  if current_user = 'authenticated' and v_statut is distinct from 'brouillon' then
    raise exception 'Une réception validée ou annulée n''est plus modifiable.';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_verrouiller_reception_ligne on reception_lignes;
create trigger trg_verrouiller_reception_ligne
  before insert or update or delete on reception_lignes
  for each row
  execute function verrouiller_reception_ligne();

-- ------------------------------------------------------------
-- 6. VERROUILLAGE DU COÛT D'ACHAT SUR LES ARTICLES (module actif)
-- "Non modifiables à la main : le coût d'achat et le coût moyen". La
-- restriction ne peut pas être un simple GRANT/REVOKE de colonne (comme
-- next_code_article) puisqu'elle dépend de module_achats_actif, propre à
-- chaque boutique -- elle est donc posée par ce trigger, qui ne bloque que
-- les appels directs du client (current_user = 'authenticated'). Le
-- trigger de coût moyen (appliquer_cout_moyen_pondere(), déclenché par
-- reappros) et valider_reception()/annuler_reception() plus bas
-- s'exécutent tous en SECURITY DEFINER : leurs propres UPDATE sur
-- articles tournent sous le propriétaire de la fonction, jamais
-- 'authenticated', donc jamais bloqués ici -- module actif ou non.
-- ------------------------------------------------------------
create or replace function verrouiller_cout_achat_module_actif()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_module_actif boolean;
begin
  if current_user <> 'authenticated' then
    return new;
  end if;

  if new.prix_achat is distinct from old.prix_achat or new.frais_annexes is distinct from old.frais_annexes then
    select module_achats_actif into v_module_actif from businesses where id = new.business_id;
    if v_module_actif then
      raise exception 'Le coût d''achat et le coût moyen ne sont modifiables que via une réception.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_verrouiller_cout_achat on articles;
create trigger trg_verrouiller_cout_achat
  before update on articles
  for each row
  execute function verrouiller_cout_achat_module_actif();

-- ------------------------------------------------------------
-- 7. VALIDATION D'UNE RÉCEPTION (transaction atomique)
-- SECURITY DEFINER, vérifie elle-même que la boutique de la réception
-- appartient à l'appelant (owner_id = auth.uid()) -- comme
-- verifier_expiration_abonnement(). `select ... for update` sur la
-- réception sérialise tout double clic : le second appel voit déjà
-- statut <> 'brouillon' une fois le premier terminé, et échoue proprement
-- plutôt que de revalider. Tous les contrôles (au moins une ligne,
-- quantités/coûts/frais valides, noms de nouveaux articles non vides et
-- non dupliqués) sont vérifiés avant toute écriture : en cas d'échec,
-- rien n'est créé ni modifié.
-- ------------------------------------------------------------
create or replace function valider_reception(p_reception_id uuid)
returns receptions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reception receptions;
  v_ligne record;
  v_article_id uuid;
  v_stock_actuel integer;
  v_prix_achat_actuel numeric;
  v_frais_annexes_actuel numeric;
  v_nouveau_prix_achat numeric;
  v_nouveaux_frais_annexes numeric;
  v_cout_revient numeric;
  v_total_achat numeric := 0;
  v_cumul_frais numeric := 0;
  v_part numeric;
  v_nb_lignes integer;
  v_rang integer := 0;
begin
  select * into v_reception from receptions where id = p_reception_id for update;
  if not found then
    raise exception 'Réception introuvable';
  end if;

  if not exists (select 1 from businesses where id = v_reception.business_id and owner_id = auth.uid()) then
    raise exception 'Boutique non autorisée pour cette réception';
  end if;

  if v_reception.statut <> 'brouillon' then
    raise exception 'Cette réception a déjà été validée ou annulée.';
  end if;

  select count(*) into v_nb_lignes from reception_lignes where reception_id = p_reception_id;
  if v_nb_lignes = 0 then
    raise exception 'Une réception doit contenir au moins une ligne.';
  end if;

  for v_ligne in select * from reception_lignes where reception_id = p_reception_id loop
    if v_ligne.quantite <= 0 then
      raise exception 'Quantité invalide pour une ligne de réception.';
    end if;
    if v_ligne.cout_unitaire < 0 or coalesce(v_ligne.frais_annexes, 0) < 0 then
      raise exception 'Les coûts et frais annexes ne peuvent pas être négatifs.';
    end if;
    if v_ligne.article_id is null and coalesce(trim(v_ligne.nom_nouvel_article), '') = '' then
      raise exception 'Le nom du nouvel article est obligatoire.';
    end if;
    v_total_achat := v_total_achat + (v_ligne.quantite * v_ligne.cout_unitaire);
  end loop;

  if exists (
    select 1 from reception_lignes
    where reception_id = p_reception_id and article_id is null
    group by lower(trim(nom_nouvel_article))
    having count(*) > 1
  ) then
    raise exception 'Deux lignes ne peuvent pas créer un article du même nom.';
  end if;

  if exists (
    select 1 from reception_lignes rl
    join articles a on a.business_id = v_reception.business_id and lower(trim(a.nom)) = lower(trim(rl.nom_nouvel_article))
    where rl.reception_id = p_reception_id and rl.article_id is null
  ) then
    raise exception 'Un article du même nom existe déjà dans le stock.';
  end if;

  for v_ligne in select * from reception_lignes where reception_id = p_reception_id order by created_at asc, id asc loop
    v_rang := v_rang + 1;
    v_article_id := v_ligne.article_id;

    if v_article_id is null then
      insert into articles (business_id, nom, categorie_id, unite, image_url, prix_vente, prix_achat, frais_annexes, stock, seuil)
      values (
        v_reception.business_id,
        trim(v_ligne.nom_nouvel_article),
        v_ligne.categorie_id,
        coalesce(v_ligne.unite, 'unite'),
        v_ligne.image_url,
        coalesce(v_ligne.prix_vente, 0),
        0, 0, 0, 0
      )
      returning id into v_article_id;
    end if;

    select stock, prix_achat, frais_annexes
      into v_stock_actuel, v_prix_achat_actuel, v_frais_annexes_actuel
      from articles where id = v_article_id for update;

    -- Frais groupés : part au prorata de la valeur d'achat de la ligne
    -- (quantité × coût unitaire) ; la dernière ligne reçoit le reste exact
    -- plutôt qu'une part arrondie séparément, pour que la somme des parts
    -- égale toujours le total saisi. Sinon, le montant saisi directement
    -- sur la ligne (0 si vide).
    if v_reception.frais_groupes then
      if v_rang = v_nb_lignes then
        v_part := round(v_reception.frais_total - v_cumul_frais, 2);
      elsif v_total_achat > 0 then
        v_part := round(v_reception.frais_total * (v_ligne.quantite * v_ligne.cout_unitaire) / v_total_achat, 2);
        v_cumul_frais := v_cumul_frais + v_part;
      else
        v_part := 0;
      end if;
    else
      v_part := coalesce(v_ligne.frais_annexes, 0);
    end if;

    v_cout_revient := round(v_ligne.cout_unitaire + (v_part / v_ligne.quantite), 2);

    v_nouveau_prix_achat := calculer_cout_moyen_pondere(v_stock_actuel, v_prix_achat_actuel, v_ligne.quantite, v_ligne.cout_unitaire);
    v_nouveaux_frais_annexes := calculer_cout_moyen_pondere(v_stock_actuel, v_frais_annexes_actuel, v_ligne.quantite, v_part / v_ligne.quantite);

    update articles
      set stock = stock + v_ligne.quantite,
          prix_achat = v_nouveau_prix_achat,
          frais_annexes = v_nouveaux_frais_annexes
      where id = v_article_id;

    update reception_lignes
      set article_id = v_article_id,
          frais_repartis = v_part,
          cout_revient_unitaire = v_cout_revient,
          stock_avant = v_stock_actuel,
          stock_apres = v_stock_actuel + v_ligne.quantite,
          prix_achat_moyen_avant = v_prix_achat_actuel,
          prix_achat_moyen_apres = v_nouveau_prix_achat,
          frais_annexes_moyen_avant = v_frais_annexes_actuel,
          frais_annexes_moyen_apres = v_nouveaux_frais_annexes
      where id = v_ligne.id;
  end loop;

  update receptions set statut = 'validee', validated_at = now()
    where id = p_reception_id
    returning * into v_reception;

  return v_reception;
end;
$$;

grant execute on function valider_reception(uuid) to authenticated;

-- ------------------------------------------------------------
-- 8. ANNULATION D'UNE RÉCEPTION VALIDÉE
-- Possible uniquement si elle est la plus récente réception validée pour
-- CHACUN de ses articles (sinon une correction par une nouvelle réception
-- est demandée, pour ne jamais ré-écrire une moyenne pondérée au milieu de
-- l'historique) et si le stock actuel couvre encore la quantité reçue.
-- "distinct on (article_id)" : une même réception peut recevoir un même
-- article sur plusieurs lignes (vagues successives) -- seule la première
-- ligne de CETTE réception pour un article donné porte le véritable état
-- "avant" à restaurer, les lignes suivantes n'ayant fait qu'affiner la
-- moyenne déjà en cours depuis cette première ligne.
-- ------------------------------------------------------------
create or replace function annuler_reception(p_reception_id uuid)
returns receptions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reception receptions;
  v_ligne record;
  v_stock_actuel integer;
  v_derniere_reception_id uuid;
begin
  select * into v_reception from receptions where id = p_reception_id for update;
  if not found then
    raise exception 'Réception introuvable';
  end if;

  if not exists (select 1 from businesses where id = v_reception.business_id and owner_id = auth.uid()) then
    raise exception 'Boutique non autorisée pour cette réception';
  end if;

  if v_reception.statut <> 'validee' then
    raise exception 'Seule une réception validée peut être annulée.';
  end if;

  for v_ligne in
    select distinct on (article_id) *
    from reception_lignes
    where reception_id = p_reception_id and article_id is not null
    order by article_id, created_at asc, id asc
  loop
    select rl2.reception_id into v_derniere_reception_id
    from reception_lignes rl2
    join receptions r2 on r2.id = rl2.reception_id
    where rl2.article_id = v_ligne.article_id and r2.statut = 'validee'
    order by r2.validated_at desc, r2.created_at desc
    limit 1;

    if v_derniere_reception_id is distinct from p_reception_id then
      raise exception 'Cette réception n''est plus la plus récente pour un de ses articles : corrigez par une nouvelle réception.';
    end if;

    select stock into v_stock_actuel from articles where id = v_ligne.article_id;
    if v_stock_actuel < v_ligne.quantite then
      raise exception 'Le stock actuel ne couvre plus la quantité reçue par cette réception : corrigez par une nouvelle réception.';
    end if;
  end loop;

  for v_ligne in
    select distinct on (article_id) *
    from reception_lignes
    where reception_id = p_reception_id and article_id is not null
    order by article_id, created_at asc, id asc
  loop
    update articles
      set stock = v_ligne.stock_avant,
          prix_achat = v_ligne.prix_achat_moyen_avant,
          frais_annexes = v_ligne.frais_annexes_moyen_avant
      where id = v_ligne.article_id;
  end loop;

  update receptions set statut = 'annulee', cancelled_at = now()
    where id = p_reception_id
    returning * into v_reception;

  return v_reception;
end;
$$;

grant execute on function annuler_reception(uuid) to authenticated;

-- ------------------------------------------------------------
-- 9. ADMINISTRATION — interrupteur module_achats_actif
-- admin_list_businesses() déjà étendue (supabase-admin-liste-paiements-
-- migration.sql) pour renvoyer `plan` -- Postgres refuse un simple
-- `create or replace` quand la liste des colonnes de retour change
-- (ERROR 42P13), il faut donc la supprimer avant de la recréer avec
-- module_achats_actif en plus. admin_set_module_achats_actif() suit
-- exactement le même principe que admin_set_is_admin() (supabase-admin-
-- scope-abonnement-migration.sql).
-- ------------------------------------------------------------
drop function if exists admin_list_businesses();

create function admin_list_businesses()
returns table (
  id uuid,
  owner_id uuid,
  name text,
  email text,
  subscription_status text,
  subscription_expires_at timestamptz,
  is_admin boolean,
  plan text,
  module_achats_actif boolean
)
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  if not is_admin_user() then
    raise exception 'Accès réservé aux administrateurs';
  end if;
  return query
    select b.id, b.owner_id, b.name, b.email, b.subscription_status, b.subscription_expires_at, b.is_admin, b.plan, b.module_achats_actif
    from businesses b;
end;
$$;

grant execute on function admin_list_businesses() to authenticated;

create or replace function admin_set_module_achats_actif(p_business_id uuid, p_actif boolean)
returns table (
  id uuid,
  owner_id uuid,
  name text,
  email text,
  subscription_status text,
  subscription_expires_at timestamptz,
  is_admin boolean,
  plan text,
  module_achats_actif boolean
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_admin_user() then
    raise exception 'Accès réservé aux administrateurs';
  end if;
  return query
    update businesses b
    set module_achats_actif = p_actif
    where b.id = p_business_id
    returning b.id, b.owner_id, b.name, b.email, b.subscription_status, b.subscription_expires_at, b.is_admin, b.plan, b.module_achats_actif;
end;
$$;

grant execute on function admin_set_module_achats_actif(uuid, boolean) to authenticated;
