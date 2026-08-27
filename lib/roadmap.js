import {
  Banknote,
  Boxes,
  Building2,
  Calculator,
  CreditCard,
  FileSpreadsheet,
  Gauge,
  Handshake,
  Heart,
  History,
  LayoutGrid,
  Lock,
  MessageCircle,
  PackageCheck,
  Palette,
  Percent,
  Receipt,
  Share2,
  ShoppingBag,
  Sparkles,
  Store,
  Truck,
  TrendingUp,
  UserCog,
  Wallet,
  Bell,
} from "lucide-react";

// Contenu de la feuille de route publique (app/feuille-de-route/page.js) —
// 4 phases (1 déjà là, 3 à venir), chacune avec sa couleur pour bien les
// distinguer visuellement (schéma du haut + bordure des capsules). Jamais
// de nouvelle palette : couleurs déjà posées sur .sb-landing
// (app/globals.css) et déjà visibles ailleurs sur le site vitrine (badges
// de formule, statuts, textes secondaires) — référencées ici via var(...)
// plutôt que recopiées en dur, pour rester automatiquement synchronisées
// si ces couleurs venaient à changer.
//
// Extrait de la page elle-même dans ce fichier séparé (demande explicite)
// pour que "disponible" soit piloté depuis une donnée centralisée qu'on
// met à jour ici, en un seul endroit, à chaque livraison — jamais en
// retouchant le texte de la page vitrine elle-même. Dès qu'une
// fonctionnalité passe disponible: true, sa coche passe automatiquement du
// gris au vert sur /feuille-de-route (voir sb-roadmap-feature-statut-ok
// dans app/globals.css), sans autre changement.
export const ROADMAP_PHASES = [
  {
    numero: 1,
    nom: "Vos fondamentaux",
    // Orange de marque (--accent) plutôt que le vert initial (encore
    // écarté, deuxième retour sur cette couleur) : seule teinte de
    // l'identité Doka pas encore utilisée par une autre phase, cohérente
    // avec le reste du site (bouton principal, icône du teaser).
    couleur: "var(--accent)",
    couleurBg: "rgba(224, 122, 41, 0.16)",
    icone: Sparkles,
    fonctionnalites: [
      {
        icone: Boxes,
        nom: "Suivi de stock en temps réel",
        description: "Stock réel et stock théorique (déjà réservé par des commandes en attente)",
        disponible: true,
      },
      {
        icone: Calculator,
        nom: "Marge réelle automatique",
        description: "Frais annexes (transport, import) inclus dans le calcul, pas juste prix de vente − prix d'achat",
        disponible: true,
      },
      {
        icone: PackageCheck,
        nom: "Commandes avec livraison et paiement intégrés",
        description: "Zones de livraison, Mobile Money, confirmation envoyée sur WhatsApp",
        disponible: true,
      },
      {
        icone: LayoutGrid,
        nom: "Catalogue partageable",
        description: "Prêt pour WhatsApp, Instagram, ou impression PDF",
        disponible: true,
      },
      {
        icone: Wallet,
        nom: "Trésorerie",
        description: "Suivi du CA et de la marge dans le temps, avec export",
        disponible: true,
      },
      {
        icone: Palette,
        nom: "Personnalisation complète",
        description: "Logo, couleurs, devise, langue de chaque boutique",
        disponible: true,
      },
      {
        icone: Bell,
        nom: "Notifications en temps réel",
        description: "Centre de notifications et alertes directement sur l'appareil",
        disponible: true,
      },
      {
        icone: Lock,
        nom: "Données strictement confidentielles",
        description: "Chaque boutique isolée, jamais visible par un autre commerçant",
        disponible: true,
      },
    ],
  },
  {
    numero: 2,
    nom: "Mieux piloter",
    // Gris clair (--muted) plutôt qu'une couleur vive : demande explicite
    // à la place du vert initial, qui se confondait visuellement avec le
    // vert "disponible" des coches de fonctionnalités.
    couleur: "var(--muted)",
    couleurBg: "rgba(196, 192, 186, 0.16)",
    icone: Gauge,
    fonctionnalites: [
      {
        icone: History,
        nom: "Historique client enrichi",
        description: "Date du dernier achat et produit favori directement sur la fiche cliente",
        disponible: true,
      },
      {
        icone: TrendingUp,
        nom: "Statistiques des produits les plus vendus",
        description: "Savoir quoi remettre en avant et quoi arrêter de stocker",
        disponible: true,
      },
      {
        icone: Percent,
        nom: "Comparaison du chiffre d'affaires au mois dernier",
        description: "Une variation en % mise en avant, pas juste des chiffres côte à côte",
        disponible: false,
      },
      {
        icone: MessageCircle,
        nom: "Rapport hebdomadaire enrichi",
        description: "Un résumé de toute l'activité (CA, marge, points clés) par WhatsApp ou notification, pas seulement le stock",
        disponible: true,
      },
      {
        icone: FileSpreadsheet,
        nom: "Export comptable consolidé",
        description: "Un récapitulatif mensuel ou annuel (ventes, marge, stock réunis) prêt à transmettre à un comptable ou une banque",
        disponible: false,
      },
    ],
  },
  {
    numero: 3,
    nom: "Grandir en équipe",
    couleur: "var(--amber)",
    couleurBg: "var(--amber-bg)",
    icone: Handshake,
    fonctionnalites: [
      {
        icone: Banknote,
        nom: "Paiement partiel par acompte",
        description: "Accepter une commande sans exiger le paiement complet",
        disponible: false,
      },
      {
        icone: UserCog,
        nom: "Plusieurs utilisateurs, droits limités",
        description: "Déléguer sans donner accès à toutes les données",
        disponible: false,
      },
      {
        icone: Truck,
        nom: "Suivi des fournisseurs et des achats",
        description: "Savoir combien on doit, et à qui",
        disponible: false,
      },
      {
        icone: CreditCard,
        nom: "Diversification des moyens de paiement pour les abonnements",
        description: "Ne pas dépendre d'une seule option de paiement",
        disponible: false,
      },
    ],
  },
  {
    numero: 4,
    nom: "Se structurer",
    couleur: "var(--coral)",
    couleurBg: "var(--coral-bg)",
    icone: Building2,
    fonctionnalites: [
      {
        icone: Share2,
        nom: "Programme de parrainage",
        description: "Être récompensé(e) pour avoir fait connaître Doka",
        disponible: false,
      },
      {
        icone: Receipt,
        nom: "Facturation",
        description: "Émettre des factures conformes, directement depuis Doka",
        disponible: false,
      },
      {
        icone: Store,
        nom: "Gestion multi-boutique",
        description: "Piloter plusieurs points de vente depuis un seul compte",
        disponible: false,
      },
      {
        icone: Heart,
        nom: "Fidélisation des clientes",
        description: "Donner une raison de plus de revenir",
        disponible: false,
      },
      {
        icone: ShoppingBag,
        nom: "Marketplace Doka",
        description: "Un espace commun centralisant les catalogues de tous les commerçants Doka, pour donner de la visibilité à chaque boutique auprès de nouveaux clients",
        disponible: false,
      },
    ],
  },
];
