-- ============================================================
-- CORRIGE UNE RÉGRESSION : la mention de la formule avait disparu du
-- message de la notification 🔔 admin « paiement à vérifier ».
-- À exécuter une fois dans l'éditeur SQL Supabase.
-- Nécessite supabase-alerte-paiement-serveur-migration.sql (pg_net,
-- appel à /api/alerte-paiement, remplacée ici) et
-- supabase-notifications-formule-migration.sql (fonction libelle_formule,
-- toujours nécessaire, inchangée).
-- ============================================================

-- supabase-alerte-paiement-serveur-migration.sql a réécrit
-- notifier_admins_nouveau_justificatif() en repartant par erreur de la
-- version d'origine (supabase-notifications-migration.sql) plutôt que de
-- la version déjà enrichie par supabase-notifications-formule-migration.sql
-- (mention de la formule dans le message, via libelle_formule) : la
-- mention de la formule avait donc disparu du message de la notification
-- 🔔 admin, tout en restant présente dans l'e-mail (libelleFormule() côté
-- JS, app/api/alerte-paiement/route.js, non affecté par cette régression).
-- Cette migration devient la version canonique et définitive de la
-- fonction : message enrichi (formule) + appel e-mail via pg_net,
-- réunis en un seul endroit.
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
