-- ============================================================
-- RAPPORT HEBDOMADAIRE ENRICHI (CA, marge réelle, top vente de la
-- semaine, alertes de stock) — envoyé une fois par semaine, au choix du
-- commerçant par WhatsApp (lien pré-rempli à ouvrir) ou notification
-- push. Désactivé par défaut.
-- À exécuter une fois dans l'éditeur SQL Supabase.
-- Nécessite supabase-notifications-migration.sql (table notifications) et
-- supabase-push-notifications-migration.sql (table push_subscriptions,
-- dont la policy RLS est assouplie plus bas).
-- ============================================================

-- rapport_hebdo_actif : désactivé par défaut, comme demandé — la
-- fonction boutiques_dues_rapport_hebdo() ci-dessous ignore toute
-- boutique où ce drapeau est false, donc aucun rapport n'est jamais
-- envoyé sans action explicite du commerçant dans Paramètres.
-- rapport_hebdo_mode : 'whatsapp' (lien wa.me pré-rempli à ouvrir
-- soi-même — aucune API WhatsApp Business n'existe dans cette app, voir
-- lib/format.js/toWhatsAppNumber et components/Receipt.js pour le même
-- principe déjà en place ailleurs) ou 'push' (vraie notification Web
-- Push, voir push_subscriptions).
-- rapport_hebdo_jour_semaine : jour d'envoi choisi par le commerçant
-- (0 = dimanche ... 6 = samedi, même convention que
-- extract(dow from ...) en PostgreSQL — et que l'ancien
-- rapport_stock_jour_semaine, retiré, voir README).
-- rapport_hebdo_dernier_envoi : posé uniquement par
-- boutiques_dues_rapport_hebdo() (jamais par le client, donc absent du
-- GRANT UPDATE plus bas) — empêche un double envoi si la tâche planifiée
-- tournait deux fois le même jour.
alter table businesses
  add column if not exists rapport_hebdo_actif boolean not null default false,
  add column if not exists rapport_hebdo_mode text not null default 'whatsapp',
  add column if not exists rapport_hebdo_jour_semaine smallint not null default 0,
  add column if not exists rapport_hebdo_dernier_envoi date;

alter table businesses
  drop constraint if exists businesses_rapport_hebdo_mode_check;
alter table businesses
  add constraint businesses_rapport_hebdo_mode_check check (rapport_hebdo_mode in ('whatsapp', 'push'));

alter table businesses
  drop constraint if exists businesses_rapport_hebdo_jour_semaine_check;
alter table businesses
  add constraint businesses_rapport_hebdo_jour_semaine_check check (rapport_hebdo_jour_semaine between 0 and 6);

-- Même piège que visite_guidee_vue (voir
-- supabase-visite-guidee-migration.sql) : le GRANT UPDATE sur businesses
-- est restreint colonne par colonne (voir
-- supabase-businesses-colonnes-restreintes-migration.sql) — sans cet
-- ajout, l'update depuis Paramètres échouerait silencieusement.
-- rapport_hebdo_dernier_envoi volontairement absent de la liste : seule
-- boutiques_dues_rapport_hebdo() (SECURITY DEFINER, appelée uniquement
-- par le cron via la clé service_role) doit pouvoir l'écrire.
grant update (rapport_hebdo_actif, rapport_hebdo_mode, rapport_hebdo_jour_semaine) on businesses to authenticated;

-- ------------------------------------------------------------
-- push_subscriptions : assoupli à toute boutique, pas seulement aux
-- comptes admin (policy d'origine dans
-- supabase-push-notifications-migration.sql, écrite avant que le push ne
-- serve qu'aux alertes de paiement admin) — un commerçant qui choisit le
-- mode push pour son rapport hebdomadaire doit pouvoir s'abonner sur son
-- propre appareil, exactement comme un compte admin le fait déjà pour les
-- alertes de paiement. Toujours strictement scopé à sa propre boutique
-- (business_id in (select id from businesses where owner_id = auth.uid()))
-- — seule la condition is_admin = true est retirée.
-- ------------------------------------------------------------
drop policy if exists "Un admin gère ses propres abonnements push" on push_subscriptions;
drop policy if exists "Une boutique gère ses propres abonnements push" on push_subscriptions;
create policy "Une boutique gère ses propres abonnements push"
  on push_subscriptions for all
  using (business_id in (select id from businesses where owner_id = auth.uid()))
  with check (business_id in (select id from businesses where owner_id = auth.uid()));

-- ------------------------------------------------------------
-- boutiques_dues_rapport_hebdo() : sélectionne les boutiques dues
-- aujourd'hui ET marque l'envoi dans la même opération atomique (update
-- ... returning), pour ne jamais doubler un envoi si la tâche planifiée
-- tournait deux fois le même jour — même principe que
-- generer_notifications_expiration() (voir
-- supabase-notifications-migration.sql). Jamais grantée à authenticated :
-- le cron l'appelle uniquement via la clé service_role, qui contourne les
-- droits (voir app/api/cron/expiration-reminders pour le même schéma).
-- Ne calcule pas elle-même le contenu du rapport (CA, marge, top vente,
-- alertes stock) : ces agrégations multi-tables (commandes,
-- commande_lignes, articles) sont faites côté route
-- (app/api/cron/rapport-hebdo), plus simple à lire/maintenir qu'en SQL
-- pur pour le petit nombre de boutiques dues chaque jour.
-- ------------------------------------------------------------
create or replace function boutiques_dues_rapport_hebdo()
returns table (business_id uuid, business_name text, rapport_hebdo_mode text, devise text, langue text)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
    update businesses
    set rapport_hebdo_dernier_envoi = current_date
    where rapport_hebdo_actif = true
      and rapport_hebdo_jour_semaine = extract(dow from now())::smallint
      and (rapport_hebdo_dernier_envoi is null or rapport_hebdo_dernier_envoi < current_date)
    returning id, name, rapport_hebdo_mode, devise, langue;
end;
$$;
