# SmartBiz — app Next.js + Supabase

Mini ERP pour petits commerçants (formule autonome). Cette app remplace le
prototype `smartbiz.jsx` (données en mémoire) par une vraie application
Next.js connectée à Supabase, avec authentification, isolation des données
par boutique (Row Level Security) et abonnement payant.

La marque affichée aux utilisateurs est **Doka** (page de connexion,
sidebar, pied de page des reçus, PWA…) — seuls le nom du dépôt, le schéma
Supabase et les identifiants internes du code gardent le nom historique
« SmartBiz ».

## Stack

- Next.js 16 (App Router, JavaScript)
- `@supabase/supabase-js` (auth + base de données Postgres)
- `recharts` (graphiques du tableau de bord et de la trésorerie)
- `lucide-react` (icônes)
- `react-markdown` (rendu des pages légales — CGU, Confidentialité, Mentions légales)
- `xlsx` (SheetJS Community Edition — génération des exports .xlsx)

## Démarrage

```bash
npm install
cp .env.local.example .env.local   # puis renseigne tes identifiants Supabase
npm run dev
```

L'app tourne sur http://localhost:3000.

Avant de pouvoir uploader des photos d'articles, exécute une fois
`supabase-storage-setup.sql` dans l'éditeur SQL de ton projet Supabase (crée
le bucket `article-photos` et ses règles d'accès) — voir la section
« Photos d'articles » plus bas.

Exécute aussi une fois, dans l'ordre, `supabase-clients-actif-migration.sql`
(ajoute la colonne `clients.actif`, nécessaire à la désactivation de
clients — voir « Clients : suppression vs désactivation » plus bas),
`supabase-commandes-statut-migration.sql` puis
`supabase-commandes-livraison-migration.sql` (ajoutent et font évoluer
`commandes.statut` — voir « Commandes : cycle de vie » plus bas),
`supabase-businesses-devise-migration.sql` (ajoute la colonne
`businesses.devise` — voir « Devise » plus bas),
`supabase-businesses-langue-migration.sql` (ajoute la colonne
`businesses.langue` — voir « Langue » plus bas),
`supabase-articles-unite-migration.sql` (ajoute la colonne
`articles.unite` — voir « Unité de mesure » plus bas), et enfin
`supabase-businesses-admin-migration.sql` (ajoute `businesses.is_admin` et
`businesses.email`, la policy RLS et la fonction associées — voir « Espace
Administration » plus bas), et enfin
`supabase-paiements-manuels-migration.sql` (colonnes de justificatif sur
`paiements_abonnement`, RLS durcie, nouvelle table `parametres_globaux` —
voir « Paiement manuel vérifié » plus bas ; nécessite que la migration
précédente ait déjà été exécutée), et enfin
`supabase-parametres-globaux-logo-migration.sql` (colonnes de logo/icônes sur
`parametres_globaux`, policy de lecture rendue publique — voir « Logo
Doka (marque de la plateforme) » plus bas ; nécessite
`supabase-paiements-manuels-migration.sql`), et enfin
`supabase-businesses-owner-unique-migration.sql` (fusionne les doublons
`businesses` déjà existants puis ajoute une contrainte unique sur
`owner_id` — voir « Fonctionnement du compte / abonnement » plus bas), et
enfin `supabase-admin-scope-abonnement-migration.sql` (retire l'accès
direct de l'administratrice à la table `businesses` et le remplace par
trois fonctions limitées aux colonnes d'abonnement — voir « Espace
Administration » plus bas ; nécessite
`supabase-businesses-admin-migration.sql`), et enfin
`supabase-support-telephone-migration.sql` (colonne `support_telephone`
sur `parametres_globaux` — voir « Aide / Support » plus bas ; nécessite
`supabase-paiements-manuels-migration.sql`), et enfin
`supabase-revenus-admin-migration.sql` (colonne `valide_at` sur
`paiements_abonnement`, avec rétro-remplissage pour les paiements déjà
validés — voir « Revenus Doka » plus bas ; nécessite
`supabase-paiements-manuels-migration.sql`), et enfin
`supabase-mode-affichage-migration.sql` (colonne `mode_affichage` sur
`businesses`, `clair` par défaut — voir « Mode sombre » plus bas), et
enfin `supabase-telephone-text-migration.sql` (garantit explicitement que
`wave_telephone`/`support_telephone` sont bien de type `text` — voir
« Aide / Support » plus bas ; nécessite
`supabase-support-telephone-migration.sql`), et enfin
`supabase-notifications-migration.sql` (nouvelle table `notifications`,
RLS, déclencheur sur `paiements_abonnement` et fonction de génération des
rappels d'expiration — voir « Centre de notifications » plus bas ;
nécessite `supabase-businesses-admin-migration.sql` et
`supabase-paiements-manuels-migration.sql`), et enfin
`supabase-rapport-stock-horaire-migration.sql` (colonnes d'horaire sur
`businesses` et fonction de sélection des boutiques dues — voir « Rapport
de stock automatique » plus bas), et enfin
`supabase-rapport-stock-heure-fixe-migration.sql` (adapte cette fonction
au déclenchement quotidien à heure fixe du plan Vercel Hobby — voir
« Rapport de stock automatique » plus bas ; nécessite
`supabase-rapport-stock-horaire-migration.sql`), et enfin
`supabase-rapport-stock-retrait-heure-migration.sql` (retire la colonne
`rapport_stock_heure`, devenue inutile — voir « Rapport de stock
automatique » plus bas ; nécessite
`supabase-rapport-stock-heure-fixe-migration.sql`), et enfin
`supabase-notifications-formule-migration.sql` (mentionne la formule du
commerçant dans les notifications admin de justificatif et d'inscription
— voir « Centre de notifications » plus bas ; nécessite
`supabase-notifications-migration.sql`), et enfin
`supabase-generer-notifications-expiration-onconflict-fix-migration.sql`
(corrige une clause `ON CONFLICT` ne correspondant à aucune contrainte,
qui faisait échouer `generer_notifications_expiration()` à chaque appel —
voir « Centre de notifications » plus bas ; nécessite
`supabase-notifications-migration.sql`), et enfin
`supabase-rapport-stock-retrait-migration.sql` (retire la fonctionnalité
de rapport de stock automatique, jugée redondante — voir « Rapport de
stock automatique — retiré » plus bas ; nécessite
`supabase-rapport-stock-retrait-heure-migration.sql`), et enfin
`supabase-admin-reject-payment-migration.sql` (fait aussi repasser
`businesses.subscription_status` à un état bloqué quand l'administratrice
rejette un justificatif, plutôt que de ne toucher que
`paiements_abonnement.statut` — voir « Paiement manuel vérifié » plus bas ;
nécessite `supabase-admin-scope-abonnement-migration.sql` et
`supabase-paiements-manuels-migration.sql`), et enfin
`supabase-businesses-colonnes-restreintes-migration.sql` (retire à
`authenticated` le droit d'écrire n'importe quelle colonne de sa propre
ligne `businesses` — notamment `subscription_status` et `is_admin` — et
ajoute la fonction `verifier_expiration_abonnement` qui reprend la
bascule d'expiration jusque-là faite par un update direct du client ; voir
le point 9 de « Fonctionnement du compte / abonnement » plus bas ;
nécessite `supabase-businesses-admin-migration.sql` et
`supabase-admin-scope-abonnement-migration.sql`), et enfin
`supabase-admin-reject-payment-anticipe-migration.sql` (remplace
`admin_reject_payment` pour qu'un rejet ne coupe plus un accès déjà
valide — renouvellement anticipé rejeté avant l'échéance réelle en
cours — et notifie alors le commerçant via le centre de notifications ;
voir le point 10 de « Fonctionnement du compte / abonnement » plus bas ;
nécessite `supabase-admin-reject-payment-migration.sql`), et enfin
`supabase-notifications-renouvellement-anticipe-migration.sql` (ajoute
un déclencheur qui notifie de la même façon le commerçant à l'envoi d'un
renouvellement anticipé, pendant du côté « envoi » de ce même point 10 ;
nécessite `supabase-notifications-migration.sql` et
`supabase-admin-reject-payment-anticipe-migration.sql`), et enfin
`supabase-validation-paiement-installation-migration.sql` (remplace
`admin_mark_subscription_paid` : calcule désormais la nouvelle date
d'expiration côté serveur plutôt que de faire confiance à une valeur
transmise par le client, fait passer le justificatif associé à `reussi`
dans la même opération atomique, et ajoute le suivi des frais
d'installation de la formule Clé en main — voir « Espace Administration »
et « Paiement manuel vérifié » plus bas ; nécessite
`supabase-admin-scope-abonnement-migration.sql` et
`supabase-paiements-manuels-migration.sql`), et enfin
`supabase-alerte-paiement-serveur-migration.sql` puis
`supabase-alerte-paiement-formule-fix-migration.sql` — historique,
toujours nécessaires comme prérequis (activent `pg_net`, entre autres)
mais dont le comportement (appel e-mail via `pg_net`) a depuis été
entièrement remplacé par les deux migrations suivantes, l'e-mail
n'ayant jamais pu être fiabilisé — voir « Notifications push (Web
Push) » plus bas pour le remplacement. Et enfin
`supabase-push-notifications-migration.sql` (table `push_subscriptions`
+ RLS, et remplace à nouveau `notifier_admins_nouveau_justificatif` pour
appeler une notification push plutôt que l'e-mail Resend — supprime aussi
les secrets Vault de l'ancien mécanisme devenus inutiles ; nécessite
`supabase-notifications-formule-migration.sql`) et
`supabase-confirmation-paiement-migration.sql` (remplace
`admin_mark_subscription_paid` une troisième fois pour ajouter une
notification 🔔 au commerçant quand son paiement est validé ; nécessite
`supabase-validation-paiement-installation-migration.sql`), et enfin
`supabase-admin-liste-paiements-migration.sql` (ajoute `plan` au retour
de `admin_list_businesses`, pour afficher la formule dans la nouvelle
liste des paiements en attente et sur la page de détail — voir « Espace
Administration » plus bas ; et fait passer `business_id` dans le payload
push, pour que la notification emmène directement sur le paiement
concerné — voir « Notifications push (Web Push) » plus bas ; nécessite
`supabase-admin-scope-abonnement-migration.sql` et
`supabase-push-notifications-migration.sql`).

## Variables d'environnement

Voir `.env.local.example`. Ces deux clés viennent de **Project Settings →
API** dans Supabase. La clé publique (`sb_publishable_...` ou l'ancienne clé
`anon`) est faite pour être exposée côté client — la sécurité est assurée par
les règles RLS définies dans `smartbiz-schema.sql`, pas par le secret de la
clé.

`SUPABASE_SERVICE_ROLE_KEY` et `CRON_SECRET` sont requises pour le rappel
d'expiration planifié et pour les notifications push (voir « Centre de
notifications » et « Notifications push (Web Push) » plus bas) — sans
elles, le reste de l'application fonctionne normalement.
`NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` et `PUSH_ADMIN_SECRET`
sont requises pour les notifications push à l'administratrice (voir
« Notifications push (Web Push) » plus bas) — sans elles, l'envoi de
justificatif fonctionne quand même, seule cette notification est ignorée.

`.env.local` n'est jamais commité (voir `.gitignore`).

## Fonctionnement du compte / abonnement

1. Un commerçant crée un compte sur `/login` (onglet « Créer un compte »).
2. À la première connexion, une ligne est automatiquement créée dans
   `businesses` avec `owner_id = auth.uid()`, `subscription_status = 'essai'`
   et `subscription_expires_at` = date de création + 7 jours (colonne déjà
   présente dans `smartbiz-schema.sql`, jusque-là inutilisée — voir
   `lib/AuthProvider.js`, `ensureBusiness`). `owner_id` est **unique**
   (`supabase-businesses-owner-unique-migration.sql`) : un compte ne peut
   jamais avoir deux boutiques. `ensureBusiness` fait une lecture puis une
   création, ce qui reste théoriquement une course entre onglets/appels
   concurrents — c'est justement la contrainte unique qui tranche en base ;
   côté client, un conflit (code Postgres `23505`) fait simplement relire la
   ligne déjà créée par l'appel gagnant plutôt que d'échouer.
3. **Pendant l'essai**, l'accès à l'application est complet, comme avec un
   abonnement `actif`. La sidebar affiche un indicateur discret du nombre de
   jours restants (« Essai — X jours restants »).
4. **À l'expiration** de `subscription_expires_at`, le statut bascule
   automatiquement — l'application n'ayant pas de tâche planifiée côté
   serveur, cette bascule est vérifiée paresseusement à chaque connexion /
   chargement de la boutique (`verifierExpirationAbonnement` dans
   `lib/AuthProvider.js`) plutôt que par un cron. Deux cas selon le statut
   précédent, chacun avec son propre écran de blocage dédié
   (`app/(app)/layout.js`) — jamais le même texte entre les deux, voir
   plus bas :
   - un essai dépassé (jamais payé) passe à `en_attente_paiement` →
     `components/PremierPaiement.js` (message d'accueil « premier
     paiement ») ;
   - un abonnement `actif` dépassé (payé, puis expiré) passe à `expire`
     → `components/Reabonnement.js` (message de réabonnement).

   Dans les deux cas, l'accès à l'application (Tableau de bord, Commandes,
   Articles, Clients, Catalogue, Paramètres) est bloqué. Un compte
   `suspendu` (pas forcément lié à un problème de paiement) affiche un
   troisième écran sans flux de paiement, `components/CompteSuspendu.js`.
5. Le passage à `actif` (fin d'essai payée ou renouvellement classique) se
   fait via le circuit de paiement manuel vérifié décrit ci-dessous
   (« Marquer comme payé » dans l'espace Administration, une fois le
   justificatif contrôlé) ; le webhook CinetPay (voir
   `smartbiz-backend-roadmap.md`) l'automatisera plus tard — indépendamment
   du statut précédent.
6. **Exception admin** : un compte `is_admin = true` garde un accès complet
   quel que soit son `subscription_status`/`subscription_expires_at` — le
   blocage automatique à l'expiration ne concerne que les comptes
   commerçants classiques. Cette exception est appliquée à deux endroits :
   `verifierExpirationAbonnement` (`lib/AuthProvider.js`) ne bascule jamais
   le statut d'un compte admin, et la condition de blocage dans
   `app/(app)/layout.js` ignore le statut si `business.is_admin` — donc
   aussi bien à la connexion qu'à toute revérification pendant la
   navigation (le `business` du contexte `AuthProvider` est partagé par
   toute l'app).
7. **Revérification en cours de session** (`app/(app)/layout.js`) : au-delà
   du calcul d'expiration paresseux du point 4 (qui ne se déclenche qu'à la
   connexion/au chargement initial de la boutique), un `useEffect` déclenché
   à chaque changement de route (`usePathname`) rappelle `refreshBusiness()`
   — sauf au tout premier rendu, déjà couvert par le chargement initial de
   `AuthProvider`. Sans ça, un compte encore `actif`/`essai` dont le
   justificatif de renouvellement anticipé vient d'être rejeté par
   l'administratrice (voir « Espace Administration » plus bas) gardait un
   accès complet jusqu'à une déconnexion/reconnexion manuelle : l'état
   `business` de `AuthProvider`, chargé une seule fois, ne reflétait jamais
   le changement fait côté base par une autre session. Avec ce correctif, le
   blocage prend effet dès la prochaine navigation du commerçant — pas
   besoin de se déconnecter. Une déconnexion forcée côté serveur au moment
   même du rejet (plutôt que d'attendre cette prochaine navigation) a été
   envisagée puis écartée : elle demanderait une route API dédiée avec
   `SUPABASE_SERVICE_ROLE_KEY` et, la révocation d'un jeton Supabase déjà
   émis n'étant pas instantanée, ne garantirait de toute façon pas un
   blocage plus immédiat que cette revérification par navigation.
8. **Deuxième ligne de défense, indépendante de `subscription_status`**
   (`lib/AuthProvider.js`, state `paiementInfo` — `{ statut: null |
   'en_attente' | 'echoue', bloquant: boolean }`, calculé par
   `dernierPaiementBlocage()` dans `lib/paiements.js`) : le point 6
   (`admin_reject_payment`) met déjà `subscription_status` à jour au
   moment du rejet, mais un commerçant a pu malgré tout garder l'accès
   pendant qu'un justificatif était encore en attente ou avait été rejeté
   — le cas typique est un renouvellement anticipé pendant que le compte
   est encore `actif`/`essai` (carte « Abonnement » de Paramètres, ou
   « Changer ma formule ») : le nouveau justificatif ne touche jamais
   `subscription_status` tant qu'il n'est pas validé par
   l'administratrice, donc rien ne bloquait l'accès dans ce cas précis.
   L'accès dépend donc aussi, indépendamment de `subscription_status`, du
   dernier `paiements_abonnement` de la boutique — **mais uniquement
   quand le compte n'a pas déjà un accès valide en cours** (voir point 10
   ci-dessous pour la nuance du renouvellement anticipé, qui ne doit
   jamais être bloquant). `paiementInfo.bloquant` distingue les deux :
   vrai seulement si le dernier paiement est `en_attente`/`echoue` **et**
   que le compte n'a pas déjà un accès valide (premier paiement jamais
   validé, ou abonnement réellement expiré) ; dans ce cas l'accès est
   bloqué **quelle que soit la valeur de `subscription_status`** — y
   compris `actif` ou `essai` par erreur/chemin non prévu. Recalculé dans
   `ensureBusiness` (donc à chaque connexion, chaque `getSession()` au
   chargement de l'app, et chaque `refreshBusiness()` — voir point 7 pour
   la revérification par navigation), jamais uniquement de façon
   différée — `business` et `paiementInfo` sont mis à jour par deux
   `setState` volontairement appelés l'un juste après l'autre, sans
   `await` entre eux (React les regroupe alors en un seul rendu), pour
   éviter un rendu intermédiaire où `business` refléterait déjà un compte
   débloqué avant que `paiementInfo` n'ait rattrapé le retard d'un
   aller-retour réseau. Sans écran de blocage dédié pour ce cas précis
   (`expire`/`suspendu` restent décidés par `subscription_status` seul
   quand ils s'appliquent), l'accès retombe sur `PremierPaiement.js`, qui
   affiche l'un des trois messages (`premierPaiement`, `paiementEnAttente`
   ou `paiementRejete`, selon `paiementInfo.statut`) — même logique dans
   `Reabonnement.js` avec son propre message par défaut. Un nouvel envoi
   de justificatif (`PaiementAbonnement.js`) devient aussitôt le paiement
   le plus récent (`statut = 'en_attente'`) et déclenche lui-même un
   `refreshBusiness()` sans attendre la prochaine navigation ; la
   validation par l'administratrice réactive ensuite le compte normalement.
