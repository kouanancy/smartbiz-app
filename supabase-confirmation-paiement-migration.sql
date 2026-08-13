-- ============================================================
-- CONFIRMATION AU COMMERÇANT QUAND SON PAIEMENT EST VALIDÉ
-- À exécuter une fois dans l'éditeur SQL Supabase.
-- Nécessite supabase-validation-paiement-installation-migration.sql
-- (fonction admin_mark_subscription_paid, remplacée ici) et
-- supabase-notifications-migration.sql (table notifications).
-- ============================================================

-- Jusqu'ici, rien ne prévenait le commerçant que son paiement avait été
-- validé — il ne le découvrait qu'en revenant sur l'app et en constatant
-- que son compte était de nouveau actif (ou par la notification "en cours
-- de vérification"/"rejeté", qui elle disparaît simplement sans être
-- remplacée par une confirmation). Ajoute une notification 🔔 dédiée,
-- avec la nouvelle date d'expiration en toutes lettres — capturée dans
-- des variables plutôt que relue après coup, pour garantir qu'elle
-- correspond exactement à ce que la mise à jour vient d'écrire (RETURNING
-- ... INTO, une seule opération). `if not v_is_admin` : jamais utile pour
-- un compte admin, qui n'a de toute façon jamais d'abonnement à valider
-- via ce chemin (le bouton "Marquer comme payé" est masqué sur ces
-- lignes, voir app/(app)/admin/commercants/[id]/page.js) — garde-fou,
-- pas un cas réellement atteignable.
create or replace function admin_mark_subscription_paid(p_business_id uuid, p_paiement_id uuid default null)
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
  v_installation_incluse boolean := false;
  v_id uuid;
  v_owner_id uuid;
  v_name text;
  v_email text;
  v_status text;
  v_expires timestamptz;
  v_is_admin boolean;
begin
  if not is_admin_user() then
    raise exception 'Accès réservé aux administrateurs';
  end if;

  if p_paiement_id is not null then
    select coalesce(p.installation_incluse, false) into v_installation_incluse
    from paiements_abonnement p
    where p.id = p_paiement_id and p.business_id = p_business_id;

    update paiements_abonnement p
    set statut = 'reussi', valide_at = now()
    where p.id = p_paiement_id and p.business_id = p_business_id;
  end if;

  update businesses b
  set
    subscription_status = 'actif',
    subscription_expires_at =
      (case
        when b.subscription_status in ('actif', 'essai')
          and b.subscription_expires_at is not null
          and b.subscription_expires_at > now()
          then b.subscription_expires_at
        else now()
      end) + interval '1 month',
    frais_installation_payes = b.frais_installation_payes or v_installation_incluse
  where b.id = p_business_id
  returning b.id, b.owner_id, b.name, b.email, b.subscription_status, b.subscription_expires_at, b.is_admin
  into v_id, v_owner_id, v_name, v_email, v_status, v_expires, v_is_admin;

  if not v_is_admin then
    insert into notifications (business_id, type, message, lien)
    values (
      v_id,
      'paiement_valide',
      'Ton paiement a été validé, ton abonnement est actif jusqu''au ' || to_char(v_expires, 'DD/MM/YYYY') || '.',
      '/parametres'
    );
  end if;

  return query select v_id, v_owner_id, v_name, v_email, v_status, v_expires, v_is_admin;
end;
$$;
