-- ============================================================
-- BOUTIQUE EN LIGNE (module expérimental) — relie un compte Doka à un
-- site e-commerce externe (ex. le site NHL). Doka reste la référence pour
-- la marchandise (articles, stock, prix, photo principale) ; le site gère
-- la vitrine (description, photos supplémentaires, promotions) et ses
-- propres commandes, créées dans Doka "en_attente" puis confirmées
-- "livree"/"annulee" depuis l'administration du site.
--
-- À exécuter une fois dans l'éditeur SQL Supabase. Rejouable sans risque
-- (add column if not exists, create or replace function, drop
-- trigger/function if exists avant chaque create).
--
-- Portée : jamais de changement de comportement pour un commerçant sans
-- le module (businesses.module_boutique_en_ligne_actif, par défaut
-- false, modifiable uniquement par une administratrice — voir section 1).
-- Code générique ("boutique en ligne", jamais "NHL" en dur) : ce module
-- pourra être proposé à d'autres commerçants plus tard, chacun avec sa
-- propre adresse de site et sa propre clé.
--
-- Fonctions security definer avec `set search_path = ''` (plutôt que
-- `set search_path = public` comme le reste de ce dépôt) : ce module
-- manipule une clé d'API externe (boutique_en_ligne_connexions.cle) et
-- échange avec un site tiers — durcissement volontaire contre tout
-- détournement de search_path, chaque référence à une table est donc
-- explicitement qualifiée `public....` ci-dessous. gen_random_bytes()/
-- digest() (pgcrypto) sont référencées `extensions.` : c'est le schéma où
-- Supabase installe pgcrypto par défaut sur les projets récents — si ce
-- projet l'a installée ailleurs (vérifiable avec `\dx pgcrypto` ou
-- `select extnamespace::regnamespace from pg_extension where extname =
-- 'pgcrypto'`), remplacer `extensions.` par le bon schéma dans
-- boutique_en_ligne_generer_cle() plus bas avant de rejouer ce fichier.
-- ============================================================

-- ------------------------------------------------------------
-- 1. ACTIVATION PAR BOUTIQUE — même principe exact que
-- module_achats_actif (supabase-achats-approvisionnement-migration.sql) :
-- jamais accordée en écriture à `authenticated` (absente du GRANT UPDATE
-- de supabase-businesses-colonnes-restreintes-migration.sql, qui ne doit
-- jamais la lister), modifiable uniquement par
-- admin_set_module_boutique_en_ligne_actif() plus bas (SECURITY DEFINER,
-- is_admin_user()) et par l'interrupteur correspondant sur la fiche d'un
-- commerçant dans l'espace Administration. Activée tout de suite pour les
-- comptes admin, pour pouvoir tester le module sans dépendre d'un
-- aller-retour dans l'Administration.
-- ------------------------------------------------------------
create extension if not exists pg_net;
create extension if not exists pgcrypto;

alter table businesses add column if not exists module_boutique_en_ligne_actif boolean not null default false;
update businesses set module_boutique_en_ligne_actif = true where is_admin = true and not module_boutique_en_ligne_actif;

-- admin_list_businesses()/admin_set_module_achats_actif() renvoient déjà
-- module_achats_actif : étendues ici avec module_boutique_en_ligne_actif,
-- pour que l'espace Administration affiche et modifie les deux modules
-- avec les mêmes fonctions déjà en place. Postgres refuse un simple
-- `create or replace` quand la liste des colonnes de retour change (ERROR
-- 42P13) -- il faut d'abord les supprimer, ce qui retire au passage leurs
-- GRANT existants (ré-accordés explicitement plus bas).
drop function if exists admin_list_businesses();
drop function if exists admin_set_module_achats_actif(uuid, boolean);

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
  module_achats_actif boolean,
  module_boutique_en_ligne_actif boolean
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
    select b.id, b.owner_id, b.name, b.email, b.subscription_status, b.subscription_expires_at, b.is_admin, b.plan,
      b.module_achats_actif, b.module_boutique_en_ligne_actif
    from businesses b;
end;
$$;

grant execute on function admin_list_businesses() to authenticated;

