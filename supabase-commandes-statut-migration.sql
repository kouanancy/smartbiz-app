-- ============================================================
-- COMMANDES — statut confirmée / annulée
-- À exécuter une fois dans l'éditeur SQL Supabase (comme les
-- autres fichiers supabase-*-migration.sql).
-- ============================================================

-- 'confirmee' | 'annulee'. Une commande annulée reste visible dans
-- l'historique mais est exclue du CA/marge affichés sur le Dashboard,
-- et ne peut plus être modifiée ni annulée à nouveau (voir
-- app/(app)/commandes/page.js).
alter table commandes
  add column if not exists statut text not null default 'confirmee';
