-- ============================================================
-- RAPPORT DE STOCK : retrait du choix d'heure côté commerçant
-- À exécuter une fois dans l'éditeur SQL Supabase.
-- Nécessite supabase-rapport-stock-heure-fixe-migration.sql.
-- ============================================================

-- Laisser le commerçant choisir une heure qu'on ne peut pas respecter
-- (plan Vercel Hobby : une seule exécution par jour, à heure fixe pour
-- toutes les boutiques) induisait en erreur plutôt que d'aider — le champ
-- correspondant a été retiré de Paramètres. rapport_stock_heure n'est plus
-- lue nulle part (boutiques_dues_rapport_stock() ne la comparait déjà
-- plus depuis supabase-rapport-stock-heure-fixe-migration.sql) : la
-- colonne devenue inutile est donc retirée complètement plutôt que
-- laissée orpheline en base. Seul rapport_stock_jour_semaine subsiste,
-- pour le jour du rapport hebdomadaire — le déclenchement reste quotidien
-- à 7h fixe pour tout le monde (voir vercel.json,
-- app/api/cron/stock-reports).
alter table businesses
  drop column if exists rapport_stock_heure;
