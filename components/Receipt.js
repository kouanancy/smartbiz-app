"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CheckCircle2, Download, Image as ImageIcon, X } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { fmt as fmtBase, dateLocale, tronquerMilieuNom } from "@/lib/format";
import { t as tBase } from "@/lib/i18n";
import { exporterPdf } from "@/lib/pdfExport";

// Seuil de troncature des noms d'article dans le tableau imprimé/PDF
// (table à 5 colonnes — photo, article, prix unitaire, quantité,
// sous-total — sur une page A4 pleine largeur), calibré par capture
// d'écran (page.emulateMedia('print')) sur la largeur réellement
// disponible pour la colonne Article (~320-360px une fois les 4 autres
// colonnes réservées). Le <td> porte aussi un max-width (voir plus bas),
// volontairement plus large que le rendu attendu de cette chaîne : un
// vrai filet de sécurité pour un rendu de police inhabituellement large,
// jamais une contrainte qui retronquerait en plus du JS — un max-width
// trop serré ferait perdre la fin du nom (couleur/variante) à la
// troncature CSS, qui coupe toujours à la fin et jamais au milieu
// contrairement à tronquerMilieuNom().
const LONGUEUR_NOM_IMPRESSION = 42;

// Seuil pour le nom d'article dans l'aperçu à l'écran (modale de 380px,
// le nom partage sa ligne avec « ×quantité unité » à gauche et le
// montant à droite — ou, pour un cadeau offert, le badge CadeauBadge,
// plus large qu'un simple montant, qui laisse donc moins de place
// disponible). Calibré sur le cas le plus serré (ligne d'un cadeau
// offert sur mobile) par capture d'écran, pour que les deux sections
// (lignesVendues et lignesOffertes) partagent un seul seuil cohérent
// sans retroncature CSS qui ferait perdre la fin du nom.
const LONGUEUR_NOM_APERCU = 22;

// Couleurs "amber" du thème clair recopiées en dur (jamais var(--amber)/
// var(--amber-bg)) : ce composant force déjà un fond blanc fixe partout
// (écran comme impression), indépendant du mode sombre éventuellement
// choisi par le commerçant dans l'app — utiliser les variables CSS ferait
// apparaître les teintes assombries de --amber-bg (pensées pour un fond
// sombre) sur ce fond blanc, illisibles. Même principe que l'accent
// #E07A29 déjà en dur plus bas.
function CadeauBadge({ t }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        fontSize: 11,
        fontWeight: 600,
        padding: "3px 8px",
        borderRadius: 20,
        background: "#FBF0DF",
        color: "#C9862B",
        whiteSpace: "nowrap",
      }}
    >
      🎁 {t("receipt.cadeauOffertBadge")}
    </span>
  );
}

// Même principe que CadeauBadge ci-dessus (couleurs "emerald" recopiées
// en dur plutôt que var(--emerald)/var(--emerald-bg), qui suivraient le
// mode sombre éventuel de l'app alors que ce composant reste toujours
// blanc) — signale qu'une commande Mobile Money a déjà son montant
// d'articles réglé au moment de la commande, jamais dû à la livraison.
function DejaPayeBadge({ t }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        fontSize: 11,
        fontWeight: 600,
        padding: "3px 8px",
        borderRadius: 20,
        background: "#E1F3EC",
        color: "#0E8F6E",
        whiteSpace: "nowrap",
      }}
    >
      {t("receipt.dejaPayeBadge")}
    </span>
  );
}

