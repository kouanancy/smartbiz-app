-- ============================================================
-- SCHÉMA SMARTBIZ — Supabase / PostgreSQL
-- Formule "autonome" : chaque commerçant a son propre espace
-- isolé (multi-tenant), rattaché à son compte d'authentification.
-- ============================================================

-- 1. BOUTIQUES (une ligne = un commerçant inscrit)
create table businesses (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text default 'Ma boutique',
  logo_url text,
  theme_key text default 'orange',
  notif_email text,
  confirmation_email boolean default false,
  rapport_stock text default 'aucun', -- 'aucun' | 'journalier' | 'hebdomadaire'
  next_numero integer default 1,
  -- Abonnement / facturation
  plan text default 'autonome', -- 'autonome' | 'cle_en_main' | 'premium'
  subscription_status text default 'en_attente_paiement', -- 'en_attente_paiement' | 'actif' | 'expire' | 'suspendu'
  subscription_expires_at timestamptz,
  created_at timestamptz default now()
);

-- 2. CATÉGORIES DE PRODUITS (configurables par boutique)
create table categories (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  nom text not null,
  created_at timestamptz default now(),
  unique (business_id, nom)
);

-- 3. ZONES DE LIVRAISON (configurables par boutique, pas figées à Abidjan)
create table zones_livraison (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  zone text not null,
  frais numeric not null default 0,
  created_at timestamptz default now()
);

-- 4. CLIENTS
create table clients (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  nom text not null,
  telephone text not null,
  adresse text,
  email text,
  created_at timestamptz default now()
);

-- 5. ARTICLES / STOCK
create table articles (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  categorie_id uuid references categories(id) on delete set null,
  nom text not null,
  prix_achat numeric not null default 0,
  frais_annexes numeric not null default 0,
  prix_vente numeric not null default 0,
  stock integer not null default 0,
  seuil integer not null default 3,
  image_url text,
  created_at timestamptz default now()
);

-- 6. COMMANDES
create table commandes (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  numero text not null,
  client_id uuid not null references clients(id),
  ca numeric not null default 0,
  marge numeric not null default 0,
  livraison_type text not null default 'boutique', -- 'boutique' | 'livraison'
  livraison_zone text,
  livraison_frais numeric not null default 0,
  paiement_mode text not null default 'livraison', -- 'livraison' | 'mobile_money'
  paiement_operateur text,
  created_at timestamptz default now()
);

-- 7. LIGNES DE COMMANDE (détail des articles vendus, prix figés au moment de la vente)
create table commande_lignes (
  id uuid primary key default gen_random_uuid(),
  commande_id uuid not null references commandes(id) on delete cascade,
  article_id uuid not null references articles(id),
  quantite integer not null,
  prix_vente numeric not null,
  prix_achat numeric not null,
  frais_annexes numeric not null default 0
);

-- 8. HISTORIQUE DE RÉAPPROVISIONNEMENT
create table reappros (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  article_id uuid not null references articles(id) on delete cascade,
  quantite integer not null,
  prix_achat numeric not null,
  frais_annexes numeric not null default 0,
  created_at timestamptz default now()
);

-- 9. PAIEMENTS D'ABONNEMENT (historique + statut, alimenté par le webhook CinetPay)
create table paiements_abonnement (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  montant numeric not null,
  statut text not null default 'en_attente', -- 'en_attente' | 'reussi' | 'echoue'
  reference_cinetpay text,
  periode_couverte_jusqu_au timestamptz,
  created_at timestamptz default now()
);

-- ============================================================
-- SÉCURITÉ : chaque commerçant ne voit QUE ses propres données
-- (Row Level Security — c'est ce qui remplace le multi-tenant
-- "à la main" et empêche un commerçant de voir les données d'un autre)
-- ============================================================

alter table businesses enable row level security;
alter table categories enable row level security;
alter table zones_livraison enable row level security;
alter table clients enable row level security;
alter table articles enable row level security;
alter table commandes enable row level security;
alter table commande_lignes enable row level security;
alter table reappros enable row level security;
alter table paiements_abonnement enable row level security;

create policy "Le propriétaire gère sa boutique"
  on businesses for all
  using (owner_id = auth.uid());

-- Modèle répété pour chaque table liée à business_id :
create policy "Accès limité à sa boutique" on categories for all
  using (business_id in (select id from businesses where owner_id = auth.uid()));
create policy "Accès limité à sa boutique" on zones_livraison for all
  using (business_id in (select id from businesses where owner_id = auth.uid()));
create policy "Accès limité à sa boutique" on clients for all
  using (business_id in (select id from businesses where owner_id = auth.uid()));
create policy "Accès limité à sa boutique" on articles for all
  using (business_id in (select id from businesses where owner_id = auth.uid()));
create policy "Accès limité à sa boutique" on commandes for all
  using (business_id in (select id from businesses where owner_id = auth.uid()));
create policy "Accès limité à sa boutique" on reappros for all
  using (business_id in (select id from businesses where owner_id = auth.uid()));
create policy "Accès limité à sa boutique" on paiements_abonnement for all
  using (business_id in (select id from businesses where owner_id = auth.uid()));
create policy "Accès limité à sa boutique" on commande_lignes for all
  using (commande_id in (
    select id from commandes where business_id in (
      select id from businesses where owner_id = auth.uid()
    )
  ));
