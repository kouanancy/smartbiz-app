"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, CheckCircle2, Image as ImageIcon, Pencil, RefreshCw, Trash2, X } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/lib/AuthProvider";
import { fmt as fmtBase, dateLocale } from "@/lib/format";
import { t as tBase } from "@/lib/i18n";
import { UNITES } from "@/lib/constants";
import ImageUploadField from "@/components/ImageUploadField";
import ClearableInput from "@/components/ClearableInput";

// Une paire label/valeur de la fiche article — voir aussi
// app/(app)/articles/page.js (même structure, avant son déplacement ici).
function DetailField({ label, value, valueColor }) {
  return (
    <div>
      <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-faint)", marginBottom: 4 }}>{label}</div>
      <div className="sb-mono" style={{ fontSize: 14, fontWeight: 600, color: valueColor || "var(--ink)" }}>
        {value}
      </div>
    </div>
  );
}

export default function ArticleDetailPage() {
  const { business } = useAuth();
  const router = useRouter();
  const params = useParams();
  const fmt = (n) => fmtBase(n, business?.devise);
  const t = (key, vars) => tBase(business?.langue, key, vars);
  const uniteLabel = (u) => t(`common.unites.${u || "unite"}`);

  const [article, setArticle] = useState(undefined);
  const [categories, setCategories] = useState([]);
  const [enAttente, setEnAttente] = useState(0);
  const [reappros, setReappros] = useState([]);

  const [reapproOpen, setReapproOpen] = useState(false);
  const [reapproForm, setReapproForm] = useState({ quantite: "", prix_achat: "", frais_annexes: "" });

  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState(null);
  const [editError, setEditError] = useState("");

  async function chargerArticle() {
    const { data } = await supabase.from("articles").select("*").eq("id", params.id).eq("business_id", business.id).maybeSingle();
    setArticle(data || null);
  }

  useEffect(() => {
    if (!business?.id || !params.id) return;
    let active = true;
    async function load() {
      const [, categoriesRes, enAttenteRes, reapprosRes] = await Promise.all([
        chargerArticle(),
        supabase.from("categories").select("*").eq("business_id", business.id).order("nom"),
        supabase
          .from("commande_lignes")
          .select("quantite, commandes!inner(business_id, statut)")
          .eq("article_id", params.id)
          .eq("commandes.business_id", business.id)
          .eq("commandes.statut", "en_attente"),
        supabase
          .from("reappros")
          .select("*")
          .eq("article_id", params.id)
          .eq("business_id", business.id)
          .order("created_at", { ascending: false })
          .limit(10),
      ]);
      if (!active) return;
      setCategories(categoriesRes.data || []);
      setEnAttente((enAttenteRes.data || []).reduce((s, l) => s + l.quantite, 0));
      setReappros(reapprosRes.data || []);
    }
    load();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- chargerArticle ferme sur business/params.id, redéfinie à chaque rendu mais toujours équivalente pour ces mêmes valeurs
  }, [business?.id, params.id]);

  const categorieName = (id) => categories.find((c) => c.id === id)?.nom ?? t("common.sansCategorie");

  function ouvrirReappro() {
    setReapproForm({ quantite: "", prix_achat: String(article.prix_achat), frais_annexes: String(article.frais_annexes || 0) });
    setReapproOpen(true);
  }

  async function validerReappro() {
    const qte = Number(reapproForm.quantite);
    if (!qte || qte < 1) return;
    const nouveauPrixAchat = Number(reapproForm.prix_achat) || 0;
    const nouveauxFraisAnnexes = Number(reapproForm.frais_annexes) || 0;

    const { error } = await supabase
      .from("articles")
      .update({ stock: article.stock + qte, prix_achat: nouveauPrixAchat, frais_annexes: nouveauxFraisAnnexes })
      .eq("id", article.id);
    if (error) return;

    await supabase.from("reappros").insert({
      business_id: business.id,
      article_id: article.id,
      quantite: qte,
      prix_achat: nouveauPrixAchat,
      frais_annexes: nouveauxFraisAnnexes,
    });

    await chargerArticle();
    const { data: reapprosRes } = await supabase
      .from("reappros")
      .select("*")
      .eq("article_id", article.id)
      .eq("business_id", business.id)
      .order("created_at", { ascending: false })
      .limit(10);
    setReappros(reapprosRes || []);
    setReapproOpen(false);
  }

  function ouvrirEdition() {
    setEditError("");
    setEditForm({
      nom: article.nom,
      categorie_id: article.categorie_id || "",
      unite: article.unite || "unite",
      prix_achat: String(article.prix_achat),
      frais_annexes: String(article.frais_annexes || 0),
      prix_vente: String(article.prix_vente),
      stock: String(article.stock),
      seuil: String(article.seuil),
      image_url: article.image_url || "",
    });
    setEditOpen(true);
  }

  async function validerEdition(e) {
    e.preventDefault();
    if (!editForm.nom.trim() || !editForm.prix_vente) {
      setEditError(t("articles.nomRequiredError"));
      return;
    }
    const { error } = await supabase
      .from("articles")
      .update({
        nom: editForm.nom.trim(),
        categorie_id: editForm.categorie_id || null,
        unite: editForm.unite || "unite",
        prix_achat: Number(editForm.prix_achat) || 0,
        frais_annexes: Number(editForm.frais_annexes) || 0,
        prix_vente: Number(editForm.prix_vente) || 0,
        stock: Math.max(0, Number(editForm.stock) || 0),
        seuil: Number(editForm.seuil) || 3,
        image_url: editForm.image_url.trim() || null,
      })
      .eq("id", article.id);
    if (error) {
      setEditError(error.message);
      return;
    }
    await chargerArticle();
    setEditOpen(false);
  }

  async function supprimerArticle() {
    const confirmed = window.confirm(t("articles.confirmDelete", { nom: article.nom }));
    if (!confirmed) return;
    const { error } = await supabase.from("articles").delete().eq("id", article.id);
    if (error) {
      if (error.code === "23503") {
        window.alert(t("articles.deleteLinkedError", { nom: article.nom }));
      } else {
        window.alert(t("articles.deleteGenericError", { message: error.message }));
      }
      return;
    }
    router.push("/articles");
  }

  if (article === undefined) return <p className="sb-sub">{t("common.loading")}</p>;

  if (article === null) {
    return (
      <div>
        <button className="sb-back-link" onClick={() => router.push("/articles")}>
          <ArrowLeft size={15} /> {t("articles.detailBackToList")}
        </button>
        <p className="sb-sub">{t("articles.detailNotFound")}</p>
      </div>
    );
  }

  const margeReelle = article.prix_vente - article.prix_achat - (article.frais_annexes || 0);
  const theorique = article.stock - enAttente;

  return (
    <div>
      <button className="sb-back-link" onClick={() => router.push("/articles")}>
        <ArrowLeft size={15} /> {t("articles.detailBackToList")}
      </button>

      <div className="sb-card" style={{ maxWidth: 480 }}>
        {article.image_url ? (
          <div style={{ width: "100%", aspectRatio: "1", borderRadius: 12, overflow: "hidden", marginBottom: 14, background: "var(--paper)" }}>
            <img src={article.image_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          </div>
        ) : (
          <div
            style={{
              width: "100%",
              aspectRatio: "1",
              borderRadius: 12,
              marginBottom: 14,
              background: "var(--paper)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--text-faint)",
            }}
          >
            <ImageIcon size={40} />
          </div>
        )}

        <div className="sb-section-title" style={{ fontSize: 18, margin: "0 0 2px" }}>
          {article.nom}
        </div>
        <p style={{ fontSize: 12.5, color: "var(--muted)", margin: "0 0 16px" }}>{categorieName(article.categorie_id)}</p>

        <div className="sb-detail-field-grid" style={{ marginBottom: 12 }}>
          <DetailField label={t("articles.colAchat")} value={fmt(article.prix_achat)} />
          <DetailField label={t("articles.colFraisAnnexes")} value={fmt(article.frais_annexes || 0)} />
          <DetailField label={t("articles.colVente")} value={fmt(article.prix_vente)} />
          <DetailField
            label={t("articles.colMargeReelle")}
            value={fmt(margeReelle)}
            valueColor={margeReelle >= 0 ? "var(--emerald)" : "var(--coral)"}
          />
          <DetailField label={t("articles.colStock")} value={`${article.stock} ${uniteLabel(article.unite)}`} />
          <DetailField label={t("articles.colStockTheorique")} value={`${theorique} ${uniteLabel(article.unite)}`} />
          <DetailField label={t("articles.seuilLabel")} value={`${article.seuil} ${uniteLabel(article.unite)}`} />
          <DetailField label={t("articles.uniteLabel")} value={uniteLabel(article.unite)} />
        </div>

        {theorique <= 0 && enAttente > 0 && (
          <span className="sb-badge sb-badge-coral">{t("common.badgeTotalementCommande")}</span>
        )}
        {article.stock === 0 ? (
          <span className="sb-badge sb-badge-coral" style={{ marginLeft: 6 }}>{t("common.badgeRupture")}</span>
        ) : article.stock <= article.seuil ? (
          <span className="sb-badge sb-badge-amber" style={{ marginLeft: 6 }}>{t("common.badgeFaible")}</span>
        ) : (
          <span className="sb-badge sb-badge-emerald" style={{ marginLeft: 6 }}>{t("common.badgeOk")}</span>
        )}

        <div className="sb-detail-actions">
          <button className="sb-btn sb-btn-ghost" onClick={ouvrirReappro}>
            <RefreshCw size={15} /> {t("articles.reappro")}
          </button>
          <button className="sb-btn sb-btn-primary" onClick={ouvrirEdition}>
            <Pencil size={15} /> {t("articles.modifier")}
          </button>
          <button className="sb-btn sb-btn-ghost" style={{ color: "var(--coral)" }} onClick={supprimerArticle}>
            <Trash2 size={15} /> {t("articles.supprimer")}
          </button>
        </div>
      </div>

      {reappros.length > 0 && (
        <div className="sb-card" style={{ maxWidth: 480, marginTop: 16 }}>
          <div className="sb-section-title" style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
            <RefreshCw size={14} color="var(--accent-text)" /> {t("articles.historiqueReappro")}
          </div>
          <div className="sb-table-scroll">
            <table className="sb-table">
              <thead>
                <tr>
                  <th>{t("dashboard.colDate")}</th>
                  <th>{t("articles.colQuantiteAjoutee")}</th>
                  <th>{t("articles.colPrixAchat")}</th>
                </tr>
              </thead>
              <tbody>
                {reappros.map((r) => (
                  <tr key={r.id}>
                    <td>{new Date(r.created_at).toLocaleDateString(dateLocale(business?.langue))}</td>
                    <td className="sb-mono">
                      +{r.quantite} {uniteLabel(article.unite)}
                    </td>
                    <td className="sb-mono">{fmt(r.prix_achat)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {reapproOpen && (
        <div className="sb-modal-overlay" onClick={() => setReapproOpen(false)}>
          <div className="sb-card" style={{ width: 340, background: "var(--card)" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
              <div className="sb-section-title" style={{ margin: 0 }}>
                {t("articles.reapproModalTitle")}
              </div>
              <button onClick={() => setReapproOpen(false)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted)" }}>
                <X size={16} />
              </button>
            </div>
            <p style={{ fontSize: 12.5, color: "var(--muted)", margin: "0 0 14px" }}>{article.nom}</p>

            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div className="sb-field">
                <label>{t("articles.quantiteAjouteeLabel")}</label>
                <input
                  className="sb-input"
                  placeholder={t("articles.quantitePlaceholder")}
                  type="number"
                  min={1}
                  value={reapproForm.quantite}
                  onChange={(e) => setReapproForm({ ...reapproForm, quantite: e.target.value })}
                />
              </div>
              <div className="sb-field">
                <label>{t("articles.nouveauPrixAchatLabel")}</label>
                <input
                  className="sb-input"
                  placeholder={t("articles.prixAchatPlaceholder")}
                  type="number"
                  value={reapproForm.prix_achat}
                  onChange={(e) => setReapproForm({ ...reapproForm, prix_achat: e.target.value })}
                />
              </div>
              <div className="sb-field">
                <label>{t("articles.fraisAnnexesLabel")}</label>
                <input
                  className="sb-input"
                  placeholder={t("articles.fraisAnnexesPlaceholder")}
                  type="number"
                  value={reapproForm.frais_annexes}
                  onChange={(e) => setReapproForm({ ...reapproForm, frais_annexes: e.target.value })}
                />
              </div>
              <p style={{ fontSize: 11, color: "var(--muted)", margin: 0 }}>{t("articles.reapproNote")}</p>
              <button className="sb-btn sb-btn-emerald" style={{ justifyContent: "center" }} onClick={validerReappro} disabled={!reapproForm.quantite}>
                <CheckCircle2 size={14} /> {t("articles.confirmerReappro")}
              </button>
            </div>
          </div>
        </div>
      )}

      {editOpen && editForm && (
        <div className="sb-modal-overlay" onClick={() => setEditOpen(false)}>
          <div
            className="sb-card"
            style={{ width: 380, background: "var(--card)", maxHeight: "90vh", overflowY: "auto" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
              <div className="sb-section-title" style={{ margin: 0 }}>
                {t("articles.editModalTitle")}
              </div>
              <button onClick={() => setEditOpen(false)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted)" }}>
                <X size={16} />
              </button>
            </div>

            <form onSubmit={validerEdition} style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 10 }}>
              <div className="sb-field">
                <label>{t("articles.nomLabel")}</label>
                <ClearableInput
                  placeholder={t("articles.nomPlaceholder")}
                  value={editForm.nom}
                  onChange={(e) => setEditForm({ ...editForm, nom: e.target.value })}
                  clearLabel={t("common.clearField")}
                />
              </div>
              <div className="sb-field">
                <label>{t("articles.categorieLabel")}</label>
                <select className="sb-input" value={editForm.categorie_id} onChange={(e) => setEditForm({ ...editForm, categorie_id: e.target.value })}>
                  <option value="">{t("common.sansCategorie")}</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nom}
                    </option>
                  ))}
                </select>
              </div>
              <div className="sb-field">
                <label>{t("articles.uniteLabel")}</label>
                <select className="sb-input" value={editForm.unite} onChange={(e) => setEditForm({ ...editForm, unite: e.target.value })}>
                  {UNITES.map((u) => (
                    <option key={u} value={u}>
                      {uniteLabel(u)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="sb-form-grid">
                <div className="sb-field">
                  <label>{t("articles.prixAchatLabel")}</label>
                  <input
                    className="sb-input"
                    placeholder={t("articles.prixAchatPlaceholder")}
                    type="number"
                    value={editForm.prix_achat}
                    onChange={(e) => setEditForm({ ...editForm, prix_achat: e.target.value })}
                  />
                </div>
                <div className="sb-field">
                  <label>{t("articles.fraisAnnexesLabel")}</label>
                  <input
                    className="sb-input"
                    placeholder={t("articles.fraisAnnexesPlaceholder")}
                    type="number"
                    value={editForm.frais_annexes}
                    onChange={(e) => setEditForm({ ...editForm, frais_annexes: e.target.value })}
                  />
                </div>
                <div className="sb-field">
                  <label>{t("articles.prixVenteLabel")}</label>
                  <input
                    className="sb-input"
                    placeholder={t("articles.prixVentePlaceholder")}
                    type="number"
                    value={editForm.prix_vente}
                    onChange={(e) => setEditForm({ ...editForm, prix_vente: e.target.value })}
                  />
                </div>
                <div className="sb-field">
                  <label>{t("articles.seuilLabel")}</label>
                  <input
                    className="sb-input"
                    placeholder={t("articles.seuilPlaceholder")}
                    type="number"
                    value={editForm.seuil}
                    onChange={(e) => setEditForm({ ...editForm, seuil: e.target.value })}
                  />
                </div>
              </div>
              <div className="sb-field">
                <label>{t("articles.stockActuelLabel")}</label>
                <input
                  className="sb-input"
                  placeholder={t("articles.stockActuelPlaceholder")}
                  type="number"
                  min={0}
                  value={editForm.stock}
                  onChange={(e) => setEditForm({ ...editForm, stock: e.target.value })}
                />
                <p style={{ fontSize: 11, color: "var(--muted)", margin: 0 }}>{t("articles.stockActuelNote")}</p>
              </div>
              <ImageUploadField
                label={t("articles.photoLabel")}
                businessId={business.id}
                value={editForm.image_url}
                onChange={(url) => setEditForm((f) => ({ ...f, image_url: url }))}
              />
              {editError && <p style={{ fontSize: 12, color: "var(--coral)", margin: 0 }}>{editError}</p>}
              <button className="sb-btn sb-btn-emerald" type="submit" style={{ justifyContent: "center" }}>
                <CheckCircle2 size={14} /> {t("articles.saveEdits")}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
