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

// langue vient de businesses.langue (fr par défaut) — distincte de la
// devise, qui pilote plutôt le format des nombres/montants ci-dessus.
export const dateLocale = (langue) => (langue === "en" ? "en-US" : "fr-FR");

export const monthLabel = (d, langue = "fr") =>
  d.toLocaleDateString(dateLocale(langue), { month: "short" }).replace(".", "");

// Normalise un numéro ivoirien local (ex. "07 01 22 33 44") au format
// international attendu par wa.me (préfixe 225, sans le 0 initial).
export function toWhatsAppNumber(tel) {
  const digits = (tel || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("225")) return digits;
  if (digits.startsWith("0")) return "225" + digits.slice(1);
  return "225" + digits;
}
