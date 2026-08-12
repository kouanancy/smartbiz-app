-- ============================================================
-- REJET D'UN JUSTIFICATIF : ne coupe plus un accès déjà valide
-- (renouvellement anticipé rejeté avant l'échéance réelle)
-- À exécuter une fois dans l'éditeur SQL Supabase.
-- Remplace la fonction créée par supabase-admin-reject-payment-migration.sql
-- (elle-même toujours nécessaire comme prérequis, avec
-- supabase-admin-scope-abonnement-migration.sql et
-- supabase-paiements-manuels-migration.sql).
-- ============================================================

-- admin_reject_payment faisait jusqu'ici passer 'actif' -> 'expire' (et
-- 'essai' -> 'en_attente_paiement') au moindre rejet, même quand le
-- justificatif rejeté était un renouvellement anticipé envoyé pendant que
-- l'abonnement en cours restait valide (subscription_expires_at encore
-- dans le futur, carte Abonnement des Paramètres ou changement de
-- formule) : le commerçant perdait alors l'accès avant l'échéance réelle
-- qu'il avait pourtant déjà payée. Un rejet ne doit désormais faire
-- basculer le statut que si l'accès n'était pas déjà valide par ailleurs
-- (premier paiement jamais validé, ou abonnement réellement expiré) —
-- même logique que dernierPaiementBlocage côté client (lib/paiements.js,
-- fonction accesDejaValide), à garder synchronisée. Dans ce cas précis
-- (accès conservé), le commerçant est aussi notifié via le centre de
-- notifications (notifications, supabase-notifications-migration.sql) —
-- sans ça, un rejet qui ne bloque rien passerait complètement inaperçu.
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
  v_deja_valide boolean;
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

  select
    b.subscription_status in ('actif', 'essai')
    and b.subscription_expires_at is not null
    and b.subscription_expires_at > now()
  into v_deja_valide
  from businesses b
  where b.id = v_business_id;

  if v_deja_valide then
    insert into notifications (business_id, type, message, lien)
    values (
      v_business_id,
      'renouvellement_anticipe_rejete',
      'Ton dernier renouvellement anticipé n''a pas pu être validé — pense à renvoyer un justificatif avant la fin de ton abonnement en cours.',
      '/parametres'
    );
  end if;

  return query
    update businesses b
    set subscription_status = case
      -- Renouvellement anticipé rejeté, mais l'échéance en cours n'est pas
      -- encore passée (v_deja_valide) : le compte garde l'accès qu'il a
      -- déjà payé, seul le justificatif (déjà mis à 'echoue' ci-dessus,
      -- notification envoyée ci-dessus) reflète le rejet.
      when v_deja_valide then b.subscription_status
      -- Même correspondance que EXPIRATION_SUIVANTE côté JS
      -- (lib/AuthProvider.js) : un compte 'actif' réellement expiré (ou
      -- sans date d'expiration) dont le justificatif est rejeté redevient
      -- 'expire' (réabonnement, écran dédié) ; un compte 'essai' redevient
      -- 'en_attente_paiement' (premier paiement, jamais encore payé).
      when b.subscription_status = 'actif' then 'expire'
      when b.subscription_status = 'essai' then 'en_attente_paiement'
      -- Compte déjà bloqué (en_attente_paiement/expire/suspendu) : reste
      -- dans son état, rejeter une nouvelle tentative ne le débloque pas
      -- mais ne force pas non plus son statut vers une valeur qui
      -- décrirait mal son historique.
      else b.subscription_status
    end
    where b.id = v_business_id
    returning b.id, b.owner_id, b.name, b.email, b.subscription_status, b.subscription_expires_at, b.is_admin;
end;
$$;

grant execute on function admin_reject_payment(uuid, text) to authenticated;
