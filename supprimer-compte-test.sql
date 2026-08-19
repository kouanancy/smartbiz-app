-- ============================================================
-- SUPPRESSION COMPLÈTE D'UN COMPTE DE TEST (boutique + toutes ses
-- données liées), dans l'ordre correct — sans rien laisser d'orphelin.
--
-- ⚠️ DESTRUCTIF ET IRRÉVERSIBLE. Ne concerne QUE les tables propres à une
-- boutique (business_id) — jamais parametres_globaux (table globale de la
-- plateforme : logo Doka, config Wave, support...), jamais les autres
-- boutiques.
--
-- Contexte technique : toutes les tables ci-dessous ont déjà une
-- contrainte "references businesses(id) on delete cascade" (voir
-- smartbiz-schema.sql, supabase-notifications-migration.sql,
-- supabase-push-notifications-migration.sql). Un simple
-- "delete from businesses where id = ..." suffirait donc en théorie à
-- tout supprimer en cascade. Ce script fait néanmoins la suppression
-- explicitement, table par table, dans l'ordre — pour rester auditable
-- (compte le nombre de lignes touchées à chaque étape) et ne jamais
-- dépendre silencieusement d'un comportement de cascade.
--
-- UTILISATION :
-- 1. Remplace la valeur de v_business_id ci-dessous par l'UUID réel de la
--    boutique à supprimer (colonne businesses.id — visible depuis
--    Administration, ou via : select id, name, owner_id from businesses
--    where name ilike '%nom de la boutique%';).
-- 2. Colle et exécute ce script dans l'éditeur SQL Supabase.
-- 3. Chaque étape affiche le nombre de lignes supprimées (onglet
--    "Messages"/"Notices" du résultat) — vérifie qu'aucun nombre ne te
--    semble anormal avant de faire confiance au résultat final.
-- 4. Voir tout en bas de ce fichier : la ligne businesses supprimée ne
--    supprime PAS le compte de connexion (auth.users) — étape séparée,
--    expliquée après le script.
-- ============================================================

do $$
declare
  v_business_id uuid := '00000000-0000-0000-0000-000000000000'; -- <-- REMPLACER ICI
  v_count integer;
  v_business_name text;
begin
  select name into v_business_name from businesses where id = v_business_id;
  if v_business_name is null then
    raise exception 'Aucune boutique trouvée avec id = %. Vérifie la valeur de v_business_id avant de relancer.', v_business_id;
  end if;
  raise notice 'Suppression de la boutique « % » (id = %)...', v_business_name, v_business_id;

  -- 1. Lignes de commande (dépendent des commandes ET des articles —
  --    doivent partir avant les deux ; pas de business_id direct sur
  --    cette table, on passe par les commandes de la boutique).
  delete from commande_lignes
    where commande_id in (select id from commandes where business_id = v_business_id);
  get diagnostics v_count = row_count;
  raise notice '  commande_lignes : % ligne(s) supprimée(s)', v_count;

  -- 2. Commandes.
  delete from commandes where business_id = v_business_id;
  get diagnostics v_count = row_count;
  raise notice '  commandes : % ligne(s) supprimée(s)', v_count;

  -- 3. Historique de réapprovisionnement (référence business_id ET
  --    article_id — supprimé avant les articles).
  delete from reappros where business_id = v_business_id;
  get diagnostics v_count = row_count;
  raise notice '  reappros : % ligne(s) supprimée(s)', v_count;

  -- 4. Articles / stock (plus aucune commande_lignes ni reappros n'y fait
  --    référence à ce stade).
  delete from articles where business_id = v_business_id;
  get diagnostics v_count = row_count;
  raise notice '  articles : % ligne(s) supprimée(s)', v_count;

  -- 5. Clients (les commandes qui les référençaient sont déjà supprimées
  --    à l'étape 2 — sinon la suppression échouerait, commandes.client_id
  --    n'autorisant pas la suppression d'un client encore référencé).
  delete from clients where business_id = v_business_id;
  get diagnostics v_count = row_count;
  raise notice '  clients : % ligne(s) supprimée(s)', v_count;

  -- 6. Catégories de produits.
  delete from categories where business_id = v_business_id;
  get diagnostics v_count = row_count;
  raise notice '  categories : % ligne(s) supprimée(s)', v_count;

  -- 7. Zones de livraison.
  delete from zones_livraison where business_id = v_business_id;
  get diagnostics v_count = row_count;
  raise notice '  zones_livraison : % ligne(s) supprimée(s)', v_count;

  -- 8. Historique des paiements d'abonnement.
  delete from paiements_abonnement where business_id = v_business_id;
  get diagnostics v_count = row_count;
  raise notice '  paiements_abonnement : % ligne(s) supprimée(s)', v_count;

  -- 9. Notifications (commerçant + celles générées côté admin pour cette
  --    boutique, ex. "paiement à vérifier").
  delete from notifications where business_id = v_business_id;
  get diagnostics v_count = row_count;
  raise notice '  notifications : % ligne(s) supprimée(s)', v_count;

  -- 10. Abonnements aux notifications push (comptes admin uniquement —
  --     n'existera quasiment jamais pour un compte de test classique,
  --     mais inclus pour ne rien laisser d'orphelin si c'en était un).
  delete from push_subscriptions where business_id = v_business_id;
  get diagnostics v_count = row_count;
  raise notice '  push_subscriptions : % ligne(s) supprimée(s)', v_count;

  -- 11. La boutique elle-même, en dernier.
  delete from businesses where id = v_business_id;
  get diagnostics v_count = row_count;
  raise notice '  businesses : % ligne(s) supprimée(s)', v_count;

  raise notice 'Terminé. La boutique « %  » et toutes ses données liées ont été supprimées.', v_business_name;
end $$;

-- ============================================================
-- ET LE COMPTE auth.users CORRESPONDANT ?
--
-- Ce script NE LE SUPPRIME PAS — businesses.owner_id référence
-- auth.users(id), jamais l'inverse, donc supprimer la ligne businesses ne
-- touche pas auth.users. Le compte de connexion (email + mot de passe)
-- reste donc utilisable après ce script, simplement sans plus aucune
-- boutique associée (à la prochaine connexion, ensureBusiness recréerait
-- une boutique vide pour ce même compte).
--
-- Si tu veux aussi supprimer complètement le compte de connexion :
--
-- Option recommandée — Dashboard Supabase (aucun risque d'oubli
-- technique, gère aussi les tables internes d'auth comme
-- auth.identities/auth.sessions) :
--   Authentication → Users → cherche l'e-mail du compte de test →
--   menu "..." sur la ligne → Delete user.
--
--   Astuce ordre inverse : si tu supprimes le compte auth.users AVANT de
--   lancer ce script, la suppression cascade automatiquement jusqu'à la
--   boutique et toutes ses données liées (même chaîne de contraintes
--   "on delete cascade" que ce script emprunte manuellement) — ce script
--   devient alors inutile pour ce compte précis. Les deux approches sont
--   donc valables ; ce script reste utile si tu veux repartir sur une
--   boutique vierge SANS supprimer le compte de connexion lui-même.
--
-- À éviter : supprimer directement la ligne dans auth.users par un DELETE
-- SQL manuel. C'est une table gérée en interne par Supabase Auth
-- (sessions, tokens de rafraîchissement, identities...) — la
-- suppression via le Dashboard ou l'API Admin (supabase.auth.admin.
-- deleteUser(userId), avec la clé service_role, jamais côté client)
-- garantit que tout est nettoyé proprement à cet endroit aussi.
-- ============================================================
