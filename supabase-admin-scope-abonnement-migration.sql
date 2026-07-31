-- ============================================================
-- ESPACE ADMINISTRATION — restreint aux données d'abonnement
-- À exécuter une fois dans l'éditeur SQL Supabase.
-- Nécessite supabase-businesses-admin-migration.sql (is_admin_user()).
-- ============================================================

-- La policy "Les admins gèrent toutes les boutiques" (for all) donnait à
-- l'administratrice un accès complet à TOUTES les colonnes de TOUTES les
-- boutiques — y compris le contenu métier (theme_key, notif_email,
-- confirmation_email, rapport_stock, logo_url, plan...), alors que
-- l'espace Administration n'a besoin que des colonnes liées à
-- l'abonnement (nom, e-mail, statut, expiration, droits admin). Le RLS de
-- Postgres ne restreint pas les colonnes à l'intérieur d'une policy : on
-- retire donc entièrement cet accès direct à la table, remplacé par trois
-- fonctions SECURITY DEFINER qui ne lisent/écrivent que ces colonnes-là,
-- chacune vérifiant is_admin_user() elle-même. Un compte non-admin qui
-- interroge businesses directement (requête REST, SQL...) ne voit plus
-- que sa propre boutique (policy "Le propriétaire gère sa boutique",
-- inchangée) ; un compte admin qui tente de lire/modifier une colonne
-- hors de ce périmètre n'a tout simplement plus aucun chemin pour le
-- faire, y compris via une requête directe.
drop policy if exists "Les admins gèrent toutes les boutiques" on businesses;

create or replace function admin_list_businesses()
returns table (
  id uuid,
  owner_id uuid,
  name text,
  email text,
  subscription_status text,
  subscription_expires_at timestamptz,
  is_admin boolean
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
    select b.id, b.owner_id, b.name, b.email, b.subscription_status, b.subscription_expires_at, b.is_admin
    from businesses b;
end;
$$;

grant execute on function admin_list_businesses() to authenticated;

create or replace function admin_mark_subscription_paid(p_business_id uuid, p_expires_at timestamptz)
returns table (
  id uuid,
  owner_id uuid,
  name text,
  email text,
  subscription_status text,
  subscription_expires_at timestamptz,
  is_admin boolean
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
    set subscription_status = 'actif', subscription_expires_at = p_expires_at
    where b.id = p_business_id
    returning b.id, b.owner_id, b.name, b.email, b.subscription_status, b.subscription_expires_at, b.is_admin;
end;
$$;

grant execute on function admin_mark_subscription_paid(uuid, timestamptz) to authenticated;

create or replace function admin_set_is_admin(p_business_id uuid, p_is_admin boolean)
returns table (
  id uuid,
  owner_id uuid,
  name text,
  email text,
  subscription_status text,
  subscription_expires_at timestamptz,
  is_admin boolean
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
    set is_admin = p_is_admin
    where b.id = p_business_id
    returning b.id, b.owner_id, b.name, b.email, b.subscription_status, b.subscription_expires_at, b.is_admin;
end;
$$;

grant execute on function admin_set_is_admin(uuid, boolean) to authenticated;
