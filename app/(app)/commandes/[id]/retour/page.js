"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import { ArrowLeft, RotateCcw } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/lib/AuthProvider";
import { fmt as fmtBase, dateLocale, tronquerMilieuNom } from "@/lib/format";
import { MODES_PAIEMENT_ACOMPTE } from "@/lib/constants";
import { t as tBase } from "@/lib/i18n";
import { quantiteRetourneeParLigne, quantiteRetournable } from "@/lib/retours";
import PrintPreviewModal from "@/components/PrintPreviewModal";

const COMMANDE_SELECT =
  "*, clients(nom, telephone, adresse, email), commande_lignes(id, article_id, quantite, prix_vente, prix_achat, frais_annexes, offert, articles(nom, unite, image_url)), retours(id, retour_lignes(commande_ligne_id, quantite))";

export default function RetourCommandePage() {
  const { business } = useAuth();
  const router = useRouter();
  const params = useParams();
  const fmt = (n) => fmtBase(n, business?.devise);
  const t = (key, vars) => tBase(business?.langue, key, vars);
  const uniteLabel = (u) => t(`common.unites.${u || "unite"}`);

  const [commande, setCommande] = useState(undefined);
  const [platformLogo, setPlatformLogo] = useState("");

  // Étape 1 (uniquement si retournable > 1) : choix de la quantité.
  const [quantiteModal, setQuantiteModal] = useState(null); // { ligne, max } | null
  const [quantiteSaisie, setQuantiteSaisie] = useState(1);

  // Étape 2 : confirmation (toujours affichée, précédée ou non de l'étape 1).
  const [confirmModal, setConfirmModal] = useState(null); // { ligne, quantite } | null
  const [modeRemboursement, setModeRemboursement] = useState("especes");
  const [motif, setMotif] = useState("");
  const [saving, setSaving] = useState(false);
  const [erreur, setErreur] = useState("");

  const [dernierRetour, setDernierRetour] = useState(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const printRef = useRef(null);

  async function charger() {
    const { data } = await supabase
      .from("commandes")
      .select(COMMANDE_SELECT)
      .eq("id", params.id)
      .eq("business_id", business.id)
      .maybeSingle();
    setCommande(data || null);
  }

  useEffect(() => {
    if (!business?.id || !params.id) return;
    let active = true;
    async function load() {
      await charger();
      const { data } = await supabase.from("parametres_globaux").select("logo_url").limit(1).maybeSingle();
      if (!active) return;
      setPlatformLogo(data?.logo_url || "");
    }
    load();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- charger() ferme sur business/params.id, redéfinie à chaque rendu mais toujours équivalente
  }, [business?.id, params.id]);

  if (commande === undefined) return <p className="sb-sub">{t("common.loading")}</p>;

  if (commande === null || commande.statut !== "livree") {
    return (
      <div>
        <button className="sb-back-link" onClick={() => router.push(`/commandes/${params.id}`)}>
          <ArrowLeft size={15} /> {t("commandes.retourRetourCommande")}
        </button>
        <p className="sb-sub">{t("commandes.detailNotFound")}</p>
      </div>
    );
  }

  const retourneParLigne = quantiteRetourneeParLigne(commande.retours);

  // Pré-sélection du mode de remboursement selon le paiement d'origine de
  // la commande — même principe que l'acompte final de "Solder la
  // commande" (dernierModeAcompte, app/(app)/commandes/[id]/page.js) :
  // une suggestion raisonnable, jamais imposée (le champ reste modifiable).
  function ouvrirRetour(ligne) {
    const max = quantiteRetournable(ligne, retourneParLigne);
    if (max <= 0) return;
    setErreur("");
    setModeRemboursement(commande.paiement_mode === "mobile_money" ? "mobile_money" : "especes");
    setMotif("");
    if (max > 1) {
      setQuantiteSaisie(1);
      setQuantiteModal({ ligne, max });
    } else {
      setConfirmModal({ ligne, quantite: 1 });
    }
  }

  function validerQuantite() {
    const q = Number(quantiteSaisie);
    if (!Number.isInteger(q) || q < 1 || q > quantiteModal.max) return;
    setConfirmModal({ ligne: quantiteModal.ligne, quantite: q });
    setQuantiteModal(null);
  }

  async function confirmerRetour() {
    if (!confirmModal || saving) return;
    setSaving(true);
    setErreur("");
    const { ligne, quantite } = confirmModal;
    const { data, error } = await supabase
      .rpc("enregistrer_retour", {
        p_commande_ligne_id: ligne.id,
        p_quantite: quantite,
        p_mode_remboursement: modeRemboursement,
        p_motif: motif.trim() || null,
      })
      .single();
    setSaving(false);
    if (error) {
      setErreur(t("commandes.retourError", { message: error.message }));
      return;
    }
    setConfirmModal(null);
    setDernierRetour({
      numero: data.numero,
      created_at: data.created_at,
      montant: data.montant,
      mode_remboursement: data.mode_remboursement,
      motif: data.motif,
      article: ligne.articles,
      unite: ligne.articles?.unite,
      quantite,
      prixUnitaire: ligne.prix_vente,
    });
    await charger();
    setPreviewOpen(true);
  }

  function getElementImpression() {
    const el = printRef.current;
    el?.classList.add("sb-pdf-export-capture");
    return el;
  }

  return (
    <div>
      <button className="sb-back-link" onClick={() => router.push(`/commandes/${commande.id}`)}>
        <ArrowLeft size={15} /> {t("commandes.retourRetourCommande")}
      </button>

      <div style={{ marginBottom: 18 }}>
        <h1 className="sb-h1">{t("commandes.retourFormTitle")}</h1>
        <p className="sb-sub sb-mono">{commande.numero}</p>
      </div>

      <div className="sb-card" style={{ marginBottom: 16 }}>
        <div className="sb-receipt-print-info">
          <div className="sb-receipt-print-info-block">
            <h3>{t("receipt.printClient")}</h3>
            <div>
              <span>{t("receipt.printNom")}</span>
              <strong>{commande.clients?.nom ?? "—"}</strong>
            </div>
            <div>
              <span>{t("receipt.printTelephone")}</span>
              <strong>{commande.clients?.telephone ?? "—"}</strong>
            </div>
            <div>
              <span>{t("receipt.printAdresse")}</span>
              <strong>{commande.clients?.adresse || "—"}</strong>
            </div>
          </div>
          <div className="sb-receipt-print-info-block">
            <h3>{t("receipt.printLivraisonPaiement")}</h3>
            <div>
              <span>{t("receipt.printLivraison")}</span>
              <strong>{commande.livraison_type === "livraison" ? commande.livraison_zone : t("receipt.recuperationBoutique")}</strong>
            </div>
            <div>
              <span>{t("receipt.printPaiement")}</span>
              <strong>{commande.paiement_mode === "mobile_money" ? commande.paiement_operateur : t("receipt.paiementLivraison")}</strong>
            </div>
          </div>
        </div>
      </div>

      <div className="sb-card">
        <div className="sb-section-title" style={{ fontSize: 13 }}>
          {t("commandes.articlesTitle")}
        </div>
        <div className="sb-table-scroll">
          <table className="sb-table">
            <thead>
              <tr>
                <th></th>
                <th>{t("receipt.tableArticle")}</th>
                <th style={{ textAlign: "right" }}>{t("receipt.tablePrixUnitaire")}</th>
                <th style={{ textAlign: "center" }}>{t("commandes.colQte")}</th>
                <th style={{ textAlign: "right" }}>{t("commandes.colSousTotal")}</th>
                <th style={{ textAlign: "center" }}>{t("commandes.colDejaRetourne")}</th>
                <th style={{ textAlign: "center" }}>{t("commandes.colRetournable")}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {commande.commande_lignes.map((l) => {
                const dejaRetourne = retourneParLigne[l.id] || 0;
                const retournable = quantiteRetournable(l, retourneParLigne);
                return (
                  <tr key={l.id}>
                    <td style={{ width: 44 }}>
                      {l.articles?.image_url ? (
                        <div className="sb-thumb-upload">
                          <img src={l.articles.image_url} alt="" />
                        </div>
                      ) : null}
                    </td>
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span className="sb-nom-tronque" title={l.articles?.nom ?? ""} style={{ flex: 1, minWidth: 0 }}>
                          {l.articles?.nom ? tronquerMilieuNom(l.articles.nom) : "—"}
                        </span>
                        {l.offert && (
                          <span className="sb-badge sb-badge-amber" style={{ fontSize: 11, flexShrink: 0 }}>
                            {t("receipt.cadeauOffertBadge")}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="sb-mono" style={{ textAlign: "right" }}>{fmt(l.prix_vente)}</td>
                    <td className="sb-mono" style={{ textAlign: "center" }}>
                      {l.quantite} {uniteLabel(l.articles?.unite)}
                    </td>
                    <td className="sb-mono" style={{ textAlign: "right" }}>{fmt(l.prix_vente * l.quantite)}</td>
                    <td className="sb-mono" style={{ textAlign: "center" }}>{l.offert ? "—" : dejaRetourne}</td>
                    <td className="sb-mono" style={{ textAlign: "center" }}>{l.offert ? "—" : retournable}</td>
                    <td>
                      {l.offert ? null : retournable > 0 ? (
                        <button className="sb-btn sb-btn-ghost" style={{ color: "var(--coral)", whiteSpace: "nowrap" }} onClick={() => ouvrirRetour(l)}>
                          <RotateCcw size={13} /> {t("commandes.retour")}
                        </button>
                      ) : (
                        <span className="sb-badge sb-badge-muted">{t("commandes.retourne")}</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {quantiteModal && (
        <div className="sb-modal-overlay" onClick={() => setQuantiteModal(null)}>
          <div className="sb-card" style={{ width: 360, maxWidth: "95vw" }} onClick={(e) => e.stopPropagation()}>
            <div className="sb-section-title" style={{ marginBottom: 12 }}>
              {t("commandes.retourQuantiteTitle")}
            </div>
            <p style={{ fontSize: 13, color: "var(--muted)", margin: "0 0 14px" }}>
              {t("commandes.retourQuantiteSub", { nom: quantiteModal.ligne.articles?.nom ?? "", max: quantiteModal.max })}
            </p>
            <div className="sb-field" style={{ marginBottom: 16 }}>
              <label>{t("commandes.quantiteLabel")}</label>
              <input
                className="sb-input"
                type="number"
                min={1}
                max={quantiteModal.max}
                value={quantiteSaisie}
                onChange={(e) => setQuantiteSaisie(e.target.value)}
              />
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="sb-btn sb-btn-ghost" style={{ flex: 1, justifyContent: "center" }} onClick={() => setQuantiteModal(null)}>
                {t("commandes.annuler")}
              </button>
              <button
                className="sb-btn sb-btn-primary"
                style={{ flex: 1, justifyContent: "center" }}
                onClick={validerQuantite}
                disabled={!Number.isInteger(Number(quantiteSaisie)) || Number(quantiteSaisie) < 1 || Number(quantiteSaisie) > quantiteModal.max}
              >
                {t("commandes.continuer")}
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmModal && (
        <div className="sb-modal-overlay" onClick={() => !saving && setConfirmModal(null)}>
          <div className="sb-card" style={{ width: 420, maxWidth: "95vw" }} onClick={(e) => e.stopPropagation()}>
            <div className="sb-section-title" style={{ marginBottom: 12 }}>
              {t("commandes.retourConfirmTitle")}
            </div>

            <div className="sb-client-fiche" style={{ marginTop: 0, marginBottom: 16 }}>
              <div>
                <span>{t("receipt.tableArticle")}</span>
                <strong>{confirmModal.ligne.articles?.nom ?? "—"}</strong>
              </div>
              <div>
                <span>{t("commandes.colQte")}</span>
                <strong>
                  {confirmModal.quantite} {uniteLabel(confirmModal.ligne.articles?.unite)}
                </strong>
              </div>
              <div>
                <span>{t("commandes.retourPrixPaye")}</span>
                <strong>{fmt(confirmModal.ligne.prix_vente)}</strong>
              </div>
              <div>
                <span>{t("commandes.retourMontantLabel")}</span>
                <strong className="sb-mono" style={{ color: "var(--coral)" }}>
                  {fmt(confirmModal.ligne.prix_vente * confirmModal.quantite)}
                </strong>
              </div>
            </div>

            <div className="sb-field" style={{ marginBottom: 14 }}>
              <label>{t("commandes.retourModeLabel")}</label>
              <select className="sb-input" value={modeRemboursement} onChange={(e) => setModeRemboursement(e.target.value)}>
                {MODES_PAIEMENT_ACOMPTE.map((m) => (
                  <option key={m} value={m}>
                    {m === "especes" ? t("commandes.especes") : t("commandes.mobileMoney")}
                  </option>
                ))}
              </select>
            </div>

            <div className="sb-field" style={{ marginBottom: 16 }}>
              <label>{t("commandes.retourMotifLabel")}</label>
              <input
                className="sb-input"
                placeholder={t("commandes.retourMotifPlaceholder")}
                value={motif}
                onChange={(e) => setMotif(e.target.value)}
              />
            </div>

            {erreur && <p style={{ fontSize: 12, color: "var(--coral)", margin: "0 0 12px" }}>{erreur}</p>}

            <button
              className="sb-btn sb-btn-primary"
              style={{ width: "100%", justifyContent: "center" }}
              onClick={confirmerRetour}
              disabled={saving}
            >
              <RotateCcw size={14} /> {saving ? t("commandes.saving") : t("commandes.retourConfirmerBtn")}
            </button>
          </div>
        </div>
      )}

      <PrintPreviewModal
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        title={t("commandes.retourRapportTitle")}
        nomFichier={`${dernierRetour?.numero || "retour"}.pdf`}
        getElement={getElementImpression}
        onCaptured={() => printRef.current?.classList.remove("sb-pdf-export-capture")}
        labelFermer={t("common.apercuFermer")}
        labelTelecharger={t("achats.telechargerPdf")}
        labelTelechargement={t("common.apercuTelechargement")}
        labelGeneration={t("achats.generationPdf")}
        labelErreur={(err) => t("achats.impressionError", { message: err.message })}
        labelPage={(p, total) => t("common.pageSur", { page: p, total })}
      />

      {dernierRetour &&
        typeof document !== "undefined" &&
        createPortal(
          <div className="sb-retour-print" ref={printRef}>
            <div className="sb-retour-print-header">
              <div className="sb-retour-print-brand">
                {business?.logo_url ? (
                  <img src={business.logo_url} alt={business?.name || "Logo"} />
                ) : (
                  <div className="sb-retour-print-logo-fallback">{(business?.name || "Doka").slice(0, 2).toUpperCase()}</div>
                )}
                <span className="sb-retour-print-brand-name">{business?.name || t("common.defaultBusinessName")}</span>
              </div>
              <div className="sb-retour-print-title">
                <h1>{t("commandes.retourRapportTitle")}</h1>
                <p className="sb-mono">{dernierRetour.numero}</p>
                <p>{new Date(dernierRetour.created_at).toLocaleDateString(dateLocale(business?.langue))}</p>
              </div>
            </div>

            <div className="sb-retour-print-info sb-pdf-no-split">
              <div className="sb-retour-print-info-block">
                <h3>{t("receipt.printClient")}</h3>
                <div>{commande.clients?.nom ?? "—"}</div>
                <div>{commande.clients?.telephone ?? "—"}</div>
              </div>
              <div className="sb-retour-print-info-block">
                <h3>{t("commandes.retourCommandeLabel")}</h3>
                <div className="sb-mono">{commande.numero}</div>
              </div>
            </div>

            <table className="sb-retour-print-table">
              <thead>
                <tr>
                  <th>{t("receipt.tableArticle")}</th>
                  <th style={{ textAlign: "right" }}>{t("commandes.colQte")}</th>
                  <th style={{ textAlign: "right" }}>{t("receipt.tablePrixUnitaire")}</th>
                  <th style={{ textAlign: "right" }}>{t("commandes.retourMontantLabel")}</th>
                </tr>
              </thead>
              <tbody>
                <tr className="sb-pdf-no-split">
                  <td>{tronquerMilieuNom(dernierRetour.article?.nom || "—", 40)}</td>
                  <td style={{ textAlign: "right" }}>
                    {dernierRetour.quantite} {uniteLabel(dernierRetour.unite)}
                  </td>
                  <td style={{ textAlign: "right" }}>{fmt(dernierRetour.prixUnitaire)}</td>
                  <td style={{ textAlign: "right" }}>{fmt(dernierRetour.montant)}</td>
                </tr>
              </tbody>
            </table>

            <div className="sb-retour-print-totals sb-pdf-no-split">
              <div className="sb-retour-print-totals-block">
                <div>
                  <span>{t("commandes.retourModeLabel")}</span>
                  <strong>{dernierRetour.mode_remboursement === "especes" ? t("commandes.especes") : t("commandes.mobileMoney")}</strong>
                </div>
                {dernierRetour.motif && (
                  <div>
                    <span>{t("commandes.retourMotifLabel")}</span>
                    <strong>{dernierRetour.motif}</strong>
                  </div>
                )}
                <div className="total">
                  <span>{t("commandes.retourMontantLabel")}</span>
                  <strong>{fmt(dernierRetour.montant)}</strong>
                </div>
              </div>
            </div>

            <div className="sb-retour-print-footer">
              {platformLogo && <img src={platformLogo} alt="" />}
              {t("common.poweredBy")}
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
