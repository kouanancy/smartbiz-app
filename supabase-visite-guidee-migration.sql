-- ============================================================
-- BUSINESSES — visite guidée (onboarding interactif)
-- À exécuter une fois dans l'éditeur SQL Supabase.
-- ============================================================

-- true dès que le commerçant a vu (ou passé) la visite guidée du
-- Dashboard — évite de la réafficher automatiquement à chaque
-- connexion suivante. false par défaut : chaque compte existant comme
-- chaque nouveau compte la voit une fois, à sa prochaine arrivée sur le
-- Dashboard (voir components/OnboardingTour.js,
-- app/(app)/dashboard/page.js). Peut aussi être relancée manuellement à
-- tout moment depuis Aide (app/(app)/aide/page.js), sans repasser cette
-- colonne à false — la relance est un affichage ponctuel côté client
-- (paramètre d'URL ?tour=1), pas un nouvel état "jamais vue".
alter table businesses
  add column if not exists visite_guidee_vue boolean not null default false;

-- Aucune nouvelle policy nécessaire : la policy existante
-- "Le propriétaire gère sa boutique" sur businesses (for all) couvre
-- déjà la lecture/mise à jour de cette colonne pour le propriétaire de
-- la boutique.