9. **Colonnes de `businesses` restreintes en écriture**
   (`supabase-businesses-colonnes-restreintes-migration.sql`) — la vraie
   cause probable d'un cas où un commerçant a retrouvé l'accès à son
   compte après un simple envoi de justificatif, sans aucune validation
   admin, alors qu'aucun code applicatif (client ou fonction SQL) ne fait
   passer `subscription_status` à `'actif'` en dehors de
   `admin_mark_subscription_paid` (voir point 5). La policy RLS de
   `businesses` (`for all using (owner_id = auth.uid())`) n'a jamais
   restreint les *colonnes* qu'un commerçant peut écrire sur sa propre
   ligne — seulement les lignes visibles — et Supabase accorde par défaut
   les droits `INSERT`/`UPDATE`/`DELETE` complets à `authenticated` sur
   les tables du schéma public. Un commerçant authentifié pouvait donc,
   via un appel direct à l'API REST Supabase (n'importe quel outil HTTP
   avec son propre jeton — pas besoin de passer par l'app ni par un bug
   de son code), modifier `subscription_status` (se remettre `'actif'`
   lui-même) ou même `is_admin` sur sa propre ligne, y compris dès
   l'inscription. `INSERT`/`UPDATE`/`DELETE` sont maintenant révoqués pour
   `authenticated` puis regrantés colonne par colonne : `INSERT` ne couvre
   que ce qu'`ensureBusiness` pose à l'inscription (`owner_id`, `email`,
   `name`, `plan`, `subscription_status`, `subscription_expires_at` — mais
   jamais `is_admin`, qui garde sa valeur par défaut `false` quoi que le
   client envoie) ; `UPDATE` ne couvre que les colonnes que l'app modifie
   légitimement depuis le client (`name`, `logo_url`, `theme_key`,
   `mode_affichage`, `devise`, `langue`, `notif_email`,
   `confirmation_email`, `plan`, `next_numero`) — jamais
   `subscription_status`, `subscription_expires_at`, `is_admin`,
   `owner_id` ni `email`. `DELETE` est retiré aussi : supprimer sa propre
   ligne aurait permis de relancer un essai gratuit de 7 jours à la
   prochaine connexion (`ensureBusiness` recrée la ligne faute d'en
   trouver une). La bascule paresseuse d'expiration
   (`verifierExpirationAbonnement`, point 4) était le seul autre endroit
   du code à écrire `subscription_status` par un update direct du client
   — remplacée par la fonction `verifier_expiration_abonnement`
   (`SECURITY DEFINER`, vérifie `owner_id = auth.uid()`, recalcule tout
   côté serveur à partir de la ligne réelle en base). Les fonctions
   `admin_*` continuent de fonctionner normalement : `SECURITY DEFINER`
   les rend indépendantes de ces `GRANT`.
10. **Renouvellement anticipé : le blocage du point 8 ne s'applique
    jamais à un accès déjà valide** (`accesDejaValide()` dans
    `lib/paiements.js`) — un commerçant peut envoyer un nouveau
    justificatif (carte « Abonnement » de Paramètres, ou « Changer ma
    formule ») avant l'expiration de sa période en cours, pendant que le
    compte est encore `actif` **ou** `essai` avec `subscription_expires_at`
    dans le futur (généralisation volontaire de `actif` à `essai` aussi,
    par cohérence : les deux formulaires de renouvellement anticipé sont
    accessibles depuis les deux statuts). Dans ce cas précis,
    `dernierPaiementBlocage()` renvoie toujours `statut` (`'en_attente'`
    ou `'echoue'`) mais force `bloquant` à `false` — le commerçant garde un
    accès normal jusqu'à sa vraie date d'expiration, sans aucun écran de
    blocage. L'information reste néanmoins visible, mais via le centre de
    notifications existant (`NotificationBell.js`, voir « Centre de
    notifications » plus bas) plutôt qu'un bandeau dédié dans
    `app/(app)/layout.js` : deux nouveaux déclencheurs `SECURITY DEFINER`
    insèrent chacun une notification pour le commerçant lui-même (jamais
    pour l'administratrice, à la différence du trigger déjà existant sur
    tout nouveau justificatif) —
    `notifier_commercant_renouvellement_anticipe()`
    (`supabase-notifications-renouvellement-anticipe-migration.sql`,
    déclenché à l'insertion d'un paiement `en_attente`, condition identique
    à `accesDejaValide()`) au moment de l'envoi, et une insertion
    équivalente ajoutée dans `admin_reject_payment`
    (`supabase-admin-reject-payment-anticipe-migration.sql`) au moment du
    rejet, dans les deux cas seulement si l'accès reste valide — sinon rien
    de plus que le trigger existant (accès bloqué, écran dédié avec le
    message adapté, voir point 8). S'il est ensuite validé par
    l'administratrice (point 5, `admin_mark_subscription_paid`), la
    prolongation part déjà de la date d'expiration existante plutôt que de
    la date du jour (voir « Paiement manuel vérifié » plus bas) — un
    renouvellement anticipé ne fait donc jamais perdre de jours payés.
    S'il est rejeté, `admin_reject_payment` applique la même nuance côté
    statut que côté notification : il ne fait plus basculer
    `subscription_status` vers `'expire'`/`'en_attente_paiement'` quand
    l'échéance en cours n'est pas encore passée — sans ce correctif, le
    rejet aurait lui-même déclenché le blocage du point 7
    (`statutBloquant`, basé sur `subscription_status`) chez un commerçant
    dont l'accès payé restait pourtant valide ; seul le justificatif
    (`paiements_abonnement.statut = 'echoue'`) reflète alors le rejet,
    signalé par la notification ci-dessus, jusqu'à un nouvel envoi ou
    l'échéance réelle.

## Formule (plan)

Indépendante du statut d'abonnement ci-dessus (essai/actif/expiré...), la
formule (`businesses.plan` : `'autonome' | 'cle_en_main' | 'premium'`,
colonne déjà présente dans `smartbiz-schema.sql`, `'autonome'` par défaut)
détermine le niveau d'accompagnement dont bénéficie le commerçant — elle
n'a aucun effet automatique sur la facturation ou l'accès : la différence
de prix/paiement entre formules reste gérée manuellement, côté
Administration, par l'équipe Doka.

**À l'inscription** (`app/login/page.js`) : l'onglet « Créer un compte »
s'ouvre désormais sur une étape de choix de formule (les trois cartes,
avec accroche/description/avantages) avant le formulaire habituel
(nom de boutique/e-mail/mot de passe/CGU) — un lien « Changer » permet d'y
revenir. Le choix voyage dans les métadonnées utilisateur Supabase
(`options.data.plan` de `supabase.auth.signUp`, même mécanisme que
`business_name`) et est repris par `ensureBusiness`
(`lib/AuthProvider.js`) à la création de la ligne `businesses`, avec
repli sur `'autonome'` si absent/invalide.

