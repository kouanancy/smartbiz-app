-- ============================================================
-- PARAMÈTRES GLOBAUX — logo SmartBiz (marque de la plateforme)
-- À exécuter une fois dans l'éditeur SQL Supabase.
-- Nécessite supabase-paiements-manuels-migration.sql (table
-- parametres_globaux et fonction is_admin_user()).
-- ============================================================

-- Logo général (en-tête page de connexion, pied de page des reçus) et
-- icônes carrées pré-générées pour l'icône d'écran d'accueil (PWA) :
-- 192×192, 512×512 (manifest) et 180×180 (Apple touch icon).
alter table parametres_globaux add column if not exists logo_url text;
alter table parametres_globaux add column if not exists icon_192_url text;
alter table parametres_globaux add column if not exists icon_512_url text;
alter table parametres_globaux add column if not exists icon_apple_180_url text;

-- La policy de lecture précédente restreignait aux comptes déjà connectés
-- (auth.uid() is not null). Le logo/les icônes doivent pourtant être
-- lisibles AVANT toute connexion : page de connexion/inscription et
-- manifest PWA (requis par le navigateur/l'OS sans session utilisateur).
-- Rien de confidentiel dans cette table (QR/numéro/prix déjà publics,
-- logo/icônes le sont tout autant) : on passe la lecture en public.
drop policy if exists "Lecture des paramètres globaux par tout compte connecté" on parametres_globaux;
create policy "Lecture publique des paramètres globaux"
  on parametres_globaux for select
  using (true);
