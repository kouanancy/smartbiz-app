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

export const monthLabel = (d) =>
  d.toLocaleDateString("fr-FR", { month: "short" }).replace(".", "");
