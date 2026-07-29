-- ============================================================
-- BUSINESSES — langue de l'interface
-- À exécuter une fois dans l'éditeur SQL Supabase.
-- ============================================================

-- 'fr' | 'en'. 'fr' par défaut pour tout nouveau compte.
alter table businesses
  add column if not exists langue text not null default 'fr';
