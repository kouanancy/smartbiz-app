const CURRENCY_CONFIG = {
  FCFA: { locale: "fr-FR", currency: "XOF" },
  EUR: { locale: "fr-FR", currency: "EUR" },
  USD: { locale: "en-US", currency: "USD" },
};

export const DEVISES = Object.keys(CURRENCY_CONFIG);

// devise vient de businesses.devise (FCFA par défaut). XOF n'a pas de
// sous-unité en ISO 4217, donc Intl arrondit déjà à 0 décimale pour FCFA
// sans traitement particulier ; EUR/USD gardent leurs centimes.
export const fmt = (n, devise = "FCFA") => {
  const conf = CURRENCY_CONFIG[devise] || CURRENCY_CONFIG.FCFA;
  return new Intl.NumberFormat(conf.locale, { style: "currency", currency: conf.currency }).format(n || 0);
};

// Format compact ("k"/"M") pour les étiquettes de valeur affichées en
// permanence au-dessus des barres des graphiques mensuels (Dashboard,
// Trésorerie) — notation "compact" d'Intl fait tout le travail (arrondi
// + suffixe déjà localisés), pas de recopie manuelle d'un seuil des
// milliers. minimumFractionDigits: 0 évite un ".0"/",0" superflu sur les
// devises à décimales (EUR/USD) quand le montant tombe rond une fois
// arrondi (XOF n'a de toute façon pas de décimale).
export const fmtCompact = (n, devise = "FCFA") => {
  const conf = CURRENCY_CONFIG[devise] || CURRENCY_CONFIG.FCFA;
  return new Intl.NumberFormat(conf.locale, {
    style: "currency",
    currency: conf.currency,
    notation: "compact",
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
  }).format(n || 0);
};

// Largeur approximative (px) d'un caractère de l'étiquette de valeur
// (police à chasse fixe IBM Plex Mono, 10px — voir renderBarValueLabel
// dans Dashboard/Trésorerie) : ~0,63 × la taille de police pour une
// police monospace, mesuré empiriquement plutôt que recopié d'une table.
const LABEL_CHAR_WIDTH_PX = 6.3;

// Décide si les étiquettes de valeur d'un graphique en barres doivent
// basculer sur fmtCompact ci-dessus plutôt que fmt (valeur exacte) : la
// valeur la plus longue, une fois formatée en entier, doit tenir dans la
// largeur réellement disponible par barre — containerWidth (mesurée via
// lib/useElementWidth.js, jamais un nombre de barres seul : le même
// nombre de barres tient large sur desktop et déborde sur mobile) divisée
// par barSlots (barres réellement dessinées — catégories × séries, ex.
// CA + marge sur Trésorerie occupent deux fois plus de barres que le
// même nombre de catégories sur Dashboard). containerWidth à 0 (pas
// encore mesuré, ex. tout premier rendu avant que le ResizeObserver ne
// se déclenche) => compact par défaut : mieux vaut un texte compact
// affiché un bref instant qu'un débordement visible le temps de la
// première mesure.
export function shouldCompactLabels(values, barSlots, devise, containerWidth) {
  if (!containerWidth || !barSlots) return true;
  // -68px : largeur retirée par l'axe Y (YAxis width={40}/{44}) et par
  // les marges gauche/droite du graphique (margin={{ right: 10, left: 10
  // }}, voir Dashboard/Trésorerie — cette marge laisse un peu d'air aux
  // étiquettes des barres tout au bord, sinon rognées par le viewBox du
  // SVG) — la zone de tracé, seule à contenir des barres, est plus
  // étroite que le conteneur entier. ×0,85 sur le résultat : marge de
  // sécurité pour les espacements entre barres/groupes de barres
  // (category/bar gap), jamais comptés dans un simple "largeur ÷ nombre
  // de barres".
  const plotWidth = Math.max(containerWidth - 68, 0);
  const pxPerBar = (plotWidth / barSlots) * 0.85;
  const maxLabelLen = values.reduce((max, v) => Math.max(max, fmt(v, devise).length), 0);
  return maxLabelLen * LABEL_CHAR_WIDTH_PX > pxPerBar;
}

// langue vient de businesses.langue (fr par défaut) — distincte de la
// devise, qui pilote plutôt le format des nombres/montants ci-dessus.
export const dateLocale = (langue) => (langue === "en" ? "en-US" : "fr-FR");

export const monthLabel = (d, langue = "fr") =>
  d.toLocaleDateString(dateLocale(langue), { month: "short" }).replace(".", "");

// Normalise un numéro ivoirien local (ex. "07 01 22 33 44") au format
// international attendu par wa.me. Depuis la réforme de numérotation à
// 10 chiffres (2021), le 0 initial fait partie intégrante du numéro
// ivoirien — ce n'est pas un préfixe de tri à retirer pour l'international
// (contrairement à la France, par ex.) : +225 07 01 22 33 44 se compose
// bien de l'indicatif 225 suivi des 10 chiffres complets, 0 inclus. On ne
// fait donc jamais sauter ce 0, seulement ajouter 225 devant si absent.
// String(tel ?? "") plutôt que (tel || "") : si jamais un numéro arrivait
// ici comme nombre JS (ex. colonne mal typée, valeur convertie par erreur
// ailleurs), (tel || "") le laisserait tel quel et .replace() planterait —
// String(...) le convertit d'abord, sans jamais perdre de chiffre.
export function toWhatsAppNumber(tel) {
  const digits = String(tel ?? "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("225")) return digits;
  return "225" + digits;
}
