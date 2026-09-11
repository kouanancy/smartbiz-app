-- ============================================================
-- TAUX DE CHANGE PAR DÉFAUT — convertisseur intégré au champ Prix
-- d'achat (Nouvel article / Modifier l'article / Réapprovisionner), pour
-- convertir un achat payé dans une devise étrangère (USD, EUR, CNY, GBP...)
-- vers le FCFA sans passer par un outil externe. Voir
-- components/PrixAchatConvertible.js et lib/constants.js
-- (DEVISES_TAUX_CHANGE).
--
-- Sans rapport avec businesses.devise (devise d'AFFICHAGE de la boutique,
-- voir supabase-businesses-devise-migration.sql) : prix_achat reste
-- toujours en FCFA quelle que soit la devise d'affichage choisie (voir le
-- libellé "Prix d'achat (FCFA)", jamais traduit selon business.devise) —
-- ce convertisseur ne fait qu'aider à calculer ce montant FCFA à partir
-- d'un paiement fait à l'étranger, il ne le stocke jamais autrement.
--
-- À exécuter une fois dans l'éditeur SQL Supabase.
-- ============================================================

-- taux_change_valeur / taux_change_devise : pré-remplissent le
-- convertisseur à l'ouverture (modifiable pour chaque conversion
-- ponctuelle, sans jamais changer ce réglage par défaut). Défaut EUR /
-- 655.957 -- pas une estimation mais la parité fixe FCFA/EUR (XOF/EUR),
-- garantie par accord depuis 1948 et non un taux de marché : le seul
-- défaut numérique qui reste exact indéfiniment, contrairement à un taux
-- USD qui serait périmé dès le lendemain. Le commerçant qui importe en
-- USD/CNY/GBP change la devise (et le taux) directement dans Paramètres
-- ou pour une conversion ponctuelle.
alter table businesses
  add column if not exists taux_change_devise text not null default 'EUR',
  add column if not exists taux_change_valeur numeric not null default 655.957;

alter table businesses
  drop constraint if exists businesses_taux_change_devise_check;
alter table businesses
  add constraint businesses_taux_change_devise_check check (taux_change_devise in ('USD', 'EUR', 'CNY', 'GBP'));

alter table businesses
  drop constraint if exists businesses_taux_change_valeur_check;
alter table businesses
  add constraint businesses_taux_change_valeur_check check (taux_change_valeur > 0);

-- Même piège que tous les autres réglages ajoutés à businesses depuis
-- supabase-businesses-colonnes-restreintes-migration.sql : le GRANT
-- UPDATE est restreint colonne par colonne, une colonne ajoutée après
-- coup n'est accordée nulle part par défaut — sans cette ligne,
-- l'enregistrement depuis Paramètres échouerait silencieusement.
grant update (taux_change_devise, taux_change_valeur) on businesses to authenticated;
