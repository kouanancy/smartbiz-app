-- ============================================================
-- RETOUR D'ARTICLES LIVRÉS
-- À exécuter une fois dans l'éditeur SQL Supabase, après
-- supabase-articles-offerts-migration.sql (commande_lignes.offert) et
-- supabase-commandes-livraison-migration.sql (commandes.statut = 'livree').
-- Rejouable sans risque (create table if not exists, create or replace
-- function, drop trigger/policy if exists avant chaque create).
-- ============================================================

-- ------------------------------------------------------------
-- 1. NUMÉROTATION RET-0001 — même principe que gerer_code_article()
-- (supabase-articles-code-migration.sql) et gerer_numero_reception()
-- (supabase-achats-approvisionnement-migration.sql) : compteur par
-- boutique, jamais accordé en écriture à `authenticated` (absent du
-- GRANT UPDATE de supabase-businesses-colonnes-restreintes-migration.sql,
-- et ne doit jamais y figurer), incrémenté uniquement par le trigger
-- SECURITY DEFINER plus bas.
-- ------------------------------------------------------------
alter table businesses add column if not exists next_numero_retour integer not null default 1;

-- ------------------------------------------------------------
-- 2. TABLES
-- Une seule ligne par retour dans cette version (un seul article retourné
-- par confirmation, voir enregistrer_retour() plus bas) — retour_lignes
-- existe déjà comme une vraie table à part (plutôt que des colonnes
-- directement sur retours) pour accueillir plusieurs lignes par retour
-- plus tard sans migration de schéma supplémentaire.
-- `montant`/`marge` sur `retours` sont des totaux figés, sommes des
-- lignes — même principe de dénormalisation que commandes.ca/commandes.marge
-- (sommes des commande_lignes), pour que Trésorerie/Dashboard les lisent
-- directement sans avoir à joindre retour_lignes à chaque fois.
-- ------------------------------------------------------------
create table if not exists retours (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  numero text not null,
  commande_id uuid not null references commandes(id),
  montant numeric not null default 0,
  marge numeric not null default 0,
  mode_remboursement text not null check (mode_remboursement in ('especes', 'mobile_money')),
  motif text,
  created_at timestamptz not null default now()
);

create index if not exists retours_business_idx on retours (business_id, created_at desc);
create index if not exists retours_commande_idx on retours (commande_id);

alter table retours drop constraint if exists retours_business_numero_unique;
alter table retours add constraint retours_business_numero_unique unique (business_id, numero);

alter table retours enable row level security;
drop policy if exists "Accès limité à sa boutique" on retours;
create policy "Accès limité à sa boutique" on retours for all
  using (business_id in (select id from businesses where owner_id = auth.uid()));

-- commande_ligne_id n'est délibérément pas "on delete cascade" (une
-- ligne de commande ne se supprime jamais après coup, voir
-- app/(app)/commandes/[id]/page.js) ; article_id reste "on delete set
-- null" comme reception_lignes.article_id : si l'article est supprimé
-- plus tard, la ligne de retour reste une pièce d'historique/impression
-- avec ses montants déjà figés.
create table if not exists retour_lignes (
  id uuid primary key default gen_random_uuid(),
  retour_id uuid not null references retours(id) on delete cascade,
  commande_ligne_id uuid not null references commande_lignes(id),
  article_id uuid references articles(id) on delete set null,
  quantite integer not null check (quantite > 0),
  prix_unitaire numeric not null,
  marge_unitaire numeric not null,
  montant numeric not null
);

create index if not exists retour_lignes_retour_idx on retour_lignes (retour_id);
create index if not exists retour_lignes_commande_ligne_idx on retour_lignes (commande_ligne_id);

alter table retour_lignes enable row level security;
drop policy if exists "Accès limité à sa boutique" on retour_lignes;
create policy "Accès limité à sa boutique" on retour_lignes for all
  using (retour_id in (
    select id from retours where business_id in (
      select id from businesses where owner_id = auth.uid()
    )
  ));

-- ------------------------------------------------------------
-- 3. NUMÉROTATION ET VERROUILLAGE
-- Contrairement aux réceptions (brouillon modifiable, verrouillée
-- seulement une fois validée), un retour est créé déjà définitif en une
-- seule transaction par enregistrer_retour() plus bas : aucun état
-- "brouillon" n'existe ici, donc current_user = 'authenticated' bloque
-- INSERT comme UPDATE/DELETE sans aucune exception — la seule façon
-- légitime de créer un retour est d'appeler cette fonction (SECURITY
-- DEFINER, s'exécute sous son propriétaire, jamais 'authenticated').
-- Sans ce verrou sur INSERT, un commerçant pourrait, via un appel direct
-- à l'API REST, créer un retours/retour_lignes fabriqué de toutes pièces
-- (montant arbitraire, sans jamais restaurer le stock ni vérifier la
-- quantité retournable) — la policy RLS seule ne l'empêche pas, puisque
-- la ligne appartiendrait bien à sa propre boutique.
-- ------------------------------------------------------------
create or replace function gerer_numero_retour()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_numero integer;
begin
  if tg_op = 'INSERT' then
    update businesses
      set next_numero_retour = next_numero_retour + 1
      where id = new.business_id
      returning next_numero_retour - 1 into v_numero;
    if not found then
      raise exception 'Boutique introuvable pour l''attribution du numéro de retour';
    end if;
    new.numero := 'RET-' || lpad(v_numero::text, 4, '0');
  elsif tg_op = 'UPDATE' then
    new.numero := old.numero;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_numero_retour_insert on retours;
