-- ============================================================
-- NOTIFICATIONS PUSH (Web Push) POUR LES COMPTES ADMIN
-- + retrait de l'e-mail défaillant à la place.
-- À exécuter une fois dans l'éditeur SQL Supabase.
-- Nécessite supabase-notifications-formule-migration.sql (table
-- notifications, fonction libelle_formule) et pg_net déjà activée par
-- supabase-alerte-paiement-serveur-migration.sql (create extension if not
-- exists pg_net — rejouable, aucun risque si déjà fait).
--
-- ⚠️ Étapes manuelles supplémentaires — voir le README, section
-- « Notifications push (Web Push) », pour la marche à suivre complète :
-- variables d'environnement Vercel (clés VAPID, PUSH_ADMIN_SECRET) et
-- secrets Vault (push_admin_secret, push_admin_url).
-- ============================================================

create extension if not exists pg_net;

-- ------------------------------------------------------------
-- Abonnements Web Push : un navigateur/appareil qui a accepté de
-- recevoir des notifications = une ligne. Un même compte admin peut avoir
-- plusieurs appareils abonnés (téléphone + ordinateur) ; `endpoint` est
-- l'identifiant unique fourni par le service de push du navigateur
-- (Chrome, Firefox...), jamais réutilisé entre deux abonnements
-- différents, d'où la contrainte unique plutôt qu'une clé sur
-- business_id seul.
-- ------------------------------------------------------------
create table if not exists push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

alter table push_subscriptions enable row level security;

-- Réservé aux comptes admin, à la fois dans l'interface (bouton visible
-- seulement si business.is_admin, voir Paramètres) et ici en base : un
-- commerçant ordinaire ne peut pas créer d'abonnement push sur sa propre
-- boutique même via un appel direct à l'API REST. Une seule policy
-- `for all` : même périmètre pour lire/créer/modifier/supprimer, un
-- compte admin ne gère que ses propres abonnements.
drop policy if exists "Un admin gère ses propres abonnements push" on push_subscriptions;
create policy "Un admin gère ses propres abonnements push"
  on push_subscriptions for all
  using (business_id in (select id from businesses where owner_id = auth.uid() and is_admin = true))
  with check (business_id in (select id from businesses where owner_id = auth.uid() and is_admin = true));

-- ------------------------------------------------------------
-- notifier_admins_nouveau_justificatif() : retire l'appel e-mail (Resend,
-- via /api/alerte-paiement) qui n'a jamais pu être fiabilisé malgré
-- plusieurs correctifs successifs (renommage de route, déclenchement
-- serveur, diagnostic du jeton partagé) — remplacé par une vraie
-- notification push envoyée à tous les comptes admin abonnés, via une
-- nouvelle route dédiée (app/api/push-admin-paiement). La notification
-- 🔔 dans le centre de notifications, elle, n'a jamais eu de problème et
-- reste inchangée ici.
-- ------------------------------------------------------------
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
        body := jsonb_build_object('businessName', v_business_name)
      );
    end if;
  end if;
  return new;
end;
$$;

-- Nettoyage : les secrets Vault de l'ancien mécanisme e-mail (retiré
-- ci-dessus) n'ont plus aucun usage — supprimés pour éviter toute
-- confusion future avec les nouveaux (push_admin_secret, push_admin_url).
-- Sans effet s'ils n'existent pas ou ont déjà été supprimés.
delete from vault.secrets where name in ('payment_alert_secret', 'payment_alert_url');
