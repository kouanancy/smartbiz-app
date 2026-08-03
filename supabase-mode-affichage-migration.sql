-- ============================================================
-- MODE D'AFFICHAGE (clair / sombre / automatique)
-- À exécuter une fois dans l'éditeur SQL Supabase.
-- ============================================================

-- Indépendant de theme_key (couleur d'accent) : mode_affichage pilote le
-- fond/texte général de l'app (clair, sombre, ou aligné sur les réglages
-- du système), tandis que theme_key reste la couleur d'accent choisie par
-- le commerçant, conservée à l'identique dans les deux modes. 'clair' par
-- défaut pour tout nouveau compte, comme l'app se comportait avant cette
-- migration.
alter table businesses
  add column if not exists mode_affichage text not null default 'clair'
  check (mode_affichage in ('clair', 'sombre', 'auto'));
