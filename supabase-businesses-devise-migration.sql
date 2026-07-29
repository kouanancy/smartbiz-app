-- ============================================================
-- BUSINESSES — devise d'affichage
-- À exécuter une fois dans l'éditeur SQL Supabase.
-- ============================================================

-- 'FCFA' | 'EUR' | 'USD'. FCFA par défaut pour tout nouveau compte.
alter table businesses
  add column if not exists devise text not null default 'FCFA';
