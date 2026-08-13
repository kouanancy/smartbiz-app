-- ============================================================
-- LISTE DES PAIEMENTS EN ATTENTE (espace Administration) + lien direct
-- depuis la notification push vers le paiement concerné.
-- À exécuter une fois dans l'éditeur SQL Supabase.
-- Nécessite supabase-admin-scope-abonnement-migration.sql
-- (admin_list_businesses, remplacée ici) et
-- supabase-push-notifications-migration.sql (notifier_admins_nouveau_justificatif,
-- remplacée ici).
-- ============================================================

-- admin_list_businesses() ne renvoyait pas la formule (plan) de chaque
-- boutique -- nécessaire pour afficher "Boutique / Formule / Montant /
-- Date de soumission" dans la nouvelle liste des paiements en attente
-- (app/(app)/admin/page.js), sans quoi il aurait fallu une requête
-- séparée par boutique.
create or replace function admin_list_businesses()
returns table (
  id uuid,
  owner_id uuid,
  name text,
  email text,
  subscription_status text,
  subscription_expires_at timestamptz,
  is_admin boolean,
  plan text
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
    select b.id, b.owner_id, b.name, b.email, b.subscription_status, b.subscription_expires_at, b.is_admin, b.plan
    from businesses b;
end;
$$;

-- notifier_admins_nouveau_justificatif() : inclut désormais business_id
-- dans le payload envoyé à app/api/push-admin-paiement, pour que la
-- notification push emmène directement l'administratrice sur la fiche du
-- paiement concerné (/admin/commercants/<business_id>) plutôt que sur le
-- tableau de bord général -- elle n'a alors plus jamais à chercher où
-- aller après avoir reçu l'alerte.
create or replace function notifier_admins_nouveau_justificatif()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_secret text;
  v_url text;
  v_business_name text;
  v_business_plan text;
begin
  if new.statut = 'en_attente' then
    select b.name, b.plan into v_business_name, v_business_plan
    from businesses b
    where b.id = new.business_id;

    insert into notifications (business_id, type, message, lien)
    select
      admin.id,
      'paiement_a_verifier',
      coalesce(v_business_name, 'Une boutique')
        || ' a envoyé un justificatif de paiement à vérifier — formule '
        || libelle_formule(v_business_plan) || '.',
      '/admin'
    from businesses admin
    where admin.is_admin = true;

    select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'push_admin_secret';
    select decrypted_secret into v_url from vault.decrypted_secrets where name = 'push_admin_url';

    if v_secret is not null and v_url is not null then
      perform net.http_post(
        url := v_url,
        headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_secret),
        body := jsonb_build_object('businessName', v_business_name, 'businessId', new.business_id)
      );
    end if;
  end if;
  return new;
end;
$$;