create function admin_set_module_achats_actif(p_business_id uuid, p_actif boolean)
returns table (
  id uuid,
  owner_id uuid,
  name text,
  email text,
  subscription_status text,
  subscription_expires_at timestamptz,
  is_admin boolean,
  plan text,
  module_achats_actif boolean,
  module_boutique_en_ligne_actif boolean
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
    returning b.id, b.owner_id, b.name, b.email, b.subscription_status, b.subscription_expires_at, b.is_admin, b.plan,
      b.module_achats_actif, b.module_boutique_en_ligne_actif;
end;
$$;

grant execute on function admin_set_module_achats_actif(uuid, boolean) to authenticated;

create or replace function admin_set_module_boutique_en_ligne_actif(p_business_id uuid, p_actif boolean)
returns table (
  id uuid,
  owner_id uuid,
  name text,
  email text,
  subscription_status text,
  subscription_expires_at timestamptz,
  is_admin boolean,
  plan text,
  module_achats_actif boolean,
  module_boutique_en_ligne_actif boolean
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
    set module_boutique_en_ligne_actif = p_actif
    where b.id = p_business_id
    returning b.id, b.owner_id, b.name, b.email, b.subscription_status, b.subscription_expires_at, b.is_admin, b.plan,
      b.module_achats_actif, b.module_boutique_en_ligne_actif;
end;
$$;

grant execute on function admin_set_module_boutique_en_ligne_actif(uuid, boolean) to authenticated;

-- ------------------------------------------------------------
-- 2. ARTICLES PROPOSÉS EN LIGNE
-- ------------------------------------------------------------
alter table articles add column if not exists propose_en_ligne boolean not null default true;

-- ------------------------------------------------------------
-- 3. ORIGINE D'UNE COMMANDE
-- 'doka' (créée depuis l'app, comportement actuel, valeur par défaut) ou
-- 'boutique_en_ligne' (créée par le site via boutique_creer_commande()
-- plus bas). reference_externe porte la référence attribuée par le site
-- (ex. "NHL-0142") -- unique par boutique, sert de clé d'idempotence.
-- ------------------------------------------------------------
alter table commandes add column if not exists source text not null default 'doka';
alter table commandes drop constraint if exists commandes_source_check;
alter table commandes add constraint commandes_source_check check (source in ('doka', 'boutique_en_ligne'));
alter table commandes add column if not exists reference_externe text;

create unique index if not exists commandes_business_reference_externe_idx
  on commandes (business_id, reference_externe)
  where reference_externe is not null;

-- ------------------------------------------------------------
-- 4. CONNEXION BOUTIQUE EN LIGNE ↔ SITE EXTERNE
-- Une ligne par boutique (business_id en clé primaire). `cle` est la clé en
-- clair, nécessaire pour signer les envois sortants (Doka -> site) ;
-- `cle_hash` (sha256 hex de `cle`) permet de retrouver la boutique à
-- partir d'une requête ENTRANTE (site -> Doka) sans jamais comparer la clé
-- en clair ligne par ligne. RLS activée SANS aucune policy pour
-- anon/authenticated : ni un commerçant via l'API REST, ni un visiteur
-- anonyme ne peuvent lire ou écrire cette table directement -- seules les
-- fonctions SECURITY DEFINER ci-dessous (qui vérifient elles-mêmes la
-- propriété de la boutique) et le service_role (routes serveur de l'app,
-- jamais exposées au navigateur) y accèdent.
-- ------------------------------------------------------------
create table if not exists boutique_en_ligne_connexions (
  business_id uuid primary key references businesses(id) on delete cascade,
  site_url text,
  cle text,
  cle_hash text unique,
  cle_apercu text,
  derniere_synchro_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table boutique_en_ligne_connexions enable row level security;

-- ------------------------------------------------------------
-- 5. UTILITAIRES
-- ------------------------------------------------------------

-- Normalisation d'un numéro de téléphone ivoirien pour le rapprochement
-- client (boutique_creer_commande() plus bas) : chiffres seuls, préfixe
-- international 225 retiré UNIQUEMENT si la chaîne obtenue après ce
-- retrait fait exactement 10 chiffres (sinon on ne touche à rien -- un
-- numéro déjà à 10 chiffres, ou dans un tout autre format, reste tel
-- quel). Jamais utilisée pour modifier la valeur stockée sur un client
-- (clients.telephone garde le format tel que reçu), seulement pour
-- comparer deux numéros entre eux.
create or replace function boutique_normaliser_telephone(p_tel text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when length(regexp_replace(coalesce(p_tel, ''), '\D', '', 'g')) = 13
      and left(regexp_replace(coalesce(p_tel, ''), '\D', '', 'g'), 3) = '225'
    then substring(regexp_replace(coalesce(p_tel, ''), '\D', '', 'g') from 4)
    else regexp_replace(coalesce(p_tel, ''), '\D', '', 'g')
  end;
$$;

-- Représentation JSON d'un article pour le site (format ArticleBoutique,
-- voir docs/boutique-en-ligne-api.md) -- jamais prix_achat ni
-- frais_annexes, le site n'a besoin de connaître ni l'un ni l'autre.
-- stock_reserve : même calcul que le stock théorique déjà utilisé ailleurs
-- (verifier_stock_theorique_acompte(), supabase-commande-acomptes-
-- migration.sql) -- somme des quantités des lignes (offertes comprises)
-- des commandes 'en_attente' de cet article, Doka et boutique en ligne
-- confondues. maj_le : horodatage de GÉNÉRATION de ce JSON (articles n'a
-- pas de colonne updated_at) -- une estampille de fraîcheur du relevé,
-- pas une date de dernière modification réelle.
create or replace function boutique_article_json(p_article_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', a.id,
    'code', a.code,
    'nom', a.nom,
    'categorie', c.nom,
    'prix_vente', a.prix_vente,
    'stock_reel', a.stock,
    'stock_reserve', coalesce(r.reserve, 0),
    'stock_disponible', greatest(0, a.stock - coalesce(r.reserve, 0)::integer),
    'unite', a.unite,
    'image_url', a.image_url,
    'actif', a.actif,
    'propose_en_ligne', a.propose_en_ligne,
    'maj_le', now()
  )
  from public.articles a
  left join public.categories c on c.id = a.categorie_id
  left join (
    select cl.article_id, sum(cl.quantite) as reserve
    from public.commande_lignes cl
    join public.commandes cmd on cmd.id = cl.commande_id
    where cmd.statut = 'en_attente'
    group by cl.article_id
  ) r on r.article_id = a.id
  where a.id = p_article_id;
$$;

-- Liste JSON de tous les articles proposés en ligne d'une boutique (API
-- GET /api/boutique/v1/articles, synchronisation initiale/rattrapage) --
-- même format ArticleBoutique que boutique_article_json() ci-dessus,
-- réunis en une seule requête plutôt que n appels séparés. Jamais appelée
-- par le commerçant lui-même : réservée au service_role (route serveur,
-- après vérification de la clé d'API de la boutique concernée).
create or replace function boutique_articles_proposes_json(p_business_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', a.id,
      'code', a.code,
      'nom', a.nom,
      'categorie', c.nom,
      'prix_vente', a.prix_vente,
      'stock_reel', a.stock,
      'stock_reserve', coalesce(r.reserve, 0),
      'stock_disponible', greatest(0, a.stock - coalesce(r.reserve, 0)::integer),
      'unite', a.unite,
      'image_url', a.image_url,
      'actif', a.actif,
      'propose_en_ligne', a.propose_en_ligne,
      'maj_le', now()
    ) order by a.nom
  ), '[]'::jsonb)
  from public.articles a
  left join public.categories c on c.id = a.categorie_id
  left join (
    select cl.article_id, sum(cl.quantite) as reserve
    from public.commande_lignes cl
    join public.commandes cmd on cmd.id = cl.commande_id
    where cmd.statut = 'en_attente'
    group by cl.article_id
  ) r on r.article_id = a.id
  where a.business_id = p_business_id and a.propose_en_ligne;
$$;

grant execute on function boutique_articles_proposes_json(uuid) to service_role;

-- Envoi Doka -> site (pg_net, déjà utilisé par notifier_admins_nouveau_
-- justificatif dans supabase-admin-liste-paiements-migration.sql). Envoie
-- si : le module est actif pour cette boutique, une connexion avec
-- site_url ET clé existe, et (l'article est actuellement proposé en ligne
-- OU p_forcer est vrai). p_forcer sert au cas "l'article vient de cesser
-- d'être proposé" (propose_en_ligne passé à false) : le site doit quand
-- même recevoir ce changement pour retirer l'article de la vitrine, alors
-- que le JSON renvoyé contiendra justement "propose_en_ligne": false --
-- c'est au site d'agir en conséquence, jamais à Doka de décider de ne pas
-- l'informer. N'échoue JAMAIS l'opération Doka d'origine : toute erreur
-- (site injoignable, timeout, URL mal configurée...) est capturée en
-- silence, jamais remontée à l'appelant.
create or replace function boutique_en_ligne_envoyer_article(p_article_id uuid, p_forcer boolean default false)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_business_id uuid;
  v_propose boolean;
  v_module_actif boolean;
  v_site_url text;
  v_cle text;
  v_article jsonb;
begin
  select a.business_id, a.propose_en_ligne into v_business_id, v_propose
  from public.articles a where a.id = p_article_id;

  if v_business_id is null then
    return;
  end if;

  if not v_propose and not p_forcer then
    return;
  end if;

  select b.module_boutique_en_ligne_actif into v_module_actif
  from public.businesses b where b.id = v_business_id;

  if not coalesce(v_module_actif, false) then
    return;
  end if;

  select cx.site_url, cx.cle into v_site_url, v_cle
  from public.boutique_en_ligne_connexions cx
  where cx.business_id = v_business_id;

  if v_site_url is null or v_cle is null then
    return;
  end if;

  v_article := public.boutique_article_json(p_article_id);

  begin
    perform net.http_post(
      url := v_site_url || '/api/doka/webhook',
      headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_cle),
      body := jsonb_build_object('evenement', 'article.maj', 'article', v_article, 'envoye_le', now())
    );
    update public.boutique_en_ligne_connexions
      set derniere_synchro_at = now()
      where business_id = v_business_id;
  exception when others then
    null;
  end;
end;
$$;

-- ------------------------------------------------------------
-- 6. TRIGGERS D'ENVOI — déclenchent boutique_en_ligne_envoyer_article()
-- pour chaque changement pertinent. Doublons possibles dans de rares cas
-- (plusieurs lignes d'une même commande référençant le même article,
-- insert multiple dans une même transaction...) jamais dédupliqués ici
-- (accepté explicitement : le site absorbe un même "article.maj" reçu
-- plusieurs fois de suite, il ne fait que remplacer l'état connu).
-- ------------------------------------------------------------

-- articles : création, et modification des seuls champs qui intéressent
-- le site (nom, prix de vente, stock, photo, actif, propose_en_ligne,
-- catégorie, code, unité). p_forcer := true dans les deux cas : le
-- déclenchement lui-même (new.propose_en_ligne or old.propose_en_ligne)
-- couvre déjà la condition "proposé OU vient de cesser de l'être" --
-- une fois ce filtre passé, l'envoi doit toujours partir.
create or replace function boutique_en_ligne_notifier_article()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.propose_en_ligne then
      perform public.boutique_en_ligne_envoyer_article(new.id, true);
    end if;
    return new;
  end if;

  if (new.propose_en_ligne or old.propose_en_ligne)
    and (
      new.nom is distinct from old.nom
      or new.prix_vente is distinct from old.prix_vente
      or new.stock is distinct from old.stock
      or new.image_url is distinct from old.image_url
      or new.actif is distinct from old.actif
      or new.propose_en_ligne is distinct from old.propose_en_ligne
      or new.categorie_id is distinct from old.categorie_id
      or new.code is distinct from old.code
      or new.unite is distinct from old.unite
    )
  then
    perform public.boutique_en_ligne_envoyer_article(new.id, true);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_boutique_en_ligne_article_insert on articles;
create trigger trg_boutique_en_ligne_article_insert
  after insert on articles
  for each row
  execute function boutique_en_ligne_notifier_article();

drop trigger if exists trg_boutique_en_ligne_article_update on articles;
create trigger trg_boutique_en_ligne_article_update
  after update on articles
  for each row
  execute function boutique_en_ligne_notifier_article();

-- commande_lignes : une ligne créée/modifiée/supprimée change le stock
-- réservé (stock_reserve) de l'article concerné -- jamais p_forcer ici,
-- boutique_en_ligne_envoyer_article() ignore silencieusement un article
-- qui n'est de toute façon pas proposé en ligne.
create or replace function boutique_en_ligne_notifier_commande_ligne()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_article_id uuid;
begin
  if tg_op = 'DELETE' then
    v_article_id := old.article_id;
  else
    v_article_id := new.article_id;
  end if;

  if v_article_id is not null then
    perform public.boutique_en_ligne_envoyer_article(v_article_id);
  end if;

  if tg_op = 'UPDATE' and old.article_id is distinct from new.article_id and old.article_id is not null then
    perform public.boutique_en_ligne_envoyer_article(old.article_id);
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_boutique_en_ligne_commande_ligne on commande_lignes;
create trigger trg_boutique_en_ligne_commande_ligne
  after insert or update or delete on commande_lignes
  for each row
  execute function boutique_en_ligne_notifier_commande_ligne();

-- commandes : un changement de statut (en_attente -> livree/annulee)
-- libère la réservation de chacun de ses articles -- renvoyé pour chacun.
create or replace function boutique_en_ligne_notifier_commande()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_article_id uuid;
begin
  if tg_op = 'UPDATE' and new.statut is distinct from old.statut then
    for v_article_id in
      select distinct cl.article_id
      from public.commande_lignes cl
      where cl.commande_id = new.id and cl.article_id is not null
    loop
      perform public.boutique_en_ligne_envoyer_article(v_article_id);
    end loop;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_boutique_en_ligne_commande_statut on commandes;
create trigger trg_boutique_en_ligne_commande_statut
  after update on commandes
  for each row
  execute function boutique_en_ligne_notifier_commande();

-- ------------------------------------------------------------
-- 7. COMMANDES "BOUTIQUE EN LIGNE" EN LECTURE SEULE CÔTÉ DOKA
-- "Ces commandes sont gérées depuis l'admin du site et restent en lecture
-- seule dans Doka." Même principe que verrouiller_reception_validee()/
-- verrouiller_reception_ligne() (supabase-achats-approvisionnement-
-- migration.sql) : NI l'une ni l'autre des deux fonctions ci-dessous
-- n'est SECURITY DEFINER -- c'est précisément ce qui leur permet de lire
-- current_user tel qu'il est réellement au moment de l'appel. Les deux
-- RPC réservées au service_role plus bas (boutique_creer_commande/
-- boutique_changer_statut) sont elles SECURITY DEFINER : leurs propres
-- écritures tournent sous le propriétaire de la fonction, jamais
-- 'authenticated', donc jamais bloquées ici -- seul un appel direct du
-- client (app, formulaire, API REST) est concerné.
-- ------------------------------------------------------------
create or replace function verrouiller_commande_boutique_en_ligne()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user = 'authenticated' and old.source = 'boutique_en_ligne' then
    raise exception 'Cette commande a été passée sur la boutique en ligne : son statut se gère depuis l''administration du site.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_verrouiller_commande_boutique_en_ligne on commandes;
create trigger trg_verrouiller_commande_boutique_en_ligne
  before update on commandes
  for each row
  execute function verrouiller_commande_boutique_en_ligne();

create or replace function verrouiller_commande_ligne_boutique_en_ligne()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_source text;
begin
  select c.source into v_source from public.commandes c where c.id = coalesce(new.commande_id, old.commande_id);

  if current_user = 'authenticated' and v_source = 'boutique_en_ligne' then
    raise exception 'Les lignes d''une commande passée sur la boutique en ligne ne sont pas modifiables depuis Doka.';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_verrouiller_commande_ligne_boutique_en_ligne on commande_lignes;
create trigger trg_verrouiller_commande_ligne_boutique_en_ligne
  before insert or update or delete on commande_lignes
  for each row
  execute function verrouiller_commande_ligne_boutique_en_ligne();

-- ------------------------------------------------------------
-- 8. FONCTIONS CÔTÉ COMMERÇANT (grant authenticated) — toutes vérifient
-- elles-mêmes que l'appelant possède la boutique (owner_id = auth.uid())
-- ET que le module est actif ; aucune ne renvoie jamais `cle` en clair,
-- seulement `cle_apercu` (4 derniers caractères).
-- ------------------------------------------------------------

create or replace function boutique_en_ligne_etat()
returns table (
  site_url text,
  cle_apercu text,
  derniere_synchro_at timestamptz,
  nb_articles_proposes integer,
  nb_commandes_mois integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_business_id uuid;
  v_module_actif boolean;
begin
  select b.id, b.module_boutique_en_ligne_actif into v_business_id, v_module_actif
  from public.businesses b where b.owner_id = auth.uid();

  if v_business_id is null or not coalesce(v_module_actif, false) then
    raise exception 'Module Boutique en ligne non activé pour cette boutique';
  end if;

  return query
    select
      cx.site_url,
      cx.cle_apercu,
      cx.derniere_synchro_at,
      (select count(*)::integer from public.articles a where a.business_id = v_business_id and a.propose_en_ligne),
      (select count(*)::integer from public.commandes c
         where c.business_id = v_business_id and c.source = 'boutique_en_ligne'
           and c.created_at >= date_trunc('month', now()))
    from (select v_business_id as business_id) base
    left join public.boutique_en_ligne_connexions cx on cx.business_id = base.business_id;
end;
$$;

grant execute on function boutique_en_ligne_etat() to authenticated;

create or replace function boutique_en_ligne_enregistrer_url(p_site_url text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_business_id uuid;
  v_module_actif boolean;
  v_url text;
begin
  select b.id, b.module_boutique_en_ligne_actif into v_business_id, v_module_actif
  from public.businesses b where b.owner_id = auth.uid();

  if v_business_id is null or not coalesce(v_module_actif, false) then
    raise exception 'Module Boutique en ligne non activé pour cette boutique';
  end if;

  v_url := trim(p_site_url);
  if v_url !~ '^https://' then
    raise exception 'L''adresse du site doit commencer par https://';
  end if;
  if right(v_url, 1) = '/' then
    v_url := left(v_url, length(v_url) - 1);
  end if;

  insert into public.boutique_en_ligne_connexions (business_id, site_url, updated_at)
  values (v_business_id, v_url, now())
  on conflict (business_id) do update set site_url = excluded.site_url, updated_at = now();
end;
$$;

grant execute on function boutique_en_ligne_enregistrer_url(text) to authenticated;

-- Régénérer une clé remplace l'ancienne (une seule clé active à la fois
-- par boutique) -- renvoyée UNE seule fois en clair, jamais relisible
-- ensuite (ni par cette fonction, ni par aucune autre : boutique_en_
-- ligne_etat() ne renvoie que cle_apercu).
create or replace function boutique_en_ligne_generer_cle()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_business_id uuid;
  v_module_actif boolean;
  v_cle text;
  v_hash text;
  v_apercu text;
begin
  select b.id, b.module_boutique_en_ligne_actif into v_business_id, v_module_actif
  from public.businesses b where b.owner_id = auth.uid();

  if v_business_id is null or not coalesce(v_module_actif, false) then
    raise exception 'Module Boutique en ligne non activé pour cette boutique';
  end if;

  v_cle := 'doka_bl_' || encode(extensions.gen_random_bytes(24), 'hex');
  v_hash := encode(extensions.digest(v_cle, 'sha256'), 'hex');
  v_apercu := right(v_cle, 4);

  insert into public.boutique_en_ligne_connexions (business_id, cle, cle_hash, cle_apercu, updated_at)
  values (v_business_id, v_cle, v_hash, v_apercu, now())
  on conflict (business_id) do update
    set cle = excluded.cle, cle_hash = excluded.cle_hash, cle_apercu = excluded.cle_apercu, updated_at = now();

  return v_cle;
end;
$$;

grant execute on function boutique_en_ligne_generer_cle() to authenticated;

create or replace function boutique_en_ligne_tout_renvoyer()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_business_id uuid;
  v_module_actif boolean;
  v_article_id uuid;
  v_count integer := 0;
begin
  select b.id, b.module_boutique_en_ligne_actif into v_business_id, v_module_actif
  from public.businesses b where b.owner_id = auth.uid();

  if v_business_id is null or not coalesce(v_module_actif, false) then
    raise exception 'Module Boutique en ligne non activé pour cette boutique';
  end if;

  if not exists (
    select 1 from public.boutique_en_ligne_connexions cx
    where cx.business_id = v_business_id and cx.site_url is not null and cx.cle is not null
  ) then
    raise exception 'Adresse du site ou clé de connexion manquante : configurez-les avant de tout renvoyer.';
  end if;

  for v_article_id in
    select a.id from public.articles a where a.business_id = v_business_id and a.propose_en_ligne
  loop
    perform public.boutique_en_ligne_envoyer_article(v_article_id, true);
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

grant execute on function boutique_en_ligne_tout_renvoyer() to authenticated;

-- ------------------------------------------------------------
-- 9. RPC RÉSERVÉES AU SERVICE_ROLE — jamais accordées à `authenticated`,
-- appelées uniquement depuis les routes serveur app/api/boutique/v1/*
-- (clé service_role, jamais exposée au navigateur) après vérification de
-- la clé d'API de la boutique concernée (cle_hash).
-- ------------------------------------------------------------

-- Idempotente par reference_externe (clé d'idempotence demandée par le
-- site) : si la référence existe déjà pour cette boutique, renvoie la
-- commande existante sans rien recréer (ex. nouvelle tentative du site
-- après un timeout réseau, sans dupliquer la commande). Les messages
-- d'exception portent un préfixe "code: " (ex. "donnees_invalides: ...",
-- "article_inconnu: ...") que la route app/api/boutique/v1/commandes
-- traduit en code d'erreur JSON ; voir docs/boutique-en-ligne-api.md.
create or replace function boutique_creer_commande(p_business_id uuid, p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reference text;
  v_client jsonb;
  v_lignes jsonb;
  v_livraison jsonb;
  v_paiement jsonb;
  v_client_id uuid;
  v_tel_norm text;
  v_commande_id uuid;
  v_numero text;
  v_numero_int integer;
  v_ca numeric := 0;
  v_marge numeric := 0;
  v_ligne jsonb;
  v_article record;
  v_prix_unitaire numeric;
  v_quantite integer;
  v_offert boolean;
  v_existante record;
begin
  v_reference := p_payload->>'reference';
  if v_reference is null or length(trim(v_reference)) = 0 or length(v_reference) > 40 then
    raise exception 'donnees_invalides: La référence de la commande est invalide.';
  end if;

  select c.id, c.numero, c.statut into v_existante
  from public.commandes c
  where c.business_id = p_business_id and c.reference_externe = v_reference;

  if found then
    return jsonb_build_object('commande_id', v_existante.id, 'numero', v_existante.numero, 'statut', v_existante.statut, 'cree', false);
  end if;

  v_client := p_payload->'client';
  v_lignes := p_payload->'lignes';
  v_livraison := coalesce(p_payload->'livraison', '{}'::jsonb);
  v_paiement := coalesce(p_payload->'paiement', '{}'::jsonb);

  if v_client is null or coalesce(trim(v_client->>'nom'), '') = '' then
    raise exception 'donnees_invalides: Le nom du client est obligatoire.';
  end if;
  if coalesce(trim(v_client->>'telephone'), '') = '' then
    raise exception 'donnees_invalides: Le téléphone du client est obligatoire.';
  end if;
  if v_lignes is null or jsonb_typeof(v_lignes) <> 'array' or jsonb_array_length(v_lignes) = 0 then
    raise exception 'donnees_invalides: La commande doit contenir au moins une ligne.';
  end if;
  if coalesce(v_livraison->>'type', 'boutique') not in ('livraison', 'boutique') then
    raise exception 'donnees_invalides: Type de livraison invalide.';
  end if;
  if coalesce(v_paiement->>'mode', 'livraison') not in ('livraison', 'mobile_money') then
    raise exception 'donnees_invalides: Mode de paiement invalide.';
  end if;

  -- Client : recherche par téléphone normalisé parmi les clients de cette
  -- boutique, sinon création (nom, telephone, adresse -- le téléphone est
  -- enregistré tel que reçu, jamais la version normalisée, qui ne sert
  -- qu'au rapprochement).
  v_tel_norm := public.boutique_normaliser_telephone(v_client->>'telephone');
  select cl.id into v_client_id
  from public.clients cl
  where cl.business_id = p_business_id
    and public.boutique_normaliser_telephone(cl.telephone) = v_tel_norm
  limit 1;

  if v_client_id is null then
    insert into public.clients (business_id, nom, telephone, adresse)
    values (p_business_id, trim(v_client->>'nom'), v_client->>'telephone', nullif(trim(coalesce(v_client->>'adresse', '')), ''))
    returning id into v_client_id;
  end if;

  -- Numérotation atomique, même format CMD-0001 que
  -- app/(app)/nouvelle/page.js -- ici incrémentée en une seule
  -- transaction (update ... returning), jamais lue puis réécrite en deux
  -- appels séparés comme le fait le client (voir le commentaire en tête de
  -- supabase-articles-code-migration.sql sur ce défaut, explicitement à
  -- éviter ici).
  update public.businesses
    set next_numero = coalesce(next_numero, 1) + 1
    where id = p_business_id
    returning next_numero - 1 into v_numero_int;

  if not found then
    raise exception 'introuvable: Boutique introuvable.';
  end if;
  v_numero := 'CMD-' || lpad(v_numero_int::text, 4, '0');

  insert into public.commandes (
    business_id, numero, client_id, ca, marge,
    livraison_type, livraison_zone, livraison_frais,
    paiement_mode, paiement_operateur,
    statut, source, reference_externe
  ) values (
    p_business_id, v_numero, v_client_id, 0, 0,
    coalesce(v_livraison->>'type', 'boutique'),
    case when v_livraison->>'type' = 'livraison' then v_livraison->>'zone' else null end,
    case when v_livraison->>'type' = 'livraison' then coalesce((v_livraison->>'frais')::numeric, 0) else 0 end,
    coalesce(v_paiement->>'mode', 'livraison'),
    case when v_paiement->>'mode' = 'mobile_money' then v_paiement->>'operateur' else null end,
    'en_attente', 'boutique_en_ligne', v_reference
  ) returning id into v_commande_id;

  for v_ligne in select * from jsonb_array_elements(v_lignes)
  loop
    v_quantite := (v_ligne->>'quantite')::integer;
    v_offert := coalesce((v_ligne->>'offert')::boolean, false);
    if v_quantite is null or v_quantite < 1 then
      raise exception 'donnees_invalides: Quantité invalide pour une ligne de commande.';
    end if;
    v_prix_unitaire := (v_ligne->>'prix_unitaire')::numeric;
    if v_prix_unitaire is null or v_prix_unitaire < 0 then
      raise exception 'donnees_invalides: Prix unitaire invalide pour une ligne de commande.';
    end if;

    select a.id, a.prix_achat, a.frais_annexes, a.actif, a.propose_en_ligne
      into v_article
      from public.articles a
      where a.id = (v_ligne->>'article_id')::uuid and a.business_id = p_business_id;

    if not found then
      raise exception 'article_inconnu: Article introuvable : %.', v_ligne->>'article_id';
    end if;
    if not v_article.actif or not v_article.propose_en_ligne then
      raise exception 'article_non_propose: Article non proposé en ligne : %.', v_ligne->>'article_id';
    end if;

    insert into public.commande_lignes (commande_id, article_id, quantite, prix_vente, prix_achat, frais_annexes, offert)
    values (
      v_commande_id, v_article.id, v_quantite,
      case when v_offert then 0 else v_prix_unitaire end,
      v_article.prix_achat, coalesce(v_article.frais_annexes, 0), v_offert
    );

    v_ca := v_ca + (case when v_offert then 0 else v_prix_unitaire end) * v_quantite;
    v_marge := v_marge + ((case when v_offert then 0 else v_prix_unitaire end) - v_article.prix_achat - coalesce(v_article.frais_annexes, 0)) * v_quantite;
  end loop;

  update public.commandes set ca = v_ca, marge = v_marge where id = v_commande_id;

  return jsonb_build_object('commande_id', v_commande_id, 'numero', v_numero, 'statut', 'en_attente', 'cree', true);
end;
$$;

grant execute on function boutique_creer_commande(uuid, jsonb) to service_role;

-- 'livree' : idempotente si déjà livree, refusée (statut_incompatible) si
-- annulee ; vérifie le stock RÉEL de chaque article (agrégé par article,
-- une commande pouvant référencer deux fois le même article sur des
-- lignes distinctes) avant toute écriture, comme marquerLivree() dans
-- app/(app)/commandes/[id]/page.js -- sinon renvoie stock_insuffisant
-- avec le détail ; sinon passe la commande 'livree', paye_totalite=true,
-- et déduit le stock, tout dans une seule transaction.
-- 'annulee' : uniquement depuis en_attente, idempotente si déjà annulee,
-- refusée si livree.
create or replace function boutique_changer_statut(p_business_id uuid, p_reference text, p_statut text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_commande record;
  v_ligne record;
  v_manque jsonb := '[]'::jsonb;
  v_ok boolean := true;
  v_numero text;
begin
  if p_statut not in ('livree', 'annulee') then
    raise exception 'donnees_invalides: Statut demandé invalide : %.', p_statut;
  end if;

  select c.id, c.numero, c.statut into v_commande
  from public.commandes c
  where c.business_id = p_business_id and c.reference_externe = p_reference and c.source = 'boutique_en_ligne'
  for update;

  if not found then
    raise exception 'introuvable: Commande introuvable pour cette référence.';
  end if;

  if p_statut = 'livree' then
    if v_commande.statut = 'livree' then
      return jsonb_build_object('ok', true, 'numero', v_commande.numero, 'statut', 'livree');
    end if;
    if v_commande.statut = 'annulee' then
      raise exception 'statut_incompatible: Cette commande est déjà annulée, elle ne peut pas être livrée.';
    end if;

    for v_ligne in
      select cl.article_id, a.nom, a.stock, sum(cl.quantite) as quantite
      from public.commande_lignes cl
      join public.articles a on a.id = cl.article_id
      where cl.commande_id = v_commande.id
      group by cl.article_id, a.nom, a.stock
    loop
      if v_ligne.stock < v_ligne.quantite then
        v_ok := false;
        v_manque := v_manque || jsonb_build_object(
          'article_id', v_ligne.article_id, 'nom', v_ligne.nom,
          'stock', v_ligne.stock, 'demande', v_ligne.quantite
        );
      end if;
    end loop;

    if not v_ok then
      return jsonb_build_object('ok', false, 'code', 'stock_insuffisant', 'articles', v_manque);
    end if;

    update public.commandes set statut = 'livree', paye_totalite = true where id = v_commande.id;

    update public.articles a
      set stock = a.stock - agg.total_quantite
      from (
        select article_id, sum(quantite) as total_quantite
        from public.commande_lignes
        where commande_id = v_commande.id
        group by article_id
      ) agg
      where agg.article_id = a.id;

    return jsonb_build_object('ok', true, 'numero', v_commande.numero, 'statut', 'livree');
  else
    if v_commande.statut = 'annulee' then
      return jsonb_build_object('ok', true, 'numero', v_commande.numero, 'statut', 'annulee');
    end if;
    if v_commande.statut = 'livree' then
      raise exception 'statut_incompatible: Cette commande est déjà livrée, elle ne peut plus être annulée.';
    end if;

    update public.commandes set statut = 'annulee' where id = v_commande.id;
    return jsonb_build_object('ok', true, 'numero', v_commande.numero, 'statut', 'annulee');
  end if;
end;
$$;

grant execute on function boutique_changer_statut(uuid, text, text) to service_role;
