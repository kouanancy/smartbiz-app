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
`supabase-paiements-manuels-migration.sql`).

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
voir plus bas). Actions par ligne :

- **Marquer comme payé** (masqué sur les lignes déjà admin, dont
  l'abonnement n'a pas d'effet sur l'accès) : `subscription_status →
  'actif'` et `subscription_expires_at →` aujourd'hui + 1 mois, quel que
  soit le statut ou la date précédente — le pendant manuel de ce que fera
  le webhook CinetPay plus tard, via `admin_mark_subscription_paid`. Si un
  justificatif est en attente pour ce commerçant, il passe aussi à
  `reussi`. Une vignette cliquable ouvre un aperçu du justificatif à
  contrôler avant de cliquer, et un bouton « Rejeter » (visible seulement
  s'il y a un justificatif en attente) ouvre une modale demandant une
  raison, affichée au commerçant — voir « Paiement manuel vérifié » plus
  bas.
- **Donner/Retirer les droits admin** (`admin_set_is_admin`) : toujours
  actif, y compris sur sa propre ligne.

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
ligne (créée par la migration), lisible publiquement (QR/numéro/prix n'ont
rien de confidentiel — voir aussi « Logo Doka » ci-dessous pour
pourquoi la lecture est publique et pas seulement réservée aux comptes
connectés) mais modifiable uniquement par un administrateur, depuis une
carte dédiée dans Paramètres (visible si `business.is_admin`) réutilisant
`ImageUploadField` pour le QR exactement comme le logo de la boutique.

Nécessite `supabase-paiements-manuels-migration.sql` (voir Démarrage), à
exécuter après `supabase-businesses-admin-migration.sql`.

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

- l'upload du logo original (`parametres_globaux.logo_url`) ;
- la génération, côté client via `<canvas>`, de trois variantes carrées
  (découpe centrée façon "cover", pas de bandes vides) : 192×192 et
  512×512 pour le manifest PWA, 180×180 pour l'icône Apple
  (`icon_192_url`, `icon_512_url`, `icon_apple_180_url`). Le
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
- **Pied de page « Propulsé par Doka » des reçus**
  (`components/Receipt.js`) : petite icône ajoutée devant le texte, dans
  l'aperçu écran et la version imprimée.

Chaque point de consommation lit `parametres_globaux` avec repli
silencieux en cas d'échec (aucune session au moment de la lecture pour la
page de connexion et le manifest — d'où la policy de lecture publique
introduite par la migration ci-dessous).

Nécessite `supabase-parametres-globaux-logo-migration.sql` (voir
Démarrage), à exécuter après `supabase-paiements-manuels-migration.sql`.

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
- **E-mail** : adresse fixe `contact@doka.ci`, bouton `mailto:` en repli.

## Structure

```
app/
  layout.js               root layout (police, AuthProvider)
  page.js                 redirection selon l'état de connexion
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
  (app)/parametres/        boutique, thème, zones de livraison, notifications
  (app)/aide/              support (WhatsApp / e-mail)
  (app)/admin/             espace Administration (visible si is_admin, portée limitée à l'abonnement)
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