**Après l'inscription**, si `supabase.auth.signUp()` ne renvoie pas de
session immédiate (confirmation e-mail requise côté Supabase — voir
« Notifications push (Web Push) » plus bas pour un rappel : ce dépôt
n'envoie jamais lui-même cet e-mail), un état dédié (`awaitingConfirmation`)
remplace entièrement les onglets/formulaire par un simple écran « Confirme
ton adresse » (icône enveloppe + message unique), plutôt que de rediriger
vers l'écran de connexion habituel avec un message temporaire — jamais
mélangé aux deux autres états (connexion / choix de formule + formulaire)
pour qu'il n'y ait aucune ambiguïté sur l'étape en cours. Une fois le lien
reçu par e-mail cliqué, le comportement habituel reprend (session établie
→ `onAuthStateChange` → `ensureBusiness` → redirection vers le compte),
sans lien avec cet état local de la page `/login`.

**`components/PlanGrid.js`** : grille des 3 formules côte à côte façon
page tarifaire (`.sb-plan-grid`, `repeat(3, 1fr)` — une seule colonne sous
860px), réutilisée partout où un commerçant choisit une formule. Chaque
colonne montre le nom, le prix mensuel (`lib/constants.js`, `PLAN_PRICES`,
formaté via `fmt`/`business.devise` — Clé en main garde le même abonnement
mensuel qu'Autonome, avec un frais d'installation ponctuel affiché en
plus, ex. « + 15 000 FCFA à l'installation »), l'accroche et la liste
d'avantages avec icône de coche (`lucide-react`, `Check`). La formule
active se distingue par une bordure `--accent`, un fond légèrement
différent et un badge ; `disableActive` contrôle si son bouton est
désactivé (rien à faire — cas « changer de formule » ci-dessous) ou reste
cliquable (premier paiement/réabonnement, qui doivent aboutir à un
paiement même si c'est la même formule qu'avant).

**Dans Paramètres** : plus de grille complète affichée directement — une
carte « Formule » résume juste la formule actuelle (nom) et propose un
bouton « Changer ma formule » vers une page dédiée
(`app/(app)/parametres/formule/page.js`), en trois étapes avec bouton
retour à chaque étape : liste des formules (`PlanGrid`, formule active
désactivée) → détail de la formule choisie (nom, prix, description,
avantages) → paiement (`components/PaiementAbonnement.js`, avec le
montant de cette formule précise). Choisir une formule différente met à
jour `businesses.plan` immédiatement (`updateBusiness({ plan })`), avant
même la vérification du paiement — même logique que le reste de
l'application, la différence de prix/paiement réelle restant gérée
manuellement par l'équipe Doka. **Masqué entièrement pour un compte
administrateur** (carte « Abonnement » et bouton « Changer ma formule »),
avec redirection si l'URL est atteinte directement — l'abonnement ne
concerne jamais ce type de compte (accès permanent, voir plus haut).

**Premier paiement et réabonnement** (`components/PremierPaiement.js`,
`components/Reabonnement.js`) partagent le même bloc choix de formule +
paiement, `components/FormuleEtPaiement.js` : les trois formules y sont
toutes cliquables (y compris celle déjà en place), pour toujours aboutir
à un paiement quelle qu'elle soit.

**`components/PaiementAbonnement.js`** accepte un prop `plan` optionnel :
quand il est fourni (formule en cours de choix), le montant
affiché/enregistré vient de `PLAN_PRICES` pour cette formule précise ;
sans ce prop (renouvellement générique, hors changement de formule), il
reste basé sur `parametres_globaux.abonnement_prix` comme avant.

Les libellés/descriptions des trois formules sont centralisés dans
`lib/i18n` (`common.plans.<clé>.{nom,accroche,description,avantages}`,
fr/en) et réutilisés à l'identique par `app/login/page.js` (toujours en
français, comme le reste de cette page — sans les prix, propres aux
écrans authentifiés), `app/(app)/parametres/page.js`/`formule/page.js` et
les écrans de blocage (langue du compte). La liste des clés de formule
vit dans `lib/constants.js` (`PLANS`), pour rester alignée avec la
contrainte SQL ; les prix affichés (`PLAN_PRICES`) sont purement
indicatifs, la facturation réelle restant gérée manuellement.

## Photos d'articles (et logo de la boutique)

Les photos (formulaires « Nouvel article » et « Modifier l'article ») sont
envoyées vers **Supabase Storage**, bucket `article-photos` :

1. Choix de fichier classique (sélecteur natif du navigateur — sur mobile,
   ça propose automatiquement appareil photo ou galerie) ou copier-coller
   d'image (Ctrl+V, une fois la zone cliquée).
2. Aperçu immédiat pendant l'envoi (`components/ImageUploadField.js`).
3. Le fichier est stocké sous `<business_id>/<uuid>.<extension>` et l'URL
   publique renvoyée par Supabase est enregistrée dans `articles.image_url`.

Le **logo de la boutique** (page Paramètres, `businesses.logo_url`) réutilise
exactement le même composant `ImageUploadField`, avec un préfixe de dossier
dédié (`folder="logo"` → `<business_id>/logo/<uuid>.<extension>`) — même
bucket, pas de migration Storage supplémentaire.

**Configuration requise (une seule fois par projet Supabase)** : exécute
`supabase-storage-setup.sql` dans l'éditeur SQL — il crée le bucket
`article-photos` (lecture publique, écriture/suppression réservées au
propriétaire de la boutique via une policy sur `storage.objects`, sur le
même modèle que les policies RLS de `smartbiz-schema.sql`). Sans cette
étape, l'upload échoue avec un message explicite invitant à exécuter ce
script.

## Clients : suppression vs désactivation

- Un client **sans commande enregistrée** peut être supprimé définitivement
  (bouton « Supprimer », confirmation demandée).
- Un client **avec au moins une commande** ne peut pas être supprimé — la
  contrainte de clé étrangère `commandes.client_id` l'en empêcherait de
  toute façon (`ON DELETE` par défaut = `RESTRICT`). Le bouton proposé est
  alors « Désactiver » (`clients.actif = false`) : le client disparaît de la
  liste par défaut et du sélecteur de « Nouvelle commande », mais reste
  intact pour l'historique de ses commandes passées.
- La case « Afficher aussi les clients désactivés » réaffiche ces clients
  dans le tableau, avec un bouton « Réactiver ».
- Nécessite la migration `supabase-clients-actif-migration.sql` (voir
  Démarrage).

## Commandes : cycle de vie (en attente / livrée / annulée)

`commandes.statut` a trois valeurs possibles : `en_attente` (défaut à la
création) → `livree` ou `annulee`.

- **À la création**, quel que soit le mode boutique/livraison choisi, la
  commande démarre `en_attente` et **le stock n'est pas encore déduit**. Le
  volet « Livraison » du formulaire (boutique/livraison, zone, frais) reste
  purement indicatif du mode choisi par la cliente — indépendant de ce
  statut de suivi.
- **« Livré »** (uniquement sur une commande en attente) déclenche le
  déstockage définitif — un article insuffisant en stock réel bloque
  l'action avec un message clair — et passe le statut à `livree`. Le CA et
  la marge de la commande (déjà calculés à la création à partir des prix du
  moment) n'apparaissent dans les totaux et le graphique du Dashboard qu'à
  partir de ce moment (filtre `statut = 'livree'`).
- **« Modifier »** (client, articles/quantités, livraison, paiement) n'est
  possible que sur une commande en attente ; comme le stock n'a pas encore
  bougé, l'édition ne touche à aucun stock — seules les quantités saisies
  sont plafonnées par le stock réel disponible. Le CA/la marge sont
  recalculés à l'enregistrement à partir des prix actuels des articles.
- **« Annuler »** (au lieu d'une suppression définitive) n'est possible que
  sur une commande en attente — aucune restitution de stock n'est
  nécessaire puisqu'il n'a jamais été déduit — et demande confirmation
  (« Es-tu sûr(e) de vouloir annuler cette commande ? »). Une commande
  livrée ou déjà annulée ne peut plus être ni modifiée ni annulée.
- La page Commandes affiche un indicateur du nombre de commandes en attente
  de livraison et un filtre Toutes / En attente de livraison / Livrées.
- Nécessite les migrations `supabase-commandes-statut-migration.sql` puis
  `supabase-commandes-livraison-migration.sql` (voir Démarrage) — la
  seconde bascule aussi les commandes déjà existantes vers `livree`
  (leur stock avait déjà été déduit sous l'ancien modèle).

## Confirmation de commande : photo des articles + partage PDF WhatsApp

**Photo dans le tableau imprimé** : chaque ligne de la version A4
(`components/Receipt.js`, bloc `.sb-receipt-print`) affiche la miniature de
l'article (`articles.image_url`) à côté de son nom, avec le même
pictogramme de repli (`ImageIcon` de lucide-react) qu'ailleurs dans l'app
(`ArticleSelect.js`) si l'article n'a pas de photo. `image_url` voyage
avec chaque ligne de commande (`nouvelle/page.js` au moment de la
création, `commandes/page.js` au moment d'un réaffichage/réimpression) —
jamais stockée dans `commande_lignes` elle-même (qui ne fige que les
montants), toujours relue depuis `articles` au moment d'afficher un reçu,
donc reflète la photo actuelle de l'article, pas celle du jour de la
commande.

**Partage direct par WhatsApp (PDF joint)** : `genererPdfBlob()` capture
`.sb-receipt-print` (déjà stylé pour l'A4) via `jsPDF.html()` — qui
délègue le rendu à `html2canvas` en interne — et renvoie un vrai fichier
PDF plutôt qu'une simple invite d'impression navigateur. Le bloc est
normalement `display: none` à l'écran ; une classe
`.sb-receipt-print-capture` (position hors écran, jamais visible) le rend
temporairement mesurable par `html2canvas` le temps de la capture. Les
styles visuels du reçu (`.sb-receipt-print-header`, `-table`, `-totals`...)
sont volontairement en dehors de `@media print` — une capture déclenchée
par clic n'est pas une impression réelle, des règles scopées à `@media
print` ne s'appliqueraient pas à ce moment-là ; seul l'affichage
(`display`) reste conditionnel, soit par une vraie impression, soit par
`.sb-receipt-print-capture`.

Bouton « Envoyer par WhatsApp » : sur les appareils supportant le partage
natif de fichiers (`navigator.canShare({ files: […] })`, la quasi-totalité
des téléphones récents), génère le PDF puis ouvre le menu de partage du
téléphone avec le PDF déjà joint — la personne choisit WhatsApp dans ce
menu, sans dépendre du numéro enregistré côté client (contrairement à
l'ancien lien `wa.me`). Sur les appareils qui ne le supportent pas
(essentiellement les navigateurs d'ordinateur), le bouton garde son
ancien comportement (message texte pré-rempli vers `wa.me`, qui a
toujours besoin d'un numéro de téléphone client valide) et un bouton
séparé **Télécharger le PDF** apparaît à côté, pour joindre le fichier à
la main dans WhatsApp Web/Desktop.

Nécessite `jspdf`/`html2canvas` (ajoutés à `package.json`), chargés via un
import dynamique dans `genererPdfBlob()` pour ne pas alourdir le chargement
initial de l'app — ces bibliothèques ne sont récupérées qu'au moment où
un PDF est réellement demandé.

## Stock théorique

Le stock affiché sur la page Articles (`articles.stock`) est le stock réel.
À côté, la colonne **Stock théorique** = stock réel − somme des quantités de
cet article dans les commandes encore `en_attente`. Le badge « Totalement
commandé » n'apparaît que si ce stock théorique est ≤ 0 **et** qu'il existe
au moins une commande en attente sur cet article (`enAttenteParArticle`) —
un article neuf à stock réel 0 sans aucune commande passée n'a théorique
que 0 lui aussi (0 − 0), mais ce n'est pas la même situation : le badge
« Rupture » de la colonne suivante suffit à la signaler, sans laisser
penser à tort que des clients attendent une livraison.

Le stock ne doit jamais être négatif : le champ « Stock initial » du
formulaire de création a `min={0}` (le clic sur la flèche de décrément d'un
`<input type="number">` vide sans `min` fait descendre à -1, pas à 0 —
c'était la cause d'un article créé à stock 0 s'affichant en -1) et
l'enregistrement clampe la valeur via `Math.max(0, ...)`, comme le fait
déjà l'édition d'un article existant.

Dans **Nouvelle commande**, sélectionner un article dont le stock théorique
est ≤ 0 affiche un avertissement à cet endroit précis — mais le stock
théorique peut tomber à 0 pour deux raisons bien différentes, distinguées
via `enAttenteParArticle[id]` : des commandes en attente qui couvrent tout
le stock réel (« Cet article est déjà totalement commandé... »), ou un
article qui n'a tout simplement aucun stock réel sans jamais avoir été
commandé — ex. un article tout juste créé à 0 (« Cet article n'a
actuellement aucun stock disponible. »). L'article reste sélectionnable
dans le champ dédié tant que le stock réel le permet ; le sélecteur
lui-même (`components/ArticleSelect.js`) désactive les articles à stock
réel ≤ 0, indépendamment de ce message.

**Sélecteur d'article avec recherche + miniature** :
`components/ArticleSelect.js` remplace le `<select>` natif — un `<option>`
HTML ne peut ni filtrer en tapant, ni contenir d'image (limitations
universelles des navigateurs), donc un champ de recherche avec
suggestions (fermeture au clic extérieur) filtre la liste en temps réel
sur `articles.nom` (recherche insensible à la casse, sur toute la chaîne,
pas seulement le début) et affiche la photo de chaque résultat en
miniature à côté de son nom/prix/stock, avec le même pictogramme de repli
que `ImageUploadField` pour les articles sans photo. Le champ reste
utilisable au clavier (Entrée sélectionne le premier résultat non
désactivé, Échap referme et revient au nom déjà sélectionné) comme au
clic/tactile (choisir une suggestion). Utilisé à la fois dans Nouvelle
commande et dans la modale d'édition d'une commande (Commandes) — même
composant, même comportement de recherche aux deux endroits.

## Pages de détail (Commandes / Articles / Clients)

Plutôt que des boutons d'action collés sur chaque ligne (petits boutons
`padding: 4px 8px`, plusieurs par ligne, difficiles à toucher sans erreur
sur téléphone), Commandes, Stock et Clients suivent tous les trois le même
schéma : la ligne du tableau ne garde que les informations essentielles et
devient elle-même cliquable/tactile (`className="sb-row-clickable"`,
`onClick` → `router.push(...)`) vers une vraie page de détail —
`app/(app)/commandes/[id]/page.js`, `app/(app)/articles/[id]/page.js`,
`app/(app)/clients/[id]/page.js` — pas une fenêtre modale : navigation
complète, historique du navigateur inclus, cohérente sur ordinateur comme
sur téléphone.

Chaque page de détail affiche toutes les informations (client/articles/
livraison/paiement pour une commande, photo/prix/stock pour un article,
coordonnées/statistiques pour un client) et regroupe les actions dans une
rangée bien espacée (`.sb-detail-actions`, `padding: 10px 18px` par
bouton, `gap: 10px`) en bas de page — Livré/Modifier/Annuler/Imprimer-PDF
pour une commande, Réappro./Modifier/Supprimer pour un article, Modifier/
Réactiver-Désactiver/Supprimer pour un client. Un lien de retour
(`.sb-back-link`, flèche + libellé) en haut de chaque page ramène à la
liste. Les modales de modification/réapprovisionnement elles-mêmes
restent des modales (pattern déjà établi, pas concerné par le problème des
boutons collés) — seule la navigation *vers* le détail change.

Les listes elles-mêmes se sont allégées en conséquence : plus de logique
d'édition/suppression/changement de statut sur les pages liste
(`commandes/page.js`, `articles/page.js`, `clients/page.js`), qui ne
gardent que chargement paginé, recherche/filtres et export Excel. La liste
Commandes a aussi perdu ses colonnes Articles et Marge réelle (déplacées
sur la page de détail) pour ne garder que numéro/date/client/statut/CA.

`app/(app)/commandes/[id]/page.js` et `app/(app)/articles/[id]/page.js`
rechargent leurs propres listes de référence (clients/articles/zones pour
l'édition d'une commande ; catégories pour un article) plutôt que de les
recevoir de la page liste, dont ils sont maintenant complètement
indépendants — chacun peut être ouvert directement par son URL.

## Trésorerie

Page dédiée (`/tresorerie`, `app/(app)/tresorerie/page.js`), accessible à
tout commerçant (pas réservée aux admins), pour suivre l'évolution du CA
et de la marge réelle dans le temps — le Dashboard ne montre que le mois
en cours. Ne compte que les commandes au statut `livree`, comme partout
ailleurs dans l'app (Dashboard, Catalogue, marge réelle des Articles) —
jamais les commandes en attente ou annulées.

Trois blocs, alimentés par une seule requête (les commandes livrées des 12
derniers mois glissants) :

- **Totaux cumulés** (CA total, marge totale) sur la période sélectionnée.
- **Graphique** combinant CA et marge (deux barres groupées, via
  `ComposedChart` de `recharts`) avec un sélecteur Mois / Trimestre /
  Semestre / Année. « Mois » détaille par semaine (même découpage que
  l'évolution du Dashboard) ; les trois autres découpent par mois et
  reprennent simplement les N derniers mois d'un même tableau de 12 mois
  calculé une fois — Trimestre = les 3 derniers, Semestre = les 6
  derniers, Année = les 12.
- **Tableau récapitulatif** des 12 derniers mois (CA, marge), du plus
  récent au plus ancien — indépendant de la période choisie pour le
  graphique.

**Impression / export PDF** (« Imprimer / PDF », `window.print()` — même
mécanisme que le Catalogue et les reçus) : mise en page dédiée pleine page
A4, rendue via un portail directement dans `<body>` (comme
`components/Receipt.js`), qui masque tout le reste de l'app pendant
l'impression (`body:has(.sb-tresorerie-print) .sb-root { display: none }`)
plutôt que de cacher élément par élément. Contient l'en-tête (logo et nom
de la boutique, « Rapport de trésorerie », période sélectionnée — ex.
« Trimestre — Mai à Juillet 2026 »), les totaux cumulés mis en évidence,
le tableau récapitulatif des 12 mois et un pied de page « Propulsé par
Doka ». **Volontairement sans le graphique** : un graphique `recharts`
mesuré pendant qu'il est masqué (`display: none`, cas de ce portail avant
impression) ne se redimensionne pas de façon fiable une fois affiché pour
l'impression (limitation connue de `ResponsiveContainer` avec les media
queries d'impression) — le tableau reste de toute façon l'essentiel pour
un usage comptable.

## Export Excel

En complément de l'impression PDF, un bouton « Exporter en Excel »
(`lib/exportExcel.js`, basé sur `xlsx` / SheetJS Community Edition) permet
de télécharger un fichier `.xlsx` directement depuis le navigateur, sans
aller-retour serveur, sur quatre modules :

- **Stock / Articles** (`/articles`) : nom, catégorie, prix d'achat, frais
  annexes, prix de vente, marge réelle, stock, unité — respecte le filtre
  par catégorie et la recherche actifs à l'écran.
- **Clients** (`/clients`) : nom, téléphone, adresse, e-mail, nombre de
  commandes, total des achats — respecte la recherche et le filtre
  « afficher les désactivés ».
- **Commandes** (`/commandes`) : numéro, date, client, articles (liste
  condensée comme à l'écran), CA, marge réelle, statut — respecte le
  filtre en attente / livrée.
- **Trésorerie** (`/tresorerie`) : le même tableau récapitulatif des 12
  derniers mois (mois, CA, marge) que l'export PDF, à côté du bouton
  « Imprimer / PDF ».

Chaque export respecte exactement le filtre et la recherche actifs à
l'écran, et couvre l'intégralité des résultats correspondants — jamais
seulement la page affichée (voir « Pagination » plus bas). Sur Stock,
Clients et Commandes, désormais paginés, cela veut dire une requête
Supabase dédiée au moment de l'export (mêmes filtres que la liste,
simplement sans `.range()`) plutôt qu'une réutilisation du tableau déjà
chargé à l'écran ; sur Trésorerie (page non paginée), l'export réutilise
directement le tableau déjà affiché. Les montants sont exportés en valeurs
numériques brutes (pas de mise en forme monétaire), pour rester
exploitables dans un tableur. `lib/exportExcel.js` n'utilise que le chemin
d'écriture de `xlsx` (`json_to_sheet` / `writeFile`) sur des données
locales de confiance — les failles connues de la bibliothèque (pollution
de prototype, ReDoS) concernent uniquement l'analyse de fichiers importés
(`XLSX.read`), un chemin que cette app n'utilise jamais.

## Pagination

Stock (`/articles`), Clients (`/clients`) et Commandes (`/commandes`)
chargent leurs listes 25 lignes à la fois (`PAGE_SIZE`,
`lib/constants.js`) plutôt que la totalité d'un coup, via `.range()` côté
Supabase — filtre, recherche et tri sont eux aussi appliqués côté serveur
(`.eq()`/`.ilike()`/`.is()`/`.order()`), pas recalculés côté client sur un
tableau déjà en mémoire. Navigation page précédente / suivante
(`components/Pagination.js`, masquée dès qu'une seule page suffit).

- **Recherche débattue (debounce)** : la frappe met à jour l'input
  immédiatement, mais la requête Supabase n'est déclenchée que 300 ms après
  la dernière touche, pour éviter une requête par caractère tapé.
- **Filtres et pagination restent cohérents** : changer de catégorie, de
  recherche ou de statut ramène automatiquement à la page 1 ; supprimer la
  dernière ligne de la dernière page rabat sur la nouvelle dernière page
  plutôt que d'afficher une page vide.
- **Après une création/modification/suppression**, la page affichée est
  rechargée depuis le serveur (compteur `refreshTick` interne) plutôt que
  corrigée localement — plus simple et plus sûr dès qu'un tri, une
  catégorie ou un statut peuvent faire changer la position d'une ligne.
- **Ce qui reste volontairement non paginé** : les données nécessaires à
  autre chose qu'à l'affichage de la liste elle-même — listes complètes
  pour les menus déroulants (clients/articles/zones dans la modale de
  commande), agrégats globaux qui doivent rester exacts quel que soit le
  nombre de pages (marge totale exposée en stock sur Articles, statistiques
  par client sur Clients, badge « en attente » sur Commandes), et la
  détection de doublon de téléphone sur Clients (doit voir tous les
  clients de la boutique, pas seulement la page affichée). Chacun de ces
  cas utilise une requête Supabase dédiée, indépendante de la pagination de
  la liste principale.

## Unité de mesure

`articles.unite` (`'unite' | 'metre' | 'kilo'`, `'unite'` par défaut) se
choisit dans les formulaires « Nouvel article » / « Modifier l'article » et
s'affiche accolée à toute quantité de cet article dans l'application :
tableau du stock (Articles), historique de réappro, ligne de commande
(Nouvelle commande, Commandes, reçu) et prix au Catalogue (`15 000 FCFA /
Mètre`). Les libellés (« Unité »/« Mètre »/« Kilo » en français, « Unit »/
« Meter »/« Kilo » en anglais) vivent dans `lib/i18n` comme le reste des
textes traduits ; la liste des clés valides est centralisée dans
`UNITES` (`lib/constants.js`). Comme pour `nom`, cette unité n'est pas
recopiée sur `commande_lignes` — elle est retrouvée par jointure sur
`articles` à l'affichage, y compris pour l'historique des commandes déjà
livrées ou annulées. Nécessite la migration
`supabase-articles-unite-migration.sql` (voir Démarrage).

## Devise

`businesses.devise` (`'FCFA' | 'EUR' | 'USD'`, `'FCFA'` par défaut pour tout
nouveau compte) contrôle le formatage de **tous** les montants affichés dans
l'application — Dashboard, Articles, Commandes, Catalogue, Paramètres et
reçus. Choix modifiable dans Paramètres → Devise, sans rechargement.

`lib/format.js` fait la conversion via `Intl.NumberFormat` (code ISO 4217
associé : XOF pour FCFA, EUR, USD). Chaque page importe le formateur brut
sous le nom `fmtBase` et le ré-enveloppe localement :
`const fmt = (n) => fmtBase(n, business?.devise);` — ce qui laisse tous les
appels `fmt(x)` déjà existants inchangés tout en les rendant sensibles à la
devise choisie. Nécessite la migration
`supabase-businesses-devise-migration.sql` (voir Démarrage).

## Thème de couleur

La couleur d'accent choisie dans Paramètres (`businesses.theme_key`) ne se
limite pas à un détail du graphique du Dashboard : elle pilote trois
variables CSS globales — `--accent`, `--accent-deep`, `--accent-soft`
(définies dans `lib/constants.js`, `THEMES`) — injectées sur
`document.documentElement` par un effet dans `(app)/layout.js`. Elles
cascadent ainsi vers toute l'application (y compris le reçu imprimé, rendu
via un portail directement dans `<body>`) : sidebar, boutons principaux
(`.sb-btn-primary`), éléments actifs de la navigation, badges et accents des
différents modules.

Les couleurs à signification fixe (badges de statut Rupture/Faible/OK,
Confirmée/Annulée/En attente, Actif/Désactivé, et les boutons emerald de
succès) restent volontairement indépendantes du thème — elles portent un
sens (danger/avertissement/succès) qui ne doit pas varier avec la couleur de
marque choisie par le commerçant.

## Mode sombre

Indépendant de la couleur d'accent ci-dessus. Trois réglages
(`businesses.mode_affichage` : `clair` / `sombre` / `auto`, `clair` par
défaut pour tout nouveau compte). `auto` suit `prefers-color-scheme` du
système et se met à jour en direct si l'utilisateur change de réglage
pendant que l'app est ouverte.

**Deux points d'accès, adaptés à chaque taille d'écran** (`components/Sidebar.js`) :
sur ordinateur, la sidebar occupe une largeur fixe et n'a pas la place pour
un sélecteur à trois options sans surcharger l'espace du nom de la
boutique — le réglage complet vit donc uniquement dans Paramètres, juste
en dessous de « Thème de couleur », avec le même style `sb-toggle-group`
que Devise/Langue. Sur mobile, où la sidebar devient une barre horizontale
en haut de l'écran, une icône seule (soleil/lune/moniteur selon le mode
actuel) apparaît juste à côté du bouton menu ☰ — un clic fait défiler
clair → sombre → automatique → clair, sans texte ni menu déroulant à cet
endroit. Les deux boutons partagent la classe `.sb-mobile-actions`
(`display: none` par défaut, visible uniquement sous 860px via la même
media query que le bouton ☰), donc invisible sur desktop où le réglage
complet dans Paramètres suffit.

**Résolution centralisée dans `lib/AuthProvider.js`** plutôt que dans
`(app)/layout.js` (à la différence de la couleur d'accent) : un graphique
Recharts (Dashboard, Trésorerie, Revenus Doka) a besoin de connaître le
mode effectif en JavaScript, pas seulement en CSS, donc `effectiveTheme`
('light' | 'dark') est calculé une fois et exposé par `useAuth()` à toute
l'application. Le calcul est un dérivé pur du rendu (pas de `setState`
dans le corps d'un effect) ; seul le mode `auto` a besoin d'un état
(`systemPrefersDark`, initialisé directement depuis `matchMedia` pendant
le rendu), mis à jour par un effect qui ne fait qu'écouter l'évènement
`change` — jamais d'appel à `setState` synchrone dans son corps. Un
second effect, séparé, pose `data-theme` sur `<html>` à partir
d'`effectiveTheme`.

**`app/globals.css`** définit deux jeux de variables sémantiques —
`:root` (clair, valeurs historiques inchangées) et `:root[data-theme="dark"]`
(fonds/textes recalibrés) : `--ink`, `--paper`, `--card`, `--card-soft`,
`--line`, `--muted`, `--text-faint`, `--emerald`/`--amber`/`--coral` (+
leurs variantes `-bg` pour les badges), `--toggle-bg`/`--toggle-color`. La
couleur d'accent (`--accent`/`--accent-deep`/`--accent-soft`) n'est
volontairement **pas** redéfinie ici : elle reste celle choisie par le
commerçant dans les deux modes, comme demandé. Seule exception :
`--accent-text`, une variable dédiée au texte sur fond neutre (pas un fond
de bouton) — `theme.deep` est calibré pour du texte sur fond blanc, et
tombe sous 3:1 de contraste sur une carte sombre pour cinq des six
couleurs de `THEMES` ; `--accent-text` bascule donc sur `theme.soft` en
mode sombre (déjà posé par la même couleur choisie par le commerçant), qui
reste ≥ 8:1 sur fond sombre pour les six couleurs. Vérifié par calcul de
contraste WCAG sur toutes les paires texte/fond du système de variables
(texte principal ≥ 13:1, textes secondaires ≥ 4.7:1, couleurs de statut
≥ 5.9:1) et par capture d'écran comparative clair/sombre.

Audit complet ré-effectué sur l'ensemble du code (hex/`rgb()`/couleurs
nommées, en JSX comme en CSS) : aucune couleur de texte fixe restante en
dehors des cas volontairement exclus ci-dessous.

**Couvre toute l'application**, pas seulement les nouveaux écrans : les
~120 couleurs jusque-là écrites en dur dans les styles JSX (`color:
"#6E6B68"`, `background: "#fff"`...) ont été remplacées par ces variables
dans les 15 fichiers concernés (toutes les pages de `(app)/`, plus
`ImageUploadField`, `LogoPlatformUpload`, `Pagination`,
`PaiementAbonnement`, `PendingSubscription`), y compris les écrans de
connexion/légaux/abonnement en attente qui partagent le même système de
variables. Les couleurs des graphiques Recharts passées en props JS
(grille, tooltip) suivent aussi ces variables — `fill`/`stroke` en SVG
résolvent `var()` comme n'importe quelle propriété CSS.

**Volontairement laissés en clair, quel que soit le mode d'affichage** :
les mises en page d'impression (Trésorerie, Revenus Doka, Catalogue, reçu)
— personne n'imprime un rapport sur fond noir — et `components/Receipt.js`
dans son ensemble (aperçu à l'écran inclus), traité comme un document
prévu pour l'impression/le partage WhatsApp plutôt que comme un écran de
navigation, donc cohérent quel que soit le thème de l'app.

## Langue

`businesses.langue` (`'fr' | 'en'`, `'fr'` par défaut pour tout nouveau
compte) contrôle la langue de **toute** l'interface d'administration
(Dashboard, Nouvelle commande, Articles, Clients, Commandes, Catalogue,
Paramètres) ainsi que des documents destinés aux clientes générés dans la
langue du commerçant : le reçu de confirmation (aperçu, message WhatsApp,
impression PDF) et le catalogue partageable (texte copié/WhatsApp, version
imprimée). Choix modifiable dans Paramètres → Langue, sans rechargement.

Les textes vivent dans un dictionnaire centralisé, `lib/i18n/` :
`fr.js` et `en.js` exportent chacun un objet imbriqué par module
(`dashboard`, `articles`, `commandes`...), et `index.js` expose
`t(langue, "namespace.cle", variables)` — une entrée peut être une chaîne
(avec interpolation `{{var}}`) ou une fonction (pour les pluriels et
phrases dynamiques, ex. `t("dashboard.restant", { n: article.stock })`).
Chaque page suit le même schéma que pour la devise : elle importe `t` sous
le nom `tBase` et le ré-enveloppe localement —
`const t = (key, vars) => tBase(business?.langue, key, vars);` — ce qui
garde le mécanisme cohérent avec le shim `fmt` déjà en place.

Les dates (`toLocaleDateString`) suivent aussi la langue choisie via
`dateLocale(langue)` dans `lib/format.js` (`fr-FR` / `en-US`) ; le format
des montants reste piloté par la devise, indépendamment de la langue.

Ajouter une langue supplémentaire plus tard consiste à créer un nouveau
fichier `lib/i18n/<code>.js` avec les mêmes clés, l'enregistrer dans
`DICTS` (`lib/i18n/index.js`) et l'ajouter au sélecteur de Paramètres.
Nécessite la migration `supabase-businesses-langue-migration.sql` (voir
Démarrage).

## Catalogue

Le bouton « Imprimer / PDF » imprime exactement ce qui est affiché à
l'écran : la grille d'articles (`.sb-catalogue-grid`) est déjà filtrée par
`filtreCategorie` avant d'être rendue, pour l'écran comme pour
l'impression — seuls les boutons/filtres eux-mêmes sont masqués à
l'impression (classe `.sb-no-print`), pas les données. Filtrer sur une
catégorie puis imprimer ne produit donc que les articles de cette
catégorie.

Quand un filtre de catégorie est actif, son nom s'ajoute au titre du
document imprimé/PDF (`document.title`, mis à jour juste avant
`window.print()` et restauré à la fermeture de l'aperçu via l'événement
`afterprint`) ainsi qu'au sous-titre du bandeau affiché sur la page —
utile pour distinguer plusieurs PDF imprimés séparément par catégorie
(ex. « Catalogue — Chez Aïcha Beauté — Mèches »).

## Espace Administration

`businesses.is_admin` (`boolean`, `false` par défaut) donne accès à
`/admin`, une page listant tous les commerçants inscrits (nom, e-mail,
statut d'abonnement, date d'expiration) — jamais attribué automatiquement
à l'inscription. L'entrée « Administration » n'apparaît dans la sidebar
que si `business.is_admin` est vrai (`components/Sidebar.js`) ; la page
elle-même redirige tout compte non-admin vers `/dashboard`
(`app/(app)/admin/page.js`).

**Portée volontairement limitée aux données d'abonnement.** L'espace
Administration ne donne accès qu'aux informations nécessaires à la gestion
des abonnements (nom de la boutique, e-mail, statut, date d'expiration,
droits admin, justificatifs de paiement) — jamais au contenu métier d'un
commerçant (clients, articles/stock, commandes, CA, marge). Cette
restriction est appliquée en base, pas seulement dans l'interface : la
policy RLS qui donnait auparavant à un admin un accès complet (`for all`,
donc à toutes les colonnes) à la table `businesses` a été retirée par
`supabase-admin-scope-abonnement-migration.sql`, remplacée par trois
fonctions `security definer` (`admin_list_businesses`,
`admin_mark_subscription_paid`, `admin_set_is_admin`) qui ne
lisent/écrivent que les colonnes listées ci-dessus, et qui vérifient
elles-mêmes `is_admin_user()` avant d'agir. Un compte non-admin qui
interrogerait directement `businesses` (requête REST, SQL...) ne voit
toujours que sa propre boutique ; un compte admin n'a lui-même aucun
chemin pour lire ou modifier une colonne hors de ce périmètre, y compris
via une requête directe — les autres tables (`clients`, `articles`,
`commandes`, `reappros`...) n'ont jamais eu de policy admin et restent
strictement scopées à leur propriétaire.

Les lignes dont l'abonnement (`actif` ou `essai`) expire dans les 7 jours
à venir sont mises en évidence (fond ambre, badge « Expire bientôt ») et
triées en premier — sauf la propre ligne de l'admin connecté, qui n'
affiche jamais sa date d'expiration ni ce badge (son accès est permanent,
voir plus bas). Une ligne entièrement cliquable (`.sb-row-clickable`, même
principe que Commandes/Articles/Clients) ouvre une page de détail dédiée
(`app/(app)/admin/commercants/[id]/page.js`) plutôt que d'entasser des
boutons d'action sur chaque ligne de la liste — celle-ci se limite donc
aux colonnes Boutique/E-mail/Statut/Expiration.

**Paiements en attente** : accès **permanent**, pas seulement un badge de
comptage conditionnel — un bouton (`.sb-paiements-attente-btn`) juste sous
le titre de l'espace Administration, toujours visible, affichant le nombre
en attente dans un badge (`.sb-btn-count-badge`) uniquement quand il y en a
au moins un. Il mène à une page dédiée
(`app/(app)/admin/paiements/page.js`) où chaque ligne (Boutique / Formule /
Montant / Date de soumission, avec « depuis N jour(s) » à côté de la date)
mène, elle aussi, à la page de détail correspondante. Triée par
`created_at` croissant : **les paiements les plus anciens en premier**,
pour qu'aucun ne reste oublié en bas d'une longue liste.

La page de détail affiche le justificatif en attente (le cas échéant),
avec sa formule et sa date d'envoi juste au-dessus — l'image, cliquable,
s'agrandit dans une visionneuse plein écran (`.sb-modal-overlay`, clic
n'importe où pour refermer) pour vérifier un montant ou une référence pas
toujours lisibles en aperçu. Deux boutons dédiés à la vérification,
nettement plus grands et mieux espacés que les actions secondaires
ci-dessous (`.sb-verification-actions`/`.sb-btn-verification`), juste sous
la photo :

- **Valider** (« Marquer comme payé » quand il n'y a pas de justificatif
  en attente — même bouton, `marquerPaye()`, seul le libellé change selon
  le contexte ; masqué sur les lignes déjà admin, dont l'abonnement n'a
  pas d'effet sur l'accès) : `subscription_status → 'actif'`, le pendant
  manuel de ce que fera le webhook CinetPay plus tard, via
  `admin_mark_subscription_paid`
  (`supabase-validation-paiement-installation-migration.sql`).
  `subscription_expires_at` est calculée **côté serveur**, jamais transmise
  par le client : prolonge depuis l'échéance existante si elle n'est pas
  encore passée (un commerçant qui paie en avance ne perd jamais les jours
  déjà payés), repart d'aujourd'hui sinon, puis + 1 mois dans les deux cas
  — cette règle est ainsi garantie identique à chaque validation, quel que
  soit l'appelant (avant, elle était calculée en JS et transmise en
  paramètre, sans aucune vérification côté serveur). Si un justificatif
  est en attente pour ce commerçant, la fonction le fait aussi passer à
  `reussi` dans la **même opération atomique** (avant : un second appel
  séparé côté client, avec un risque réel d'incohérence si celui-ci
  échouait après le premier — compte déjà actif mais justificatif resté
  `en_attente` indéfiniment) ; si ce justificatif incluait les frais
  d'installation de la formule Clé en main, `businesses.frais_installation_payes`
  passe aussi à `true` dans la foulée — voir « Frais d'installation (formule
  Clé en main) » plus bas. Insère aussi, depuis
  `supabase-confirmation-paiement-migration.sql`, une notification 🔔
  `paiement_valide` pour le commerçant (voir « Centre de notifications »
  plus bas) — la nouvelle date d'expiration y est capturée dans la même
  opération, garantissant qu'elle correspond exactement à ce qui vient
  d'être écrit.
- **Rejeter** (visible seulement s'il y a un justificatif en attente)
  ouvre une modale demandant une raison, affichée au commerçant — voir
  « Paiement manuel vérifié » plus bas. Fait aussi repasser
  `subscription_status` à un état bloqué (`admin_reject_payment`) : `actif
  → expire`, `essai → en_attente_paiement`, inchangé s'il était déjà
  bloqué **ou** si l'accès reste valide (renouvellement anticipé rejeté
  avant l'échéance réelle — voir le point 10 de « Fonctionnement du compte
  / abonnement » plus haut, qui notifie alors le commerçant via le centre
  de notifications plutôt que de couper son accès).
- **Donner/Retirer les droits admin** (`admin_set_is_admin`) : toujours
  actif, y compris sur sa propre ligne.

La page de détail réutilise `admin_list_businesses()` (filtrée côté client
sur l'identifiant de la fiche) plutôt qu'une nouvelle fonction SQL dédiée
— même périmètre de colonnes (plus `plan` depuis
`supabase-admin-liste-paiements-migration.sql`, nécessaire pour afficher
la formule).

**Compte admin = accès permanent à l'application.** `subscription_status`
et `subscription_expires_at` n'ont aucun effet sur un compte
`is_admin = true` : `verifierExpirationAbonnement`
(`lib/AuthProvider.js`) ne bascule jamais son statut, et la condition de
blocage dans `app/(app)/layout.js` ignore son statut — donc aussi bien à
la connexion qu'à toute revérification pendant la navigation. La sidebar
n'affiche d'ailleurs jamais de badge d'abonnement (essai/expiration) pour
un compte admin.

**Paiement Wave et logo Doka** : la configuration globale de la
plateforme (QR code/numéro/prix Wave, logo Doka et ses icônes PWA) vit
entièrement ici, dans deux cartes dédiées en haut de la page — jamais dans
les Paramètres d'un commerçant, qui n'y ont ni accès visuel ni, pour le
Wave, de policy RLS le permettant (`parametres_globaux` reste modifiable
uniquement par un administrateur).

`businesses.email` (dupliqué depuis `auth.users`, schéma protégé non
accessible depuis le client) est renseigné à l'inscription
(`lib/AuthProvider.js`) et rétroactivement pour les comptes déjà existants
par la migration elle-même.

Nécessite `supabase-businesses-admin-migration.sql` (voir Démarrage), qui
attribue aussi les droits admin au compte `koua.nancy@gmail.com` — si ce
compte ne s'est pas encore inscrit au moment où tu exécutes la migration,
relance-la après sa première connexion — puis
`supabase-admin-scope-abonnement-migration.sql` pour restreindre l'accès
aux seules données d'abonnement.

## Revenus Doka

Section dédiée en haut de l'espace Administration (`app/(app)/admin/page.js`)
pour suivre ce que rapporte réellement la plateforme — distincte de la
Trésorerie que voit chaque commerçant, qui ne concerne que sa propre
activité. Alimentée uniquement par les paiements d'abonnement validés
(`paiements_abonnement.statut = 'reussi'`), jamais par le CA/la marge des
boutiques.

- **Indicateurs clés** : revenu total encaissé (somme de tous les
  paiements réussis), revenu du mois en cours, nombre de boutiques à
  l'abonnement `actif`, nombre de comptes en `essai` — ces deux derniers
  recalculés depuis la même liste de boutiques (`admin_list_businesses`)
  que le tableau des commerçants plus bas.
- **Graphique d'évolution** : revenu mensuel encaissé, avec le même
  sélecteur Mois / Trimestre / Semestre / Année que la Trésorerie (« Mois »
  détaille par semaine, les trois autres par mois glissants).
- **Tableau détaillé** : tous les paiements validés (boutique, montant,
  date de validation), triable en cliquant l'en-tête « Date de validation »
  — le plus récent en premier par défaut. Un bouton « Supprimer » par
  ligne (avec confirmation) retire un paiement — utile pour nettoyer les
  paiements fictifs créés en phase de test ; la policy admin existante
  (`for all`, `is_admin_user()`) couvre déjà `DELETE`, aucune migration
  supplémentaire nécessaire.
- **Export PDF et Excel** : mêmes mécanismes que partout ailleurs dans
  l'app — impression via `window.print()` et une mise en page dédiée
  (`.sb-revenus-print`, portail dans `<body>`, comme la Trésorerie), et
  `.xlsx` via `lib/exportExcel.js` — respectant tous deux l'ordre de tri
  actuellement affiché à l'écran.

**Date de validation, distincte de la date d'envoi du justificatif.**
`paiements_abonnement.created_at` correspond à l'envoi du justificatif par
le commerçant, pas à sa validation par l'administratrice — d'où la
nouvelle colonne `valide_at`, renseignée au moment où un paiement passe à
`reussi` (`supabase-revenus-admin-migration.sql`, qui rétro-remplit aussi
`valide_at = created_at` pour les paiements déjà validés avant cette
migration) — désormais posée par `admin_mark_subscription_paid` elle-même
(`supabase-validation-paiement-installation-migration.sql`), plus par un
update séparé côté client (voir « Espace Administration » plus haut).
Aucune policy RLS supplémentaire n'est nécessaire : la policy admin
existante sur `paiements_abonnement` (`for all`, `is_admin_user()`) couvre
déjà cette colonne.

## Paiement manuel vérifié

En attendant le webhook CinetPay, l'abonnement se paie via Wave puis se
vérifie à la main : le commerçant paie et envoie une preuve, l'admin
contrôle et débloque. Toute la logique vit dans
`components/PaiementAbonnement.js`, un composant partagé monté à deux
endroits :

**Police** : `.sb-pending-screen` (écrans de blocage ci-dessous) est en
dehors du shell applicatif (`.sb-root`, qui définit `font-family: "Inter"`)
— sans sa propre déclaration, tout son texte (montant, QR, boutons non
stylés) retombait sur la police par défaut du navigateur au lieu d'Inter,
contrairement au reste de l'app. Corrigé en ajoutant `font-family: "Inter",
sans-serif` directement sur `.sb-pending-screen`, même principe que
`.sb-auth-screen` (page de connexion).

- **`PremierPaiement.js`/`Reabonnement.js`** (écrans de blocage, via
  `FormuleEtPaiement.js` — voir « Formule (plan) » plus haut) : seuls
  endroits accessibles à un compte dont l'accès est bloqué (voir le point 8
  de « Fonctionnement du compte / abonnement » plus haut — statut, ou
  dernier paiement en attente ou rejeté), donc c'est là que doit vivre le
  flux complet pour un compte bloqué. Absent pour un compte `suspendu`
  (`CompteSuspendu.js` — une suspension n'est pas forcément liée à un
  impayé). Titre/texte remplacés par l'un de deux messages dédiés
  (`paiementEnAttente.title`/`.text` ou `paiementRejete.title`/`.text`,
  prop `paiementBlocage` transmise depuis `app/(app)/layout.js`, dérivée de
  `paiementInfo.statut` — state `paiementInfo` de `AuthProvider`, voir le
  point 8 de « Fonctionnement du compte / abonnement » plus haut ; le nom
  de la prop reste `paiementBlocage` par simplicité, seul le state source a
  été renommé) quand le blocage vient du dernier paiement plutôt que d'un
  premier paiement ou d'une expiration classique — jamais pour un
  renouvellement anticipé pendant que l'accès est déjà valide (point 10),
  qui n'atteint d'ailleurs jamais ces deux écrans puisque l'accès n'y est
  alors pas bloqué. Un nouvel envoi de justificatif
  (`PaiementAbonnement.js`) fait retomber ce dernier paiement à
  `en_attente` et appelle lui-même `refreshBusiness()` : le message
  bascule aussitôt sur « en cours de vérification » (toujours bloqué, mais
  avec le message adapté), sans attendre une navigation. Un seul
  bouton de confirmation dans tout le parcours, sur les deux écrans :
  celui d'envoi du justificatif, dans FormuleEtPaiement/PaiementAbonnement
  — pas de bouton « J'ai payé, vérifier mon statut » séparé, qui faisait
  doublon (même sens que « Envoyer pour vérification ») et n'avait de
  toute façon pas sa place tant qu'aucune formule n'est choisie (étape
  liste des formules). `refreshBusiness()` est de toute façon déjà rappelé
  à chaque navigation (`app/(app)/layout.js`), donc retirer ce bouton ne
  retire aucune capacité de rafraîchissement — voir le point 8 de
  « Fonctionnement du compte / abonnement » plus haut.
- **Carte « Abonnement » de `parametres/page.js`** : pour un renouvellement
  anticipé pendant que le compte est encore `actif` ou en `essai` (page
  seulement accessible dans ce cas, donc jamais en double avec l'écran de
  blocage), ou via « Changer ma formule » →
  `parametres/formule/page.js`.

**Ce que montre le composant** : le prix — via le prop `plan` (formule en
cours de choix, montant tiré de `PLAN_PRICES`) ou, à défaut,
`parametres_globaux.abonnement_prix` (renouvellement générique), formaté
selon la devise de la boutique comme partout ailleurs —, le QR Wave
(`parametres_globaux.wave_qr_url`) ou à défaut le numéro Wave
(`wave_telephone`) si le QR n'est pas encore renseigné, un champ d'upload
(`ImageUploadField`, même mécanisme que les photos d'articles ou le logo)
et l'historique des paiements envoyés par cette boutique
(`paiements_abonnement`, triés du plus récent au plus ancien). Le paiement
le plus récent détermine la bannière affichée en haut : « en attente de
vérification » (message exact demandé : « Merci ! Ton paiement est en
cours de vérification, l'activation peut prendre jusqu'à 1 heure. ») s'il
est `en_attente`, la raison du rejet s'il est `echoue`, rien s'il est
`reussi` ou s'il n'y a encore aucun envoi.

**Frais d'installation (formule Clé en main)** : `PLAN_PRICES.cle_en_main`
(`lib/constants.js`) porte, en plus du prix mensuel, un frais
d'installation ponctuel (15 000 FCFA) — dû une seule fois par compte,
jamais deux fois, quel que soit le nombre de changements de formule
ultérieurs (`businesses.frais_installation_payes`, colonne posée par
`supabase-validation-paiement-installation-migration.sql`, jamais écrite
directement par le client — voir point 9 de « Fonctionnement du compte /
abonnement » : une colonne ajoutée après coup n'est, par défaut, dans
aucune liste de colonnes regrantées à `authenticated`). Tant que ces frais
restent dus (`installationRestante = montantInstallation > 0 &&
!business.frais_installation_payes`) :

- si l'abonnement en cours **n'est pas encore expiré**
  (`accesDejaValide()`, lib/paiements.js — même notion que pour le point 10
  ci-dessus) au moment de l'envoi, seuls les frais d'installation sont
  facturés (le mois en cours reste déjà couvert par ailleurs) — l'écran
  affiche alors `paiement.montantAPayerInstallationSeule` plutôt que le
  libellé habituel ;
- sinon (abonnement déjà expiré, ou tout premier paiement jamais fait), le
  mois et les frais d'installation sont facturés ensemble, comme avant.

Une fois les frais d'installation déjà payés (`frais_installation_payes =
true`), seul le montant mensuel est facturé à chaque renouvellement
suivant, qu'il soit anticipé ou non — plus jamais les frais d'installation.
Ce booléen `installation_incluse` est posé sur la ligne
`paiements_abonnement` elle-même à l'envoi (même modèle de confiance que
la colonne `montant`, déjà fournie par le client et vérifiée visuellement
par l'administratrice avant validation — aucune restriction de grant
supplémentaire nécessaire), puis lu par `admin_mark_subscription_paid` au
moment de la validation pour, le cas échéant, faire passer
`frais_installation_payes` à `true` (voir « Espace Administration » plus
haut). Les formules Autonome et Premium (aucun frais d'installation dans
`PLAN_PRICES`) ne sont pas concernées : leur facturation reste inchangée.

**Validation explicite avant envoi** : l'upload de la photo
(`ImageUploadField.onChange`) ne fait plus qu'enregistrer l'URL en
brouillon local (`justificatifDraft`) — un bouton « Envoyer pour
vérification » distinct déclenche l'insertion en base et la notification
admin (`envoyerJustificatif`). Évite qu'une simple sélection de fichier
parte en vérification avant que le commerçant ait pu se relire ou changer
d'avis. `ImageUploadField` est remonté (prop `key`) après un envoi réussi
pour repartir d'une zone vide. Le bouton reste affiché même sans photo
chargée (plutôt que d'être absent tant que `justificatifDraft` est vide) :
un clic sans justificatif affiche un message d'erreur dédié
(`paiement.justificatifRequis`) au lieu de ne rien faire silencieusement.
Ce message d'erreur, ainsi que celui d'un échec d'envoi
(`paiement.submitError`), vit dans un state séparé (`erreurMsg`, badge
corail) du message de succès (`uploadMsg`, badge vert) — avant, les deux
partageaient le même badge vert, ce qui affichait une erreur d'envoi avec
un style de succès.

**À l'envoi d'un justificatif** (bouton « Envoyer pour vérification », une
fois la photo déjà dans Storage) : une ligne est insérée dans
`paiements_abonnement` avec `statut = 'en_attente'`, `montant` = prix
courant au moment de l'envoi (figé, comme les prix sur `commande_lignes`).
Cette insertion déclenche elle-même, côté base, la notification par
e-mail à l'administratrice — voir « Notification e-mail : déclenchement
serveur » plus bas pour le détail (et pourquoi ce n'est **plus** un appel
fait depuis le navigateur du commerçant).

**Sécurité RLS** : la policy d'origine sur `paiements_abonnement`
(`for all`, propriétaire de la boutique) permettait à un commerçant de
faire passer lui-même son paiement à `reussi` sans jamais payer. La
migration la remplace par deux policies restreintes au commerçant
(lecture de ses propres lignes ; insertion limitée à
`statut = 'en_attente'`) plus une policy admin complète
(`is_admin_user()`, même fonction que pour `businesses`) — seul un
administrateur peut faire passer un paiement à `reussi` ou `echoue`.

**Réglages globaux** : `parametres_globaux` est une table à une seule
ligne (créée par la migration), lisible publiquement (QR/numéro/prix n'ont
rien de confidentiel — voir aussi « Logo Doka » ci-dessous pour
pourquoi la lecture est publique et pas seulement réservée aux comptes
connectés) mais modifiable uniquement par un administrateur, depuis une
carte dédiée dans Paramètres (visible si `business.is_admin`) réutilisant
`ImageUploadField` pour le QR exactement comme le logo de la boutique.

Nécessite `supabase-paiements-manuels-migration.sql` (voir Démarrage), à
exécuter après `supabase-businesses-admin-migration.sql`.

## Notifications push (Web Push)

**Historique** : la notification admin de nouveau justificatif est
passée par deux mécanismes e-mail successifs (`/api/notify-admin-payment`
côté navigateur, puis `/api/alerte-paiement` côté serveur via `pg_net`),
sans jamais pouvoir être fiabilisée malgré plusieurs correctifs
(renommage de route, déclenchement serveur, diagnostic du jeton
partagé) — abandonnée au profit d'une vraie notification **push**,
envoyée directement sur le téléphone/ordinateur de l'administratrice,
réservée aux comptes admin. La route e-mail et son appel `pg_net` ont été
entièrement retirés (voir Démarrage,
`supabase-push-notifications-migration.sql`) ; `RESEND_API_KEY` reste
utilisée ailleurs, pour le rappel d'expiration (voir « Centre de
notifications » plus bas), inchangé.

**Architecture**, même schéma que l'ancien mécanisme e-mail, adapté au
push :

1. Le commerçant envoie un justificatif → `notifier_admins_nouveau_justificatif()`
   (trigger SQL sur `paiements_abonnement`, inchangé pour la notification
   🔔 en base) appelle désormais `app/api/push-admin-paiement` via
   `pg_net.http_post`, protégée par `PUSH_ADMIN_SECRET` (même mécanisme
   que `CRON_SECRET`).
2. La route lit `push_subscriptions` (avec `SUPABASE_SERVICE_ROLE_KEY`,
   RLS contourné volontairement, comme pour le rappel d'expiration) filtré
   sur les boutiques `is_admin = true`, et envoie une vraie notification
   push à chacune via `web-push` (npm), signée avec les clés VAPID
   (`NEXT_PUBLIC_VAPID_PUBLIC_KEY` + `VAPID_PRIVATE_KEY`). Un abonnement
   qui répond `404`/`410` (navigateur désinstallé, permission révoquée...)
   est supprimé automatiquement de `push_subscriptions` — jamais réessayé
   ensuite.
3. Le service worker (`public/sw.js`, minimal — uniquement l'écoute
   `push`/`notificationclick`, pas de cache offline) affiche la
   notification et ramène au clic sur `/admin/commercants/<business_id>`
   (la fiche du paiement concerné, `business_id` inclus dans le payload
   depuis `supabase-admin-liste-paiements-migration.sql`) plutôt que sur
   `/admin` en général — l'administratrice n'a alors plus jamais à
   chercher où aller après avoir reçu l'alerte.

**Abonnement** (Paramètres, carte « Notifications push », visible
uniquement si `business.is_admin`) : le bouton « Activer les
notifications sur cet appareil » (`lib/push.js`,
`activerNotificationsPush()`) demande la permission navigateur, enregistre
le service worker, s'abonne auprès du service de push du navigateur
(`PushManager.subscribe`) puis enregistre l'abonnement
(`push_subscriptions`, table dédiée — `endpoint` unique, `p256dh`/`auth`
= les clés de chiffrement du navigateur pour ce couple utilisateur/appareil).
Un même compte admin peut avoir plusieurs appareils abonnés (téléphone +
ordinateur) : chaque `endpoint` est une ligne séparée.

**Sécurité** : `push_subscriptions` n'est accessible (`select`/`insert`/
`update`/`delete`) qu'au propriétaire d'une boutique `is_admin = true` —
un commerçant ordinaire ne peut pas s'y abonner même via un appel direct
à l'API REST, en plus du bouton déjà masqué côté interface. La route
`app/api/push-admin-paiement` filtre aussi explicitement sur
`is_admin = true` côté serveur (défense en profondeur).

**⚠️ Étapes manuelles requises, dans l'ordre :**

1. Exécuter `supabase-push-notifications-migration.sql` puis
   `supabase-confirmation-paiement-migration.sql` dans l'éditeur SQL
   Supabase (voir Démarrage pour les prérequis).
2. Générer une paire de clés VAPID (`npx web-push generate-vapid-keys`,
   ou toute autre méthode équivalente — une seule paire pour toute
   l'application, à générer une fois) et les renseigner comme variables
   d'environnement Vercel :
   - `NEXT_PUBLIC_VAPID_PUBLIC_KEY` (clé publique)
   - `VAPID_PRIVATE_KEY` (clé privée, jamais exposée au client)
3. Choisir une chaîne aléatoire longue pour `PUSH_ADMIN_SECRET` (Vercel)
   et créer le secret Vault correspondant, **rigoureusement identique** :
   `select vault.create_secret('<la-meme-chaine>', 'push_admin_secret');`
   (pour corriger une valeur déjà créée, utiliser `vault.update_secret`
   plutôt que de rejouer `create_secret` — voir la remarque équivalente
   ci-dessous pour l'URL).
4. Secret Vault `push_admin_url`, avec l'URL complète de la route sur le
   domaine de production réel :
   `select vault.create_secret('https://<ton-domaine>/api/push-admin-paiement', 'push_admin_url');`
5. `SUPABASE_SERVICE_ROLE_KEY` (Vercel) — normalement déjà configurée
   pour le rappel d'expiration planifié ; sinon voir « Centre de
   notifications » plus bas.
6. **Redéployer le projet sur Vercel** après toute modification de
   variables d'environnement — elles ne sont chargées que par les
   fonctions déployées après le changement.

Sans ces étapes, le justificatif s'enregistre normalement et la
notification dans le centre de notifications (badge cloche) continue de
fonctionner — seule la notification push reste ignorée.

**Test, une fois déployé** :

1. Se connecter avec un compte admin, aller dans Paramètres, cliquer
   « Activer les notifications sur cet appareil » et accepter la
   permission demandée par le navigateur.
2. Vérifier qu'une ligne apparaît dans `push_subscriptions` (éditeur de
   table Supabase) pour ce compte.
3. Depuis un autre compte (ou un navigateur en navigation privée),
   envoyer un justificatif de paiement.
4. Une notification push doit apparaître sur l'appareil où l'étape 1 a
   été faite, dans les quelques secondes — même si l'onglet Doka est
   fermé (c'est tout l'intérêt du service worker). Le clic dessus doit
   ouvrir/ramener directement sur la fiche de la boutique concernée
   (`/admin/commercants/<id>`, photo du justificatif + boutons Valider/
   Rejeter déjà visibles), jamais sur le tableau de bord général.
5. En cas d'échec, consulter les logs de fonction Vercel pour
   `/api/push-admin-paiement` — mêmes principes de diagnostic que
   documentés précédemment pour l'e-mail (jeton attendu vs reçu, etc., si
   le problème est un `401`).

## Fond animé des écrans d'entrée

Connexion/inscription, premier paiement, réabonnement, compte suspendu et
changement de formule partagent la même identité visuelle : un fond animé
façon lampe à lave, aux couleurs de la marque Doka, derrière une carte à
fond opaque — jamais l'inverse.

**Les bulles flottantes** (`components/FloatingBlobs.js`, monté une fois
par écran juste après `.sb-auth-screen`/`.sb-pending-screen`/
`.sb-formule-screen` ; styles dans `app/globals.css`, sélecteurs
`.sb-blob-field`/`.sb-blob-1` à `-6`) : six formes (`filter: blur(6px)`,
un contour net plutôt qu'un dégradé délavé) aux couleurs **fixes** de la
marque — trois orangées, trois grises, en `radial-gradient` excentré (pas
un simple aplat) pour un reflet façon cire éclairée, plutôt qu'un disque
plat — indépendantes de `--accent` (la couleur de thème
personnalisée par le commerçant, voir « Mode sombre » plus bas) : ces
écrans précèdent ou entourent le compte, l'identité doit rester celle de
Doka, jamais celle, potentiellement bleue ou verte, choisie par tel ou tel
commerçant. Rendues en DOM réel plutôt qu'en pseudo-éléments `::before`/
`::after` — un pseudo-élément est limité à deux par écran, insuffisant
pour un mouvement vraiment désynchronisé. Chaque bulle a son propre cycle
(18 à 30s, `ease-in-out infinite alternate` — l'aller-retour de
`alternate` correspond bien à la métaphore : la bulle « monte » puis «
redescend », comme la cire d'une vraie lampe à lave — `animation-delay`
négatif et distinct pour démarrer déjà déphasée plutôt que les six
ensemble à l'écran 0) et anime, à chaque étape du keyframe, trois
propriétés ensemble : `border-radius` (percentages très asymétriques,
jusqu'à 70/30) pour un contour qui passe de goutte à galet à ovale plutôt
que de rester un cercle qui grossit ; `scale(x, y)` à deux valeurs
distinctes (jamais un zoom uniforme) pour un étirement/aplatissement façon
cire qui s'allonge en montant puis s'écrase en changeant de direction ; et
une légère `rotate()` pour achever l'impression organique. Seuls
`transform` et `border-radius` (plus `opacity`) animent — jamais une
propriété qui déclenche un reflow — pour rester fluide sur mobile sans
recourir à du JavaScript.

Toujours en `z-index: 0`, dans un conteneur `overflow: hidden` (le champ de
bulles lui-même, en plus de l'écran englobant) pour éviter tout scroll
parasite malgré une amplitude de déplacement volontairement large ; la
carte (`.sb-auth-card`/`.sb-pending-card`/`.sb-formule-inner`) est
explicitement passée en `z-index: 1` au-dessus, avec son propre fond
opaque — le texte et les boutons ne bougent jamais, seul l'arrière-plan
est concerné. `@media (prefers-reduced-motion: reduce)`
coupe l'animation pour les comptes qui la désactivent au niveau système.
Comme `.sb-auth-screen`/`.sb-pending-screen` sont déjà utilisées par
`CompteSuspendu.js`, ce fond s'applique aussi à cet écran par la même
occasion (pas de classe séparée à dupliquer pour un cinquième écran de
blocage).

**Le logo Doka** (`components/PlatformLogo.js`, monté en haut de chaque
écran, net et jamais animé — contrairement au fond derrière lui) lit
`parametres_globaux.logo_url` (lecture publique, aucune session requise à
ce stade) : le même logo déjà uploadable depuis Administration (voir
`components/LogoPlatformUpload.js`, aucune nouvelle étape manuelle) est
donc réutilisé tel quel sur les cinq écrans, avec un repli textuel («
Doka », `.sb-auth-brand`) tant qu'aucun logo n'a encore été uploadé.

**« Changer ma formule »** (`app/(app)/parametres/formule/page.js`,
`.sb-formule-screen`) passe en plein écran (`position: fixed; inset: 0`),
sidebar masquée — même sensation d'écran d'entrée à part entière que les
quatre autres, plutôt que de rester dans le contenu de `.sb-main`. La
sidebar reste techniquement montée derrière (même route, même garde
d'authentification que le reste de `app/(app)/layout.js`, aucune
restructuration du shell), simplement recouverte par cet écran tant qu'il
est affiché. `z-index: 70`, au même niveau que `.sb-modal-overlay` — au-
dessus du menu mobile coulissant (`.sb-nav`, `z-index: 60` sous 860px).
`overflow-y: auto` (pas `hidden` comme les quatre autres écrans) : le
contenu (grille des 3 formules, détail, paiement) peut dépasser la
hauteur de l'écran sur les petits écrans. `.sb-formule-inner` (max-width
860px, centré) évite que ce contenu ne s'étire sur toute la largeur d'un
grand écran, faute de la contrainte de largeur qu'apportait auparavant la
sidebar.

**Badge de confiance** (`.sb-trust-badge`, `components/PaiementAbonnement.js`
— cadenas/bouclier `ShieldCheck` + « Paiement sécurisé ») : affiché une
seule fois au montage du composant (fondu + léger mouvement vers le haut,
`animation: ... both` sans `infinite`, donc pas de répétition), uniquement
sur les écrans de paiement — jamais sur connexion/inscription, où un badge
de paiement n'aurait pas de sens. Comme `PaiementAbonnement.js` est
partagé par les trois écrans de paiement (premier paiement, réabonnement,
changement de formule) et par la carte « Abonnement » de Paramètres
(renouvellement anticipé), le badge apparaît aussi là par cohérence.

## Site vitrine public

`/` (`app/page.js`, `components/LandingPage.js`) est un vrai site vitrine
public, accessible sans connexion — plus de redirection automatique vers
`/login` pour un visiteur non connecté (seul un compte déjà connecté qui
atterrit sur `/` est renvoyé vers `/dashboard`, la page vitrine s'affiche
donc immédiatement pour tout le monde, sans attendre la résolution de la
session).

**Fond sombre permanent, propre à cette page** — pas le mode sombre de
l'app (réservé aux comptes connectés qui le choisissent). Les mêmes
valeurs déjà définies pour `:root[data-theme="dark"]` (`app/globals.css`)
sont simplement redéclarées sur `.sb-landing` : tout ce qui est déjà
construit avec ces variables sémantiques (`.sb-btn`, `.sb-card`,
`.sb-badge`, `.sb-plan-card` via `PlanGrid.js`...) en hérite
automatiquement, sans qu'aucun de ces composants n'ait eu besoin d'être
modifié. `--accent`/`--accent-deep`/`--accent-soft` restent les couleurs
de marque fixes (jamais la couleur de thème personnalisée d'un
commerçant, comme pour les bulles) ; `--accent-text` bascule sur
`--accent-soft`, plus lisible en texte sur fond sombre que `--accent-deep`
(calibré pour du texte sur fond blanc).

**Bulles flottantes sur toute la page**, pas seulement le héros — même
composant que les écrans d'entrée (`components/FloatingBlobs.js`, voir
« Fond animé des écrans d'entrée »), avec deux props : `count` (2 ou 6,
défaut 6) réduit le nombre de bulles pour les sections secondaires —
plus léger que le héros sans répéter la même densité partout sur une
seule page — et `subtle` applique une opacité globale réduite
(`.sb-blob-field-subtle`) pour ne jamais gêner la lecture, contrairement
au héros où les bulles sont seules derrière un titre court. Histoire,
paragraphe « pourquoi Doka te convient », modules, chiffres clés et
tarifs utilisent chacun `<FloatingBlobs count={2} subtle />`.

**En-tête** : logo/nom Doka en haut à gauche (`components/PlatformLogo.js`
— police et couleur de marque, jamais animé), trois liens en haut à
droite — **Accueil** (`/`), **Se connecter** (`/login`), **S'inscrire**
(`/login#signup`, voir plus bas).

**Héros, en deux colonnes** (une colonne sous 860px) : à gauche, « Découvrez
Doka » puis « Votre ERP pensé pour les entrepreneurs d'aujourd'hui. » —
chaque ligne apparaît avec sa propre animation d'entrée au chargement
(`@keyframes sb-landing-hero-line-in`, translateY + fondu, délais en
cascade — jamais `components/Reveal.js`/`IntersectionObserver`, inutile
pour du contenu déjà visible sans défilement) ; le mot « Doka » a en plus
sa propre animation d'entrée imbriquée (`sb-landing-doka-pop`, léger effet
de zoom) suivie d'un halo continu (`sb-landing-doka-glow`, `text-shadow`
en boucle infinie une fois l'entrée terminée) pour qu'il reste visiblement
« vivant » quel que soit le moment où on regarde la page, pas seulement
pendant la fraction de seconde de son entrée. Un seul bouton d'action («
Commencer l'essai gratuit ») — « Se connecter » n'apparaît que dans la
barre de navigation, jamais en double dans le héros. À droite,
`components/DeviceComposition.js` : une composition ordinateur +
téléphone (cadres construits en CSS) affichant chacun une maquette de
module (`components/ModuleMockup.js`, réutilisée telle quelle) — ou une
vraie capture d'écran dès qu'elle est fournie, voir « Remplacer les
maquettes par de vraies captures d'écran » ci-dessous.
`prefers-reduced-motion` coupe toutes ces animations d'entrée et le halo
continu — le contenu reste affiché, juste sans mouvement.

**Notre histoire** : texte fourni tel quel par l'équipe Doka, jamais
reformulé, signé sur deux lignes (`.sb-landing-histoire-signature`) —
« Nancy Koné » puis « Fondatrice de Doka ».

**Pourquoi Doka pour ton commerce** : court paragraphe (pas une liste de
cartes, texte fourni tel quel, sans tiret) expliquant pourquoi Doka
correspond à ce type de commerçant — simplicité, prix accessible, données
qui restent les siennes.

**6 modules** (Dashboard, Nouvelle commande, Stock, Clients, Commandes,
Trésorerie — Catalogue volontairement laissé de côté pour un site plus
resserré) — chacun avec une petite maquette visuelle de l'écran réel
(`components/ModuleMockup.js`, construite en CSS pur mais calquée sur la
vraie structure de chaque page plutôt que des formes génériques : trois
tuiles KPI + graphique pour le Dashboard (`app/(app)/dashboard/page.js`),
même stepper que « Nouvelle commande » (`app/(app)/nouvelle/page.js`),
lignes de tableau avec vignette photo + badge de stock OK/Faible/Rupture
pour Stock (`app/(app)/articles/page.js`, mêmes couleurs que
`common.badgeOk`/`badgeFaible`/`badgeRupture`), vrai tableau — jamais une
liste d'avatars, qui n'existe nulle part dans l'app — pour Clients
(`app/(app)/clients/page.js`), tableau N°/Cliente/CA/Statut pour Commandes
(`app/(app)/commandes/page.js`), grille de fiches produit pour Catalogue
(`app/(app)/catalogue/page.js`), courbe d'évolution + deux totaux pour
Trésorerie) et une description — reprise telle quelle quand elle existait
déjà dans `lib/i18n/fr.js` (`dashboard.subtitle`, `nouvelle.subtitle`,
`tresorerie.subtitle`), sinon rédigée à partir des fonctionnalités
réelles plutôt qu'inventée (ex. seuil d'alerte de stock, fiche client).
Chaque maquette affiche aussi de vrais libellés/valeurs d'exemple
illustratifs (noms, montants, statuts « OK »/« Faible »/« Rupture », «
Livrée »/« En cours »...) plutôt que de simples barres grises vides, pour
ressembler à un aperçu réel plutôt qu'à un squelette abstrait — jamais de
vraies données d'une boutique.

**Chiffres clés** animés (`components/Counter.js` — compte de 0 à la
valeur finale via `requestAnimationFrame` dès l'entrée dans le viewport,
jamais avant) : 7 jours d'essai gratuit, 3 formules, 100% des données
isolées par boutique — les trois valeurs réelles déjà utilisées ailleurs
sur la page, jamais des statistiques inventées (pas de nombre de clients
ou de volumes fictifs).

**Ce qu'en disent les commerçants** : aucun vrai client à ce jour, donc
aucun faux témoignage inventé pour combler l'espace. Trois cartes
volontairement estompées (bordure en pointillés, lignes de texte grisées,
`opacity: 0.6`) suggèrent l'emplacement réservé, avec un message explicite
en dessous — « Les premiers retours de nos commerçants arriveront
bientôt ici. » — plutôt qu'un silence qui laisserait croire à un oubli.

**Tarifs** : réutilise directement `components/PlanGrid.js` (mêmes 3
formules, mêmes prix exacts, même liste d'avantages que partout ailleurs
dans l'app) plutôt que d'en recréer une version dédiée — seul `onChoose`
change : redirige vers `/login#signup` au lieu de changer de formule pour
une boutique déjà existante. Le détail de la formule Clé en main (frais
d'installation) reste uniquement dans sa propre carte — pas de note
répétée en dessous des trois cartes.

**Pied de page complet** : liens `/cgu`, `/confidentialite`,
`/mentions-legales`, `contact@doka.ci` (même adresse que
`app/(app)/aide/page.js`), et `components/FooterSupport.js` — mention du
support (WhatsApp + e-mail), avec les **mêmes canaux réels** que la page
Aide (lecture publique de `parametres_globaux.support_telephone`, lien
WhatsApp affiché seulement si un numéro est configuré), pas une simple
mention décorative.

**Révélation au défilement** (`components/Reveal.js`) : chaque section
sous le pli (histoire, paragraphe, modules, chiffres clés, tarifs)
apparaît avec un fondu + léger mouvement vers le haut la première fois
qu'elle entre dans le viewport (`IntersectionObserver`, natif, aucune
dépendance ; se déclenche une seule fois, jamais de réapparition en
remontant). `prefers-reduced-motion` coupe la transition — le contenu
reste affiché, juste sans animation. Les cartes module ont en plus une
légère élévation au survol (`.sb-landing-card:hover` —
`transform`/`box-shadow`/`border-color`, jamais les cartes tarifs qui
gardent leur propre style `.sb-plan-card` inchangé).

**`/login#signup`** : `app/login/page.js` lit `window.location.hash` une
fois au montage (dans un `useEffect`, jamais dans l'initialiseur de
`useState` — lire le hash dès l'initialiseur produirait un rendu client
initial différent du HTML serveur, un vrai mismatch d'hydratation, pas
juste un avertissement cosmétique) pour ouvrir directement l'onglet «
Créer un compte » plutôt que de forcer un clic supplémentaire depuis la
page vitrine.

**Responsive** : mêmes classes de grille que le reste de l'app
(`.sb-landing-grid`, `repeat(3, 1fr)` → une colonne sous 860px, identique
à `.sb-plan-grid`) — un seul point de rupture, cohérent avec toutes les
autres grilles de l'application plutôt que d'en introduire un nouveau. La
composition d'appareils du héros passe en colonne unique (téléphone sous
l'ordinateur, plus de chevauchement) au même point de rupture.

**Défilement continu, sans démarcation entre sections** : toute la page
partage le même fond (`.sb-landing { background: var(--paper); }`), aucune
section n'a de fond/bordure propre (la barre de navigation fait
volontairement exception : c'est un élément de chrome persistant, pas une
section de contenu). Chaque section garde son propre champ de bulles
flottantes (`components/FloatingBlobs.js`), mais celui-ci n'est plus
strictement découpé au bord de sa section : `.sb-landing-hero` et
`.sb-landing-blobby-section` repassent en `overflow: visible` (au lieu du
`overflow: hidden` par défaut, hérité de la règle commune avec les écrans
d'entrée) pour laisser une bulle déborder naturellement d'une section sur
la suivante — seule sa propre forme organique + son flou restent ses
bords, jamais une coupe droite au changement de section. Le seul point de
découpe horizontal de toute la page reste `.sb-landing` lui-même
(`overflow-x: hidden`), pour qu'un décalage négatif de bulle en bord
d'écran (ex. `left: -9vw`) ne provoque jamais de barre de défilement
latérale.

**Remplacer les maquettes par de vraies captures d'écran** : chaque
maquette CSS est prête à être remplacée par une vraie image, sans aucune
restructuration.
- Modules (`components/LandingPage.js`, tableau `MODULES`) : renseigner le
  champ `image` de l'entrée voulue avec un chemin sous `/public` (ex.
  `/screenshots/dashboard.png`) — la carte affiche alors cette image à la
  place de la maquette CSS (`components/ModuleMockup.js`, prop
  `imageSrc`).
- Composition (statique) du héros (`components/LandingPage.js`, constantes
  `HERO_LAPTOP_IMAGE`/`HERO_PHONE_IMAGE`) : même principe, un chemin sous
  `/public` pour la vue ordinateur et/ou la vue téléphone
  (`components/DeviceComposition.js`, props `laptopImage`/`phoneImage`).
- Carrousel (animé) du héros (`components/HeroCarousel.js`,
  `HERO_CAROUSEL_IMAGES` dans `components/LandingPage.js`) : tableau de
  `{ src, alt }`, chemins sous `/public` — dès qu'il contient au moins une
  entrée, le héros bascule automatiquement du `DeviceComposition` statique
  ci-dessus vers ce carrousel, qui fait défiler toutes les images en fondu
  enchaîné (4,2 s par image). `prefers-reduced-motion` coupe le défilement
  automatique — seule la première image reste affichée, statique.
  **En place** : trois photos sous `public/hero/` (fournies par l'équipe
  Doka) montrant des commerçants en situation d'usage. Le contenu affiché
  à l'écran du téléphone sur ces photos n'est pas un aperçu fidèle de
  l'app — elles servent donc de visuel d'ambiance uniquement (texte alt
  générique, sans mention de l'app à l'écran), pas de vraie capture
  d'écran. Fichiers assez lourds (1,4 à 1,9 Mo chacun, non compressés) —
  à optimiser avant une mise en production si le poids de page devient un
  souci.

Ces mécanismes coexistent avec la maquette CSS existante : tant qu'aucune
image n'est fournie (valeur `null`/tableau vide), la maquette construite
en CSS s'affiche normalement.

**Lisibilité des textes secondaires** : `--muted`/`--text-faint` sont
volontairement plus clairs sur `.sb-landing` que la même variable en mode
sombre de l'app (`:root[data-theme="dark"]`) — un site public, découvert
sans familiarité avec l'app, mérite un standard de lisibilité plus
généreux pour ses sous-titres/légendes que l'écran d'un utilisateur déjà
connecté. Les couleurs de marque (accent, emerald, amber, coral) ne
changent pas.

**`components/HomeLink.js`** : petit lien « ← Accueil » vers `/`, affiché
en haut à gauche des écrans atteignables directement depuis les boutons du
site vitrine (Se connecter, S'inscrire, Commencer l'essai gratuit) —
`app/login/page.js`, `components/PremierPaiement.js`,
`components/Reabonnement.js`. Toujours un lien statique vers `/` plutôt
que `router.back()` (contrairement à `components/LegalBackLink.js`) : ici
on veut précisément revenir au site vitrine, pas à la page précédente
quelle qu'elle soit.

## Centre de notifications

Une cloche (badge = nombre de notifications non lues) ouvre un panneau
listant les notifications de la boutique connectée, les plus récentes en
premier — placée dans la sidebar sur ordinateur (à côté du nom de la
boutique) et à côté du menu ☰ sur mobile. `lib/NotificationsProvider.js`
(même structure que `AuthProvider`) centralise l'état (liste, compteur non
lues, marquage individuel ou global) ; `components/NotificationBell.js` est
la partie visuelle, montée deux fois dans `Sidebar.js` (une seule visible à
la fois selon la largeur d'écran, l'autre masquée en CSS) pour partager le
même état sans dupliquer les requêtes.

**Six types de notifications**, générées uniquement côté base (jamais
insérées depuis le client — voir RLS plus bas) :

- **`abonnement_expire`** (commerçant) : dès que `subscription_expires_at`
  passe sous 3 jours. Générée par la fonction SQL
  `generer_notifications_expiration()`, appelée une fois par jour par
  `app/api/cron/expiration-reminders` (Vercel Cron, voir `vercel.json`,
  06:00 UTC). Une colonne `dedupe_key` (`abonnement_expire:<business_id>:<date
  d'expiration>`) avec un index unique **partiel** (`where dedupe_key is
  not null` — les autres types de notifications n'en posent pas) garantit
  qu'une échéance donnée ne génère jamais qu'une seule notification, même
  si la tâche tourne plusieurs fois le même jour ou que le commerçant se
  reconnecte entre-temps — contrairement à une vérification faite à chaque
  connexion (comme `verifierExpirationAbonnement`), qui aurait dupliqué la
  notification à chaque rechargement. La clause `on conflict (dedupe_key)`
  de la fonction doit répéter ce même prédicat (`where dedupe_key is not
  null`) pour que Postgres accepte de l'associer à cet index partiel —
  omis initialement, ce qui faisait échouer la fonction à chaque appel
  avec l'erreur `42P10` (« no unique or exclusion constraint matching the
  ON CONFLICT specification ») ; corrigé par
  `supabase-generer-notifications-expiration-onconflict-fix-migration.sql`.
  **En plus** de la notification en base, un e-mail de
  rappel est envoyé via Resend directement depuis cette route cron (seul
  usage restant de `RESEND_API_KEY`, voir « Notifications push (Web
  Push) » ci-dessus) — les deux canaux coexistent, et l'e-mail n'est
  envoyé que pour les boutiques réellement notifiées cette fois-ci (donc,
  comme la notification, une seule fois par échéance).
- **`paiement_a_verifier`** (administratrice) : créée immédiatement par un
  déclencheur SQL (`trg_notifier_admins_nouveau_justificatif`) dès qu'une
  ligne `paiements_abonnement` est insérée avec `statut = 'en_attente'` —
  donc à chaque envoi de justificatif (voir « Paiement manuel vérifié »
  ci-dessus). Une notification est créée pour chaque boutique
  `is_admin = true` ; ce même déclencheur déclenche aussi désormais une
  notification push (`app/api/push-admin-paiement`, voir « Notifications
  push (Web Push) » ci-dessus). Le message mentionne la formule du
  commerçant concerné (ex. « formule Clé en main (5 000 FCFA/mois +
  15 000 FCFA à l'installation) ») pour que l'administratrice sache
  immédiatement quel montant vérifier sans aller chercher l'information
  ailleurs.
- **`paiement_valide`** (commerçant) : insérée directement par
  `admin_mark_subscription_paid`
  (`supabase-confirmation-paiement-migration.sql`, pas un déclencheur
  séparé puisque la fonction gère déjà toute la validation) au moment où
  l'administratrice marque un paiement comme payé — avec la nouvelle date
  d'expiration en toutes lettres (« Ton paiement a été validé, ton
  abonnement est actif jusqu'au JJ/MM/AAAA. »). Jusqu'ici, rien ne
  prévenait le commerçant que son paiement avait été validé — il ne le
  découvrait qu'en revenant sur l'app.
- **`nouvelle_inscription`** (administratrice) : créée immédiatement par un
  déclencheur SQL (`trg_notifier_admins_nouvelle_inscription`) dès qu'une
  ligne `businesses` non-admin est insérée — donc à la première connexion
  d'un commerçant après confirmation de son e-mail (voir `ensureBusiness`
  dans `lib/AuthProvider.js`), pas à la soumission du formulaire
  d'inscription elle-même. Mentionne elle aussi la formule choisie. Pas
  d'e-mail pour ce cas (aucun mécanisme d'e-mail n'existait déjà pour les
  inscriptions).
- **`renouvellement_anticipe_en_attente`** (commerçant) : créée
  immédiatement par un déclencheur SQL dédié
  (`trg_notifier_commercant_renouvellement_anticipe`,
  `supabase-notifications-renouvellement-anticipe-migration.sql`) dès
  qu'une ligne `paiements_abonnement` est insérée avec
  `statut = 'en_attente'` **et** que la boutique a déjà un accès valide en
  cours (`actif`/`essai` avec `subscription_expires_at` dans le futur) —
  un renouvellement anticipé, jamais bloquant (voir le point 10 de
  « Fonctionnement du compte / abonnement » ci-dessus). Contrairement à
  `paiement_a_verifier`, cette notification vise la boutique elle-même,
  pas l'administratrice — un déclencheur séparé plutôt qu'ajouté à
  `notifier_admins_nouveau_justificatif`, puisque les deux visent des
  boutiques différentes.
- **`renouvellement_anticipe_rejete`** (commerçant) : insérée directement
  par `admin_reject_payment`
  (`supabase-admin-reject-payment-anticipe-migration.sql`, pas un
  déclencheur séparé puisque la fonction gère déjà tout le rejet) au
  moment où l'administratrice rejette un justificatif, uniquement si la
  boutique a — là aussi — déjà un accès valide en cours, même logique que
  ci-dessus. Sans cette notification, un rejet qui ne bloque rien (accès
  déjà valide, voir point 10) serait passé complètement inaperçu.

Le libellé + prix de chaque formule utilisé dans ces messages est
centralisé dans `libelle_formule(plan)` côté SQL
(`supabase-notifications-formule-migration.sql`) — duplique
volontairement `PLAN_PRICES`/`PLANS` de `lib/constants.js` (Postgres ne
peut pas importer de JS) et doit être mise à jour manuellement si les
prix changent côté application.

**Sécurité RLS** : la table `notifications` n'a de policy que pour
`select` et `update`, toutes deux limitées à
`business_id in (select id from businesses where owner_id = auth.uid())` —
un commerçant ne voit et ne peut marquer comme lues que ses propres
notifications, l'administratrice les siennes (dont ses
`paiement_a_verifier`). Aucune policy `insert`/`delete` pour le rôle
`authenticated` : toute création passe par les fonctions/déclencheurs
`SECURITY DEFINER` ci-dessus (comme les fonctions `admin_*` de « Espace
Administration »), jamais directement depuis le client.
`generer_notifications_expiration()` n'est accordée à aucun rôle client
(ni `authenticated` ni `anon`) — seule la route cron, avec la clé
`service_role`, peut l'appeler.

Nécessite `supabase-notifications-migration.sql` (voir Démarrage), à
exécuter après `supabase-businesses-admin-migration.sql` et
`supabase-paiements-manuels-migration.sql` — et, pour `paiement_valide`,
`supabase-confirmation-paiement-migration.sql` ; et, pour les deux
derniers types ci-dessus,
`supabase-notifications-renouvellement-anticipe-migration.sql` et
`supabase-admin-reject-payment-anticipe-migration.sql`. Le rappel d'expiration
planifié nécessite en plus `SUPABASE_SERVICE_ROLE_KEY` et `CRON_SECRET`
(voir `.env.local.example`) — sans elles, la route cron refuse de
s'exécuter (500) plutôt que de tourner sans protection ou sans les droits
nécessaires ; le reste du centre de notifications (cloche, panneau,
notification de justificatif) fonctionne normalement sans elles.

## Rapport de stock automatique — retiré

Cette fonctionnalité (rapport journalier/hebdomadaire du stock par
e-mail, `app/api/cron/stock-reports`) a existé un temps puis a été
retirée : jugée redondante, le stock étant déjà facilement consultable
dans l'application (page Articles). Retiré : la route cron elle-même,
son entrée dans `vercel.json`, le champ correspondant dans Paramètres, la
fonction SQL `boutiques_dues_rapport_stock()` et les colonnes
`businesses.rapport_stock`/`rapport_stock_jour_semaine`/`rapport_stock_dernier_envoi`
(`supabase-rapport-stock-retrait-migration.sql`, à exécuter une fois dans
Supabase). Les confirmations de commande par e-mail
(`businesses.notif_email`, `businesses.confirmation_email`) sont une
fonctionnalité distincte, conservée telle quelle — voir « Centre de
notifications » plus bas.

## Logo Doka (marque de la plateforme)

Différent du logo de boutique (personnalisable par chaque commerçant dans
ses propres Paramètres, voir « Photos d'articles (et logo de la
boutique) » plus haut) : le logo Doka est la marque par défaut de la
plateforme elle-même, gérée par l'administratrice depuis une carte dédiée
en haut de l'espace Administration (`components/LogoPlatformUpload.js`,
même mécanisme d'upload que les autres images de l'app, stocké dans le
bucket `article-photos` déjà existant sous
`<business_id>/smartbiz-logo/`).

