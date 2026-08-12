-- ============================================================
-- NOTIFICATION COMMERÇANT : renouvellement anticipé envoyé
-- (paiement en_attente pendant que le compte a déjà un accès valide)
-- À exécuter une fois dans l'éditeur SQL Supabase.
-- Nécessite supabase-notifications-migration.sql (table notifications,
-- trigger trg_notifier_admins_nouveau_justificatif sur
-- paiements_abonnement) et supabase-admin-reject-payment-anticipe-migration.sql
-- (pendant du côté "rejeté" de cette même nuance).
-- ============================================================

-- Le déclencheur existant (notifier_admins_nouveau_justificatif) prévient
-- déjà l'administratrice de tout nouveau justificatif à vérifier, mais
-- rien ne prévenait jusqu'ici le commerçant lui-même quand ce justificatif
-- est un renouvellement anticipé (compte déjà 'actif'/'essai' avec une
-- échéance encore dans le futur, carte Abonnement des Paramètres ou
-- changement de formule) : ce cas précis n'est jamais bloquant (voir
-- lib/paiements.js, fonction accesDejaValide, et
-- dernierPaiementBlocage côté client), donc sans ce trigger le commerçant
-- n'aurait aucune confirmation visible que son envoi a bien été pris en
-- compte avant sa validation par l'administratrice. Fonction séparée du
-- trigger existant (plutôt que fusionnée) : deux boutiques différentes
-- reçoivent la notification (l'administratrice pour l'une, le commerçant
-- lui-même pour l'autre), donc deux insertions indépendantes.
create or replace function notifier_commercant_renouvellement_anticipe()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deja_valide boolean;
begin
  if new.statut = 'en_attente' then
    select
      b.subscription_status in ('actif', 'essai')
      and b.subscription_expires_at is not null
      and b.subscription_expires_at > now()
    into v_deja_valide
    from businesses b
    where b.id = new.business_id;

    if v_deja_valide then
      insert into notifications (business_id, type, message, lien)
      values (
        new.business_id,
        'renouvellement_anticipe_en_attente',
        'Ton paiement de renouvellement est en cours de vérification.',
        '/parametres'
      );
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_notifier_commercant_renouvellement_anticipe on paiements_abonnement;
create trigger trg_notifier_commercant_renouvellement_anticipe
  after insert on paiements_abonnement
  for each row
  execute function notifier_commercant_renouvellement_anticipe();
