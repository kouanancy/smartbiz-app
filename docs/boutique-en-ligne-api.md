# API Boutique en ligne

Module expérimental (réservé pour l'instant aux comptes admin) qui connecte
Doka à un site e-commerce externe. Ce document décrit le contrat d'échange
entre les deux systèmes.

## Principe

Doka reste la référence pour la marchandise : articles, réceptions,
inventaire, stock, prix de vente, photo principale (`articles.image_url`).
Le site gère la vitrine : description détaillée, photos supplémentaires,
promotions. Rien de saisi sur le site ne modifie jamais un article Doka.

- **Doka → site** : à chaque changement utile d'un article proposé en
  ligne (création, prix, stock, réservation, photo, nom, désactivation,
  retrait de la vente en ligne), Doka envoie l'article au site.
- **Site → Doka** : chaque commande passée sur le site crée une commande
  Doka `en_attente` (stock réservé, comme toute commande en attente). Le
  site envoie ensuite `livree` ou `annulee`. Ces commandes sont gérées
  depuis l'administration du site et restent **en lecture seule dans
  Doka** : ni leur statut, ni leurs lignes ne peuvent être modifiés
  directement dans l'application (seules les RPC `service_role`
  ci-dessous peuvent les changer — des triggers de verrouillage bloquent
  toute autre écriture).

Le code ne mentionne jamais un site en particulier : le module s'appelle
« Boutique en ligne » et peut être proposé à n'importe quel commerçant.

## Activation

Le module est contrôlé par `businesses.module_boutique_en_ligne_actif`,
jamais modifiable par le commerçant — uniquement par un administrateur,
depuis la fiche du commerçant dans Administration (bouton « Activer/
Désactiver la Boutique en ligne »), qui appelle la fonction
`admin_set_module_boutique_en_ligne_actif(p_business_id, p_actif)`.

Tant que le module est inactif pour une boutique :
- aucun écran, bouton ou appel réseau supplémentaire côté commerçant ;
- toutes les routes `/api/boutique/v1/*` répondent `403 module_inactif`.

Une fois le module activé pour une boutique, depuis **Paramètres → Boutique
en ligne**, le commerçant peut :

1. Enregistrer l'adresse du site (`https://...`).
2. Générer une clé de connexion (affichée en clair **une seule fois**).
3. Tester la connexion.
4. Renvoyer tous les articles proposés en ligne (rattrapage initial ou en
   cas de désynchronisation).

## Authentification des appels du site vers Doka

Toutes les routes `GET/POST /api/boutique/v1/*` attendent l'en-tête :

```
Authorization: Bearer <clé>
```

Doka calcule le sha256 de la clé reçue et retrouve la boutique
correspondante par `cle_hash` (la clé n'est jamais comparée ni stockée en
clair côté recherche). Si le module n'est pas actif pour cette boutique,
la requête échoue même avec une clé par ailleurs valide.

## Format d'erreur

Toutes les erreurs de l'API `/api/boutique/v1/*` ont la forme :

```json
{ "error": { "code": "...", "message": "..." } }
```

| Code | Statut HTTP | Signification |
|---|---|---|
| `non_autorise` | 401 | Clé manquante ou invalide |
| `module_inactif` | 403 | Module Boutique en ligne non activé pour cette boutique |
| `introuvable` | 404 | Commande ou ressource introuvable |
| `donnees_invalides` | 422 | Corps de requête invalide |
| `article_inconnu` | 422 | `article_id` inexistant pour cette boutique |
| `article_non_propose` | 422 | Article non actif ou non proposé en ligne |
| `statut_incompatible` | 409 | Changement de statut refusé (ex. commande déjà annulée) |
| `stock_insuffisant` | 409 | Stock réel insuffisant pour livrer (voir détail ci-dessous) |
| `erreur_interne` | 500 | Erreur inattendue côté serveur |

Les réponses ne contiennent jamais `prix_achat` ni `frais_annexes`.

## Endpoints

### `GET /api/boutique/v1/ping`

Vérifie que la clé est valide et que le module est actif.

```json
{ "ok": true, "boutique": "Ma boutique" }
```

### `GET /api/boutique/v1/articles`

Renvoie tous les articles proposés en ligne (`propose_en_ligne = true`),
actifs ou non — c'est au site de masquer ceux dont `actif` est `false`.

```json
{ "articles": [ /* ArticleBoutique, ... */ ] }
```

### `POST /api/boutique/v1/commandes`

Crée une commande `en_attente` dans Doka à partir d'une commande passée
sur le site.

Corps de la requête :

```json
{
  "reference": "NHL-0142",
  "client": { "nom": "Aïcha K.", "telephone": "0700000000", "adresse": "Cocody, Riviera 3" },
  "lignes": [
    { "article_id": "<uuid>", "quantite": 1, "prix_unitaire": 36000, "offert": false }
  ],
  "livraison": { "type": "livraison", "zone": "Cocody", "frais": 2000 },
  "paiement": { "mode": "livraison", "operateur": null }
}
```

Règles :
- `reference` : obligatoire, 1 à 40 caractères, unique par boutique
  (clé d'idempotence — une requête déjà traitée avec cette référence
  renvoie la commande existante sans rien recréer).