Un seul fichier envoyé déclenche deux choses :

- l'upload du logo, **fond blanc rendu transparent** (`parametres_globaux.logo_url`,
  voir plus bas) ;
- la génération, côté client via `<canvas>`, de trois variantes carrées
  **opaques**, depuis le fichier d'origine non traité (découpe centrée
  façon "cover", pas de bandes vides) : 192×192 et 512×512 pour le
  manifest PWA, 180×180 pour l'icône Apple (`icon_192_url`,
  `icon_512_url`, `icon_apple_180_url`) — restées opaques
  volontairement : une icône d'écran d'accueil transparente s'affiche
  avec un fond noir sur iOS, ce n'est donc pas souhaitable là. Le
  redimensionnement se fait depuis le fichier local
  (`URL.createObjectURL`, même origine) plutôt que depuis l'URL déjà
  hébergée sur Supabase Storage, pour ne jamais dépendre des en-têtes CORS
  du bucket lors du dessin sur canvas.

Les quatre URLs sont enregistrées immédiatement (pas de bouton
« Enregistrer » séparé) dès que les quatre uploads réussissent, pour que
le changement se répercute aussitôt pour tous les comptes.

**Où ce logo est utilisé automatiquement :**

- **Icône d'écran d'accueil (PWA)** : `app/manifest.js` (convention
  Next.js — servi dynamiquement à `/manifest.webmanifest`) lit
  `icon_192_url`/`icon_512_url` à chaque requête et les expose dans le
  manifest ; `app/layout.js` utilise `generateMetadata()` (async, remplace
  l'export statique `metadata`) pour ajouter `icon_apple_180_url` en
  `<link rel="apple-touch-icon">`. **Limite connue** : une icône déjà
  installée sur l'écran d'accueil d'un téléphone ne se met pas forcément à
  jour instantanément — c'est une limitation du cache PWA du système
  d'exploitation, pas de l'app (le prochain lancement/réinstallation la
  reprend).
- **En-tête de la page de connexion/inscription** (`app/login/page.js`) :
  remplace le texte « Doka » par défaut, uniquement pour les comptes
  qui n'ont pas encore leur propre logo de boutique personnalisé (celui-ci
  ne s'affiche qu'après connexion).
