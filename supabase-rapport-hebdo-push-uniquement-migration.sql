-- ============================================================
-- RAPPORT HEBDOMADAIRE — canal unique : notification push
-- Simplifie supabase-rapport-hebdo-migration.sql : ce dernier proposait
-- un choix WhatsApp/push (rapport_hebdo_mode) ; il n'existe plus qu'un
-- seul canal, la notification push — le même mécanisme d'activation que
-- les autres notifications de l'app (voir Paramètres, section
-- « Notification push », désormais commune aux comptes admin et
-- commerçant classique, plus une carte séparée par rôle). Plus simple à
-- comprendre côté commerçant (un seul bouton à connaître) et côté code
-- (plus de branche wa.me à maintenir dans app/api/cron/rapport-hebdo).
-- À exécuter une fois dans l'éditeur SQL Supabase, après
-- supabase-rapport-hebdo-migration.sql.
-- ============================================================

-- La fonction doit être supprimée avant de retirer la colonne qu'elle
-- renvoyait (rapport_hebdo_mode) : "create or replace function" refuse de
-- changer le type de retour d'une fonction existante.
drop function if exists boutiques_dues_rapport_hebdo();

alter table businesses drop column if exists rapport_hebdo_mode;

create function boutiques_dues_rapport_hebdo()
returns table (business_id uuid, business_name text, devise text, langue text)
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
    returning id, name, devise, langue;
end;
$$;
