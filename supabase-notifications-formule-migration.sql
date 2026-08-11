-- ============================================================
-- FORMULE DANS LES NOTIFICATIONS ADMIN
-- À exécuter une fois dans l'éditeur SQL Supabase, après
-- supabase-notifications-migration.sql (table notifications, trigger de
-- justificatif) — remplace ce trigger et en ajoute un nouveau pour les
-- inscriptions.
-- ============================================================

-- ------------------------------------------------------------
-- libelle_formule(plan) : libellé lisible + prix indicatif d'une formule,
-- pour les messages de notification ci-dessous. Duplique volontairement
-- PLANS/PLAN_PRICES de lib/constants.js (Postgres ne peut pas importer de
-- JS) — à mettre à jour manuellement ici si ces valeurs changent côté
-- application.
-- ------------------------------------------------------------
create or replace function libelle_formule(plan text)
returns text
language sql
immutable
as $$
  select case plan
    when 'cle_en_main' then 'Clé en main (5 000 FCFA/mois + 15 000 FCFA à l''installation)'
    when 'premium' then 'Premium géré (30 000 FCFA/mois)'
    else 'Autonome (5 000 FCFA/mois)'
  end;
$$;

-- ------------------------------------------------------------
-- Notification admin : nouveau justificatif de paiement à vérifier.
-- Reprend le trigger de supabase-notifications-migration.sql en ajoutant
-- la formule du commerçant au message, pour savoir immédiatement quel
-- montant vérifier sans aller chercher l'information ailleurs.
-- ------------------------------------------------------------
create or replace function notifier_admins_nouveau_justificatif()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
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
  end if;
  return new;
end;
$$;

-- ------------------------------------------------------------
-- Notification admin : nouvelle inscription. N'existait pas jusqu'ici —
-- se déclenche à la création de la ligne businesses (première connexion
-- après confirmation e-mail, voir ensureBusiness dans
-- lib/AuthProvider.js), pas à la soumission du formulaire d'inscription
-- elle-même. SECURITY DEFINER pour la même raison que le trigger de
-- justificatif : le commerçant qui vient de créer son compte n'a (et ne
-- doit) avoir aucun droit d'écriture sur les notifications de
-- l'administratrice.
-- ------------------------------------------------------------
create or replace function notifier_admins_nouvelle_inscription()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.is_admin = false then
    insert into notifications (business_id, type, message, lien)
    select
      admin.id,
      'nouvelle_inscription',
      coalesce(new.name, 'Une nouvelle boutique')
        || ' vient de s''inscrire — formule ' || libelle_formule(new.plan) || '.',
      '/admin'
    from businesses admin
    where admin.is_admin = true;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_notifier_admins_nouvelle_inscription on businesses;
create trigger trg_notifier_admins_nouvelle_inscription
  after insert on businesses
  for each row
  execute function notifier_admins_nouvelle_inscription();