- **En-tête du site vitrine public** (`components/LandingPage.js`, voir
  « Site vitrine public » plus haut) : même composant `PlatformLogo.js`,
  même repli texte.
- **Pied de page « Propulsé par Doka » des reçus**
  (`components/Receipt.js`) : petite icône ajoutée devant le texte, dans
  l'aperçu écran et la version imprimée.

Chaque point de consommation lit `parametres_globaux` avec repli
silencieux en cas d'échec (aucune session au moment de la lecture pour la
page de connexion et le manifest — d'où la policy de lecture publique
introduite par la migration ci-dessous).

Un fond blanc visible autour du logo sur un fond sombre (site vitrine, ou
futur mode sombre général) viendrait du fichier envoyé lui-même (pixels
de fond opaques), jamais d'un style de l'app — `PlatformLogo.js` n'ajoute
aucun fond en CSS. Un simple `mix-blend-mode: multiply` en CSS ferait
disparaître un fond blanc mais écraserait aussi les couleurs de marque du
logo vers le noir sur un fond sombre (`multiply(couleur, fond_sombre) ≈
fond_sombre` pour toute couleur non blanche) : ce n'est donc pas la
solution retenue.

À la place, `lib/removeWhiteBackground.js` (`removeWhiteBackgroundToCanvas`,
partagée par les deux points ci-dessous) traite l'image au niveau des
pixels via `<canvas>` : tout pixel proche du blanc devient transparent
(une bande de transition entre deux seuils adoucit les bords anti-aliasés
du logo plutôt qu'une découpe nette et dentelée), tout pixel de couleur
(noir, orange de marque...) reste inchangé — un logo déjà transparent au
départ n'est pas affecté (le traitement ne réduit jamais l'opacité d'un
pixel qui n'est pas déjà proche du blanc). Le traitement se fait à deux
endroits :

- **À l'envoi** (`components/LogoPlatformUpload.js`) : le fichier local
  (`URL.createObjectURL`, toujours même origine, jamais de souci CORS) est
  traité avant l'upload — `parametres_globaux.logo_url` contient donc
  directement l'image déjà transparente.
- **À l'affichage** (`components/PlatformLogo.js`), en filet de
  sécurité : un logo déjà publié avant ce traitement (ou dont le fichier
  d'origine reste à fond blanc) est retraité à la volée depuis l'image
  distante déjà en ligne — sans avoir besoin de le renvoyer depuis
  Administration. `getImageData` peut cependant échouer sur une image
  chargée depuis une autre origine si le bucket Storage ne renvoie pas
  d'en-tête CORS permissif (contrairement à l'envoi, toujours une image
  locale) ; en cas d'échec, l'image d'origine reste affichée telle quelle,
  sans rien casser.

Nécessite `supabase-parametres-globaux-logo-migration.sql` (voir
Démarrage), à exécuter après `supabase-paiements-manuels-migration.sql`.

## Confirmation avant déconnexion

`components/ConfirmDialog.js` (habillage `.sb-modal-overlay`/`.sb-card`,
comme les modales Articles/Admin) s'affiche avant toute déconnexion —
« Oui, me déconnecter » appelle `signOut()`, « Annuler » ou un clic à
l'extérieur referme la modale sans rien faire. Un `window.confirm()`
natif aurait suffi côté logique (déjà utilisé pour les suppressions
Articles/Clients et l'annulation de commande), mais impose les libellés
de boutons du navigateur — une modale maison était nécessaire pour les
libellés demandés. Montée aux deux endroits où vit un bouton de
déconnexion : `Sidebar.js` (même bouton pour ordinateur et mobile, la
sidebar ne fait que se repositionner en CSS selon la largeur d'écran) et
les trois écrans de blocage d'un compte non actif (`PremierPaiement.js`,
`Reabonnement.js`, `CompteSuspendu.js`).

Sur mobile, avec le menu ☰ ouvert, cette modale doit s'afficher au-dessus
du panneau de navigation coulissant plutôt que derrière lui : `.sb-modal-overlay`
est passée en `z-index: 70`, au-dessus de `.sb-nav` (`z-index: 60` sous
860px). Le bouton « Déconnexion » de `Sidebar.js` referme aussi
explicitement le menu (`setMenuOpen(false)`) au moment où il ouvre la
confirmation, pour éviter que les deux restent visuellement superposés.

## Navigation mobile (menu hamburger)

En dessous de 860px de large (`components/Sidebar.js`, `app/globals.css`),
la sidebar bascule en barre horizontale réduite au logo/nom de boutique et
à un bouton hamburger ; la navigation elle-même devient un panneau
coulissant (`position: fixed`, translaté hors écran par défaut) ouvert par
ce bouton, avec un overlay assombri en fond. Se referme au clic sur
l'overlay, sur un lien de nav, ou sur le bouton (qui devient une croix une
fois ouvert). Au-dessus de 860px, aucun changement : la sidebar reste
affichée en permanence comme avant, le bouton hamburger et le panneau
restent masqués (`display: none` hors media query).

## Pages légales (CGU, Confidentialité, Mentions légales)

Trois pages publiques (`/cgu`, `/confidentialite`, `/mentions-legales`),
accessibles sans connexion — donc situées hors du groupe `(app)` (comme
`/login`), pas de gate d'abonnement. Chacune lit son fichier Markdown
source à la racine du dépôt (`doka-cgu.md`,
`doka-politique-confidentialite.md`, `doka-mentions-legales.md` — via
`fs.readFileSync` dans un Server Component, ces fichiers sont donc la
source de vérité : les éditer suffit, la page reprend le contenu au
prochain build) et le rend avec `react-markdown`
(`components/LegalDocument.js`). Deux ajustements au rendu :

- Les liens internes entre fichiers `.md` (ex. dans les mentions légales,
  un lien vers `doka-politique-confidentialite.md`) sont réécrits vers la
  route de l'app correspondante (`/confidentialite`) plutôt que de pointer
  vers un fichier `.md` inexistant en tant que route.
- Les blockquotes (`>`) ne sont jamais rendues : dans ces fichiers, elles
  servent à des notes internes adressées à l'éditrice du contenu (ex. « Note
  pour toi : tant que l'entreprise n'est pas immatriculée... » dans les
  mentions légales), jamais à du contenu destiné aux utilisateurs.

