-- ============================================================
-- CENTRE DE NOTIFICATIONS (commerçant + administratrice)
-- À exécuter une fois dans l'éditeur SQL Supabase.
-- Nécessite supabase-businesses-admin-migration.sql (is_admin_user()) et
-- supabase-paiements-manuels-migration.sql (table paiements_abonnement).
-- ============================================================

create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  type text not null,
  message text not null,
  lien text,
  lue boolean not null default false,
  -- Clé de déduplication optionnelle (ex. "abonnement_expire:<business_id>:<date>")
  -- posée uniquement par generer_notifications_expiration() ci-dessous, pour
  -- qu'une même échéance ne génère jamais deux notifications même si la
  -- tâche planifiée tourne plusieurs fois ou que le commerçant se
  -- reconnecte entre-temps. Les autres types de notifications (ex. le
  -- trigger de justificatif plus bas) n'en posent pas : chaque insertion en
  -- base de paiements_abonnement est déjà un évènement unique en soi.
  dedupe_key text,
  created_at timestamptz not null default now()
);

create unique index if not exists notifications_dedupe_key_idx
  on notifications (dedupe_key)
  where dedupe_key is not null;

create index if not exists notifications_business_lecture_idx
  on notifications (business_id, lue, created_at desc);

alter table notifications enable row level security;

-- Lecture et passage à "lue" limités à sa propre boutique — un commerçant
-- ne voit que ses notifications, l'administratrice ne voit que les siennes
-- (dont ses notifications "paiement à vérifier", voir le trigger plus
-- bas). Pas de policy insert/delete pour le rôle authenticated : toute
-- création passe par les fonctions/déclencheurs SECURITY DEFINER
-- ci-dessous, jamais directement depuis le client.
drop policy if exists "Un commerçant consulte ses notifications" on notifications;
create policy "Un commerçant consulte ses notifications"
  on notifications for select
  using (business_id in (select id from businesses where owner_id = auth.uid()));

drop policy if exists "Un commerçant marque ses notifications comme lues" on notifications;
create policy "Un commerçant marque ses notifications comme lues"
  on notifications for update
  using (business_id in (select id from businesses where owner_id = auth.uid()))
  with check (business_id in (select id from businesses where owner_id = auth.uid()));

-- ------------------------------------------------------------
-- Notification admin : nouveau justificatif de paiement à vérifier.
-- SECURITY DEFINER car le commerçant qui envoie le justificatif n'a (et ne
-- doit) avoir aucun droit d'écriture sur les notifications d'une autre
-- boutique (celle de l'administratrice) — le déclencheur contourne
-- volontairement le RLS pour cette seule insertion ciblée.
-- ------------------------------------------------------------
create or replace function notifier_admins_nouveau_justificatif()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.statut = 'en_attente' then
    insert into notifications (business_id, type, message, lien)
    select
      admin.id,
      'paiement_a_verifier',
      coalesce((select b.name from businesses b where b.id = new.business_id), 'Une boutique')
        || ' a envoyé un justificatif de paiement à vérifier.',
      '/admin'
    from businesses admin
    where admin.is_admin = true;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_notifier_admins_nouveau_justificatif on paiements_abonnement;
create trigger trg_notifier_admins_nouveau_justificatif
  after insert on paiements_abonnement
  for each row
  execute function notifier_admins_nouveau_justificatif();

-- ------------------------------------------------------------
-- Notification commerçant : abonnement qui expire dans 3 jours ou moins.
-- Appelée une fois par jour par app/api/cron/expiration-reminders
-- (Vercel Cron), avec la clé service_role — jamais depuis le client, donc
-- aucun grant à authenticated ici (contrairement aux fonctions
-- admin_* de supabase-admin-scope-abonnement-migration.sql). Le
-- ON CONFLICT (dedupe_key) DO NOTHING garantit qu'une échéance donnée
-- (business_id + date d'expiration) ne génère jamais qu'une seule
-- notification, même appelée plusieurs fois le même jour. La fonction ne
-- renvoie que les boutiques pour lesquelles une notification a vraiment
-- été créée cette fois-ci : la route cron s'en sert pour n'envoyer l'e-mail
-- de rappel qu'une seule fois par échéance elle aussi.
-- ------------------------------------------------------------
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
      on conflict (dedupe_key) do nothing
      returning notifications.business_id
    )
    select b.id, b.name, b.email, b.subscription_expires_at
    from nouvelles n
    join businesses b on b.id = n.business_id;
end;
$$;
