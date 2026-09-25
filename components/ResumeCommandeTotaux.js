"use client";

// Bloc de résumé chiffré (Total articles / Frais de livraison / Total à
// payer / Marge réelle estimée), réutilisé partout où une commande
// affiche ce résumé côté écran : Nouvelle commande
// (app/(app)/nouvelle/page.js), modification et consultation d'une
// commande existante (app/(app)/commandes/[id]/page.js) — un seul
// endroit pour la règle "Mobile Money" plutôt que de la dupliquer 3 fois
// avec un risque de divergence. Voir components/Receipt.js pour la
// version imprimée/confirmation, structurellement différente (mise en
// page A4, badge aux couleurs figées indépendantes du thème), qui
// applique la même règle séparément.
//
// "Mobile Money" == payé au moment de la commande (in-app), donc le
// montant des articles est déjà réglé ("Déjà payé") et exclu du total
// encore dû — seuls les frais de livraison restent à percevoir à la
// livraison. "Paiement à la livraison" (comportement historique) ne
// change rien : le total dû reste articles + livraison.
export default function ResumeCommandeTotaux({
  t,
  fmt,
  totalArticles,
  fraisLivraison,
  paiementMode,
  margeReelle,
  toujoursAfficherFraisLivraison = false,
}) {
  const dejaPaye = paiementMode === "mobile_money";
  const totalDu = dejaPaye ? fraisLivraison : totalArticles + fraisLivraison;

  return (
    <div className="sb-resume-commande">
      <div>
        <span>{t("commandes.totalArticles")}</span>
        <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <strong>{fmt(totalArticles)}</strong>
          {dejaPaye && <span className="sb-badge sb-badge-emerald" style={{ fontSize: 10.5, padding: "2px 7px" }}>{t("commandes.dejaPayeBadge")}</span>}
        </span>
      </div>
      {(toujoursAfficherFraisLivraison || fraisLivraison > 0) && (
        <div>
          <span>{t("commandes.fraisLivraison")}</span>
          <strong>{fmt(fraisLivraison)}</strong>
        </div>
      )}
      <div className="sb-resume-total">
        <span>{dejaPaye ? t("commandes.totalAPayerLivraison") : t("commandes.totalAPayer")}</span>
        <strong>{fmt(totalDu)}</strong>
      </div>
      {margeReelle != null && (
        <div>
          <span>{t("commandes.margeEstimee")}</span>
          <strong style={{ color: margeReelle >= 0 ? "var(--emerald)" : "var(--coral)" }}>{fmt(margeReelle)}</strong>
        </div>
      )}
    </div>
  );
}
