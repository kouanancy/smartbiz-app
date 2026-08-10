-- ============================================================
-- HORAIRE PERSONNALISÉ DU RAPPORT DE STOCK
-- À exécuter une fois dans l'éditeur SQL Supabase.
-- Nécessite smartbiz-schema.sql (colonne businesses.rapport_stock).
-- ============================================================

-- Heure d'envoi choisie par la boutique (0-23, heure pleine — la tâche
-- planifiée tourne une fois par heure, pas à la minute près, voir
-- app/api/cron/stock-reports). Toujours interprétée en heure d'Abidjan,
-- qui est UTC+0 toute l'année (pas de changement d'heure) : aucune
-- conversion de fuseau n'est donc nécessaire, extract(hour from now())
-- suffit côté SQL.
alter table businesses
  add column if not exists rapport_stock_heure smallint not null default 8
    check (rapport_stock_heure >= 0 and rapport_stock_heure <= 23);

-- Jour de la semaine pour le rapport hebdomadaire uniquement (ignoré si
-- rapport_stock = 'journalier'). Convention 0 = dimanche .. 6 = samedi,
-- identique à extract(dow from ...) côté Postgres et à Date.getDay() côté
-- JS — pas de table de correspondance à maintenir entre les deux.
alter table businesses
  add column if not exists rapport_stock_jour_semaine smallint not null default 1
    check (rapport_stock_jour_semaine >= 0 and rapport_stock_jour_semaine <= 6);

-- Déduplication : la date du dernier rapport envoyé avec succès. Empêche
-- un double envoi si la tâche planifiée tourne plusieurs fois dans la même
-- heure (retry, redéploiement...) — voir boutiques_dues_rapport_stock()
-- ci-dessous, qui ne renvoie (et ne marque comme envoyées) que les
-- boutiques pas encore servies aujourd'hui.
alter table businesses
  add column if not exists rapport_stock_dernier_envoi date;

-- ------------------------------------------------------------
-- Sélectionne les boutiques dont l'heure (et, pour l'hebdomadaire, le
-- jour) choisis correspondent à maintenant, et marque leur envoi dans le
-- même mouvement (UPDATE ... RETURNING) : la mise à jour de
-- rapport_stock_dernier_envoi verrouille la ligne le temps de la
-- transaction, donc deux exécutions concurrentes de la tâche planifiée ne
-- peuvent jamais renvoyer/marquer deux fois la même boutique le même jour.
-- SECURITY DEFINER + aucun grant à authenticated/anon : seule la route
-- cron, avec la clé service_role, peut l'appeler (même choix que
-- generer_notifications_expiration(), voir
-- supabase-notifications-migration.sql).
-- ------------------------------------------------------------
create or replace function boutiques_dues_rapport_stock()
returns table (
  business_id uuid,
  business_name text,
  notif_email text,
  langue text,
  devise text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
    update businesses b
    set rapport_stock_dernier_envoi = current_date
    where b.notif_email is not null
      and (
        (b.rapport_stock = 'journalier' and b.rapport_stock_heure = extract(hour from now())::int)
        or (
          b.rapport_stock = 'hebdomadaire'
          and b.rapport_stock_heure = extract(hour from now())::int
          and b.rapport_stock_jour_semaine = extract(dow from now())::int
        )
      )
      and (b.rapport_stock_dernier_envoi is null or b.rapport_stock_dernier_envoi < current_date)
    returning b.id, b.name, b.notif_email, b.langue, b.devise;
end;
$$;
