-- ============================================================
-- CLIENTS — statut actif / désactivé
-- À exécuter une fois dans l'éditeur SQL Supabase (comme
-- smartbiz-schema.sql et supabase-storage-setup.sql).
-- ============================================================

-- Un client désactivé n'est plus proposé à la vente (Nouvelle commande)
-- ni dans la liste active, mais sa ligne reste en base : l'historique des
-- commandes déjà passées continue de le référencer sans rien casser.
alter table clients
  add column if not exists actif boolean not null default true;

-- Aucune nouvelle policy nécessaire : la policy existante
-- "Accès limité à sa boutique" sur clients (for all) couvre déjà la
-- mise à jour de cette colonne pour le propriétaire de la boutique.
