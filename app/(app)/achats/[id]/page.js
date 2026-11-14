"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import { ArrowLeft, CheckCircle2, Download, Plus, Trash2, XCircle } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/lib/AuthProvider";
import { fmt as fmtBase, dateLocale, tronquerMilieuNom } from "@/lib/format";
import { t as tBase } from "@/lib/i18n";
import { UNITES } from "@/lib/constants";
import { exporterPdf } from "@/lib/pdfExport";
import ArticleSelect from "@/components/ArticleSelect";
import ClearableInput from "@/components/ClearableInput";
import ImageUploadField from "@/components/ImageUploadField";
import PrixAchatConvertible from "@/components/PrixAchatConvertible";

const STATUT_BADGE_CLASS = { brouillon: "sb-badge-amber", validee: "sb-badge-emerald", annulee: "sb-badge-coral" };
const LONGUEUR_NOM_IMPRESSION = 40;

const LIGNE_VIDE = {
  mode: "existant",
  articleId: "",
  nom: "",
  categorieId: "",
  unite: "unite",
  imageUrl: "",
  prixVente: "",
  quantite: "1",
  coutUnitaire: "",
  fraisAnnexes: "",
};

export default function ReceptionDetailPage() {
  const { business } = useAuth();
  const router = useRouter();
  const params = useParams();
  const fmt = (n) => fmtBase(n, business?.devise);
  const t = (key, vars) => tBase(business?.langue, key, vars);
  const uniteLabel = (u) => t(`common.unites.${u || "unite"}`);

  const [reception, setReception] = useState(undefined);
  const [lignes, setLignes] = useState([]);
  const [articles, setArticles] = useState([]);
  const [categories, setCategories] = useState([]);
  const [platformLogo, setPlatformLogo] = useState("");

  const [ajoutOuvert, setAjoutOuvert] = useState(false);
  const [ligneForm, setLigneForm] = useState(LIGNE_VIDE);
  const [ligneError, setLigneError] = useState("");

  const [validating, setValidating] = useState(false);
  const [actionError, setActionError] = useState("");
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const printRef = useRef(null);

  async function charger() {
    const { data: rec } = await supabase.from("receptions").select("*").eq("id", params.id).eq("business_id", business.id).maybeSingle();
    setReception(rec || null);
    if (!rec) return;
    const { data: lig } = await supabase
      .from("reception_lignes")
      .select("*, articles(nom, code, unite, image_url)")
      .eq("reception_id", rec.id)
      .order("created_at", { ascending: true });
    setLignes(lig || []);
  }

  useEffect(() => {
    if (!business?.id || !params.id) return;
    let active = true;
    async function load() {
      await charger();
      const [articlesRes, categoriesRes, logoRes] = await Promise.all([
        supabase.from("articles").select("id, nom, code, unite, prix_achat, image_url").eq("business_id", business.id).order("nom"),
        supabase.from("categories").select("*").eq("business_id", business.id).order("nom"),
        supabase.from("parametres_globaux").select("logo_url").limit(1).maybeSingle(),
      ]);
      if (!active) return;
      setArticles(articlesRes.data || []);
      setCategories(categoriesRes.data || []);
      setPlatformLogo(logoRes.data?.logo_url || "");
    }
    load();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- charger() ferme sur business/params.id, redéfinie à chaque rendu mais toujours équivalente
  }, [business?.id, params.id]);

  const estBrouillon = reception?.statut === "brouillon";

  // Après l'ajout/la suppression d'une ligne : si une seule ligne reste et
  // que les frais étaient groupés, ils sont automatiquement reportés sur
  // cet article restant (la case se grise de nouveau) — voir point 4 de la
  // demande. Le prorata exact lui-même n'est de toute façon recalculé
  // qu'à la validation (valider_reception(), côté base) ; ceci n'ajuste
  // que ce qui est affiché/saisi tant que la réception est un brouillon.
  async function ajusterFraisGroupesSiUnSeul(nouvellesLignes) {
    if (nouvellesLignes.length !== 1 || !reception.frais_groupes) return;
    const seule = nouvellesLignes[0];
    await supabase.from("reception_lignes").update({ frais_annexes: reception.frais_total }).eq("id", seule.id);
    await supabase.from("receptions").update({ frais_groupes: false, frais_total: 0 }).eq("id", reception.id);
  }

  function ouvrirAjoutLigne() {
    setLigneForm(LIGNE_VIDE);
    setLigneError("");
    setAjoutOuvert(true);
  }

  async function ajouterLigne() {
    const qte = Number(ligneForm.quantite);
    const cout = Number(ligneForm.coutUnitaire) || 0;
    if (!qte || qte <= 0) {
      setLigneError(t("achats.quantiteInvalideError"));
      return;
    }
    if (ligneForm.mode === "existant" && !ligneForm.articleId) {
      setLigneError(t("achats.articleRequisError"));
      return;
    }
    if (ligneForm.mode === "nouveau" && !ligneForm.nom.trim()) {
      setLigneError(t("achats.nomNouvelArticleRequiredError"));
      return;
    }

    const payload = {
      reception_id: reception.id,
      quantite: qte,
      cout_unitaire: cout,
      frais_annexes: reception.frais_groupes ? 0 : Number(ligneForm.fraisAnnexes) || 0,
    };
    if (ligneForm.mode === "existant") {
      payload.article_id = ligneForm.articleId;
    } else {
      payload.nom_nouvel_article = ligneForm.nom.trim();
      payload.categorie_id = ligneForm.categorieId || null;
      payload.unite = ligneForm.unite || "unite";
      payload.image_url = ligneForm.imageUrl || null;
      payload.prix_vente = Number(ligneForm.prixVente) || 0;
    }

    const { error } = await supabase.from("reception_lignes").insert(payload);
    if (error) {
      setLigneError(error.message);
      return;
    }
    setAjoutOuvert(false);
    await charger();
  }

  async function supprimerLigne(ligne) {
    const { error } = await supabase.from("reception_lignes").delete().eq("id", ligne.id);
    if (error) {
      setActionError(error.message);
      return;
    }
    const { data: lig } = await supabase
      .from("reception_lignes")
      .select("*, articles(nom, code, unite, image_url)")
      .eq("reception_id", reception.id)
      .order("created_at", { ascending: true });
    const nouvelles = lig || [];
    setLignes(nouvelles);
    await ajusterFraisGroupesSiUnSeul(nouvelles);
    await charger();
  }

  async function toggleFraisGroupes() {
    if (lignes.length < 2) return;
    if (reception.frais_groupes) {
      await supabase.from("receptions").update({ frais_groupes: false, frais_total: 0 }).eq("id", reception.id);
    } else {
      const somme = lignes.reduce((s, l) => s + (l.frais_annexes || 0), 0);
      await supabase.from("receptions").update({ frais_groupes: true, frais_total: somme }).eq("id", reception.id);
    }
    await charger();
  }

  async function majReception(champs) {
    await supabase.from("receptions").update(champs).eq("id", reception.id);
    await charger();
  }

  async function valider() {
    setValidating(true);
    setActionError("");
    const { error } = await supabase.rpc("valider_reception", { p_reception_id: reception.id }).single();
    if (error) {
      setActionError(error.message);
      setValidating(false);
      return;
    }
    await charger();
  }

  async function annuler() {
    if (!window.confirm(t("achats.confirmAnnuler"))) return;
    const { error } = await supabase.rpc("annuler_reception", { p_reception_id: reception.id }).single();
    if (error) {
      window.alert(error.message);
      return;
    }
    await charger();
  }

  async function supprimerBrouillon() {
    if (!window.confirm(t("achats.confirmSupprimerBrouillon"))) return;
    const { error } = await supabase.from("receptions").delete().eq("id", reception.id);
    if (error) {
      window.alert(error.message);
      return;
    }
    router.push("/achats");
  }

  async function telechargerPdf() {
    setGeneratingPdf(true);
    const el = printRef.current;
    el?.classList.add("sb-pdf-export-capture");
    try {
      await exporterPdf({
        getElement: () => el,
        nomFichier: `${reception.numero}.pdf`,
        labelGeneration: t("achats.generationPdf"),
        onCaptured: () => el?.classList.remove("sb-pdf-export-capture"),
      });
    } catch (err) {
      window.alert(t("achats.impressionError", { message: err.message }));
    } finally {
      el?.classList.remove("sb-pdf-export-capture");
      setGeneratingPdf(false);
    }
  }

  if (reception === undefined) return <p className="sb-sub">{t("common.loading")}</p>;

  if (reception === null) {
    return (
      <div>
        <button className="sb-back-link" onClick={() => router.push("/achats")}>
          <ArrowLeft size={15} /> {t("achats.detailBackToList")}
        </button>
        <p className="sb-sub">{t("achats.detailNotFound")}</p>
      </div>
    );
  }

  const totalAchat = lignes.reduce((s, l) => s + l.quantite * l.cout_unitaire, 0);
  const totalFrais = estBrouillon
    ? reception.frais_groupes
      ? Number(reception.frais_total) || 0
      : lignes.reduce((s, l) => s + (l.frais_annexes || 0), 0)
    : lignes.reduce((s, l) => s + (l.frais_repartis || 0), 0);
  const totalGeneral = totalAchat + totalFrais;
  const fraisGroupesDisponible = lignes.length >= 2;

  const nomLigne = (l) => l.articles?.nom || l.nom_nouvel_article || "—";
  const uniteLigne = (l) => l.articles?.unite || l.unite;

  return (
    <div>
      <button className="sb-back-link" onClick={() => router.push("/achats")}>
        <ArrowLeft size={15} /> {t("achats.detailBackToList")}
      </button>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 10 }}>
        <div>
          <h1 className="sb-h1 sb-mono">{reception.numero}</h1>
          <p className="sb-sub">{new Date(reception.date_reception).toLocaleDateString(dateLocale(business?.langue))}</p>
        </div>
        <span className={`sb-badge ${STATUT_BADGE_CLASS[reception.statut]}`} style={{ fontSize: 13, padding: "6px 12px" }}>
          {t(`achats.statut.${reception.statut}`)}
        </span>
      </div>

      <div className="sb-card" style={{ marginTop: 14, marginBottom: 16 }}>
        <div className="sb-form-grid">
          <div className="sb-field">
            <label>{t("achats.fournisseurLabel")}</label>
            {estBrouillon ? (
              <ClearableInput
                placeholder={t("achats.fournisseurPlaceholder")}
                value={reception.fournisseur || ""}
                onChange={(e) => setReception({ ...reception, fournisseur: e.target.value })}
                onBlur={() => majReception({ fournisseur: reception.fournisseur?.trim() || null })}
                clearLabel={t("common.clearField")}
              />
            ) : (
              <div style={{ fontSize: 14, fontWeight: 600 }}>{reception.fournisseur || "—"}</div>
            )}
          </div>
          <div className="sb-field">
            <label>{t("achats.dateLabel")}</label>
            {estBrouillon ? (
              <input
                className="sb-input"
                type="date"
                value={reception.date_reception}
                onChange={(e) => setReception({ ...reception, date_reception: e.target.value })}
                onBlur={(e) => majReception({ date_reception: e.target.value })}
              />
            ) : (
              <div style={{ fontSize: 14, fontWeight: 600 }}>{new Date(reception.date_reception).toLocaleDateString(dateLocale(business?.langue))}</div>
            )}
          </div>
        </div>
      </div>

      <div className="sb-card" style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <div className="sb-section-title" style={{ margin: 0 }}>{t("achats.colLignes")}</div>
          {estBrouillon && (
            <button className="sb-btn sb-btn-primary" onClick={ouvrirAjoutLigne}>
              <Plus size={14} /> {t("achats.ajouterLigne")}
            </button>
          )}
        </div>

        {lignes.length === 0 ? (
          <p style={{ fontSize: 13, color: "var(--muted)" }}>{t("achats.aucuneLigne")}</p>
        ) : (
          <div className="sb-table-scroll">
            <table className="sb-table">
              <thead>
                <tr>
                  <th>{t("achats.colArticleLigne")}</th>
                  <th>{t("achats.colQuantite")}</th>
                  <th>{t("achats.colCoutUnitaire")}</th>
                  <th>{t("achats.colFraisLigne")}</th>
                  {!estBrouillon && <th>{t("achats.colCoutRevient")}</th>}
                  {!estBrouillon && <th>{t("achats.colStock")}</th>}
                  {estBrouillon && <th></th>}
                </tr>
              </thead>
              <tbody>
                {lignes.map((l) => (
                  <tr key={l.id}>
                    <td className="sb-nom-tronque" title={nomLigne(l)}>
                      {tronquerMilieuNom(nomLigne(l))}
                      {!l.article_id && <span className="sb-badge sb-badge-emerald" style={{ marginLeft: 6, fontSize: 10 }}>{t("achats.nouvelArticleBadge")}</span>}
                    </td>
                    <td className="sb-mono">{l.quantite} {uniteLabel(uniteLigne(l))}</td>
                    <td className="sb-mono">{fmt(l.cout_unitaire)}</td>
                    <td className="sb-mono">{fmt(reception.frais_groupes && estBrouillon ? 0 : estBrouillon ? l.frais_annexes || 0 : l.frais_repartis || 0)}</td>
                    {!estBrouillon && <td className="sb-mono">{fmt(l.cout_revient_unitaire)}</td>}
                    {!estBrouillon && <td className="sb-mono">{l.stock_avant} → {l.stock_apres}</td>}
                    {estBrouillon && (
                      <td>
                        <button className="sb-btn sb-btn-ghost" style={{ padding: "3px 6px" }} onClick={() => supprimerLigne(l)}>
                          <Trash2 size={12} />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {estBrouillon && (
          <div style={{ marginTop: 14, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, opacity: fraisGroupesDisponible ? 1 : 0.5 }}>
              <input type="checkbox" checked={reception.frais_groupes} disabled={!fraisGroupesDisponible} onChange={toggleFraisGroupes} />
              {t("achats.fraisGroupesLabel")}
            </label>
            {!fraisGroupesDisponible && <span style={{ fontSize: 11.5, color: "var(--muted)" }}>{t("achats.fraisGroupesHint")}</span>}
            {reception.frais_groupes && (
              <div className="sb-field" style={{ maxWidth: 180, margin: 0 }}>
                <input
                  className="sb-input"
                  type="number"
                  min={0}
                  value={reception.frais_total}
                  onChange={(e) => setReception({ ...reception, frais_total: e.target.value })}
                  onBlur={(e) => majReception({ frais_total: Number(e.target.value) || 0 })}
                />
              </div>
            )}
          </div>
        )}
      </div>

      <div className="sb-card" style={{ marginBottom: 16, maxWidth: 360 }}>
        <div className="sb-section-title" style={{ fontSize: 13 }}>{t("achats.recapTitle")}</div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "4px 0" }}>
          <span style={{ color: "var(--muted)" }}>{t("achats.recapTotalAchat")}</span>
          <span className="sb-mono">{fmt(totalAchat)}</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "4px 0" }}>
          <span style={{ color: "var(--muted)" }}>{t("achats.recapFraisAnnexes")}</span>
          <span className="sb-mono">{fmt(totalFrais)}</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 15, fontWeight: 700, padding: "8px 0 0", borderTop: "1px solid var(--line)", marginTop: 6 }}>
          <span>{t("achats.recapTotal")}</span>
          <span className="sb-mono">{fmt(totalGeneral)}</span>
        </div>
      </div>

      {actionError && <p style={{ fontSize: 12.5, color: "var(--coral)", margin: "0 0 12px" }}>{actionError}</p>}

      <div className="sb-detail-actions">
        {estBrouillon && (
          <>
            <button className="sb-btn sb-btn-emerald" onClick={valider} disabled={validating || lignes.length === 0}>
              <CheckCircle2 size={15} /> {validating ? t("achats.validationEnCours") : t("achats.validerReception")}
            </button>
            <button className="sb-btn sb-btn-ghost" style={{ color: "var(--coral)" }} onClick={supprimerBrouillon}>
              <Trash2 size={15} /> {t("achats.supprimerBrouillon")}
            </button>
          </>
        )}
        {reception.statut === "validee" && (
          <button className="sb-btn sb-btn-ghost" style={{ color: "var(--coral)" }} onClick={annuler}>
            <XCircle size={15} /> {t("achats.annulerReception")}
          </button>
        )}
        {reception.statut !== "brouillon" && (
          <button className="sb-btn sb-btn-ghost" onClick={telechargerPdf} disabled={generatingPdf}>
            <Download size={15} /> {generatingPdf ? t("achats.generationPdf") : t("achats.telechargerPdf")}
          </button>
        )}
      </div>

      {ajoutOuvert && (
        <div className="sb-modal-overlay" onClick={() => setAjoutOuvert(false)}>
          <div className="sb-card" style={{ width: 420, background: "var(--card)", maxHeight: "90vh", overflowY: "auto" }} onClick={(e) => e.stopPropagation()}>
            <div className="sb-section-title">{t("achats.ajoutLigneModalTitle")}</div>

            <div className="sb-toggle-group" style={{ margin: "10px 0" }}>
              <button className={`sb-toggle-item${ligneForm.mode === "existant" ? " active" : ""}`} onClick={() => setLigneForm({ ...LIGNE_VIDE, mode: "existant" })}>
                {t("achats.modeArticleExistant")}
              </button>
              <button className={`sb-toggle-item${ligneForm.mode === "nouveau" ? " active" : ""}`} onClick={() => setLigneForm({ ...LIGNE_VIDE, mode: "nouveau" })}>
                {t("achats.modeNouvelArticle")}
              </button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {ligneForm.mode === "existant" ? (
                <div className="sb-field">
                  <label>{t("nouvelle.articleLabel")}</label>
                  <ArticleSelect
                    articles={articles}
                    value={ligneForm.articleId}
                    onChange={(id) => setLigneForm({ ...ligneForm, articleId: id })}
                    isDisabled={() => false}
                    placeholder={t("nouvelle.selectArticle")}
                    emptyLabel={t("common.aucunResultatArticle")}
                    getLabel={(a) => `${a.code} · ${tronquerMilieuNom(a.nom, 28)}`}
                  />
                </div>
              ) : (
                <>
                  <div className="sb-field">
                    <label>{t("articles.nomLabel")}</label>
                    <ClearableInput
                      placeholder={t("articles.nomPlaceholder")}
                      value={ligneForm.nom}
                      onChange={(e) => setLigneForm({ ...ligneForm, nom: e.target.value })}
                      clearLabel={t("common.clearField")}
                    />
                  </div>
                  <div className="sb-form-grid">
                    <div className="sb-field">
                      <label>{t("articles.categorieLabel")}</label>
                      <select className="sb-input" value={ligneForm.categorieId} onChange={(e) => setLigneForm({ ...ligneForm, categorieId: e.target.value })}>
                        <option value="">{t("common.sansCategorie")}</option>
                        {categories.map((c) => (
                          <option key={c.id} value={c.id}>{c.nom}</option>
                        ))}
                      </select>
                    </div>
                    <div className="sb-field">
                      <label>{t("articles.uniteLabel")}</label>
                      <select className="sb-input" value={ligneForm.unite} onChange={(e) => setLigneForm({ ...ligneForm, unite: e.target.value })}>
                        {UNITES.map((u) => (
                          <option key={u} value={u}>{uniteLabel(u)}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="sb-field">
                    <label>{t("articles.prixVenteLabel")}</label>
                    <input
                      className="sb-input"
                      type="number"
                      placeholder={t("articles.prixVentePlaceholder")}
                      value={ligneForm.prixVente}
                      onChange={(e) => setLigneForm({ ...ligneForm, prixVente: e.target.value })}
                    />
                  </div>
                  <ImageUploadField
                    label={t("articles.photoLabel")}
                    businessId={business.id}
                    value={ligneForm.imageUrl}
                    onChange={(url) => setLigneForm((f) => ({ ...f, imageUrl: url }))}
                  />
                </>
              )}

              <div className="sb-form-grid">
                <div className="sb-field">
                  <label>{t("achats.quantiteLabel")}</label>
                  <input
                    className="sb-input"
                    type="number"
                    min={1}
                    value={ligneForm.quantite}
                    onChange={(e) => setLigneForm({ ...ligneForm, quantite: e.target.value })}
                  />
                </div>
                <PrixAchatConvertible
                  t={t}
                  label={t("achats.coutUnitaireLabel")}
                  placeholder={t("articles.prixAchatPlaceholder")}
                  value={ligneForm.coutUnitaire}
                  onValueChange={(v) => setLigneForm({ ...ligneForm, coutUnitaire: v })}
                  tauxDefaut={business?.taux_change_valeur}
                  deviseDefaut={business?.taux_change_devise}
                />
              </div>

              {!reception.frais_groupes && (
                <div className="sb-field">
                  <label>{t("achats.fraisAnnexesLigneLabel")}</label>
                  <input
                    className="sb-input"
                    type="number"
                    min={0}
                    placeholder={t("articles.fraisAnnexesPlaceholder")}
                    value={ligneForm.fraisAnnexes}
                    onChange={(e) => setLigneForm({ ...ligneForm, fraisAnnexes: e.target.value })}
                  />
                </div>
              )}

              {ligneError && <p style={{ fontSize: 12, color: "var(--coral)", margin: 0 }}>{ligneError}</p>}
              <button className="sb-btn sb-btn-emerald" style={{ justifyContent: "center" }} onClick={ajouterLigne}>
                <CheckCircle2 size={14} /> {t("achats.confirmerAjoutLigne")}
              </button>
            </div>
          </div>
        </div>
      )}

      {typeof document !== "undefined" &&
        createPortal(
          <div className="sb-reception-print" ref={printRef}>
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
                <h1>{t("achats.rapportTitle")}</h1>
                <p className="sb-mono">{reception.numero}</p>
                <p>{new Date(reception.date_reception).toLocaleDateString(dateLocale(business?.langue))}</p>
              </div>
            </div>

            <div className="sb-reception-print-info sb-pdf-no-split">
              <div className="sb-reception-print-info-block">
                <h3>{t("achats.colFournisseur")}</h3>
                <div>{reception.fournisseur || "—"}</div>
              </div>
              <div className="sb-reception-print-info-block">
                <h3>{t("commandes.colStatut")}</h3>
                <div>{t(`achats.statut.${reception.statut}`)}</div>
              </div>
            </div>

            <table className="sb-reception-print-table">
              <thead>
                <tr>
                  <th>{t("achats.colArticleLigne")}</th>
                  <th style={{ textAlign: "right" }}>{t("achats.colQuantite")}</th>
                  <th style={{ textAlign: "right" }}>{t("achats.colCoutUnitaire")}</th>
                  <th style={{ textAlign: "right" }}>{t("achats.colFraisLigne")}</th>
                  <th style={{ textAlign: "right" }}>{t("achats.colCoutRevient")}</th>
                </tr>
              </thead>
              <tbody>
                {lignes.map((l) => (
                  <tr key={l.id}>
                    <td style={{ maxWidth: 260 }}>{tronquerMilieuNom(nomLigne(l), LONGUEUR_NOM_IMPRESSION)}</td>
                    <td style={{ textAlign: "right" }}>{l.quantite} {uniteLabel(uniteLigne(l))}</td>
                    <td style={{ textAlign: "right" }}>{fmt(l.cout_unitaire)}</td>
                    <td style={{ textAlign: "right" }}>{fmt(estBrouillon ? l.frais_annexes || 0 : l.frais_repartis || 0)}</td>
                    <td style={{ textAlign: "right" }}>{fmt(l.cout_revient_unitaire || l.cout_unitaire)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="sb-reception-print-totals sb-pdf-no-split">
              <div className="sb-reception-print-totals-block">
                <div><span>{t("achats.recapTotalAchat")}</span><strong>{fmt(totalAchat)}</strong></div>
                <div><span>{t("achats.recapFraisAnnexes")}</span><strong>{fmt(totalFrais)}</strong></div>
                <div className="total"><span>{t("achats.recapTotal")}</span><strong>{fmt(totalGeneral)}</strong></div>
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
