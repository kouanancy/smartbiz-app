-- ============================================================
-- RAPPORT DE STOCK : déclenchement quotidien à heure fixe (plan Vercel Hobby)
-- À exécuter une fois dans l'éditeur SQL Supabase.
-- Nécessite supabase-rapport-stock-horaire-migration.sql.
-- ============================================================

-- Le plan Vercel Hobby limite les Cron Jobs à une exécution par jour, à
-- heure fixe (voir vercel.json, app/api/cron/stock-reports passé de
-- "0 * * * *" à "0 7 * * *") — la tâche ne peut donc plus vérifier
-- l'heure choisie par chaque boutique (rapport_stock_heure) au moment où
-- elle tourne, puisqu'elle ne tourne qu'une seule fois par jour, à 7h.
-- rapport_stock_heure reste enregistrée normalement (champ toujours
-- visible et sélectionnable dans Paramètres, sans aucun avertissement
-- affiché au commerçant) pour pouvoir être vraiment respectée le jour où
-- le plan Vercel changerait — seule la condition qui la comparait à
-- l'heure courante est retirée ici. Le jour choisi pour l'hebdomadaire
-- (rapport_stock_jour_semaine), lui, reste pleinement respecté : la tâche
-- ne tourne qu'une fois par jour, donc comparer le jour du jour au jour
-- choisi reste exact.
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
        b.rapport_stock = 'journalier'
        or (b.rapport_stock = 'hebdomadaire' and b.rapport_stock_jour_semaine = extract(dow from now())::int)
      )
      and (b.rapport_stock_dernier_envoi is null or b.rapport_stock_dernier_envoi < current_date)
    returning b.id, b.name, b.notif_email, b.langue, b.devise;
end;
$$;
