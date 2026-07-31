-- ============================================================
-- REVENUS DOKA — date de validation des paiements d'abonnement
-- À exécuter une fois dans l'éditeur SQL Supabase.
-- Nécessite supabase-paiements-manuels-migration.sql.
-- ============================================================

-- created_at correspond à l'envoi du justificatif par le commerçant, pas à
-- sa validation par l'administratrice — la section "Revenus Doka" a besoin
-- de la date d'encaissement réel pour son graphique mensuel et son tableau
-- (tri par date de validation, la plus récente en premier).
alter table paiements_abonnement
  add column if not exists valide_at timestamptz;

-- Rétro-remplissage : pour les paiements déjà validés avant cette
-- migration, la meilleure approximation disponible est leur created_at.
update paiements_abonnement
set valide_at = created_at
where statut = 'reussi' and valide_at is null;

-- Aucun changement de policy nécessaire : "Les admins gèrent tous les
-- paiements d'abonnement" (for all, using is_admin_user()) couvre déjà la
-- lecture et l'écriture de cette nouvelle colonne pour un compte admin.
