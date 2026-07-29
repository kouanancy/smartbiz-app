-- ============================================================
-- COMMANDES — cycle de vie « en attente de livraison / livrée / annulée »
-- À exécuter une fois dans l'éditeur SQL Supabase, après
-- supabase-commandes-statut-migration.sql.
-- ============================================================

-- Les commandes existantes marquées 'confirmee' avaient déjà leur stock
-- déduit à la création sous l'ancien modèle : elles correspondent donc à
-- des commandes déjà "livrées" dans le nouveau modèle à 3 statuts.
update commandes set statut = 'livree' where statut = 'confirmee';

-- Toute nouvelle commande démarre désormais "en attente de livraison" — le
-- stock n'est déduit qu'au clic sur "Livré" (voir
-- app/(app)/nouvelle/page.js et app/(app)/commandes/page.js), quel que
-- soit le mode boutique/livraison choisi.
alter table commandes alter column statut set default 'en_attente';

-- Valeurs possibles de commandes.statut à partir de maintenant :
-- 'en_attente' | 'livree' | 'annulee'
