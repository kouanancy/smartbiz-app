-- ============================================================
-- ACOMPTES SUR COMMANDE, AVEC RÉSERVATION DU STOCK THÉORIQUE
-- À exécuter une fois dans l'éditeur SQL Supabase. Rejouable sans risque
-- (create table if not exists, create index if not exists, drop policy/
-- trigger if exists avant chaque create).
-- ============================================================

-- Une commande "réservée" est simplement une commande en attente de
-- livraison qui a au moins un acompte au statut 'verse' (voir
-- app/(app)/commandes/[id]/page.js, app/(app)/commandes/page.js) — aucune
-- colonne ni aucun calcul séparé pour "réserver" le stock : le stock
-- théorique (stock réel − quantités des commande_lignes des commandes
-- 'en_attente', déjà calculé ainsi côté app, voir
-- app/(app)/articles/page.js et app/(app)/nouvelle/page.js) tient déjà
-- compte de TOUTE commande en attente, avec ou sans acompte — une
-- commande devient "réservée" dès sa création, l'acompte ne fait que
-- l'attester financièrement. Le stock réel, lui, n'est toujours déduit
-- qu'à la livraison (marquerLivree(), inchangé). Annuler la commande la
-- fait sortir de 'en_attente', ce qui restitue le stock théorique
-- automatiquement, par ce même calcul déjà existant — aucune action
-- supplémentaire nécessaire ici pour ça.
create table if not exists commande_acomptes (
  id uuid primary key default gen_random_uuid(),
  commande_id uuid not null references commandes(id) on delete cascade,
  business_id uuid not null references businesses(id) on delete cascade,
  montant numeric not null check (montant > 0),
  mode_paiement text not null,
  date_versement date not null default current_date,
  statut text not null default 'verse', -- 'verse' | 'rembourse'
  created_at timestamptz not null default now()
);

create index if not exists commande_acomptes_commande_idx on commande_acomptes (commande_id);
create index if not exists commande_acomptes_business_statut_idx on commande_acomptes (business_id, statut);

alter table commande_acomptes enable row level security;

-- Même politique que les autres tables rattachées directement à
-- business_id (articles, commandes, reappros...) — voir smartbiz-schema.sql.
drop policy if exists "Accès limité à sa boutique" on commande_acomptes;
create policy "Accès limité à sa boutique" on commande_acomptes for all
  using (business_id in (select id from businesses where owner_id = auth.uid()));

-- ------------------------------------------------------------
-- Empêche d'enregistrer un acompte (statut 'verse') si le stock théorique
-- d'un des articles de la commande est déjà négatif — reprend exactement
-- le calcul déjà utilisé côté app (stock réel − quantités réservées par
-- toutes les commandes en attente), sans le dupliquer sous une autre
-- forme. Un acompte "remboursé" (mis à jour depuis 'verse', ou par le
-- trigger d'annulation ci-dessous) ne redéclenche jamais cette
-- vérification : seule une nouvelle insertion au statut 'verse' est
-- concernée.
-- Pas de verrouillage de ligne (select ... for update) ici contrairement
-- à appliquer_cout_moyen_pondere() (supabase-reappro-cout-moyen-
-- migration.sql) : un acompte est une action humaine ponctuelle (la
-- commerçante encaisse un versement), jamais deux insertions concurrentes
-- sur la même commande en pratique — la simplicité l'emporte ici sur une
-- protection contre une course qui ne se produit pas dans l'usage réel.
-- ------------------------------------------------------------
create or replace function verifier_stock_theorique_acompte()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_article record;
begin
  if new.statut <> 'verse' then
    return new;
  end if;

  for v_article in
    select
      a.id,
      a.nom,
      a.stock - coalesce(sum(cl.quantite) filter (where c.statut = 'en_attente'), 0) as theorique
    from commande_lignes cl
    join commandes c on c.id = cl.commande_id
    join articles a on a.id = cl.article_id
    where cl.article_id in (
      select cl2.article_id from commande_lignes cl2 where cl2.commande_id = new.commande_id
    )
    group by a.id, a.nom, a.stock
  loop
    if v_article.theorique < 0 then
      raise exception 'Stock théorique insuffisant pour « % » : cet acompte ne peut pas être enregistré.', v_article.nom;
    end if;
  end loop;

  return new;
end;
$$;

drop trigger if exists trg_verifier_stock_theorique_acompte on commande_acomptes;
create trigger trg_verifier_stock_theorique_acompte
  before insert on commande_acomptes
  for each row
  execute function verifier_stock_theorique_acompte();

-- ------------------------------------------------------------
-- À l'annulation d'une commande (statut -> 'annulee'), ses acomptes
-- encore 'verse' passent automatiquement à 'rembourse' — sans choix à
-- faire côté commerçante, et sans toucher app/(app)/commandes/[id]/page.js
-- (annulerCommande() reste un simple update de commandes.statut, ce
-- trigger fait le reste). Un acompte 'rembourse' n'est jamais compté
-- comme versé (voir le filtre statut = 'verse' partout côté app) : il ne
-- réduit plus le reste à payer et ne figure plus dans aucun total.
-- ------------------------------------------------------------
create or replace function rembourser_acomptes_a_annulation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.statut = 'annulee' and old.statut is distinct from 'annulee' then
    update commande_acomptes
      set statut = 'rembourse'
      where commande_id = new.id
        and statut = 'verse';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_rembourser_acomptes_a_annulation on commandes;
create trigger trg_rembourser_acomptes_a_annulation
  after update on commandes
  for each row
  execute function rembourser_acomptes_a_annulation();
