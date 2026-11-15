-- ============================================================
-- INVENTAIRE (comptage physique du stock, écarts valorisés)
-- À exécuter une fois dans l'éditeur SQL Supabase, après
-- supabase-achats-approvisionnement-migration.sql (dont elle réutilise
-- module_achats_actif et la numérotation par compteur sur businesses --
-- même mécanisme, aucune nouvelle colonne d'activation). Rejouable sans
-- risque (create table if not exists, create or replace function,
-- drop trigger/policy/constraint if exists avant chaque create).
-- ============================================================

-- ------------------------------------------------------------
-- 1. ACCÈS — aucune nouvelle colonne d'activation : la carte Inventaire
-- de l'écran Stock n'est visible que si module_achats_actif est déjà
-- vrai pour la boutique (même interrupteur que le module Achats, voir
-- app/(app)/admin/commercants/[id]/page.js) -- un commerçant qui n'a pas
-- le module Achats n'a pas non plus l'Inventaire.
--
-- Compteur de numérotation des inventaires, même principe que
-- next_numero_reception : jamais accordé à authenticated, incrémenté
-- uniquement par le trigger SECURITY DEFINER gerer_numero_inventaire()
-- plus bas.
-- ------------------------------------------------------------
alter table businesses add column if not exists next_numero_inventaire integer not null default 1;

-- ------------------------------------------------------------
-- 2. TABLES
-- ------------------------------------------------------------
-- perimetre_categorie_ids : null = toutes les catégories (et les
-- articles sans catégorie) ; un tableau non vide restreint aux
-- catégories listées. Jamais dénormalisé (noms de catégories) : résolu
-- côté client à partir de la liste des catégories déjà chargée ailleurs.
create table if not exists inventaires (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  numero text not null,
  date_inventaire date not null default current_date,
  perimetre_categorie_ids uuid[],
  statut text not null default 'brouillon', -- 'brouillon' | 'valide'
  created_at timestamptz not null default now(),
  validated_at timestamptz
);

create index if not exists inventaires_business_idx on inventaires (business_id, created_at desc);

alter table inventaires drop constraint if exists inventaires_business_numero_unique;
alter table inventaires add constraint inventaires_business_numero_unique unique (business_id, numero);

-- "Un seul inventaire en brouillon à la fois par boutique, appliquée
-- côté base" : un index unique partiel, pas une simple vérification
-- applicative -- une seconde ligne 'brouillon' pour la même boutique
-- viole l'index et échoue, y compris via un appel direct à l'API REST.
drop index if exists inventaires_un_brouillon_par_boutique;
create unique index inventaires_un_brouillon_par_boutique on inventaires (business_id) where statut = 'brouillon';

alter table inventaires enable row level security;
drop policy if exists "Accès limité à sa boutique" on inventaires;
create policy "Accès limité à sa boutique" on inventaires for all
  using (business_id in (select id from businesses where owner_id = auth.uid()));

-- article_id jamais nul (contrairement à reception_lignes) : une ligne
-- d'inventaire porte toujours sur un article déjà existant, aucune
-- création d'article ici. Pas de "on delete cascade"/"set null" : comme
-- commande_lignes.article_id (smartbiz-schema.sql), un article déjà
-- compté dans un inventaire (brouillon ou validé) ne peut pas être
-- supprimé tant que la ligne existe -- cohérent avec le principe déjà en
-- place de ne jamais perdre une pièce d'historique métier en supprimant
-- silencieusement l'article qu'elle concerne.
create table if not exists inventaire_lignes (
  id uuid primary key default gen_random_uuid(),
  inventaire_id uuid not null references inventaires(id) on delete cascade,
  article_id uuid not null references articles(id),
  stock_debut integer not null,
  quantite_comptee integer,
  stock_validation integer,
  ecart integer,
  cout_moyen_validation numeric,
  remarque text,
  stock_modifie_depuis_debut boolean not null default false,
  created_at timestamptz not null default now(),
  constraint inventaire_lignes_quantite_comptee_check check (quantite_comptee is null or quantite_comptee >= 0)
);

create index if not exists inventaire_lignes_inventaire_idx on inventaire_lignes (inventaire_id);
create index if not exists inventaire_lignes_article_idx on inventaire_lignes (article_id);
alter table inventaire_lignes drop constraint if exists inventaire_lignes_inventaire_article_unique;
alter table inventaire_lignes add constraint inventaire_lignes_inventaire_article_unique unique (inventaire_id, article_id);

alter table inventaire_lignes enable row level security;
drop policy if exists "Accès limité à sa boutique" on inventaire_lignes;
create policy "Accès limité à sa boutique" on inventaire_lignes for all
  using (inventaire_id in (
    select id from inventaires where business_id in (
      select id from businesses where owner_id = auth.uid()
    )
  ));

-- ------------------------------------------------------------
-- 3. NUMÉROTATION INV-0001 — même principe que gerer_numero_reception()
-- (supabase-achats-approvisionnement-migration.sql).
-- ------------------------------------------------------------
create or replace function gerer_numero_inventaire()
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
      set next_numero_inventaire = next_numero_inventaire + 1
      where id = new.business_id
      returning next_numero_inventaire - 1 into v_numero;
    if not found then
      raise exception 'Boutique introuvable pour l''attribution du numéro d''inventaire';
    end if;
    new.numero := 'INV-' || lpad(v_numero::text, 4, '0');
  elsif tg_op = 'UPDATE' then
    new.numero := old.numero;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_numero_inventaire_insert on inventaires;
create trigger trg_numero_inventaire_insert
  before insert on inventaires
  for each row
  execute function gerer_numero_inventaire();

drop trigger if exists trg_numero_inventaire_update on inventaires;
create trigger trg_numero_inventaire_update
  before update on inventaires
  for each row
  execute function gerer_numero_inventaire();

-- ------------------------------------------------------------
-- 4. VERROUILLAGE APRÈS VALIDATION
-- "Un inventaire validé n'est plus modifiable." Même technique que pour
-- les réceptions (supabase-achats-approvisionnement-migration.sql) :
-- ni l'une ni l'autre des fonctions ci-dessous n'est SECURITY DEFINER,
-- pour que current_user reflète réellement l'appelant (authenticated
-- pour un appel direct, le propriétaire de la fonction -- jamais
-- 'authenticated' -- à l'intérieur de valider_inventaire(), SECURITY
-- DEFINER, plus bas).
-- ------------------------------------------------------------
create or replace function verrouiller_inventaire_valide()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    if old.statut <> 'brouillon' then
      raise exception 'Seul un inventaire encore en brouillon peut être supprimé.';
    end if;
    return old;
  end if;

  if current_user = 'authenticated' and old.statut <> 'brouillon' then
    raise exception 'Cet inventaire est déjà validé et n''est plus modifiable.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_verrouiller_inventaire_update on inventaires;
