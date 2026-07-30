-- ============================================================
-- PAIEMENTS MANUELS VÉRIFIÉS (Wave + justificatif + admin)
-- À exécuter une fois dans l'éditeur SQL Supabase.
-- Nécessite supabase-businesses-admin-migration.sql (is_admin_user()).
-- ============================================================

-- Photo/capture du reçu envoyée par le commerçant, et raison affichée au
-- commerçant si l'administratrice rejette le justificatif.
alter table paiements_abonnement
  add column if not exists justificatif_url text;
alter table paiements_abonnement
  add column if not exists raison_rejet text;

-- La policy d'origine ("Accès limité à sa boutique", for all) laissait un
-- commerçant modifier le statut de ses propres paiements — donc s'auto-
-- valider un paiement sans jamais payer. On la remplace par une lecture/
-- insertion limitées à sa boutique, plus une insertion forcée à
-- statut = 'en_attente' ; seule la policy admin (plus bas) peut faire
-- passer un paiement à 'reussi' ou 'echoue'.
drop policy if exists "Accès limité à sa boutique" on paiements_abonnement;

create policy "Un commerçant consulte ses paiements"
  on paiements_abonnement for select
  using (business_id in (select id from businesses where owner_id = auth.uid()));

create policy "Un commerçant soumet un justificatif"
  on paiements_abonnement for insert
  with check (
    business_id in (select id from businesses where owner_id = auth.uid())
    and statut = 'en_attente'
  );

create policy "Les admins gèrent tous les paiements d'abonnement"
  on paiements_abonnement for all
  using (is_admin_user());

-- ------------------------------------------------------------
-- Réglages globaux de paiement (une seule ligne), gérés depuis l'espace
-- Administration : QR Wave, numéro Wave (repli si le QR n'est pas encore
-- renseigné), prix de l'abonnement affiché sur l'écran de paiement.
-- ------------------------------------------------------------

create table if not exists parametres_globaux (
  id uuid primary key default gen_random_uuid(),
  wave_qr_url text,
  wave_telephone text,
  abonnement_prix numeric not null default 5000,
  updated_at timestamptz default now()
);

alter table parametres_globaux enable row level security;

-- Le QR/numéro/prix n'ont rien de confidentiel : lisibles par tout
-- utilisateur connecté (nécessaire pour l'écran de paiement de chaque
-- commerçant), modifiables uniquement par un administrateur.
create policy "Lecture des paramètres globaux par tout compte connecté"
  on parametres_globaux for select
  using (auth.uid() is not null);

create policy "Les admins modifient les paramètres globaux"
  on parametres_globaux for update
  using (is_admin_user());

-- Ligne unique : l'app suppose toujours exactement une ligne dans cette
-- table (lue via .limit(1).maybeSingle()), jamais créée depuis le client.
insert into parametres_globaux (abonnement_prix)
select 5000
where not exists (select 1 from parametres_globaux);
