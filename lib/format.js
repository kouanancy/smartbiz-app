export const fmt = (n) => new Intl.NumberFormat("fr-FR").format(Math.round(n || 0)) + " FCFA";

export const monthLabel = (d) =>
  d.toLocaleDateString("fr-FR", { month: "short" }).replace(".", "");
