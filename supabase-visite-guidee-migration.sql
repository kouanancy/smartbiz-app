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

-- Aucune nouvelle policy RLS nécessaire : la policy existante
-- "Le propriétaire gère sa boutique" sur businesses (for all) couvre
-- déjà la LIGNE. Mais le GRANT UPDATE sur businesses est en plus
-- restreint colonne par colonne pour authenticated (voir
-- supabase-businesses-colonnes-restreintes-migration.sql,
-- "revoke ... ; grant update (name, logo_url, theme_key, ...)") — sans
-- ce GRANT supplémentaire, l'update ci-dessous depuis
-- app/(app)/dashboard/page.js échoue silencieusement (erreur de
-- privilège Postgres, jamais loguée avant correctif) : la colonne ne
-- passe donc jamais à true, et la visite guidée se réaffiche à chaque
-- nouvelle arrivée sur le Dashboard, quel que soit le nombre de
-- connexions/déconnexions/réabonnements. visite_guidee_vue est un
-- simple indicateur "déjà vue", sans aucune implication de sécurité
-- (contrairement à subscription_status/is_admin, volontairement hors
-- de ce GRANT) : autoriser le commerçant à l'écrire lui-même sur sa
-- propre ligne est donc sûr.
grant update (visite_guidee_vue) on businesses to authenticated;