**⚠️ Contenu à finaliser avant mise en production** : les trois fichiers
sources contiennent des espaces réservés non complétés (`[à compléter]`,
adresse, numéro RCCM, e-mail de contact...), visibles tels quels sur les
pages tant qu'ils ne sont pas remplacés dans les fichiers `.md`.

**Accès** : liens en pied de page de `/login` (les trois, ouverts dans un
nouvel onglet pour ne pas perdre la saisie du formulaire en cours) et
carte dédiée dans Paramètres (`parametres.legalTitle`) pour un commerçant
déjà connecté. Un bouton « Retour » (`components/LegalBackLink.js`,
`router.back()`) permet de revenir à l'endroit d'origine, que ce soit
avant ou après connexion.

**Consentement à l'inscription** : une case à cocher obligatoire (« J'ai
lu et j'accepte les CGU et la Politique de Confidentialité », avec liens)
conditionne l'activation du bouton « Créer mon compte » — désactivé tant
qu'elle n'est pas cochée (`app/login/page.js`).

## Aide / Support

Page `/aide` (`app/(app)/aide/page.js`), accessible à tout commerçant —
entrée de sidebar entre Paramètres et Administration. Reste volontairement
simple : pas de formulaire de ticket, seulement deux moyens de contact.

- **WhatsApp** : numéro dédié (`parametres_globaux.support_telephone`),
  configuré dans une carte « Support » séparée de l'espace Administration
  — volontairement indépendant de `wave_telephone` (numéro Wave des
  paiements), les deux rôles n'ayant aucune raison de partager le même
  numéro. L'admin voit un avertissement tant que ce champ est vide. Le
  numéro est normalisé et le lien `wa.me` pré-rempli construits par
  `toWhatsAppNumber` (`lib/format.js`, extrait de `components/Receipt.js`
  où vivait la même logique pour le bouton d'envoi de confirmation de
  commande, maintenant partagée entre les deux). Si aucun numéro n'est
  configuré, le bouton est remplacé par une note invitant à utiliser
  l'e-mail à la place plutôt que de retomber silencieusement sur le
  numéro Wave.

  **Toujours du texte, jamais un nombre** : un numéro local commence par
  0 (ex. `0700000000`), un chiffre qu'une conversion en nombre supprime
  silencieusement. `wave_telephone`/`support_telephone` sont des colonnes
  `text` (garanti explicitement par
  `supabase-telephone-text-migration.sql`), les champs de saisie dans
  Administration sont des `<input type="tel">` (jamais `type="number"`),
  et l'enregistrement ne fait qu'un `.trim()` — jamais `Number(...)`.
  `toWhatsAppNumber` convertit aussi son entrée via `String(tel ?? "")`
  avant de retirer les caractères non numériques, par sécurité si une
  valeur non textuelle lui parvenait malgré tout. Depuis la réforme de
  numérotation ivoirienne à 10 chiffres (2021), le 0 initial fait partie
  du numéro et n'est jamais retiré : la fonction se contente de préfixer
  l'indicatif pays 225 devant les chiffres complets (ex. `0710685710` →
  `2250710685710`).
