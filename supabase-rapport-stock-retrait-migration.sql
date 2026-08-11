-- ============================================================
-- RETRAIT DU RAPPORT DE STOCK PAR E-MAIL
-- À exécuter une fois dans l'éditeur SQL Supabase.
-- ============================================================

-- Fonctionnalité jugée redondante — le stock est déjà consultable
-- facilement dans l'application (page Articles) — retirée avec son cron
-- (app/api/cron/stock-reports, supprimé) et son champ dans Paramètres.
-- Les confirmations de commande par e-mail (businesses.notif_email,
-- businesses.confirmation_email) sont une fonctionnalité distincte,
-- conservée telle quelle.
drop function if exists boutiques_dues_rapport_stock();

alter table businesses drop column if exists rapport_stock;
alter table businesses drop column if exists rapport_stock_jour_semaine;
alter table businesses drop column if exists rapport_stock_dernier_envoi;
