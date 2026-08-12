-- ============================================================
-- NOTIFICATION E-MAIL DE NOUVEAU JUSTIFICATIF : déclenchée côté serveur
-- (pg_net), plus depuis le navigateur du commerçant.
-- À exécuter une fois dans l'éditeur SQL Supabase.
-- Nécessite supabase-notifications-migration.sql (table notifications,
-- fonction notifier_admins_nouveau_justificatif, remplacée ici).
--
-- ⚠️ Étape manuelle supplémentaire APRÈS avoir exécuté ce script : créer
-- les deux secrets Vault ci-dessous (URL de la route + jeton partagé) —
-- voir le README, section « Notification e-mail : déclenchement serveur »,
-- pour la marche à suivre complète. Sans eux, l'e-mail ne part toujours
-- pas (mais rien d'autre n'est affecté : la notification dans le centre
-- de notifications, elle, continue de fonctionner normalement).
-- ============================================================

create extension if not exists pg_net;
create extension if not exists supabase_vault cascade;

-- Le fetch() envoyé depuis le navigateur du commerçant
-- (components/PaiementAbonnement.js, jusqu'ici) ne laissait strictement
-- aucune trace côté serveur quand il était bloqué avant même de quitter le
-- navigateur — cause la plus probable observée : un bloqueur de pub
-- filtrant par défaut toute URL contenant "notify" (d'où aussi le
-- renommage de la route, devenue app/api/alerte-paiement). Déclenché ici
-- depuis la base au moment même de l'insertion du justificatif : ne
-- dépend plus du tout du navigateur, du réseau ou des extensions du
-- commerçant. Le secret et l'URL de la route sont lus depuis Supabase
-- Vault plutôt que codés en dur dans cette migration (jamais commités) —
-- best effort comme avant : tant qu'ils ne sont pas configurés, le
-- justificatif s'enregistre normalement, seul l'envoi de l'e-mail est
-- ignoré (v_secret/v_url restent null).
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
    insert into notifications (business_id, type, message, lien)
    select
      admin.id,
      'paiement_a_verifier',
      coalesce((select b.name from businesses b where b.id = new.business_id), 'Une boutique')
        || ' a envoyé un justificatif de paiement à vérifier.',
      '/admin'
    from businesses admin
    where admin.is_admin = true;

    select b.name, b.plan into v_business_name, v_business_plan
    from businesses b
    where b.id = new.business_id;

    select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'payment_alert_secret';
    select decrypted_secret into v_url from vault.decrypted_secrets where name = 'payment_alert_url';

    if v_secret is not null and v_url is not null then
      perform net.http_post(
        url := v_url,
        headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_secret),
        body := jsonb_build_object('businessName', v_business_name, 'plan', v_business_plan)
      );
    end if;
  end if;
  return new;
end;
$$;
