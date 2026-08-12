-- ============================================================
-- REJET D'UN JUSTIFICATIF : bloque aussi l'accès du commerçant
-- À exécuter une fois dans l'éditeur SQL Supabase.
-- Nécessite supabase-admin-scope-abonnement-migration.sql (is_admin_user(),
-- même périmètre de colonnes que admin_mark_subscription_paid) et
-- supabase-paiements-manuels-migration.sql (table paiements_abonnement).
-- ============================================================

-- Jusqu'ici, rejeter un justificatif (app/(app)/admin/commercants/[id]/page.js)
-- ne faisait passer que paiements_abonnement.statut à 'echoue' — le
-- subscription_status du compte, lui, ne changeait jamais. Sans effet
-- visible pour un commerçant déjà bloqué (en_attente_paiement/expire),
-- mais un commerçant encore actif/en essai qui avait envoyé un
-- justificatif de renouvellement anticipé (carte Abonnement des
-- Paramètres) gardait un accès complet à l'application même après le
-- rejet de ce justificatif. Cette fonction fait les deux mises à jour
-- ensemble, SECURITY DEFINER pour les mêmes raisons que
-- admin_mark_subscription_paid : seule une administratrice peut rejeter
-- un justificatif, et seule cette fonction peut écrire sur les deux
-- tables pour ce faire.
create or replace function admin_reject_payment(p_paiement_id uuid, p_raison text)
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
declare
  v_business_id uuid;
begin
  if not is_admin_user() then
    raise exception 'Accès réservé aux administrateurs';
  end if;

  update paiements_abonnement p
  set statut = 'echoue', raison_rejet = p_raison
  where p.id = p_paiement_id
  returning p.business_id into v_business_id;

  if v_business_id is null then
    raise exception 'Justificatif introuvable';
  end if;

  -- Même correspondance que EXPIRATION_SUIVANTE côté JS
  -- (lib/AuthProvider.js) : un compte 'actif' dont le justificatif de
  -- renouvellement est rejeté redevient 'expire' (réabonnement, écran
  -- dédié) ; un compte 'essai' redevient 'en_attente_paiement' (premier
  -- paiement, jamais encore payé). Un compte déjà bloqué
  -- (en_attente_paiement/expire/suspendu) reste dans son état — rejeter
  -- une nouvelle tentative ne le débloque évidemment pas, mais ne change
  -- pas non plus son statut vers une valeur qui décrirait mal son
  -- historique (ex. jamais forcer 'expire' vers 'en_attente_paiement').
  return query
    update businesses b
    set subscription_status = case b.subscription_status
      when 'actif' then 'expire'
      when 'essai' then 'en_attente_paiement'
      else b.subscription_status
    end
    where b.id = v_business_id
    returning b.id, b.owner_id, b.name, b.email, b.subscription_status, b.subscription_expires_at, b.is_admin;
end;
$$;

grant execute on function admin_reject_payment(uuid, text) to authenticated;
