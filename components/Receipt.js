"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CheckCircle2, Download, MessageCircle, Printer, X } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { fmt as fmtBase, dateLocale, toWhatsAppNumber } from "@/lib/format";
import { t as tBase } from "@/lib/i18n";

// Marge @page (voir globals.css, .sb-receipt-print) — réutilisée ici pour
// que le PDF généré par html2canvas/jsPDF (genererPdfBlob) corresponde à
// la même mise en page A4 que l'impression navigateur classique.
const PAGE_MARGIN_MM = 16;

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

export default function Receipt({ commande, business, onClose }) {
  const fmt = (n) => fmtBase(n, business?.devise);
  const t = (key, vars) => tBase(business?.langue, key, vars);
  const uniteLabel = (u) => t(`common.unites.${u || "unite"}`);
  const client = commande.client;
  const totalGeneral = commande.ca + (commande.livraison_frais || 0);
  // Séparées une fois pour les 3 surfaces (écran, PDF, WhatsApp) : aucune
  // trace de cadeaux nulle part tant que lignesOffertes est vide — la
  // section dédiée ci-dessous n'est alors jamais rendue.
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
  // Détection best-effort du partage natif de fichiers (Web Share API),
  // calculée pendant le rendu (comme systemPrefersDark dans AuthProvider)
  // plutôt que dans un effect : c'est une lecture synchrone de l'état du
  // navigateur, pas un abonnement à un évènement externe qui changerait
  // pendant que le composant est monté. navigator.canShare() exige un vrai
  // objet File pour répondre, d'où ce fichier PDF factice minimal ;
  // indisponible sur la plupart des navigateurs d'ordinateur, disponible
  // sur la quasi-totalité des téléphones récents (Android Chrome, iOS
  // Safari).
  const [canShareFiles] = useState(() => {
    if (typeof navigator === "undefined" || !navigator.canShare) return false;
    try {
      return navigator.canShare({ files: [new File([""], "test.pdf", { type: "application/pdf" })] });
    } catch {
      return false;
    }
  });
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

  // Capture .sb-receipt-print (déjà stylée pour l'A4, voir globals.css) via
  // jsPDF.html() — qui délègue le rendu à html2canvas en interne — puis
  // renvoie le PDF sous forme de Blob. Le bloc est normalement display:none
  // à l'écran ; .sb-receipt-print-capture le rend temporairement visible
  // (mais hors écran, jamais visible pour l'utilisateur) le temps de la
  // capture, indispensable pour qu'html2canvas puisse le mesurer/rendre.
  async function genererPdfBlob() {
    const el = printRef.current;
    if (!el) return null;
    const { default: jsPDF } = await import("jspdf");
    el.classList.add("sb-receipt-print-capture");
    try {
      const pdf = new jsPDF({ unit: "mm", format: "a4" });
      await pdf.html(el, {
        x: PAGE_MARGIN_MM,
        y: PAGE_MARGIN_MM,
        width: 210 - PAGE_MARGIN_MM * 2,
        windowWidth: el.scrollWidth || 900,
        html2canvas: { scale: 2, useCORS: true },
      });
      return pdf.output("blob");
    } finally {
      el.classList.remove("sb-receipt-print-capture");
    }
  }

  function telechargerBlob(blob, nomFichier) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = nomFichier;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  async function telechargerPdf() {
    setGeneratingPdf(true);
    try {
      const blob = await genererPdfBlob();
      if (blob) telechargerBlob(blob, nomFichierPdf());
    } catch (err) {
      console.error("Échec de la génération du PDF :", err);
      window.alert(t("receipt.pdfError"));
    } finally {
      setGeneratingPdf(false);
    }
  }

  // Sur les appareils supportant le partage natif de fichiers, "Envoyer par
  // WhatsApp" génère le PDF puis ouvre le menu de partage du téléphone (le
  // PDF y est joint directement, l'utilisateur choisit WhatsApp dedans) —
  // remplace le message texte pré-rempli, plus riche mais qui n'attachait
  // jamais le PDF lui-même. Ailleurs (essentiellement les ordinateurs), le
  // message texte pré-rempli reste le seul chemin disponible : un bouton
  // "Télécharger le PDF" séparé complète alors ce bouton (voir plus bas).
  async function envoyerWhatsApp() {
    if (canShareFiles) {
      setGeneratingPdf(true);
      try {
        const blob = await genererPdfBlob();
        if (!blob) return;
        const file = new File([blob], nomFichierPdf(), { type: "application/pdf" });
        if (navigator.canShare({ files: [file] })) {
          await navigator.share({ files: [file], title: nomFichierPdf() });
        } else {
          telechargerBlob(blob, nomFichierPdf());
        }
      } catch (err) {
        // AbortError : l'utilisateur a simplement fermé le menu de partage,
        // pas une vraie erreur à signaler.
        if (err?.name !== "AbortError") {
          console.error("Échec du partage du PDF :", err);
          window.alert(t("receipt.pdfError"));
        }
      } finally {
        setGeneratingPdf(false);
      }
      return;
    }

    const numero = toWhatsAppNumber(client?.telephone);
    if (!numero) return;
    const lignesTxt = lignesVendues.map((l) => `- ${l.nom} ×${l.quantite} ${uniteLabel(l.unite)}`).join("\n");
    // Section distincte, jamais mélangée à la liste ci-dessus, et
    // entièrement absente du message si aucun cadeau n'a été renseigné.
    const cadeauxTxt =
      lignesOffertes.length > 0
        ? `\n\n${t("receipt.cadeauxTitle")}\n${lignesOffertes.map((l) => `- 🎁 ${l.nom} ×${l.quantite} ${uniteLabel(l.unite)}`).join("\n")}`
        : "";
    const message = t("receipt.whatsappMessage", {
      clientNom: client?.nom || "",
      numero: commande.numero,
      businessName: businessName || "Doka",
      lignesTxt: lignesTxt + cadeauxTxt,
      livraisonLine: commande.livraison_frais > 0 ? t("receipt.whatsappLivraisonLine", { frais: fmt(commande.livraison_frais) }) : "",
      total: fmt(totalGeneral),
    });
    window.open(`https://wa.me/${numero}?text=${encodeURIComponent(message)}`, "_blank");
  }

  return (
    <>
      {/* Aperçu à l'écran — fenêtre modale, masquée à l'impression */}
      <div className="sb-modal-overlay sb-no-print" onClick={onClose}>
        <div className="sb-card" style={{ width: 380, background: "#fff" }} onClick={(e) => e.stopPropagation()}>
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
              <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, marginBottom: 4 }}>
                <span>{l.nom} ×{l.quantite} {uniteLabel(l.unite)}</span>
                <span className="sb-mono">{fmt(l.prix_vente * l.quantite)}</span>
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
                <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12.5, marginBottom: 4 }}>
                  <span>{l.nom} ×{l.quantite} {uniteLabel(l.unite)}</span>
                  <CadeauBadge t={t} />
                </div>
              ))}
            </div>
          )}

          <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, fontSize: 14.5, marginBottom: 16 }}>
            <span>{t("receipt.total")}</span>
            <span className="sb-mono">{fmt(totalGeneral)}</span>
          </div>

          <div style={{ textAlign: "center", marginBottom: 12 }}>
            <span className="sb-stamp">
              <CheckCircle2 size={15} /> {t("receipt.confirmee")}
            </span>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <button
              className="sb-btn"
              style={{ width: "100%", justifyContent: "center", background: "#25D366", color: "#fff" }}
              onClick={envoyerWhatsApp}
              disabled={generatingPdf || (!canShareFiles && !toWhatsAppNumber(client?.telephone))}
            >
              <MessageCircle size={14} /> {generatingPdf ? t("receipt.generationPdf") : t("receipt.envoyerWhatsApp")}
            </button>
            {!canShareFiles && (
              <button
                className="sb-btn sb-btn-ghost"
                style={{ width: "100%", justifyContent: "center" }}
                onClick={telechargerPdf}
                disabled={generatingPdf}
              >
                <Download size={14} /> {generatingPdf ? t("receipt.generationPdf") : t("receipt.telechargerPdf")}
              </button>
            )}
            <button className="sb-btn sb-btn-primary" style={{ width: "100%", justifyContent: "center" }} onClick={() => window.print()}>
              <Printer size={14} /> {t("receipt.imprimerPdf")}
            </button>
          </div>

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

          <div className="sb-receipt-print-info">
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

          {/* Une seule table pour les articles vendus ET les cadeaux
              offerts (jamais deux tables séparées avec leur propre
              en-tête) — la ligne "diviseur" ci-dessous, avec juste un
              intitulé sur toute la largeur, coûte beaucoup moins de
              hauteur qu'un second <thead> complet. Photo retirée
              (présente seulement dans l'aperçu à l'écran) : jamais
              indispensable à la compréhension de la confirmation.
              Document autorisé à déborder sur plusieurs pages si la
              liste d'articles est longue (plus une exigence stricte
              d'une seule page) — mais jamais une ligne coupée en plein
              milieu entre deux pages (.sb-receipt-print-table tr,
              break-inside: avoid, voir app/globals.css, même principe
              que .sb-catalogue-card) et <thead> se répète nativement en
              haut de chaque page suivante (comportement natif des
              navigateurs pour un <table> qui déborde, sans CSS
              supplémentaire) — un lecteur retrouve toujours les
              en-têtes de colonnes en haut de chaque page. */}
          <table className="sb-receipt-print-table">
            <thead>
              <tr>
                <th>{t("receipt.tableArticle")}</th>
                <th style={{ textAlign: "right" }}>{t("receipt.tablePrixUnitaire")}</th>
                <th style={{ textAlign: "center" }}>{t("receipt.tableQuantite")}</th>
                <th style={{ textAlign: "right" }}>{t("receipt.tableSousTotal")}</th>
              </tr>
            </thead>
            <tbody>
              {lignesVendues.map((l, i) => (
                <tr key={`v-${i}`}>
                  <td>{l.nom}</td>
                  <td style={{ textAlign: "right" }}>{fmt(l.prix_vente)}</td>
                  <td style={{ textAlign: "center" }}>
                    {l.quantite} {uniteLabel(l.unite)}
                  </td>
                  <td style={{ textAlign: "right" }}>{fmt(l.prix_vente * l.quantite)}</td>
                </tr>
              ))}
              {lignesOffertes.length > 0 && (
                <tr style={{ breakAfter: "avoid", pageBreakAfter: "avoid" }}>
                  <td
                    colSpan={4}
                    style={{ padding: "6px 8px 3px", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.05em", color: "#8A867F", border: "none" }}
                  >
                    {t("receipt.cadeauxTitrePrint")}
                  </td>
                </tr>
              )}
              {lignesOffertes.map((l, i) => (
                <tr key={`o-${i}`}>
                  <td>{l.nom}</td>
                  <td style={{ textAlign: "right" }}>—</td>
                  <td style={{ textAlign: "center" }}>
                    {l.quantite} {uniteLabel(l.unite)}
                  </td>
                  <td style={{ textAlign: "right", fontWeight: 700 }}>{t("receipt.offertPrint")}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="sb-receipt-print-totals">
            <div>
              <span>{t("receipt.totalArticles")}</span>
              <strong>{fmt(commande.ca)}</strong>
            </div>
            {commande.livraison_frais > 0 && (
              <div>
                <span>{t("receipt.printFraisLivraison")}</span>
                <strong>{fmt(commande.livraison_frais)}</strong>
              </div>
            )}
            <div className="total">
              <span>{t("receipt.totalAPayer")}</span>
              <strong>{fmt(totalGeneral)}</strong>
            </div>
          </div>

          <p className="sb-receipt-print-stamp">{t("receipt.stampConfirmee")}</p>

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
