-- ============================================================
-- PARAMÈTRES GLOBAUX — numéro WhatsApp du support
-- À exécuter une fois dans l'éditeur SQL Supabase.
-- Nécessite supabase-paiements-manuels-migration.sql (table
-- parametres_globaux).
-- ============================================================

-- Numéro dédié au support (espace Aide/Support côté commerçant),
-- indépendant de wave_telephone (numéro Wave des paiements) : les deux
-- rôles n'ont aucune raison de partager le même numéro, et changer l'un
-- ne doit jamais affecter l'autre.
alter table parametres_globaux add column if not exists support_telephone text;
