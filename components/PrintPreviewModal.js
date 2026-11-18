"use client";

import { useEffect, useRef, useState } from "react";
import { Download } from "lucide-react";
import { capturerPages, telechargerPagesEnPdf } from "@/lib/pdfExport";

// Aperçu commun à tous les documents imprimables de Doka (confirmation de
// commande, stock, catalogue, commandes, trésorerie, réceptions d'achats,
// inventaire...). Un seul endroit affiche le document avant impression —
// jamais de PDF téléchargé ou imprimé directement au clic d'un bouton,
// toujours ce passage par l'aperçu d'abord.
//
// Une seule source de rendu pour l'aperçu ET le PDF final : les pages
// affichées ici (capturerPages, lib/pdfExport.js) sont exactement les mêmes
// <canvas> que ceux assemblés dans le PDF téléchargé — jamais une version
// séparée qui pourrait diverger du résultat imprimé.
//
// `getElement` (sync ou async) et `getStampElement` (optionnel) suivent le
// même contrat que exporterPdf : chaque appelant garde la responsabilité de
// préparer son bloc d'impression (classe sb-pdf-export-capture, requête de
// données complémentaire si besoin...) et de le nettoyer via `onCaptured`,
// appelé dès la fin de la capture, avant même l'affichage de l'aperçu.
//
// `dependencies` : quand un de ces éléments change pendant que l'aperçu est
// ouvert (ex. la case « Afficher la colonne Stock » de la fiche
// d'inventaire), l'aperçu se recapture pour refléter immédiatement le choix
// — `renderOptions` (JSX fourni par l'appelant, qui garde l'état de ses
// propres options) s'affiche dans l'en-tête de la modale à cet effet.
export default function PrintPreviewModal({
  open,
  onClose,
  title,
  nomFichier,
  getElement,
  getStampElement,
  getFooterElement,
  onCaptured,
  renderOptions,
  dependencies = [],
  labelFermer = "Fermer",
  labelTelecharger = "Télécharger en PDF",
  labelTelechargement = "Téléchargement…",
  labelGeneration = "Génération de l'aperçu…",
  labelErreur = "Une erreur est survenue. Réessayez.",
  labelPage = (page, total) => `Page ${page} / ${total}`,
}) {
  const [pages, setPages] = useState(null);
  const [pxParMm, setPxParMm] = useState(1);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [erreur, setErreur] = useState(null);
  const depsKey = JSON.stringify(dependencies);

  // labelErreur accepte soit un texte fixe, soit une fonction (err) =>
  // texte — chaque appelant garde ainsi la main sur la formulation exacte
  // de son message d'erreur (ex. « Impossible de générer le PDF du stock :
  // {message} »), plutôt qu'un texte générique imposé ici.
  function messageErreur(err) {
    if (typeof labelErreur === "function") return labelErreur(err);
    return labelErreur;
  }

  useEffect(() => {
    let annule = false;
    (async () => {
      if (!open) {
        setPages(null);
        setErreur(null);
        return;
      }
      setLoading(true);
      setErreur(null);
      try {
        const el = await getElement();
        const stampElement = getStampElement ? await getStampElement() : null;
        const footerElement = getFooterElement ? await getFooterElement() : null;
        const resultat = await capturerPages(el, { stampElement, footerElement });
        onCaptured?.();
        if (annule) return;
        setPages(resultat.pages);
        setPxParMm(resultat.pxParMm);
      } catch (err) {
        onCaptured?.();
        if (!annule) setErreur(messageErreur(err));
      } finally {
        if (!annule) setLoading(false);
      }
    })();
    return () => {
      annule = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, depsKey]);

  if (!open) return null;

  async function telecharger() {
    if (!pages) return;
    setDownloading(true);
    try {
      await telechargerPagesEnPdf({ pages, pxParMm, nomFichier });
    } catch (err) {
      setErreur(messageErreur(err));
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="sb-modal-overlay" onClick={onClose}>
      <div className="sb-print-preview-card" onClick={(e) => e.stopPropagation()}>
        <div className="sb-print-preview-header">
          <span className="sb-print-preview-title">{title}</span>
          {renderOptions && <div className="sb-print-preview-options">{renderOptions}</div>}
        </div>

        <div className="sb-print-preview-body">
          {loading && <p className="sb-print-preview-status">{labelGeneration}</p>}
          {!loading && erreur && <p className="sb-print-preview-status">{erreur}</p>}
          {!loading &&
            !erreur &&
            pages &&
            pages.map((page, i) => (
              <PrintPreviewPage key={i} canvas={page} label={labelPage(i + 1, pages.length)} />
            ))}
        </div>

        <div className="sb-print-preview-footer">
          <button type="button" className="sb-btn sb-btn-ghost" onClick={onClose}>
            {labelFermer}
          </button>
          <button
            type="button"
            className="sb-btn sb-btn-primary"
            onClick={telecharger}
            disabled={!pages || loading || downloading}
          >
            <Download size={14} /> {downloading ? labelTelechargement : labelTelecharger}
          </button>
        </div>
      </div>
    </div>
  );
}

// Insère directement le <canvas> déjà capturé dans le DOM (jamais une copie
// via toDataURL) : les pixels affichés à l'écran sont strictement ceux
// utilisés ensuite pour le PDF téléchargé.
function PrintPreviewPage({ canvas, label }) {
  const conteneurRef = useRef(null);

  useEffect(() => {
    const conteneur = conteneurRef.current;
    if (!conteneur) return;
    conteneur.innerHTML = "";
    conteneur.appendChild(canvas);
    return () => {
      if (canvas.parentNode === conteneur) conteneur.removeChild(canvas);
    };
  }, [canvas]);

  return (
    <div className="sb-print-preview-page-wrap">
      <div className="sb-print-preview-page" ref={conteneurRef} />
      <span className="sb-print-preview-page-label">{label}</span>
    </div>
  );
}
