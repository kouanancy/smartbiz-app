-- ============================================================
-- FIX : generer_notifications_expiration() échouait avec
-- "there is no unique or exclusion constraint matching the ON CONFLICT
-- specification" (code Postgres 42P10).
-- À exécuter une fois dans l'éditeur SQL Supabase, après
-- supabase-notifications-migration.sql.
-- ============================================================

-- Cause exacte : notifications_dedupe_key_idx (voir
-- supabase-notifications-migration.sql) est un index unique PARTIEL —
-- "on notifications (dedupe_key) where dedupe_key is not null". Postgres
-- n'accepte d'inférer un index partiel pour ON CONFLICT que si la clause
-- répète le même prédicat WHERE ; "on conflict (dedupe_key) do nothing",
-- sans ce WHERE, ne correspond donc à aucune contrainte selon Postgres,
-- même si l'index existe bel et bien. Résultat : la fonction levait une
-- erreur 42P10 à chaque appel, jamais une notification/e-mail
-- d'expiration n'était donc créé(e). Pas de nouvelle contrainte à
-- ajouter — seule la clause ON CONFLICT doit répéter le prédicat de
-- l'index existant.
create or replace function generer_notifications_expiration()
returns table (
  business_id uuid,
  business_name text,
  business_email text,
  subscription_expires_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
    with nouvelles as (
      insert into notifications (business_id, type, message, lien, dedupe_key)
      select
        b.id,
        'abonnement_expire',
        'Ton abonnement expire dans '
          || greatest(1, ceil(extract(epoch from (b.subscription_expires_at - now())) / 86400))::int
          || ' jour(s).',
        '/parametres',
        'abonnement_expire:' || b.id::text || ':' || (b.subscription_expires_at::date)::text
      from businesses b
      where b.is_admin = false
        and b.subscription_status in ('actif', 'essai')
        and b.subscription_expires_at is not null
        and b.subscription_expires_at > now()
        and b.subscription_expires_at <= now() + interval '3 days'
      on conflict (dedupe_key) where dedupe_key is not null do nothing
      returning notifications.business_id
    )
    select b.id, b.name, b.email, b.subscription_expires_at
    from nouvelles n
    join businesses b on b.id = n.business_id;
end;
$$;