- **E-mail** : adresse fixe `contact@doka.ci`, bouton `mailto:` en repli.

## Structure

```
app/
  layout.js               root layout (police, AuthProvider)
  page.js                 site vitrine public (components/LandingPage.js) si non connecté, sinon redirection vers /dashboard
  login/page.js            inscription / connexion
  cgu/, confidentialite/, mentions-legales/   pages légales publiques
  (app)/layout.js          shell protégé : auth + gate d'abonnement + sidebar
  (app)/dashboard/         tableau de bord
  (app)/nouvelle/          nouvelle commande
  (app)/commandes/         historique des commandes
  (app)/tresorerie/        évolution du CA et de la marge dans le temps
  (app)/articles/          stock / articles / catégories / réappro
  (app)/clients/           clients
  (app)/catalogue/         catalogue partageable (WhatsApp / impression)
  (app)/parametres/        boutique, thème, zones de livraison, notifications, formule
  (app)/parametres/formule/   changement de formule (liste → détail → paiement)
  (app)/aide/              support (WhatsApp / e-mail)
  (app)/admin/             espace Administration (visible si is_admin, portée limitée à l'abonnement)
  (app)/admin/commercants/[id]/   page de détail d'un commerçant (justificatif, actions)
  (app)/admin/paiements/   liste dédiée des paiements en attente (accès permanent, bouton + badge sur /admin)
  api/push-admin-paiement/    route serveur : notification push (web-push), appelée depuis Supabase (pg_net) à la soumission d'un justificatif
  api/cron/expiration-reminders/   route serveur : rappel d'abonnement qui expire (Vercel Cron)
components/
  Sidebar.js, Receipt.js, ImageUploadField.js, PlanGrid.js,
  FormuleEtPaiement.js, PremierPaiement.js, Reabonnement.js, CompteSuspendu.js,
  PaiementAbonnement.js   flux de paiement Wave (montant, QR/tél., upload, historique)
  FloatingBlobs.js, PlatformLogo.js   fond animé + logo partagés par les écrans d'entrée (voir « Fond animé des écrans d'entrée »)
  LandingPage.js           site vitrine public (voir « Site vitrine public » ci-dessous)
  ModuleMockup.js, Reveal.js, Counter.js   maquettes de module, révélation au défilement, compteurs animés (site vitrine)
  DeviceComposition.js, FooterSupport.js   composition ordinateur/téléphone du héros, support WhatsApp/e-mail du pied de page (site vitrine)
lib/
  supabaseClient.js        client Supabase (browser)
  AuthProvider.js          contexte auth + création automatique de la ligne business
  push.js                  activation des notifications push (voir « Notifications push (Web Push) »)
  constants.js, format.js
  i18n/                    dictionnaires fr.js / en.js + t() (voir « Langue » ci-dessus)
public/
  sw.js                    service worker minimal (notifications push uniquement, pas de cache offline)
```