export default function Receipt({ commande, business, onClose }) {
  const fmt = (n) => fmtBase(n, business?.devise);
  const t = (key, vars) => tBase(business?.langue, key, vars);
  const uniteLabel = (u) => t(`common.unites.${u || "unite"}`);
  const client = commande.client;
  const totalGeneral = commande.ca + (commande.livraison_frais || 0);
  // commande.paye_totalite vient déjà calculé/transmis par l'appelant
  // (Nouvelle commande, détail d'une commande) — jamais déduit de
  // paiement_mode, qui ne décrit que le moyen de paiement (Mobile Money ou
  // Espèces), pas si la commande est réglée (voir
  // components/ResumeCommandeTotaux.js pour la même règle appliquée aux
  // résumés côté écran, ce composant-ci gérant sa propre mise en page
  // aperçu écran + impression A4). Quand vrai, le montant des articles est
  // déjà réglé, seuls les frais de livraison restent dus à la livraison.
  const dejaPaye = commande.paye_totalite === true;
  const totalDu = dejaPaye ? commande.livraison_frais || 0 : totalGeneral;
  // acompteVerse vient déjà calculé du composant appelant (somme des
  // acomptes au statut 'verse' — voir app/(app)/nouvelle/page.js,
  // app/(app)/commandes/[id]/page.js), jamais recalculé ici : ce
  // composant ne connaît la commande que par ce que son appelant lui
  // transmet, jamais par sa propre requête Supabase.
  const acompteVerse = commande.acompteVerse || 0;
  const resteAPayer = Math.max(0, totalDu - acompteVerse);
  // Séparées une fois pour les 2 surfaces (écran, PDF) : aucune trace de
  // cadeaux nulle part tant que lignesOffertes est vide — la section
  // dédiée ci-dessous n'est alors jamais rendue.
  const lignesVendues = commande.lignes.filter((l) => !l.offert);
  const lignesOffertes = commande.lignes.filter((l) => l.offert);
  const businessName = business?.name;
  const logo = business?.logo_url;
  const accent = "#E07A29";
  const dateStr = new Date(commande.created_at).toLocaleDateString(dateLocale(business?.langue), {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
  const [platformLogo, setPlatformLogo] = useState("");
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const printRef = useRef(null);

  // Logo Doka pour le pied de page "Propulsé par Doka" — indépendant du
  // logo de boutique (celui-ci reste géré par l'administratrice).
  useEffect(() => {
    supabase
      .from("parametres_globaux")
      .select("logo_url")
      .limit(1)
      .maybeSingle()
      .then(({ data }) => setPlatformLogo(data?.logo_url || ""));
  }, []);

  function nomFichierPdf() {
    return `commande-${commande.numero}.pdf`;
  }

  // Capture .sb-receipt-print (déjà stylée pour l'A4, voir globals.css) et
  // la télécharge/la partage de façon fiable sur téléphone — voir
  // lib/pdfExport.js pour la logique commune à tous les exports PDF de
  // l'app (reçu, stock, catalogue, trésorerie) et la cause exacte du
  // problème sur mobile. Le bloc est normalement display: none à l'écran ;
  // .sb-pdf-export-capture le rend temporairement visible (dans la fenêtre,
  // jamais hors écran — voir globals.css) le temps de la capture,
  // indispensable pour qu'html2canvas puisse le mesurer/rendre, et
  // exporterPdf pose son propre cache plein écran par-dessus pendant ce
  // temps pour qu'il ne soit jamais visible pour l'utilisatrice — onCaptured
  // retire cette classe dès la capture terminée (pas seulement à la toute
  // fin, qui peut traîner plusieurs secondes sur le sélecteur de partage du
  // système), pour qu'elle ne reste jamais affichée sans ce cache.
  async function telechargerPdf() {
    setGeneratingPdf(true);
    const el = printRef.current;
    el?.classList.add("sb-pdf-export-capture");
    try {
      await exporterPdf({
        getElement: () => el,
        nomFichier: nomFichierPdf(),
        labelGeneration: t("receipt.generationPdf"),
        onCaptured: () => el?.classList.remove("sb-pdf-export-capture"),
      });
    } catch (err) {
      console.error("Échec de la génération du PDF :", err);
      window.alert(t("receipt.pdfError"));
    } finally {
      el?.classList.remove("sb-pdf-export-capture");
      setGeneratingPdf(false);
    }
  }

  return (
    <>
      {/* Aperçu à l'écran — fenêtre modale, masquée à l'impression */}
      <div className="sb-modal-overlay sb-no-print" onClick={onClose}>
        <div className="sb-card sb-receipt-preview" style={{ width: 380 }} onClick={(e) => e.stopPropagation()}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
            {logo ? (
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <img src={logo} alt={businessName || "Logo"} style={{ width: 28, height: 28, borderRadius: 6, objectFit: "cover" }} />
                <span className="sb-display" style={{ fontWeight: 700, fontSize: 16 }}>{businessName || t("common.defaultBusinessName")}</span>
              </div>
            ) : businessName ? (
              <span className="sb-display" style={{ fontWeight: 700, fontSize: 17 }}>{businessName}</span>
            ) : (
              <div className="sb-display" style={{ fontWeight: 700, fontSize: 17 }}>
                <span style={{ color: accent }}>Doka</span>
              </div>
            )}
            <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "#6B6A63" }}>
              <X size={16} />
            </button>
          </div>
          <p style={{ fontSize: 12, color: "#6B6A63", margin: "0 0 14px" }}>{t("receipt.confirmationTitle")}</p>

          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, marginBottom: 4 }}>
            <span style={{ color: "#6B6A63" }}>{t("receipt.numeroCommande")}</span>
            <span className="sb-mono">{commande.numero}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, marginBottom: 4 }}>
            <span style={{ color: "#6B6A63" }}>{t("receipt.date")}</span>
            <span>{new Date(commande.created_at).toLocaleDateString(dateLocale(business?.langue))}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, marginBottom: 12 }}>
            <span style={{ color: "#6B6A63" }}>{t("receipt.cliente")}</span>
            <span>{client?.nom ?? "—"}</span>
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, marginBottom: 4 }}>
            <span style={{ color: "#6B6A63" }}>{t("receipt.livraison")}</span>
            <span>
              {commande.livraison_type === "livraison"
                ? `${commande.livraison_zone} (${fmt(commande.livraison_frais)})`
                : t("receipt.recuperationBoutique")}
            </span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, marginBottom: 12 }}>
            <span style={{ color: "#6B6A63" }}>{t("receipt.paiement")}</span>
            <span>{commande.paiement_mode === "mobile_money" ? commande.paiement_operateur : t("receipt.paiementLivraison")}</span>
          </div>

          <div style={{ borderTop: "1px dashed #E4E2D8", borderBottom: "1px dashed #E4E2D8", padding: "10px 0", marginBottom: lignesOffertes.length > 0 ? 10 : 12 }}>
            {lignesVendues.map((l, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 6, fontSize: 12.5, marginBottom: 4 }}>
                <span style={{ display: "flex", minWidth: 0, flex: 1 }}>
                  <span className="sb-nom-tronque" title={l.nom} style={{ flex: 1, minWidth: 0 }}>
                    {tronquerMilieuNom(l.nom, LONGUEUR_NOM_APERCU)}
                  </span>
                  <span style={{ flexShrink: 0 }}>&nbsp;×{l.quantite} {uniteLabel(l.unite)}</span>
                </span>
                <span className="sb-mono" style={{ flexShrink: 0 }}>{fmt(l.prix_vente * l.quantite)}</span>
              </div>
            ))}
            {commande.livraison_frais > 0 && (
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5 }}>
                <span>{t("receipt.fraisLivraison")}</span>
                <span className="sb-mono">{fmt(commande.livraison_frais)}</span>
              </div>
            )}
          </div>

          {lignesOffertes.length > 0 && (
            <div style={{ borderBottom: "1px dashed #E4E2D8", padding: "0 0 10px", marginBottom: 12 }}>
              <p style={{ fontSize: 10.5, textTransform: "uppercase", letterSpacing: "0.05em", color: "#A6A29D", margin: "0 0 8px" }}>
                {t("receipt.cadeauxTitle")}
              </p>
              {lignesOffertes.map((l, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 6, fontSize: 12.5, marginBottom: 4 }}>
                  <span style={{ display: "flex", minWidth: 0, flex: 1 }}>
                    <span className="sb-nom-tronque" title={l.nom} style={{ flex: 1, minWidth: 0 }}>
                      {tronquerMilieuNom(l.nom, LONGUEUR_NOM_APERCU)}
                    </span>
                    <span style={{ flexShrink: 0 }}>&nbsp;×{l.quantite} {uniteLabel(l.unite)}</span>
                  </span>
                  <CadeauBadge t={t} />
                </div>
              ))}
            </div>
          )}

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12.5, marginBottom: 4 }}>
            <span style={{ color: "#6B6A63" }}>{t("receipt.totalArticles")}</span>
            <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span className="sb-mono">{fmt(commande.ca)}</span>
              {dejaPaye && <DejaPayeBadge t={t} />}
            </span>
          </div>
          {acompteVerse > 0 && (
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, marginBottom: 4 }}>
              <span style={{ color: "#6B6A63" }}>{t("receipt.acompteVerseLabel")}</span>
              <span className="sb-mono">− {fmt(acompteVerse)}</span>
            </div>
          )}
          <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, fontSize: 14.5, marginBottom: 16 }}>
            <span>{acompteVerse > 0 ? t("receipt.resteAPayerLabel") : dejaPaye ? t("receipt.totalAPayerLivraison") : t("receipt.total")}</span>
            <span className="sb-mono">{fmt(acompteVerse > 0 ? resteAPayer : totalDu)}</span>
          </div>

          <div style={{ textAlign: "center", marginBottom: 12 }}>
            <span className="sb-stamp">
              <CheckCircle2 size={15} /> {t("receipt.confirmee")}
            </span>
          </div>

          <button
            className="sb-btn sb-btn-primary"
            style={{ width: "100%", justifyContent: "center" }}
            onClick={telechargerPdf}
            disabled={generatingPdf}
          >
            <Download size={14} /> {generatingPdf ? t("receipt.generationPdf") : t("receipt.telechargerPdf")}
          </button>

          <p style={{ textAlign: "center", fontSize: 10.5, color: "#A6A29D", margin: "12px 0 0", display: "flex", alignItems: "center", justifyContent: "center", gap: 5 }}>
            {platformLogo && <img src={platformLogo} alt="" style={{ height: 12, width: 12, objectFit: "contain" }} />}
            {t("common.poweredBy")}
          </p>
        </div>
      </div>

      {/* Mise en page dédiée à l'impression — pleine page A4, invisible à l'écran.
          Rendue via un portail directement dans <body> pour ne dépendre d'aucune
          structure de page parente : le CSS @media print n'a qu'à masquer .sb-root
          et afficher ce bloc. */}
      {createPortal(
        <div className="sb-receipt-print" ref={printRef}>
          <div className="sb-receipt-print-header">
            <div className="sb-receipt-print-brand">
              {logo ? (
                <img src={logo} alt={businessName || "Logo"} />
              ) : (
                <div className="sb-receipt-print-logo-fallback">{(businessName || "Doka").slice(0, 2).toUpperCase()}</div>
              )}
              <span className="sb-receipt-print-brand-name">{businessName || t("common.defaultBusinessName")}</span>
            </div>
            <div className="sb-receipt-print-title">
              <h1>{t("receipt.confirmationTitle")}</h1>
              <p>{t("receipt.numeroCommande")} {commande.numero}</p>
              <p>{dateStr}</p>
            </div>
          </div>

          <div className="sb-receipt-print-info sb-pdf-no-split">
            <div className="sb-receipt-print-info-block">
              <h3>{t("receipt.printClient")}</h3>
              <div>
                <span>{t("receipt.printNom")}</span>
                <strong>{client?.nom ?? "—"}</strong>
              </div>
              <div>
                <span>{t("receipt.printTelephone")}</span>
                <strong>{client?.telephone ?? "—"}</strong>
              </div>
              <div>
                <span>{t("receipt.printAdresse")}</span>
                <strong>{client?.adresse || "—"}</strong>
              </div>
              <div>
                <span>{t("receipt.printEmail")}</span>
                <strong>{client?.email || "—"}</strong>
              </div>
            </div>
            <div className="sb-receipt-print-info-block">
              <h3>{t("receipt.printLivraisonPaiement")}</h3>
              <div>
                <span>{t("receipt.printLivraison")}</span>
                <strong>
                  {commande.livraison_type === "livraison" ? commande.livraison_zone : t("receipt.recuperationBoutique")}
                </strong>
              </div>
              {commande.livraison_frais > 0 && (
                <div>
                  <span>{t("receipt.printFraisLivraison")}</span>
                  <strong>{fmt(commande.livraison_frais)}</strong>
                </div>
              )}
              <div>
                <span>{t("receipt.printPaiement")}</span>
                <strong>{commande.paiement_mode === "mobile_money" ? commande.paiement_operateur : t("receipt.paiementLivraison")}</strong>
              </div>
            </div>
          </div>

          {/* Mise en page d'origine (photo par article, table dédiée
              aux cadeaux offerts avec son propre en-tête) — la
              compaction extrême tentée pour tenir sur une seule page a
              été abandonnée sur demande : le document est explicitement
              autorisé à déborder sur plusieurs pages si la liste
              d'articles est longue. Ce qui reste non négociable : jamais
              une ligne coupée en plein milieu entre deux pages
              (.sb-receipt-print-table tr, break-inside: avoid, voir
              app/globals.css, même principe que .sb-catalogue-card) et
              un <thead> qui se répète nativement en haut de chaque page
              suivante (comportement natif des navigateurs pour un
              <table> qui déborde, sans CSS supplémentaire) — un lecteur
              retrouve toujours les en-têtes de colonnes en haut de
              chaque page. Aucun emoji dans cette version imprimée : la
              section cadeaux utilise un texte sobre (« Offert ») plutôt
              que le badge à emoji visible à l'écran. */}
          <table className="sb-receipt-print-table">
            <thead>
              <tr>
                <th className="sb-receipt-print-table-photo"></th>
                <th>{t("receipt.tableArticle")}</th>
                <th style={{ textAlign: "right" }}>{t("receipt.tablePrixUnitaire")}</th>
                <th style={{ textAlign: "right" }}>{t("receipt.tableQuantite")}</th>
                <th style={{ textAlign: "right" }}>{t("receipt.tableSousTotal")}</th>
              </tr>
            </thead>
            <tbody>
              {lignesVendues.map((l, i) => (
                <tr key={`v-${i}`} className="sb-pdf-no-split">
                  <td className="sb-receipt-print-table-photo">
                    {l.image_url ? (
                      <img src={l.image_url} alt="" />
                    ) : (
                      <div className="sb-receipt-print-table-photo-fallback">
                        <ImageIcon size={14} />
                      </div>
                    )}
                  </td>
                  <td className="sb-nom-tronque" style={{ maxWidth: 340 }}>{tronquerMilieuNom(l.nom, LONGUEUR_NOM_IMPRESSION)}</td>
                  <td style={{ textAlign: "right" }}>{fmt(l.prix_vente)}</td>
                  <td style={{ textAlign: "right" }}>
                    {l.quantite} {uniteLabel(l.unite)}
                  </td>
                  <td style={{ textAlign: "right" }}>{fmt(l.prix_vente * l.quantite)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {lignesOffertes.length > 0 && (
            <>
              <p
                style={{
                  fontSize: 11,
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  color: "#8A867F",
                  margin: "14px 0 6px",
                  breakAfter: "avoid",
                  pageBreakAfter: "avoid",
                }}
              >
                {t("receipt.cadeauxTitrePrint")}
              </p>
              <table className="sb-receipt-print-table">
                <thead>
                  <tr>
                    <th className="sb-receipt-print-table-photo"></th>
                    <th>{t("receipt.tableArticle")}</th>
                    <th style={{ textAlign: "right" }}>{t("receipt.tableQuantite")}</th>
                    <th style={{ textAlign: "right" }}></th>
                  </tr>
                </thead>
                <tbody>
                  {lignesOffertes.map((l, i) => (
                    <tr key={`o-${i}`} className="sb-pdf-no-split">
                      <td className="sb-receipt-print-table-photo">
                        {l.image_url ? (
                          <img src={l.image_url} alt="" />
                        ) : (
                          <div className="sb-receipt-print-table-photo-fallback">
                            <ImageIcon size={14} />
                          </div>
                        )}
                      </td>
                      <td className="sb-nom-tronque" style={{ maxWidth: 340 }}>{tronquerMilieuNom(l.nom, LONGUEUR_NOM_IMPRESSION)}</td>
                      <td style={{ textAlign: "right" }}>
                        {l.quantite} {uniteLabel(l.unite)}
                      </td>
                      <td style={{ textAlign: "right", fontWeight: 700 }}>{t("receipt.offertPrint")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}

          <div className="sb-receipt-print-totals sb-pdf-no-split">
            <div>
              <span>{t("receipt.totalArticles")}</span>
              <strong style={{ display: "flex", alignItems: "center", gap: 6 }}>
                {fmt(commande.ca)}
                {dejaPaye && <DejaPayeBadge t={t} />}
              </strong>
            </div>
            {commande.livraison_frais > 0 && (
              <div>
                <span>{t("receipt.printFraisLivraison")}</span>
                <strong>{fmt(commande.livraison_frais)}</strong>
              </div>
            )}
            {acompteVerse > 0 && (
              <div>
                <span>{t("receipt.acompteVerseLabel")}</span>
                <strong>− {fmt(acompteVerse)}</strong>
              </div>
            )}
            <div className="total">
              <span>{acompteVerse > 0 ? t("receipt.resteAPayerLabel") : dejaPaye ? t("receipt.totalAPayerLivraison") : t("receipt.totalAPayer")}</span>
              <strong>{fmt(acompteVerse > 0 ? resteAPayer : totalDu)}</strong>
            </div>
          </div>

          <div className="sb-receipt-print-stamp sb-pdf-no-split">
            <span>{t("receipt.stampConfirmee")}</span>
          </div>

          <div className="sb-receipt-print-footer" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 5 }}>
            {platformLogo && <img src={platformLogo} alt="" style={{ height: 12, width: 12, objectFit: "contain" }} />}
            {t("common.poweredBy")}
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