create trigger trg_numero_retour_insert
  before insert on retours
  for each row
  execute function gerer_numero_retour();

drop trigger if exists trg_numero_retour_update on retours;
create trigger trg_numero_retour_update
  before update on retours
  for each row
  execute function gerer_numero_retour();

create or replace function verrouiller_retour()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user = 'authenticated' then
    raise exception 'Un retour enregistré ne peut être ni créé, ni modifié, ni supprimé directement.';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_verrouiller_retour_insert on retours;
create trigger trg_verrouiller_retour_insert
  before insert on retours
  for each row
  execute function verrouiller_retour();

drop trigger if exists trg_verrouiller_retour_update on retours;
create trigger trg_verrouiller_retour_update
  before update on retours
  for each row
  execute function verrouiller_retour();

drop trigger if exists trg_verrouiller_retour_delete on retours;
create trigger trg_verrouiller_retour_delete
  before delete on retours
  for each row
  execute function verrouiller_retour();

create or replace function verrouiller_retour_ligne()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user = 'authenticated' then
    raise exception 'Un retour enregistré ne peut être ni créé, ni modifié, ni supprimé directement.';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_verrouiller_retour_ligne on retour_lignes;
create trigger trg_verrouiller_retour_ligne
  before insert or update or delete on retour_lignes
  for each row
  execute function verrouiller_retour_ligne();

-- ------------------------------------------------------------
-- 4. enregistrer_retour() — transaction atomique (SECURITY DEFINER,
-- vérifie elle-même la boutique de l'appelant, comme valider_reception()).
-- Un seul article par appel (un seul commande_ligne_id) ; plusieurs appels
-- successifs sur la même commande sont le fonctionnement normal pour
-- retourner plusieurs articles.
--
-- `select ... for update` sur la ligne de commande sérialise deux retours
-- simultanés sur la même ligne (double clic, ou deux onglets) : le second
-- appel attend la fin du premier, puis relit la quantité déjà retournée
-- à jour avant de vérifier le maximum — jamais de dépassement possible
-- même en cas de course.
--
-- Le stock réel est restauré SANS recalculer le coût moyen pondéré (même
-- principe que annuler_reception(), qui restaure stock_avant sans
-- recalcul) : un retour n'est pas un réapprovisionnement, juste une
-- remise en stock de l'exemplaire rendu. Un article désactivé reste
-- retournable : cette fonction ne lit ni ne modifie jamais articles.actif.
-- ------------------------------------------------------------
create or replace function enregistrer_retour(
  p_commande_ligne_id uuid,
  p_quantite integer,
  p_mode_remboursement text,
  p_motif text default null
)
returns retours
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ligne commande_lignes;
  v_commande commandes;
  v_deja_retourne integer;
  v_retournable integer;
  v_prix_unitaire numeric;
  v_marge_unitaire numeric;
  v_montant numeric;
  v_marge numeric;
  v_retour retours;
begin
  if p_quantite is null or p_quantite <= 0 then
    raise exception 'La quantité à retourner doit être supérieure à 0.';
  end if;
  if p_mode_remboursement not in ('especes', 'mobile_money') then
    raise exception 'Mode de remboursement invalide.';
  end if;

  select * into v_ligne from commande_lignes where id = p_commande_ligne_id for update;
  if not found then
    raise exception 'Ligne de commande introuvable.';
  end if;

  select * into v_commande from commandes where id = v_ligne.commande_id for update;
  if not found then
    raise exception 'Commande introuvable.';
  end if;

  if not exists (select 1 from businesses where id = v_commande.business_id and owner_id = auth.uid()) then
    raise exception 'Boutique non autorisée pour cette commande.';
  end if;

  if v_commande.statut <> 'livree' then
    raise exception 'Seule une commande livrée peut faire l''objet d''un retour.';
  end if;

  if v_ligne.offert then
    raise exception 'Un article offert ne peut pas être retourné.';
  end if;

  select coalesce(sum(rl.quantite), 0) into v_deja_retourne
    from retour_lignes rl
    where rl.commande_ligne_id = p_commande_ligne_id;

  v_retournable := v_ligne.quantite - v_deja_retourne;
  if p_quantite > v_retournable then
    raise exception 'Quantité à retourner (%) supérieure à la quantité encore retournable (%).', p_quantite, v_retournable;
  end if;

  v_prix_unitaire := v_ligne.prix_vente;
  v_marge_unitaire := v_ligne.prix_vente - v_ligne.prix_achat - coalesce(v_ligne.frais_annexes, 0);
  v_montant := v_prix_unitaire * p_quantite;
  v_marge := v_marge_unitaire * p_quantite;

  update articles set stock = stock + p_quantite where id = v_ligne.article_id;

  insert into retours (business_id, commande_id, montant, marge, mode_remboursement, motif)
  values (v_commande.business_id, v_commande.id, v_montant, v_marge, p_mode_remboursement, nullif(trim(p_motif), ''))
  returning * into v_retour;

  insert into retour_lignes (retour_id, commande_ligne_id, article_id, quantite, prix_unitaire, marge_unitaire, montant)
  values (v_retour.id, p_commande_ligne_id, v_ligne.article_id, p_quantite, v_prix_unitaire, v_marge_unitaire, v_montant);

  return v_retour;
end;
$$;

grant execute on function enregistrer_retour(uuid, integer, text, text) to authenticated;
