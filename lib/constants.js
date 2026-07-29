export const THEMES = {
  orange: { label: "Orange", accent: "#E07A29", deep: "#C7601A", soft: "#F3B278" },
  bleu: { label: "Bleu", accent: "#2F6FED", deep: "#1E4FBF", soft: "#A9C4FB" },
  vert: { label: "Vert", accent: "#0E8F6E", deep: "#0B6E55", soft: "#8FD9C4" },
  violet: { label: "Violet", accent: "#7C4DDC", deep: "#5E34B0", soft: "#C9B3F5" },
  rose: { label: "Rose", accent: "#D6487D", deep: "#B12F62", soft: "#F3AFC7" },
  rouge: { label: "Rouge", accent: "#D6483C", deep: "#B22F24", soft: "#F3A79E" },
};

export const OPERATEURS_MOBILE_MONEY = ["Orange Money", "MTN Mobile Money", "Moov Money", "Wave"];

// Libellé affiché pour un article dont categorie_id est null. Centralisé ici
// pour que les pages Articles et Catalogue restent en accord (et pour
// détecter/refuser qu'un commerçant crée une vraie catégorie du même nom,
// ce qui rendrait le filtre ambigu).
export const SANS_CATEGORIE = "Sans catégorie";

export const SUBSCRIPTION_LABELS = {
  en_attente_paiement: "En attente de paiement",
  actif: "Actif",
  expire: "Expiré",
  suspendu: "Suspendu",
};

// Cycle de vie d'une commande : le stock n'est déduit qu'au passage à
// 'livree' (voir app/(app)/commandes/page.js) ; 'en_attente' ne réserve
// donc rien physiquement, seulement dans le "stock théorique" affiché sur
// la page Articles et dans Nouvelle commande.
export const COMMANDE_STATUT_LABELS = {
  en_attente: "En attente de livraison",
  livree: "Livrée",
  annulee: "Annulée",
};
