"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Image as ImageIcon } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { fmt as fmtBase, dateLocale, tronquerMilieuNom } from "@/lib/format";
import { t as tBase } from "@/lib/i18n";
import PrintPreviewModal from "@/components/PrintPreviewModal";

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

// Seuil pour le nom d'article sous chaque carré de cadeau offert (case de
// 64px, police 9px, voir .sb-receipt-print-cadeau dans globals.css) — plus
// court que LONGUEUR_NOM_IMPRESSION ci-dessus, calibré sur cette largeur
// bien plus étroite qu'une cellule de tableau.
const LONGUEUR_NOM_CADEAU = 12;

// Même principe que plus bas pour les carrés de cadeaux (couleurs
// "emerald" recopiées en dur plutôt que var(--emerald)/var(--emerald-bg),
// qui suivraient le mode sombre éventuel de l'app alors que ce composant
// reste toujours blanc) — signale qu'une commande Mobile Money a déjà son
// montant d'articles réglé au moment de la commande, jamais dû à la
// livraison.
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
  // d'impression A4). Quand vrai, le montant des articles est déjà réglé,
  // seuls les frais de livraison restent dus à la livraison.
  const dejaPaye = commande.paye_totalite === true;
  const totalDu = dejaPaye ? commande.livraison_frais || 0 : totalGeneral;
  // acompteVerse vient déjà calculé du composant appelant (somme des
  // acomptes au statut 'verse' — voir app/(app)/nouvelle/page.js,
  // app/(app)/commandes/[id]/page.js), jamais recalculé ici : ce
  // composant ne connaît la commande que par ce que son appelant lui
  // transmet, jamais par sa propre requête Supabase.
  const acompteVerse = commande.acompteVerse || 0;
  const resteAPayer = Math.max(0, totalDu - acompteVerse);
  // Séparées une fois pour les 2 sections du document (tableau des
  // articles vendus, carrés des articles offerts) : aucune trace de
  // cadeaux nulle part tant que lignesOffertes est vide — la section
  // dédiée ci-dessous n'est alors jamais rendue.
  const lignesVendues = commande.lignes.filter((l) => !l.offert);
  const lignesOffertes = commande.lignes.filter((l) => l.offert);
  const businessName = business?.name;
  const logo = business?.logo_url;
  const dateStr = new Date(commande.created_at).toLocaleDateString(dateLocale(business?.langue), {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
  const [platformLogo, setPlatformLogo] = useState("");
  const printRef = useRef(null);
  // Tampon « Confirmée » capturé séparément du reste du document (jamais
  // nichée dans printRef) : voir composerTamponEtPiedDePage dans
  // lib/pdfExport.js, qui le place lui-même dans l'espace libre de la
  // dernière page, jamais superposé au contenu ni coupé par un saut de
  // page — seul moyen de connaître cet espace libre une fois les autres
  // pages déjà découpées.
  const stampRef = useRef(null);
  // Pied de page « Propulsé par Doka » capturé séparément, selon exactement
  // le même principe que stampRef ci-dessus (jamais niché dans printRef
  // pendant cette capture-là) : lib/pdfExport.js compose désormais le
  // tampon PUIS ce pied de page, dans cet ordre, dans l'espace libre de la
  // dernière page — le pied de page reste ainsi le tout dernier élément du
  // document, avec le tampon juste au-dessus plutôt qu'en-dessous de lui.
  const footerRef = useRef(null);

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

  return (
    <>
      {/* Aperçu avant impression — composant commun à tous les documents
          imprimables de Doka (voir components/PrintPreviewModal.js). Rendu
          directement à partir de .sb-receipt-print ci-dessous : aucune
          version séparée qui pourrait diverger de ce qui est réellement
          téléchargé. .sb-pdf-export-capture rend temporairement visible
          (dans la fenêtre, jamais hors écran) le bloc normalement
          display: none le temps de la capture html2canvas — indispensable
          pour qu'elle puisse le mesurer/le rendre ; onCaptured retire cette
          classe dès que la capture (contenu + tampon) est terminée. */}
      <PrintPreviewModal
        open={true}
        onClose={onClose}
        title={t("receipt.confirmationTitle")}
        nomFichier={nomFichierPdf()}
        getElement={() => {
          const el = printRef.current;
          el?.classList.add("sb-pdf-export-capture");
          return el;
        }}
        getStampElement={() => {
          const el = stampRef.current;
          el?.classList.add("sb-pdf-export-capture");
          return el;
        }}
        getFooterElement={() => {
          const el = footerRef.current;
          el?.classList.add("sb-pdf-export-capture");
          return el;
        }}
        onCaptured={() => {
          printRef.current?.classList.remove("sb-pdf-export-capture");
          stampRef.current?.classList.remove("sb-pdf-export-capture");
          footerRef.current?.classList.remove("sb-pdf-export-capture");
        }}
        labelFermer={t("common.apercuFermer")}
        labelTelecharger={t("receipt.telechargerPdf")}
        labelTelechargement={t("common.apercuTelechargement")}
        labelGeneration={t("receipt.generationPdf")}
        labelErreur={t("receipt.pdfError")}
        labelPage={(page, total) => t("common.pageSur", { page, total })}
      />

      {/* Mise en page dédiée à l'impression — pleine page A4, invisible à l'écran.
          Rendue via un portail directement dans <body> pour ne dépendre d'aucune
          structure de page parente : le CSS @media print n'a qu'à masquer .sb-root
          et afficher ce bloc (impression native, Ctrl+P, indépendante de l'aperçu
          et du PDF téléchargé ci-dessus). Le tampon et le pied de page
          (sb-receipt-print-stamp-standalone, sb-receipt-print-footer-standalone)
          sont deux blocs supplémentaires du même portail, frères de
          .sb-receipt-print plutôt que nichés dedans : capturés séparément par
          lib/pdfExport.js (qui les compose dans cet ordre — tampon puis pied
          de page — dans l'espace libre de la dernière page), jamais par
          l'impression native, qui garde ses propres versions nichées plus bas
          (.sb-receipt-print-stamp, .sb-receipt-print-footer), inchangées et
          déjà dans le bon ordre. */}
      {createPortal(
        <>
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

            {/* Mise en page d'origine (photo par article) — la compaction
                extrême tentée pour tenir sur une seule page a été
                abandonnée sur demande : le document est explicitement
                autorisé à déborder sur plusieurs pages si la liste
                d'articles est longue. Ce qui reste non négociable : jamais
                une ligne coupée en plein milieu entre deux pages
                (.sb-pdf-no-split, repéré par capturerPages dans
                lib/pdfExport.js) et, à l'impression native (Ctrl+P), un
                <thead> qui se répète en haut de chaque page suivante
                (comportement natif du navigateur pour un <table> qui
                déborde, sans CSS supplémentaire). Aucun emoji dans cette
                version imprimée. */}
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

            {/* Articles offerts — carrés plutôt qu'un tableau (demande
                explicite), en bas du document sous les totaux. Jamais de
                montant ici ; chaque carré est protégé par sb-pdf-no-split
                (jamais coupé entre deux pages), mais la section elle-même
                peut déborder sur plusieurs pages si les cadeaux sont
                nombreux — seul un carré pris individuellement ne doit
                jamais être coupé. */}
            {lignesOffertes.length > 0 && (
              <div className="sb-receipt-print-cadeaux">
                <p className="sb-receipt-print-cadeaux-titre">{t("receipt.cadeauxTitrePrint")}</p>
                <div className="sb-receipt-print-cadeaux-grid">
                  {lignesOffertes.map((l, i) => (
                    <div key={`o-${i}`} className="sb-receipt-print-cadeau sb-pdf-no-split">
                      <div className="sb-receipt-print-cadeau-photo">
                        {l.image_url ? (
                          <img src={l.image_url} alt="" />
                        ) : (
                          <div className="sb-receipt-print-cadeau-photo-fallback">
                            <ImageIcon size={14} />
                          </div>
                        )}
                      </div>
                      <p className="sb-receipt-print-cadeau-label">{t("receipt.cadeauOffertBadge")}</p>
                      <p className="sb-nom-tronque sb-receipt-print-cadeau-nom" title={l.nom}>
                        {tronquerMilieuNom(l.nom, LONGUEUR_NOM_CADEAU)}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Versions du tampon et du pied de page utilisées par
                l'impression native (Ctrl+P) uniquement — déjà dans le bon
                ordre (tampon puis pied de page) — masquées pendant la
                capture html2canvas (voir
                .sb-receipt-print.sb-pdf-export-capture
                .sb-receipt-print-stamp/-footer dans globals.css) : l'aperçu
                et le PDF téléchargé utilisent exclusivement les versions
                autonomes plus bas, composées par composerTamponEtPiedDePage
                (lib/pdfExport.js). */}
            <div className="sb-receipt-print-stamp">
              <span className="sb-receipt-print-stamp-mark">{t("receipt.stampConfirmee")}</span>
            </div>

            <div className="sb-receipt-print-footer" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 5 }}>
              {platformLogo && <img src={platformLogo} alt="" style={{ height: 12, width: 12, objectFit: "contain" }} />}
              {t("common.poweredBy")}
            </div>
          </div>

          <div className="sb-receipt-print-stamp-standalone" ref={stampRef}>
            <span className="sb-receipt-print-stamp-mark">{t("receipt.stampConfirmee")}</span>
          </div>

          {/* display: flex posé ici sur un <span> intérieur plutôt que sur
              .sb-receipt-print-footer-standalone elle-même : cette dernière
              reçoit .sb-pdf-export-capture pendant sa capture, qui impose
              display: block !important (voir globals.css) — un display:
              flex sur l'élément racine capturé serait écrasé par cette
              règle, même principe que text-align: right déjà utilisé pour
              .sb-receipt-print-stamp-standalone plutôt qu'un flex sur sa
              propre racine. */}
          <div className="sb-receipt-print-footer-standalone" ref={footerRef}>
            <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 5 }}>
              {platformLogo && <img src={platformLogo} alt="" style={{ height: 12, width: 12, objectFit: "contain" }} />}
              {t("common.poweredBy")}
            </span>
          </div>
        </>,
        document.body
      )}
    </>
  );
}
