-- ============================================================
-- VALIDATION D'UN PAIEMENT PAR L'ADMINISTRATRICE :
-- date d'expiration calculée côté serveur (garantie uniforme, quel que
-- soit l'appelant) + suivi des frais d'installation (formule Clé en main)
-- pour ne jamais les refacturer.
-- À exécuter une fois dans l'éditeur SQL Supabase.
-- Nécessite supabase-admin-scope-abonnement-migration.sql
-- (admin_mark_subscription_paid, remplacée ici) et
-- supabase-paiements-manuels-migration.sql (table paiements_abonnement).
-- ============================================================

-- Suit si les frais d'installation (formule Clé en main,
-- lib/constants.js -> PLAN_PRICES.cle_en_main.installation) ont déjà été
-- payés pour ce compte, pour ne jamais les refacturer lors d'un
-- renouvellement ou d'un changement de formule ultérieur. Jamais écrite
-- directement par le client : pas de grant UPDATE (voir
-- supabase-businesses-colonnes-restreintes-migration.sql, qui a déjà
-- révoqué et regranté colonne par colonne -- une colonne ajoutée après
-- coup n'est, par défaut, dans aucune des listes regrantées), seulement
-- par admin_mark_subscription_paid ci-dessous.
alter table businesses
  add column if not exists frais_installation_payes boolean not null default false;

-- Indique si CE justificatif précis inclut les frais d'installation --
-- posée côté client à l'envoi (components/PaiementAbonnement.js), même
-- modèle de confiance que la colonne `montant` déjà existante (fournie par
-- le commerçant, vérifiée visuellement par l'administratrice avant
-- validation, voir « Paiement manuel vérifié » dans le README) : aucune
-- restriction de grant supplémentaire nécessaire, la policy d'insertion
-- existante ("Un commerçant soumet un justificatif") ne limite déjà que
-- business_id et statut, pas les autres colonnes. Lue par
-- admin_mark_subscription_paid au moment de la validation pour, le cas
-- échéant, marquer frais_installation_payes = true.
alter table paiements_abonnement
  add column if not exists installation_incluse boolean not null default false;

-- admin_mark_subscription_paid faisait jusqu'ici confiance à une date
-- d'expiration calculée côté client (JS,
-- app/(app)/admin/commercants/[id]/page.js) et transmise telle quelle en
-- paramètre, sans aucune vérification côté serveur : rien n'empêchait
-- techniquement un appel avec une date incorrecte. Recalculée ici à partir
-- de l'état réel de la ligne businesses (prolonge depuis
-- subscription_expires_at si elle n'est pas encore passée, repart
-- d'aujourd'hui sinon, puis + 1 mois dans les deux cas) pour que la règle
-- soit garantie à chaque validation, quel que soit l'appelant -- même
-- principe que verifier_expiration_abonnement et admin_reject_payment.
-- Reçoit aussi désormais p_paiement_id (optionnel, absent si
-- l'administratrice marque un compte payé sans justificatif en attente,
-- ce qui reste possible) pour faire passer en une seule opération
-- atomique le justificatif à 'reussi' ET l'abonnement à 'actif' --
-- jusqu'ici deux appels séparés côté client (cette RPC, puis un update
-- direct de paiements_abonnement), avec un risque réel d'incohérence si
-- le second échouait après le premier (compte déjà actif mais
-- justificatif resté 'en_attente' indéfiniment).
drop function if exists admin_mark_subscription_paid(uuid, timestamptz);

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

  return query
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
    returning b.id, b.owner_id, b.name, b.email, b.subscription_status, b.subscription_expires_at, b.is_admin;
end;
$$;

grant execute on function admin_mark_subscription_paid(uuid, uuid) to authenticated;