- `lignes` : au moins une ligne ; chaque `article_id` doit correspondre à
  un article actif et proposé en ligne de cette boutique ; `quantite`
  entier ≥ 1 ; `prix_unitaire` : prix réellement payé par unité après
  promotions éventuelles (devient `commande_lignes.prix_vente`) ;
  `offert: true` force le prix de vente à 0. Le coût d'achat et les frais
  annexes sont toujours repris depuis la fiche article Doka — jamais
  envoyés par le site. CA et marge sont calculés comme dans l'écran
  Nouvelle commande.
- `livraison.type` : `"livraison"` ou `"boutique"`.
- `paiement.mode` : `"livraison"` ou `"mobile_money"` (avec `operateur`).
- Client : recherché par téléphone normalisé (chiffres uniquement, préfixe
  225 retiré si le numéro fait alors 10 chiffres) parmi les clients déjà
  connus de la boutique ; sinon créé.

Réponse `201` (ou `200` si la référence existait déjà) :

```json
{ "commande_id": "<uuid>", "numero": "CMD-0388", "statut": "en_attente" }
```

### `POST /api/boutique/v1/commandes/{reference}/statut`

Change le statut d'une commande déjà créée depuis le site.

Corps : `{ "statut": "livree" }` ou `{ "statut": "annulee" }`.

- `"livree"` : vérifie d'abord que le stock **réel** de chaque article
  suffit (idempotent si déjà livrée ; refusé si la commande est déjà
  annulée). En cas de stock insuffisant, réponse `409` :

  ```json
  {
    "error": {
      "code": "stock_insuffisant",
      "message": "Stock insuffisant pour livrer cette commande.",
      "articles": [ { "article_id": "<uuid>", "nom": "Bob lisse HD noir", "stock": 2, "demande": 3 } ]
    }
  }
  ```

  Sinon, la commande passe `livree`, `paye_totalite = true`, et le stock
  est déduit — tout en une seule transaction.
- `"annulee"` : uniquement depuis `en_attente` (idempotent si déjà
  annulée ; refusé si déjà livrée).

Réponse : `{ "numero": "CMD-0388", "statut": "livree" }`.

## Format `ArticleBoutique`

```json
{
  "id": "<uuid>",
  "code": "A-0012",
  "nom": "Bob lisse HD noir",
  "categorie": "Perruques",
  "prix_vente": 45000,
  "stock_reel": 7,
  "stock_reserve": 2,
  "stock_disponible": 5,
  "unite": "unite",
  "image_url": "https://…",
  "actif": true,
  "propose_en_ligne": true,
  "maj_le": "2026-01-01T12:00:00.000Z"
}
```

`stock_disponible = max(0, stock_reel - stock_reserve)`. `stock_reserve`
est la somme des quantités (cadeaux compris) des lignes de commandes
`en_attente` de cet article — le même calcul que le stock théorique déjà
utilisé ailleurs dans Doka.

## Webhook sortant (Doka → site)

Quand un article proposé en ligne change (création, prix, stock, photo,
nom, catégorie, code, unité, désactivation, ou retrait de la vente en
ligne), Doka envoie :

```
POST {site_url}/api/doka/webhook
Authorization: Bearer <clé>
Content-Type: application/json
```

```json
{
  "evenement": "article.maj",
  "article": { /* ArticleBoutique */ },
  "envoye_le": "2026-01-01T12:00:00.000Z"
}
```

Cet envoi ne bloque et ne fait jamais échouer l'opération Doka d'origine :
toute erreur (site injoignable, timeout, URL mal configurée) est capturée
en silence. Un même événement peut être envoyé plusieurs fois (le site
doit l'absorber de façon idempotente).

Le bouton « Tester la connexion » des Paramètres envoie un événement
`{"evenement": "ping", "envoye_le": "..."}` au même webhook, pour vérifier
que le site répond.

## Mise en route

1. Un administrateur active le module pour la boutique concernée
   (Administration → fiche du commerçant → « Activer la Boutique en
   ligne »).
2. Exécuter la migration `supabase-boutique-en-ligne-migration.sql` dans
   l'éditeur SQL du projet Supabase (voir README.md pour la procédure
   générale des migrations).
3. Dans **Paramètres → Boutique en ligne**, renseigner l'adresse du site
   (`https://...`) et cliquer sur « Enregistrer ».
4. Cliquer sur « Générer la clé de connexion » et la copier immédiatement
   (elle ne sera plus jamais affichée en clair).
5. Reporter cette clé dans la configuration du site (variables
   d'environnement) :

   ```
   DOKA_API_URL=https://www.doka.ci
   DOKA_API_KEY=<clé copiée à l'étape 4>
   ```

6. Cliquer sur « Tester la connexion » pour vérifier que le site répond.
7. Cliquer sur « Tout renvoyer au site » pour synchroniser une première
   fois tous les articles déjà proposés en ligne.

## Note sur `extensions.gen_random_bytes` / `extensions.digest`

La migration suppose que l'extension `pgcrypto` est installée dans le
schéma `extensions`, convention par défaut d'un projet Supabase. Si ce
n'est pas le cas sur l'environnement cible, adapter les deux appels
correspondants dans `boutique_en_ligne_generer_cle()` vers le schéma réel
avant d'exécuter la migration.
