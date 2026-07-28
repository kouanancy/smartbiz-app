# SmartBiz — passage au backend réel

## Où on en est
Le fichier `smartbiz.jsx` est un prototype qui fonctionne entièrement en mémoire
(les données disparaissent si on recharge la page). Le fichier `smartbiz-schema.sql`
ci-joint est la vraie base de données prête à l'emploi pour la formule autonome :
un commerçant = un compte = un espace isolé.

## Étapes pour rendre ça vendable (formule autonome)

1. **Créer un projet Supabase** (gratuit pour démarrer)
   - Aller sur supabase.com, créer un projet.
   - Ouvrir l'éditeur SQL et coller le contenu de `smartbiz-schema.sql`.
   - Activer l'authentification par e-mail/mot de passe dans Supabase Auth.

2. **Créer le projet Next.js**
   - `npx create-next-app@latest smartbiz-app`
   - Installer le client Supabase : `npm install @supabase/supabase-js`
   - Connecter avec les clés du projet Supabase (URL + clé publique).

3. **Page d'inscription/connexion**
   - Un commerçant crée un compte → une ligne est automatiquement créée dans
     `businesses` avec son `owner_id`.
   - C'est ce compte qui donne accès uniquement à ses propres données (grâce
     aux règles de sécurité déjà écrites dans le schéma).

4. **Migrer l'interface actuelle**
   - Le fichier `smartbiz.jsx` sert de base : la structure des écrans
     (Dashboard, Articles, Clients, Commandes, Catalogue, Paramètres) ne change pas.
   - Chaque `useState` qui contient des données (articles, clients, commandes...)
     est remplacé par un appel Supabase (lecture au chargement, écriture à
     chaque ajout/modification) au lieu de rester en mémoire locale.

5. **Déploiement**
   - Héberger sur Vercel (gratuit pour démarrer, connecté à Next.js).
   - Chaque commerçant utilise la même appli, avec son propre compte.

6. **Notifications par e-mail** (déjà prévu dans les Paramètres)
   - Ajouter un service comme Resend pour l'envoi réel des rapports de stock
     et confirmations par e-mail.

## Ce qui ne change pas
Frais annexes, marge réelle, catalogue partageable, personnalisation, bouton
WhatsApp — toute la logique métier déjà construite dans le prototype se
retrouve telle quelle, seule la façon de stocker les données change.

## Paiement des abonnements (accès payant)

**Réalité technique en Côte d'Ivoire** : le vrai prélèvement automatique et
silencieux (comme une carte bancaire qui se débite toute seule) n'est pas
encore fiable avec le Mobile Money — seuls Orange Money CI et MTN MoMo CI le
proposent nativement, et l'agrégateur ivoirien **CinetPay** a un module
d'abonnement encore en beta. Autant partir sur une solution qui marche à
coup sûr dès maintenant :

1. **CinetPay** comme passerelle : couvre Orange Money, MTN MoMo, Moov Money,
   Wave et cartes bancaires en une seule intégration.
2. **Renouvellement semi-automatique** : chaque commerçant reçoit un lien de
   paiement (par e-mail ou dans l'appli) à sa date de renouvellement — il
   clique, paie en Mobile Money en quelques secondes, l'abonnement est
   prolongé automatiquement dès la confirmation du paiement (webhook CinetPay).
3. **Blocage automatique en cas de non-paiement** : le champ
   `subscription_status` de la table `businesses` passe à `expire` si la date
   `subscription_expires_at` est dépassée sans paiement reçu — l'application
   affiche alors un écran "Renouveler mon abonnement" à la place du Dashboard.
4. La table `paiements_abonnement` garde l'historique de chaque paiement.

C'est la même logique que beaucoup de SaaS locaux utilisent : pas un vrai
prélèvement invisible, mais un paiement à un clic qui revient au même en
pratique pour le commerçant.
