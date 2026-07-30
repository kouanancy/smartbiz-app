-- ============================================================
-- BUSINESSES — espace Administration (is_admin, email, RLS admin)
-- À exécuter une fois dans l'éditeur SQL Supabase.
-- ============================================================

-- Accès à l'espace Administration. false par défaut — jamais attribué
-- automatiquement à l'inscription, seulement depuis l'espace
-- Administration lui-même (ou manuellement, voir plus bas).
alter table businesses
  add column if not exists is_admin boolean not null default false;

-- Copie de l'adresse de connexion : auth.users est un schéma protégé, non
-- accessible depuis le client, donc on la duplique ici à la création du
-- compte (voir lib/AuthProvider.js) pour l'afficher dans l'espace
-- Administration.
alter table businesses
  add column if not exists email text;

-- Renseigne l'e-mail des comptes déjà existants (créés avant cette
-- migration) à partir de auth.users — accessible ici car exécuté avec les
-- droits du projet dans l'éditeur SQL, contrairement au client.
update businesses b
set email = u.email
from auth.users u
where b.owner_id = u.id and b.email is null;

-- Fonction SECURITY DEFINER : contourne volontairement le RLS pour lire
-- son propre statut admin. Évite la récursion RLS que provoquerait une
-- sous-requête directe sur businesses à l'intérieur de sa propre policy.
create or replace function is_admin_user()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce((select is_admin from businesses where owner_id = auth.uid()), false);
$$;

grant execute on function is_admin_user() to authenticated;

-- Un administrateur voit et gère toutes les boutiques (nécessaire pour la
-- liste des commerçants, "Marquer comme payé" et l'octroi/retrait des
-- droits admin).
create policy "Les admins gèrent toutes les boutiques"
  on businesses for all
  using (is_admin_user());

-- Attribue les droits admin au compte fourni. Si ce compte ne s'est pas
-- encore inscrit sur SmartBiz, cette mise à jour ne fait rien : relance-la
-- après sa première connexion.
update businesses b
set is_admin = true
from auth.users u
where b.owner_id = u.id and u.email = 'koua.nancy@gmail.com';
