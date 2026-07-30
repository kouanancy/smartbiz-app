-- ============================================================
-- ARTICLES — unité de mesure
-- À exécuter une fois dans l'éditeur SQL Supabase.
-- ============================================================

-- 'unite' | 'metre' | 'kilo'. 'unite' par défaut.
alter table articles
  add column if not exists unite text not null default 'unite';
