# SmartBiz — app Next.js + Supabase

Mini ERP pour petits commerçants (formule autonome). Cette app remplace le
prototype `smartbiz.jsx` (données en mémoire) par une vraie application
Next.js connectée à Supabase, avec authentification, isolation des données
par boutique (Row Level Security) et abonnement payant.

## Stack

- Next.js 16 (App Router, JavaScript)
- `@supabase/supabase-js` (auth + base de données Postgres)
- `recharts` (graphique du tableau de bord)
- `lucide-react` (icônes)

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
précédente ait déjà été exécutée).

## Variables d'environnement

Voir `.env.local.example`. Ces deux clés viennent de **Project Settings →
API** dans Supabase. La clé publique (`sb_publishable_...` ou l'ancienne clé
`anon`) est faite pour être exposée côté client — la sécurité est assurée par
les règles RLS définies dans `smartbiz-schema.sql`, pas par le secret de la
clé.

`.env.local` n'est jamais commité (voir `.gitignore`).

## Fonctionnement du compte / abonnement

1. Un commerçant crée un compte sur `/login` (onglet « Créer un compte »).
2. À la première connexion, une ligne est automatiquement créée dans
   `businesses` avec `owner_id = auth.uid()`, `subscription_status = 'essai'`
   et `subscription_expires_at` = date de création + 7 jours (colonne déjà
   présente dans `smartbiz-schema.sql`, jusque-là inutilisée — voir
   `lib/AuthProvider.js`, `ensureBusiness`).
3. **Pendant l'essai**, l'accès à l'application est complet, comme avec un
   abonnement `actif`. La sidebar affiche un indicateur discret du nombre de
   jours restants (« Essai — X jours restants »).
4. **À l'expiration** de `subscription_expires_at`, le statut bascule
   automatiquement — l'application n'ayant pas de tâche planifiée côté
   serveur, cette bascule est vérifiée paresseusement à chaque connexion /
   chargement de la boutique (`verifierExpirationAbonnement` dans
   `lib/AuthProvider.js`) plutôt que par un cron. Deux cas selon le statut
   précédent : un essai dépassé (jamais payé) passe à
   `en_attente_paiement` ; un abonnement `actif` dépassé (payé, puis
   expiré) passe à `expire`, avec son propre écran « Abonnement expiré ».
   Dans les deux cas, l'accès à l'application (Tableau de bord, Commandes,
   Articles, Clients, Catalogue, Paramètres) est bloqué.
