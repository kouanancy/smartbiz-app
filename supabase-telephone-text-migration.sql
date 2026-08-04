-- ============================================================
-- GARANTIE DE TYPE : numéros de téléphone toujours en texte
-- À exécuter une fois dans l'éditeur SQL Supabase.
-- ============================================================

-- wave_telephone et support_telephone (parametres_globaux) sont déjà
-- déclarées "text" dans les migrations d'origine
-- (supabase-paiements-manuels-migration.sql,
-- supabase-support-telephone-migration.sql) — cette migration ne fait que
-- le confirmer explicitement, au cas où une colonne aurait été retypée
-- manuellement par ailleurs. Un numéro local commence par 0 : le stocker
-- comme un nombre (integer/numeric) supprimerait silencieusement ce 0 et
-- rendrait le lien WhatsApp généré (wa.me/...) invalide — voir
-- lib/format.js, toWhatsAppNumber().
alter table parametres_globaux
  alter column wave_telephone type text using wave_telephone::text;
alter table parametres_globaux
  alter column support_telephone type text using support_telephone::text;
