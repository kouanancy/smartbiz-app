-- ============================================================
-- ARTICLES OFFERTS (cadeaux) DANS UNE COMMANDE
-- À exécuter une fois dans l'éditeur SQL Supabase.
-- ============================================================

-- Une ligne de commande "offerte" reste une vraie ligne de commande_lignes
-- (même déduction du stock réel à la livraison, même prise en compte dans
-- le stock théorique des commandes en attente) — seul son prix de vente
-- change : toujours 0 pour une ligne offerte (voir
-- app/(app)/nouvelle/page.js), jamais le prix catalogue de l'article.
-- Grâce à ça, les formules déjà existantes de CA (somme des
-- prix_vente × quantite) et de marge réelle (somme des
-- (prix_vente − prix_achat − frais_annexes) × quantite) restent
-- exactes sans aucun cas particulier : un cadeau n'ajoute jamais rien au
-- CA, et son coût réel (prix_achat + frais_annexes, toujours renseigné
-- normalement) réduit bien la marge — exactement comme demandé.
--
-- Aucun GRANT à ajuster : contrairement à businesses,
-- commande_lignes n'a pas de restriction colonne par colonne (voir
-- supabase-businesses-colonnes-restreintes-migration.sql, propre à
-- businesses) — seule la policy RLS existante "Accès limité à sa
-- boutique" (via la commande parente) s'applique, déjà suffisante ici.
alter table commande_lignes
  add column if not exists offert boolean not null default false;