5. Le passage à `actif` (fin d'essai payée ou renouvellement classique) se
   fait via le circuit de paiement manuel vérifié décrit ci-dessous
   (« Marquer comme payé » dans l'espace Administration, une fois le
   justificatif contrôlé) ; le webhook CinetPay (voir
   `smartbiz-backend-roadmap.md`) l'automatisera plus tard — indépendamment
   du statut précédent.

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

## Stock théorique

Le stock affiché sur la page Articles (`articles.stock`) est le stock réel.
À côté, la colonne **Stock théorique** = stock réel − somme des quantités de
cet article dans les commandes encore `en_attente`. Un article dont le stock
théorique tombe à 0 (ou moins, si plusieurs commandes en attente dépassent
ensemble le stock réel) affiche un badge « Totalement commandé ».

Dans **Nouvelle commande**, sélectionner un article dont le stock théorique
est ≤ 0 affiche un avertissement à cet endroit précis (« Cet article est
déjà totalement commandé... ») — l'article reste sélectionnable tant que le
stock réel le permet, l'avertissement sert seulement à prévenir un
sur-engagement avant de valider.

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

Les lignes dont l'abonnement (`actif` ou `essai`) expire dans les 7 jours
à venir sont mises en évidence (fond ambre, badge « Expire bientôt ») et
triées en premier. Deux actions par ligne :

- **Marquer comme payé** : `subscription_status → 'actif'` et
  `subscription_expires_at →` aujourd'hui + 1 mois, quel que soit le
  statut ou la date précédente — le pendant manuel de ce que fera le
  webhook CinetPay plus tard. Si un justificatif est en attente pour ce
  commerçant, il passe aussi à `reussi`. Un lien « Voir » (nouvel onglet)
  ouvre le justificatif à contrôler avant de cliquer, et un bouton
  « Rejeter » (visible seulement s'il y a un justificatif en attente)
  ouvre une modale demandant une raison, affichée au commerçant — voir
  « Paiement manuel vérifié » plus bas.
- **Donner/Retirer les droits admin** : bascule `is_admin`. Désactivé sur
  sa propre ligne pour éviter de se retirer ses propres droits par erreur
  (il faut alors passer par un autre compte admin, ou l'éditeur SQL
  Supabase).

**Accès multi-comptes** : comme `businesses` n'a par défaut qu'une policy
RLS restreignant chaque commerçant à sa propre ligne
(`owner_id = auth.uid()`), l'espace Administration a besoin d'une policy
supplémentaire pour voir/modifier toutes les lignes. Une sous-requête RLS
classique sur `businesses` à l'intérieur de sa propre policy provoquerait
une récursion RLS ; la migration contourne ça avec une fonction
`is_admin_user()` en `security definer` (qui lit `is_admin` avec les
privilèges de son propriétaire, donc sans re-déclencher le RLS), utilisée
comme condition de la policy admin.

`businesses.email` (dupliqué depuis `auth.users`, schéma protégé non
accessible depuis le client) est renseigné à l'inscription
(`lib/AuthProvider.js`) et rétroactivement pour les comptes déjà existants
par la migration elle-même.

Nécessite `supabase-businesses-admin-migration.sql` (voir Démarrage), qui
attribue aussi les droits admin au compte `koua.nancy@gmail.com` — si ce
compte ne s'est pas encore inscrit au moment où tu exécutes la migration,
relance-la après sa première connexion.

## Paiement manuel vérifié

En attendant le webhook CinetPay, l'abonnement se paie via Wave puis se
vérifie à la main : le commerçant paie et envoie une preuve, l'admin
contrôle et débloque. Toute la logique vit dans
`components/PaiementAbonnement.js`, un composant partagé monté à deux
endroits :

- **`PendingSubscription.js`** (écran de blocage) : seul endroit accessible
  à un compte dont le statut n'est ni `actif` ni `essai` (le shell normal
  de l'app, sidebar comprise, ne se rend pas du tout dans ce cas), donc
  c'est là que doit vivre le flux complet pour un compte bloqué. Absent
  pour un compte `suspendu` (une suspension n'est pas forcément liée à un
  impayé).
- **Carte « Abonnement » de `parametres/page.js`** : pour un renouvellement
  anticipé pendant que le compte est encore `actif` ou en `essai` (page
  seulement accessible dans ce cas, donc jamais en double avec l'écran de
  blocage).

**Ce que montre le composant** : le prix (`parametres_globaux.abonnement_prix`,
formaté selon la devise de la boutique comme partout ailleurs), le QR Wave
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

**À l'envoi d'un justificatif** (`ImageUploadField` → Storage → URL
publique) : une ligne est insérée dans `paiements_abonnement` avec
`statut = 'en_attente'`, `montant` = prix courant au moment de l'envoi
(figé, comme les prix sur `commande_lignes`), puis un appel best-effort à
`POST /api/notify-admin-payment` (route serveur Next.js, jamais exposée au
client) envoie un e-mail à l'administratrice via l'API REST de Resend. Un
échec de cet appel (clé absente, Resend indisponible...) n'empêche jamais
le commerçant de considérer son envoi comme réussi — l'admin voit de toute
façon les paiements en attente dans `/admin`. Nécessite `RESEND_API_KEY`
(et idéalement `RESEND_FROM_EMAIL` avec un domaine vérifié dans Resend,
sans quoi l'adresse sandbox par défaut ne peut envoyer qu'à l'adresse du
compte Resend lui-même) — voir `.env.local.example`.

**Sécurité RLS** : la policy d'origine sur `paiements_abonnement`
(`for all`, propriétaire de la boutique) permettait à un commerçant de
faire passer lui-même son paiement à `reussi` sans jamais payer. La
migration la remplace par deux policies restreintes au commerçant
(lecture de ses propres lignes ; insertion limitée à
`statut = 'en_attente'`) plus une policy admin complète
(`is_admin_user()`, même fonction que pour `businesses`) — seul un
administrateur peut faire passer un paiement à `reussi` ou `echoue`.

**Réglages globaux** : `parametres_globaux` est une table à une seule
ligne (créée par la migration), lisible par tout compte connecté
(QR/numéro/prix n'ont rien de confidentiel) mais modifiable uniquement par
un administrateur, depuis une carte dédiée dans Paramètres (visible si
`business.is_admin`) réutilisant `ImageUploadField` pour le QR exactement
comme le logo de la boutique.

Nécessite `supabase-paiements-manuels-migration.sql` (voir Démarrage), à
exécuter après `supabase-businesses-admin-migration.sql`.

## Structure

```
app/
  layout.js               root layout (police, AuthProvider)
  page.js                 redirection selon l'état de connexion
  login/page.js            inscription / connexion
  (app)/layout.js          shell protégé : auth + gate d'abonnement + sidebar
  (app)/dashboard/         tableau de bord
  (app)/nouvelle/          nouvelle commande
  (app)/commandes/         historique des commandes
  (app)/articles/          stock / articles / catégories / réappro
  (app)/clients/           clients
  (app)/catalogue/         catalogue partageable (WhatsApp / impression)
  (app)/parametres/        boutique, thème, zones de livraison, notifications
  (app)/admin/             espace Administration (visible si is_admin)
  api/notify-admin-payment/   route serveur : e-mail Resend à la soumission d'un justificatif
components/
  Sidebar.js, PendingSubscription.js, Receipt.js, ImageUploadField.js,
  PaiementAbonnement.js   flux de paiement Wave (montant, QR/tél., upload, historique)
lib/
  supabaseClient.js        client Supabase (browser)
  AuthProvider.js          contexte auth + création automatique de la ligne business
  constants.js, format.js
  i18n/                    dictionnaires fr.js / en.js + t() (voir « Langue » ci-dessus)
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