## Limitations connues / suite

- **Sécurité RLS à durcir avant la mise en prod payante** : la policy
  `businesses for all using (owner_id = auth.uid())` du schéma autorise un
  commerçant à modifier n'importe quelle colonne de sa propre ligne, y
  compris `subscription_status`, `subscription_expires_at` (donc,
  potentiellement, à se prolonger un essai/abonnement indéfiniment) **et
  `is_admin`** (donc, potentiellement, à s'auto-attribuer les droits admin
  et accéder à `/admin` — les données des autres commerçants restent
  cependant protégées tant que le compte n'est pas physiquement compromis,
  puisque cette policy ne donne accès qu'à sa propre ligne). Tant que le
  paiement CinetPay n'est pas branché (qui devra passer par une clé
  `service_role` côté serveur, jamais exposée au client), il est recommandé
  de restreindre l'`UPDATE` de cette table aux colonnes non liées à la
  facturation/aux droits admin (ex. policy dédiée ou colonnes gérées
  uniquement via une fonction serveur).
- **Photo d'article et logo de la boutique** : upload réel vers Supabase
  Storage (voir section dédiée ci-dessus).
- Remplacer une photo (ou repasser sur « Sans catégorie » côté image, ou
  changer le logo ou le QR Wave) ne supprime pas l'ancien fichier du
  bucket, et chaque justificatif de paiement envoyé y reste indéfiniment
  (aucune suppression automatique après vérification) — nettoyage à
  prévoir plus tard si le volume de fichiers orphelins devient significatif.
- **Numérotation des commandes** (`next_numero`) et mise à jour du stock
  (au passage « Livré ») ne sont pas transactionnelles (plusieurs appels
  Supabase séquentiels) — rare collision possible en cas d'usage concurrent
  intense. À terme, une fonction RPC Postgres (transaction unique)
  sécuriserait ce flux.
- **Stock théorique sur-engagé** : rien n'empêche plusieurs commandes en
  attente de couvrir ensemble plus que le stock réel d'un article (chacune
  est seulement plafonnée par le stock réel au moment de sa propre
  création) — c'est justement ce que la colonne « Stock théorique » et son
  badge « Totalement commandé » signalent, à charge pour le commerçant
  d'arbitrer laquelle honorer en premier au moment de livrer.
- **Paiement CinetPay** (prélèvement en ligne automatisé) n'est pas encore
  branché, conformément à `smartbiz-backend-roadmap.md` — le paiement
  manuel Wave vérifié (voir section dédiée) fait le pont en attendant.
  **Resend** n'est branché que pour la notification admin de nouveau
  justificatif ; les autres notifications prévues dans Paramètres
  (confirmations de commande, rapports de stock) restent à faire.
- Le prix de départ de l'abonnement (5 000 FCFA/mois) est une valeur
  indicative, modifiable à tout moment depuis Paramètres → Paiement Wave.
