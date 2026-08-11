export const THEMES = {
  orange: { accent: "#E07A29", deep: "#C7601A", soft: "#F3B278" },
  bleu: { accent: "#2F6FED", deep: "#1E4FBF", soft: "#A9C4FB" },
  vert: { accent: "#0E8F6E", deep: "#0B6E55", soft: "#8FD9C4" },
  violet: { accent: "#7C4DDC", deep: "#5E34B0", soft: "#C9B3F5" },
  rose: { accent: "#D6487D", deep: "#B12F62", soft: "#F3AFC7" },
  rouge: { accent: "#D6483C", deep: "#B22F24", soft: "#F3A79E" },
};

export const OPERATEURS_MOBILE_MONEY = ["Orange Money", "MTN Mobile Money", "Moov Money", "Wave"];

// Libellés traduits dans lib/i18n (common.unites). 'unite' est la valeur
// par défaut de articles.unite.
export const UNITES = ["unite", "metre", "kilo"];

// Taille de page pour les listes paginées côté serveur (Stock, Clients,
// Commandes) — assez petit pour rester rapide sur une connexion mobile,
// assez grand pour limiter le nombre d'allers-retours en navigation normale.
export const PAGE_SIZE = 25;

// Mode d'affichage (Paramètres) — indépendant de THEMES (couleur
// d'accent). 'auto' suit les réglages clair/sombre du système/téléphone.
export const MODES_AFFICHAGE = ["clair", "sombre", "auto"];

// Jours de la semaine pour le rapport de stock hebdomadaire (Paramètres),
// index aligné sur extract(dow from ...) côté Postgres et Date.getDay()
// côté JS : 0 = dimanche .. 6 = samedi. Libellés dans lib/i18n
// (parametres.jours).
export const JOURS_SEMAINE = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];

// Formules d'abonnement — correspond à businesses.plan (voir
// smartbiz-schema.sql). Choisies à l'inscription (app/login/page.js) et
// modifiables ensuite dans Paramètres. Libellés/descriptions dans lib/i18n
// (common.plans) ; la différence de prix/paiement réelle entre formules
// reste gérée manuellement côté Administration.
export const PLANS = ["autonome", "cle_en_main", "premium"];

// Prix indicatifs (FCFA/mois) affichés sur les cartes de formule —
// formatés selon business.devise via lib/format.js (fmt), comme tout
// autre montant de l'application. Purement informatif : la facturation
// réelle reste gérée manuellement (voir PLANS ci-dessus).
export const PLAN_PRICES = { autonome: 5000, cle_en_main: 15000, premium: 30000 };