create trigger trg_verrouiller_inventaire_update
  before update on inventaires
  for each row
  execute function verrouiller_inventaire_valide();

drop trigger if exists trg_verrouiller_inventaire_delete on inventaires;
create trigger trg_verrouiller_inventaire_delete
  before delete on inventaires
  for each row
  execute function verrouiller_inventaire_valide();

create or replace function verrouiller_inventaire_ligne()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_statut text;
begin
  select statut into v_statut from inventaires where id = coalesce(new.inventaire_id, old.inventaire_id);

  if current_user = 'authenticated' and v_statut is distinct from 'brouillon' then
    raise exception 'Cet inventaire est déjà validé et n''est plus modifiable.';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_verrouiller_inventaire_ligne on inventaire_lignes;
create trigger trg_verrouiller_inventaire_ligne
  before insert or update or delete on inventaire_lignes
  for each row
  execute function verrouiller_inventaire_ligne();

-- ------------------------------------------------------------
-- 5. CRÉATION D'UN INVENTAIRE (transaction atomique)
-- SECURITY DEFINER, détermine elle-même la boutique de l'appelant
-- (owner_id = auth.uid()) -- comme valider_reception(). Génère les
-- lignes à partir du stock RÉEL actuel de chaque article du périmètre,
-- figé une fois pour toutes dans stock_debut : un réapprovisionnement ou
-- une vente survenant après la création de l'inventaire ne modifie
-- jamais stock_debut, seulement ce que l'article affiche par ailleurs
-- (d'où la détection stock_modifie_depuis_debut à la validation).
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
      and (p_categorie_ids is null or a.categorie_id = any(p_categorie_ids));

  return v_inventaire;
end;
$$;

grant execute on function creer_inventaire(uuid[]) to authenticated;

-- ------------------------------------------------------------
-- 6. VALIDATION D'UN INVENTAIRE (transaction atomique)
-- SECURITY DEFINER, vérifie elle-même la boutique de l'appelant.
-- `select ... for update` sur l'inventaire sérialise tout double clic,
-- même principe que valider_reception().
--
-- Ne touche jamais prix_achat/frais_annexes (coût moyen inchangé, voir
-- la demande) ni les commande_lignes/commande_acomptes (réservations) :
-- seul articles.stock est écrit, pour chaque article compté -- le stock
-- théorique (stock réel − quantités réservées par les commandes en
-- attente, déjà calculé côté app, voir app/(app)/articles/page.js,
-- stockTheorique()) reste donc automatiquement juste après validation,
-- sans aucun calcul à dupliquer ici.
--
-- p_confirmer_ecarts_stock : si le stock réel d'au moins un article
-- compté a changé depuis stock_debut (vente/réception survenue pendant
-- que l'inventaire était ouvert) et que ce paramètre vaut encore false,
-- la fonction s'arrête avant toute écriture avec un message sentinelle
-- que le client reconnaît pour afficher une confirmation explicite, puis
-- rappelle cette même fonction avec p_confirmer_ecarts_stock = true.
-- L'écart définitif est dans tous les cas calculé sur le stock réel
-- actuel au moment de la validation, jamais sur stock_debut.
-- ------------------------------------------------------------
create or replace function valider_inventaire(p_inventaire_id uuid, p_confirmer_ecarts_stock boolean default false)
returns inventaires
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inventaire inventaires;
  v_ligne record;
  v_stock_actuel integer;
  v_cout_moyen numeric;
  v_nb_comptes integer;
  v_stock_modifie boolean;
begin
  select * into v_inventaire from inventaires where id = p_inventaire_id for update;
  if not found then
    raise exception 'Inventaire introuvable';
  end if;

  if not exists (select 1 from businesses where id = v_inventaire.business_id and owner_id = auth.uid()) then
    raise exception 'Boutique non autorisée pour cet inventaire';
  end if;

  if v_inventaire.statut <> 'brouillon' then
    raise exception 'Cet inventaire a déjà été validé.';
  end if;

  select count(*) into v_nb_comptes from inventaire_lignes where inventaire_id = p_inventaire_id and quantite_comptee is not null;
  if v_nb_comptes = 0 then
    raise exception 'Au moins un article doit être compté avant de valider.';
  end if;

  select exists (
    select 1
    from inventaire_lignes il
    join articles a on a.id = il.article_id
    where il.inventaire_id = p_inventaire_id and il.quantite_comptee is not null and a.stock <> il.stock_debut
  ) into v_stock_modifie;

  if v_stock_modifie and not p_confirmer_ecarts_stock then
    raise exception 'STOCK_MODIFIE_DEPUIS_DEBUT';
  end if;

  for v_ligne in
    select * from inventaire_lignes
    where inventaire_id = p_inventaire_id and quantite_comptee is not null
    order by created_at asc, id asc
  loop
    select stock, prix_achat + coalesce(frais_annexes, 0)
      into v_stock_actuel, v_cout_moyen
      from articles where id = v_ligne.article_id for update;

    update inventaire_lignes
      set stock_validation = v_stock_actuel,
          ecart = v_ligne.quantite_comptee - v_stock_actuel,
          cout_moyen_validation = v_cout_moyen,
          stock_modifie_depuis_debut = (v_stock_actuel <> v_ligne.stock_debut)
      where id = v_ligne.id;

    update articles set stock = v_ligne.quantite_comptee where id = v_ligne.article_id;
  end loop;

  update inventaires set statut = 'valide', validated_at = now()
    where id = p_inventaire_id
    returning * into v_inventaire;

  return v_inventaire;
end;
$$;

grant execute on function valider_inventaire(uuid, boolean) to authenticated;
