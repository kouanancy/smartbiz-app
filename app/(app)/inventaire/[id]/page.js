"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import { ArrowLeft, CheckCircle2, Download, Search, Trash2 } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/lib/AuthProvider";
import { fmt as fmtBase, dateLocale, tronquerMilieuNom } from "@/lib/format";
import { t as tBase } from "@/lib/i18n";
import PrintPreviewModal from "@/components/PrintPreviewModal";

const LONGUEUR_NOM_IMPRESSION = 40;

export default function InventaireDetailPage() {
  const { business } = useAuth();
  const router = useRouter();
  const params = useParams();
  const fmt = (n) => fmtBase(n, business?.devise);
  const t = (key, vars) => tBase(business?.langue, key, vars);
  const uniteLabel = (u) => t(`common.unites.${u || "unite"}`);

  const [inventaire, setInventaire] = useState(undefined);
  const [lignes, setLignes] = useState([]);
  const [categories, setCategories] = useState([]);
  const [platformLogo, setPlatformLogo] = useState("");

  const [recherche, setRecherche] = useState("");
  const [nonComptesSeulement, setNonComptesSeulement] = useState(false);

  const [validating, setValidating] = useState(false);
  const [actionError, setActionError] = useState("");
  const [confirmStockModifie, setConfirmStockModifie] = useState(null); // tableau des articles concernés, ou null

  const [ficheAvecStock, setFicheAvecStock] = useState(false);
  const [ficheOpen, setFicheOpen] = useState(false);
  const [rapportOpen, setRapportOpen] = useState(false);
  const ficheRef = useRef(null);
  const rapportRef = useRef(null);

  async function charger() {
    const { data: inv } = await supabase.from("inventaires").select("*").eq("id", params.id).eq("business_id", business.id).maybeSingle();
    setInventaire(inv || null);
    if (!inv) return;
    const { data: lig } = await supabase
      .from("inventaire_lignes")
      .select("*, articles(nom, code, unite, image_url, categorie_id, stock)")
      .eq("inventaire_id", inv.id)
      .order("created_at", { ascending: true });
    setLignes(lig || []);
  }

  useEffect(() => {
    if (!business?.id || !params.id) return;
    let active = true;
    async function load() {
      await charger();
      const [categoriesRes, logoRes] = await Promise.all([
        supabase.from("categories").select("*").eq("business_id", business.id).order("nom"),
        supabase.from("parametres_globaux").select("logo_url").limit(1).maybeSingle(),
      ]);
      if (!active) return;
      setCategories(categoriesRes.data || []);
      setPlatformLogo(logoRes.data?.logo_url || "");
    }
    load();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- charger() ferme sur business/params.id, redéfinie à chaque rendu mais toujours équivalente
  }, [business?.id, params.id]);

  const estBrouillon = inventaire?.statut === "brouillon";

  const categorieName = (id) => categories.find((c) => c.id === id)?.nom ?? t("common.sansCategorie");

  const lignesAffichees = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    return lignes.filter((l) => {
      if (nonComptesSeulement && l.quantite_comptee !== null) return false;
      if (!q) return true;
      return (l.articles?.nom || "").toLowerCase().includes(q) || (l.articles?.code || "").toLowerCase().includes(q);
    });
  }, [lignes, recherche, nonComptesSeulement]);

  async function majLigne(ligne, champs) {
    setLignes((ls) => ls.map((l) => (l.id === ligne.id ? { ...l, ...champs } : l)));
    await supabase.from("inventaire_lignes").update(champs).eq("id", ligne.id);
  }

  async function valider(confirmerEcartsStock) {
    setValidating(true);
    setActionError("");
    const { error } = await supabase
      .rpc("valider_inventaire", { p_inventaire_id: inventaire.id, p_confirmer_ecarts_stock: !!confirmerEcartsStock })
      .single();
    if (error) {
      if (error.message === "STOCK_MODIFIE_DEPUIS_DEBUT") {
        const articleIds = lignes.filter((l) => l.quantite_comptee !== null).map((l) => l.article_id);
        const { data: articlesActuels } = await supabase.from("articles").select("id, nom, stock").in("id", articleIds);
        const concernes = lignes
          .filter((l) => l.quantite_comptee !== null)
          .map((l) => ({ nom: l.articles?.nom, stockActuel: articlesActuels?.find((a) => a.id === l.article_id)?.stock, stockDebut: l.stock_debut }))
          .filter((c) => c.stockActuel !== undefined && c.stockActuel !== c.stockDebut);
        setConfirmStockModifie(concernes);
        setValidating(false);
        return;
      }
      setActionError(error.message);
      setValidating(false);
      return;
    }
    setConfirmStockModifie(null);
    await charger();
  }

  async function supprimerBrouillon() {
    if (!window.confirm(t("inventaire.confirmSupprimerBrouillon"))) return;
    const { error } = await supabase.from("inventaires").delete().eq("id", inventaire.id);
    if (error) {
      window.alert(error.message);
      return;
    }
    router.push("/inventaire");
  }

  function getElementFiche() {
    const el = ficheRef.current;
    el?.classList.add("sb-pdf-export-capture");
    return el;
  }

  function getElementRapport() {
    const el = rapportRef.current;
    el?.classList.add("sb-pdf-export-capture");
    return el;
  }

  if (inventaire === undefined) return <p className="sb-sub">{t("common.loading")}</p>;

  if (inventaire === null) {
    return (
      <div>
        <button className="sb-back-link" onClick={() => router.push("/inventaire")}>
          <ArrowLeft size={15} /> {t("inventaire.detailBackToList")}
        </button>
        <p className="sb-sub">{t("inventaire.detailNotFound")}</p>
      </div>
    );
  }

  const nbComptes = lignes.filter((l) => l.quantite_comptee !== null).length;
  const lignesEcarts = lignes.filter((l) => l.ecart !== null && l.ecart !== 0);
  const totalEcartValeur = lignesEcarts.reduce((s, l) => s + l.ecart * (l.cout_moyen_validation || 0), 0);
  const perimetreLabel =
    !inventaire.perimetre_categorie_ids || inventaire.perimetre_categorie_ids.length === 0
      ? t("inventaire.perimetreToutes")
      : inventaire.perimetre_categorie_ids.map((id) => categorieName(id)).join(", ");

  return (
    <div>
      <button className="sb-back-link" onClick={() => router.push("/inventaire")}>
        <ArrowLeft size={15} /> {t("inventaire.detailBackToList")}
      </button>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 10 }}>
        <div>
          <h1 className="sb-h1 sb-mono">{inventaire.numero}</h1>
          <p className="sb-sub">
            {new Date(inventaire.date_inventaire).toLocaleDateString(dateLocale(business?.langue))} · {perimetreLabel}
          </p>
        </div>
        <span className={`sb-badge ${inventaire.statut === "valide" ? "sb-badge-emerald" : "sb-badge-amber"}`} style={{ fontSize: 13, padding: "6px 12px" }}>
          {t(`inventaire.statut.${inventaire.statut}`)}
        </span>
      </div>

      {estBrouillon && (
        <div className="sb-card" style={{ marginTop: 14, marginBottom: 16 }}>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              <div style={{ position: "relative" }}>
                <Search size={14} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--text-faint)" }} />
                <input
                  className="sb-input"
                  style={{ paddingLeft: 30, width: 220 }}
                  placeholder={t("inventaire.recherchePlaceholder")}
                  value={recherche}
                  onChange={(e) => setRecherche(e.target.value)}
                />
              </div>
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
                <input type="checkbox" checked={nonComptesSeulement} onChange={(e) => setNonComptesSeulement(e.target.checked)} />
                {t("inventaire.filtreNonComptes")}
              </label>
            </div>
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <button className="sb-btn sb-btn-ghost" onClick={() => setFicheOpen(true)}>
                <Download size={14} /> {t("inventaire.telechargerFiche")}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="sb-card" style={{ marginBottom: 16 }}>
        <div className="sb-table-scroll">
          <table className="sb-table">
            <thead>
              <tr>
                <th style={{ width: 48 }}></th>
                <th>{t("articles.colCode")}</th>
                <th>{t("inventaire.colArticle")}</th>
                <th>{t("articles.colCategorie")}</th>
                <th style={{ textAlign: "right" }}>{t("inventaire.colStockDebut")}</th>
                <th style={{ textAlign: "right" }}>{t("inventaire.colQuantiteComptee")}</th>
                {!estBrouillon && <th style={{ textAlign: "right" }}>{t("inventaire.colEcart")}</th>}
                {estBrouillon && <th>{t("inventaire.colRemarque")}</th>}
              </tr>
            </thead>
            <tbody>
              {lignesAffichees.map((l) => (
                <tr key={l.id}>
                  <td>
                    {l.articles?.image_url ? (
                      <div className="sb-thumb-upload">
                        <img src={l.articles.image_url} alt="" />
                      </div>
                    ) : null}
                  </td>
                  <td className="sb-mono" style={{ color: "var(--muted)" }}>{l.articles?.code}</td>
                  <td className="sb-nom-tronque" title={l.articles?.nom}>
                    {tronquerMilieuNom(l.articles?.nom || "")}
                    {l.quantite_comptee === null && (
                      <span className="sb-badge sb-badge-amber" style={{ marginLeft: 6, fontSize: 10 }}>{t("inventaire.nonCompteBadge")}</span>
                    )}
                    {l.stock_modifie_depuis_debut && (
                      <span className="sb-badge sb-badge-coral" style={{ marginLeft: 6, fontSize: 10 }}>{t("inventaire.stockModifieBadge")}</span>
                    )}
                  </td>
                  <td className="sb-nom-tronque" style={{ color: "var(--muted)" }}>{categorieName(l.articles?.categorie_id)}</td>
                  <td className="sb-mono" style={{ textAlign: "right" }}>{l.stock_debut} {uniteLabel(l.articles?.unite)}</td>
                  <td style={{ textAlign: "right" }}>
                    {estBrouillon ? (
                      <input
                        className="sb-input"
                        style={{ width: 90, textAlign: "right" }}
                        type="number"
                        min={0}
                        value={l.quantite_comptee ?? ""}
                        placeholder="—"
                        onChange={(e) =>
                          setLignes((ls) => ls.map((x) => (x.id === l.id ? { ...x, quantite_comptee: e.target.value === "" ? null : Number(e.target.value) } : x)))
                        }
                        onBlur={(e) => majLigne(l, { quantite_comptee: e.target.value === "" ? null : Math.max(0, Number(e.target.value)) })}
                      />
                    ) : (
                      <span className="sb-mono">{l.quantite_comptee ?? "—"}</span>
                    )}
                  </td>
                  {!estBrouillon && (
                    <td className="sb-mono" style={{ textAlign: "right", color: l.ecart > 0 ? "var(--emerald)" : l.ecart < 0 ? "var(--coral)" : undefined }}>
                      {l.ecart === null ? "—" : l.ecart > 0 ? `+${l.ecart}` : l.ecart}
                    </td>
                  )}
                  {estBrouillon && (
                    <td>
                      <input
                        className="sb-input"
                        placeholder={t("inventaire.remarquePlaceholder")}
                        value={l.remarque || ""}
                        onChange={(e) => setLignes((ls) => ls.map((x) => (x.id === l.id ? { ...x, remarque: e.target.value } : x)))}
                        onBlur={(e) => majLigne(l, { remarque: e.target.value.trim() || null })}
                      />
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {!estBrouillon && lignesEcarts.length > 0 && (
        <div className="sb-card" style={{ marginBottom: 16, maxWidth: 360 }}>
          <div className="sb-section-title" style={{ fontSize: 13 }}>{t("inventaire.recapTitle")}</div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "4px 0" }}>
            <span style={{ color: "var(--muted)" }}>{t("inventaire.recapNbEcarts", { n: lignesEcarts.length })}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 15, fontWeight: 700, padding: "8px 0 0", borderTop: "1px solid var(--line)", marginTop: 6 }}>
            <span>{t("inventaire.recapValeurEcart")}</span>
            <span className="sb-mono" style={{ color: totalEcartValeur >= 0 ? "var(--emerald)" : "var(--coral)" }}>{fmt(totalEcartValeur)}</span>
          </div>
        </div>
      )}

      {actionError && <p style={{ fontSize: 12.5, color: "var(--coral)", margin: "0 0 12px" }}>{actionError}</p>}

      <div className="sb-detail-actions">
        {estBrouillon ? (
          <>
            <button className="sb-btn sb-btn-emerald" onClick={() => valider(false)} disabled={validating || nbComptes === 0}>
              <CheckCircle2 size={15} /> {validating ? t("achats.validationEnCours") : t("inventaire.validerInventaire")}
            </button>
            <button className="sb-btn sb-btn-ghost" style={{ color: "var(--coral)" }} onClick={supprimerBrouillon}>
              <Trash2 size={15} /> {t("inventaire.supprimerBrouillon")}
            </button>
          </>
        ) : (
          <button className="sb-btn sb-btn-ghost" onClick={() => setRapportOpen(true)}>
            <Download size={15} /> {t("inventaire.telechargerRapport")}
          </button>
        )}
      </div>

      {confirmStockModifie && (
        <div className="sb-modal-overlay" onClick={() => setConfirmStockModifie(null)}>
          <div className="sb-card" style={{ width: 400, background: "var(--card)" }} onClick={(e) => e.stopPropagation()}>
            <div className="sb-section-title" style={{ color: "var(--coral)" }}>{t("inventaire.stockModifieModalTitle")}</div>
            <p style={{ fontSize: 12.5, color: "var(--muted)", margin: "0 0 12px" }}>{t("inventaire.stockModifieModalSub")}</p>
            <ul style={{ fontSize: 13, margin: "0 0 14px", paddingLeft: 18 }}>
              {confirmStockModifie.map((c, i) => (
                <li key={i}>{c.nom} — {t("inventaire.stockModifieDetail", { debut: c.stockDebut, actuel: c.stockActuel })}</li>
              ))}
            </ul>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="sb-btn sb-btn-ghost" style={{ flex: 1, justifyContent: "center" }} onClick={() => setConfirmStockModifie(null)}>
                {t("admin.annuler")}
              </button>
              <button className="sb-btn" style={{ flex: 1, justifyContent: "center", background: "var(--coral)", color: "#fff" }} onClick={() => valider(true)}>
                {t("inventaire.confirmerEcartsStock")}
              </button>
            </div>
          </div>
        </div>
      )}

      {estBrouillon && (
        <PrintPreviewModal
          open={ficheOpen}
          onClose={() => setFicheOpen(false)}
          title={t("inventaire.ficheTitle")}
          nomFichier={`${inventaire.numero}-fiche.pdf`}
          getElement={getElementFiche}
          onCaptured={() => ficheRef.current?.classList.remove("sb-pdf-export-capture")}
          dependencies={[ficheAvecStock]}
          renderOptions={
            <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <input type="checkbox" checked={ficheAvecStock} onChange={(e) => setFicheAvecStock(e.target.checked)} />
              {t("inventaire.ficheAvecStockLabel")}
            </label>
          }
          labelFermer={t("common.apercuFermer")}
          labelTelecharger={t("inventaire.telechargerFiche")}
          labelTelechargement={t("common.apercuTelechargement")}
          labelGeneration={t("achats.generationPdf")}
          labelErreur={(err) => t("achats.impressionError", { message: err.message })}
          labelPage={(p, total) => t("common.pageSur", { page: p, total })}
        />
      )}

      {!estBrouillon && (
        <PrintPreviewModal
          open={rapportOpen}
          onClose={() => setRapportOpen(false)}
          title={t("inventaire.rapportTitle")}
          nomFichier={`${inventaire.numero}-rapport.pdf`}
          getElement={getElementRapport}
          onCaptured={() => rapportRef.current?.classList.remove("sb-pdf-export-capture")}
          labelFermer={t("common.apercuFermer")}
          labelTelecharger={t("inventaire.telechargerRapport")}
          labelTelechargement={t("common.apercuTelechargement")}
          labelGeneration={t("achats.generationPdf")}
          labelErreur={(err) => t("achats.impressionError", { message: err.message })}
          labelPage={(p, total) => t("common.pageSur", { page: p, total })}
        />
      )}

      {typeof document !== "undefined" &&
        estBrouillon &&
        createPortal(
          <div className="sb-reception-print" ref={ficheRef}>
            <div className="sb-reception-print-header">
              <div className="sb-reception-print-brand">
                {business?.logo_url ? (
                  <img src={business.logo_url} alt={business?.name || "Logo"} />
                ) : (
                  <div className="sb-reception-print-logo-fallback">{(business?.name || "Doka").slice(0, 2).toUpperCase()}</div>
                )}
                <span className="sb-reception-print-brand-name">{business?.name || t("common.defaultBusinessName")}</span>
              </div>
              <div className="sb-reception-print-title">
                <h1>{t("inventaire.ficheTitle")}</h1>
                <p className="sb-mono">{inventaire.numero}</p>
                <p>{new Date(inventaire.date_inventaire).toLocaleDateString(dateLocale(business?.langue))}</p>
              </div>
            </div>

            <div className="sb-reception-print-info sb-pdf-no-split">
              <div className="sb-reception-print-info-block">
                <h3>{t("inventaire.colPerimetre")}</h3>
                <div>{perimetreLabel}</div>
              </div>
            </div>

            <table className="sb-reception-print-table">
              <thead className="sb-pdf-repeat-header">
                <tr>
                  <th>{t("articles.colCode")}</th>
                  <th>{t("inventaire.colArticle")}</th>
                  <th>{t("articles.colCategorie")}</th>
                  {ficheAvecStock && <th style={{ textAlign: "right" }}>{t("inventaire.colStockDebut")}</th>}
                  <th style={{ textAlign: "right" }}>{t("inventaire.colQuantiteComptee")}</th>
                  <th>{t("inventaire.colRemarque")}</th>
                </tr>
              </thead>
              <tbody>
                {lignes.map((l) => (
                  <tr key={l.id} className="sb-pdf-no-split">
                    <td className="sb-mono">{l.articles?.code}</td>
                    <td style={{ maxWidth: 220 }}>{tronquerMilieuNom(l.articles?.nom || "", LONGUEUR_NOM_IMPRESSION)}</td>
                    <td>{categorieName(l.articles?.categorie_id)}</td>
                    {ficheAvecStock && <td style={{ textAlign: "right" }}>{l.stock_debut}</td>}
                    <td style={{ textAlign: "right" }}></td>
                    <td></td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="sb-reception-print-footer">
              {platformLogo && <img src={platformLogo} alt="" />}
              {t("common.poweredBy")}
            </div>
          </div>,
          document.body
        )}

      {typeof document !== "undefined" &&
        !estBrouillon &&
        createPortal(
          <div className="sb-reception-print" ref={rapportRef}>
            <div className="sb-reception-print-header">
              <div className="sb-reception-print-brand">
                {business?.logo_url ? (
                  <img src={business.logo_url} alt={business?.name || "Logo"} />
                ) : (
                  <div className="sb-reception-print-logo-fallback">{(business?.name || "Doka").slice(0, 2).toUpperCase()}</div>
                )}
                <span className="sb-reception-print-brand-name">{business?.name || t("common.defaultBusinessName")}</span>
              </div>
              <div className="sb-reception-print-title">
                <h1>{t("inventaire.rapportTitle")}</h1>
                <p className="sb-mono">{inventaire.numero}</p>
                <p>{new Date(inventaire.date_inventaire).toLocaleDateString(dateLocale(business?.langue))}</p>
              </div>
            </div>

            <table className="sb-reception-print-table">
              <thead className="sb-pdf-repeat-header">
                <tr>
                  <th>{t("inventaire.colArticle")}</th>
                  <th style={{ textAlign: "right" }}>{t("inventaire.colStockDebut")}</th>
                  <th style={{ textAlign: "right" }}>{t("inventaire.colQuantiteComptee")}</th>
                  <th style={{ textAlign: "right" }}>{t("inventaire.colEcart")}</th>
                  <th style={{ textAlign: "right" }}>{t("inventaire.colValeurEcart")}</th>
                </tr>
              </thead>
              <tbody>
                {lignesEcarts.map((l) => (
                  <tr key={l.id} className="sb-pdf-no-split">
                    <td style={{ maxWidth: 240 }}>{tronquerMilieuNom(l.articles?.nom || "", LONGUEUR_NOM_IMPRESSION)}</td>
                    <td style={{ textAlign: "right" }}>{l.stock_validation}</td>
                    <td style={{ textAlign: "right" }}>{l.quantite_comptee}</td>
                    <td style={{ textAlign: "right" }}>{l.ecart > 0 ? `+${l.ecart}` : l.ecart}</td>
                    <td style={{ textAlign: "right" }}>{fmt(l.ecart * (l.cout_moyen_validation || 0))}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="sb-reception-print-totals sb-pdf-no-split">
              <div className="sb-reception-print-totals-block">
                <div className="total"><span>{t("inventaire.recapValeurEcart")}</span><strong>{fmt(totalEcartValeur)}</strong></div>
              </div>
            </div>

            <div className="sb-reception-print-footer">
              {platformLogo && <img src={platformLogo} alt="" />}
              {t("common.poweredBy")}
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
