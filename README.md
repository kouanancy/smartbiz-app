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

Exécute aussi une fois `supabase-clients-actif-migration.sql` (ajoute la
colonne `clients.actif`, nécessaire à la désactivation de clients — voir
« Clients : suppression vs désactivation » plus bas).

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
   `businesses` avec `owner_id = auth.uid()` et le statut par défaut
   `subscription_status = 'en_attente_paiement'` (valeur par défaut de la
   colonne, définie dans le schéma).
3. Tant que ce statut n'est pas `actif`, l'accès à l'application (Tableau de
   bord, Commandes, Articles, Clients, Catalogue, Paramètres) est bloqué —
   l'utilisateur voit un écran « Abonnement en attente de paiement ».
4. Le passage à `actif` se fera via le webhook CinetPay (voir
   `smartbiz-backend-roadmap.md`), pas encore branché à ce stade.

## Photos d'articles

Les photos (formulaires « Nouvel article » et « Modifier l'article ») sont
envoyées vers **Supabase Storage**, bucket `article-photos` :

1. Choix de fichier classique (sélecteur natif du navigateur — sur mobile,
   ça propose automatiquement appareil photo ou galerie) ou copier-coller
   d'image (Ctrl+V, une fois la zone cliquée).
2. Aperçu immédiat pendant l'envoi (`components/ImageUploadField.js`).
3. Le fichier est stocké sous `<business_id>/<uuid>.<extension>` et l'URL
   publique renvoyée par Supabase est enregistrée dans `articles.image_url`.

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
components/
  Sidebar.js, PendingSubscription.js, Receipt.js, ImageUploadField.js
lib/
  supabaseClient.js        client Supabase (browser)
  AuthProvider.js          contexte auth + création automatique de la ligne business
  constants.js, format.js
```

## Limitations connues / suite

- **Sécurité RLS à durcir avant la mise en prod payante** : la policy
  `businesses for all using (owner_id = auth.uid())` du schéma autorise un
  commerçant à modifier n'importe quelle colonne de sa propre ligne,
  y compris `subscription_status`. Tant que le paiement CinetPay n'est pas
  branché (qui devra passer par une clé `service_role` côté serveur, jamais
  exposée au client), il est recommandé de restreindre l'`UPDATE` de cette
  table aux colonnes non liées à la facturation (ex. policy dédiée ou
  colonnes gérées uniquement via une fonction serveur).
- **Photo d'article** : upload réel vers Supabase Storage (voir section
  dédiée ci-dessus). Le **logo de la boutique** (`businesses.logo_url`,
  page Paramètres) utilise encore un simple champ URL — le même composant
  `ImageUploadField` pourrait s'y brancher si besoin.
- Remplacer une photo (ou repasser sur « Sans catégorie » côté image) ne
  supprime pas l'ancien fichier du bucket — nettoyage à prévoir plus tard
  si le volume de fichiers orphelins devient significatif.
- **Numérotation des commandes** (`next_numero`) et mise à jour du stock ne
  sont pas transactionnelles (plusieurs appels Supabase séquentiels) — rare
  collision possible en cas d'usage concurrent intense. À terme, une fonction
  RPC Postgres (transaction unique) sécuriserait ce flux.
- **Paiement CinetPay** et **notifications e-mail (Resend)** ne sont pas
  encore branchés, conformément à `smartbiz-backend-roadmap.md`.
