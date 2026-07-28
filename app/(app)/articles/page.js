"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Pencil, Plus, RefreshCw, Trash2, X } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/lib/AuthProvider";
import { fmt } from "@/lib/format";
import { SANS_CATEGORIE } from "@/lib/constants";

const emptyForm = { nom: "", categorie_id: "", prix_achat: "", frais_annexes: "", prix_vente: "", stock: "", seuil: "3", image_url: "" };

export default function ArticlesPage() {
  const { business } = useAuth();
  const [articles, setArticles] = useState([]);
  const [categories, setCategories] = useState([]);
  const [reappros, setReappros] = useState([]);
  const [loading, setLoading] = useState(true);

  const [form, setForm] = useState(emptyForm);
  const [showForm, setShowForm] = useState(false);
  const [showCatManager, setShowCatManager] = useState(false);
  const [newCat, setNewCat] = useState("");
  const [catMsg, setCatMsg] = useState("");
  const [filtreCategorie, setFiltreCategorie] = useState("Toutes");
  const [reapproId, setReapproId] = useState(null);
  const [reapproForm, setReapproForm] = useState({ quantite: "", prix_achat: "", frais_annexes: "" });
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState(emptyForm);
  const [editError, setEditError] = useState("");

  useEffect(() => {
    if (!business?.id) return;
    let active = true;
    async function load() {
      setLoading(true);
      const [articlesRes, categoriesRes, reapprosRes] = await Promise.all([
        supabase.from("articles").select("*").eq("business_id", business.id).order("nom"),
        supabase.from("categories").select("*").eq("business_id", business.id).order("nom"),
        supabase
          .from("reappros")
          .select("*, articles(nom)")
          .eq("business_id", business.id)
          .order("created_at", { ascending: false })
          .limit(10),
      ]);
      if (!active) return;
      setArticles(articlesRes.data || []);
      setCategories(categoriesRes.data || []);
      setReappros(reapprosRes.data || []);
      setLoading(false);
    }
    load();
    return () => {
      active = false;
    };
  }, [business?.id]);

  const categorieName = (id) => categories.find((c) => c.id === id)?.nom ?? SANS_CATEGORIE;

  function ouvrirReappro(article) {
    setReapproId(article.id);
    setReapproForm({ quantite: "", prix_achat: String(article.prix_achat), frais_annexes: String(article.frais_annexes || 0) });
  }

  async function validerReappro() {
    const qte = Number(reapproForm.quantite);
    if (!qte || qte < 1) return;
    const nouveauPrixAchat = Number(reapproForm.prix_achat) || 0;
    const nouveauxFraisAnnexes = Number(reapproForm.frais_annexes) || 0;
    const article = articles.find((a) => a.id === reapproId);

    const { data: updated, error } = await supabase
      .from("articles")
      .update({ stock: article.stock + qte, prix_achat: nouveauPrixAchat, frais_annexes: nouveauxFraisAnnexes })
      .eq("id", reapproId)
      .select()
      .single();
    if (error) return;

    const { data: reappro } = await supabase
      .from("reappros")
      .insert({
        business_id: business.id,
        article_id: reapproId,
        quantite: qte,
        prix_achat: nouveauPrixAchat,
        frais_annexes: nouveauxFraisAnnexes,
      })
      .select()
      .single();

    setArticles((prev) => prev.map((a) => (a.id === reapproId ? updated : a)));
    if (reappro) setReappros((prev) => [{ ...reappro, articles: { nom: article.nom } }, ...prev].slice(0, 10));
    setReapproId(null);
  }

  function ouvrirEdition(article) {
    setEditingId(article.id);
    setEditError("");
    setEditForm({
      nom: article.nom,
      categorie_id: article.categorie_id || "",
      prix_achat: String(article.prix_achat),
      frais_annexes: String(article.frais_annexes || 0),
      prix_vente: String(article.prix_vente),
      stock: String(article.stock),
      seuil: String(article.seuil),
      image_url: article.image_url || "",
    });
  }

  async function validerEdition(e) {
    e.preventDefault();
    if (!editForm.nom.trim() || !editForm.prix_vente) {
      setEditError("Le nom et le prix de vente sont obligatoires.");
      return;
    }
    const { data, error } = await supabase
      .from("articles")
      .update({
        nom: editForm.nom.trim(),
        categorie_id: editForm.categorie_id || null,
        prix_achat: Number(editForm.prix_achat) || 0,
        frais_annexes: Number(editForm.frais_annexes) || 0,
        prix_vente: Number(editForm.prix_vente) || 0,
        stock: Math.max(0, Number(editForm.stock) || 0),
        seuil: Number(editForm.seuil) || 3,
        image_url: editForm.image_url.trim() || null,
      })
      .eq("id", editingId)
      .select()
      .single();
    if (error) {
      setEditError(error.message);
      return;
    }
    setArticles((prev) => prev.map((a) => (a.id === editingId ? data : a)).sort((a, b) => a.nom.localeCompare(b.nom)));
    setEditingId(null);
    setEditError("");
  }

  async function supprimerArticle(article) {
    const confirmed = window.confirm(`Supprimer définitivement « ${article.nom} » ? Cette action est irréversible.`);
    if (!confirmed) return;
    const { error } = await supabase.from("articles").delete().eq("id", article.id);
    if (error) {
      if (error.code === "23503") {
        window.alert(
          `« ${article.nom} » est lié à des commandes déjà enregistrées et ne peut pas être supprimé. Tu peux le laisser à 0 en stock à la place.`
        );
      } else {
        window.alert(`Impossible de supprimer cet article : ${error.message}`);
      }
      return;
    }
    setArticles((prev) => prev.filter((a) => a.id !== article.id));
  }

  async function submit(e) {
    e.preventDefault();
    if (!form.nom || !form.prix_vente) return;
    const { data, error } = await supabase
      .from("articles")
      .insert({
        business_id: business.id,
        nom: form.nom,
        categorie_id: form.categorie_id || null,
        prix_achat: Number(form.prix_achat) || 0,
        frais_annexes: Number(form.frais_annexes) || 0,
        prix_vente: Number(form.prix_vente) || 0,
        stock: Number(form.stock) || 0,
        seuil: Number(form.seuil) || 3,
        image_url: form.image_url || null,
      })
      .select()
      .single();
    if (error) return;
    setArticles((prev) => [...prev, data].sort((a, b) => a.nom.localeCompare(b.nom)));
    setForm(emptyForm);
    setShowForm(false);
  }

  async function addCategory() {
    const nom = newCat.trim();
    if (!nom) return;
    if (nom.toLowerCase() === SANS_CATEGORIE.toLowerCase()) {
      setCatMsg(`« ${SANS_CATEGORIE} » est un libellé réservé aux articles sans catégorie — choisis un autre nom.`);
      return;
    }
    if (categories.some((c) => c.nom.toLowerCase() === nom.toLowerCase())) {
      setCatMsg("Cette catégorie existe déjà.");
      return;
    }
    const { data, error } = await supabase.from("categories").insert({ business_id: business.id, nom }).select().single();
    if (error) {
      setCatMsg(error.message);
      return;
    }
    setCategories((prev) => [...prev, data].sort((a, b) => a.nom.localeCompare(b.nom)));
    setNewCat("");
    setCatMsg("");
  }

  async function removeCategory(cat) {
    const utilisee = articles.some((a) => a.categorie_id === cat.id);
    if (utilisee) {
      setCatMsg(`« ${cat.nom} » est utilisée par au moins un article — impossible à supprimer.`);
      return;
    }
    const { error } = await supabase.from("categories").delete().eq("id", cat.id);
    if (error) {
      setCatMsg(error.message);
      return;
    }
    setCategories((prev) => prev.filter((c) => c.id !== cat.id));
    setCatMsg("");
    if (filtreCategorie === cat.nom) setFiltreCategorie("Toutes");
  }

  const articlesFiltres =
    filtreCategorie === "Toutes" ? articles : articles.filter((a) => categorieName(a.categorie_id) === filtreCategorie);

  if (loading) return <p className="sb-sub">Chargement…</p>;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h1 className="sb-h1">Stock / Articles</h1>
          <p className="sb-sub">{articles.length} article(s) référencé(s)</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="sb-btn sb-btn-ghost" onClick={() => setShowCatManager((s) => !s)}>
            Catégories
          </button>
          <button className="sb-btn sb-btn-primary" onClick={() => setShowForm((s) => !s)}>
            <Plus size={14} /> Nouvel article
          </button>
        </div>
      </div>

      {showCatManager && (
        <div className="sb-card" style={{ marginBottom: 16 }}>
          <div className="sb-section-title">Catégories du commerce</div>
          <p style={{ fontSize: 12.5, color: "#6E6B68", margin: "0 0 12px" }}>
            Configure ici les catégories propres à ton activité (ex. Extensions capillaires, Accessoires...).
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
            {categories.map((c) => (
              <span key={c.id} className="sb-badge sb-badge-emerald" style={{ padding: "5px 10px", fontSize: 12 }}>
                {c.nom}
                <X size={11} style={{ cursor: "pointer", marginLeft: 4 }} onClick={() => removeCategory(c)} />
              </span>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <input className="sb-input" placeholder="Nouvelle catégorie (ex. Accessoires)" value={newCat} onChange={(e) => setNewCat(e.target.value)} />
            <button className="sb-btn sb-btn-primary" onClick={addCategory}>
              <Plus size={14} /> Ajouter
            </button>
          </div>
          {catMsg && <p style={{ fontSize: 12, color: "#C24E37", margin: "8px 2px 0" }}>{catMsg}</p>}
        </div>
      )}

      {showForm && (
        <form onSubmit={submit} className="sb-card sb-form-grid" style={{ marginBottom: 18 }}>
          <input
            className="sb-input"
            placeholder="Nom de l'article"
            value={form.nom}
            onChange={(e) => setForm({ ...form, nom: e.target.value })}
            style={{ gridColumn: "1 / 3" }}
          />
          <select className="sb-input" value={form.categorie_id} onChange={(e) => setForm({ ...form, categorie_id: e.target.value })}>
            <option value="">{SANS_CATEGORIE}</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nom}
              </option>
            ))}
          </select>
          <input className="sb-input" placeholder="Stock initial" type="number" value={form.stock} onChange={(e) => setForm({ ...form, stock: e.target.value })} />
          <input
            className="sb-input"
            placeholder="Prix d'achat (FCFA)"
            type="number"
            value={form.prix_achat}
            onChange={(e) => setForm({ ...form, prix_achat: e.target.value })}
          />
          <input
            className="sb-input"
            placeholder="Frais annexes / unité — facultatif (transport, import...)"
            type="number"
            value={form.frais_annexes}
            onChange={(e) => setForm({ ...form, frais_annexes: e.target.value })}
          />
          <input
            className="sb-input"
            placeholder="Prix de vente (FCFA)"
            type="number"
            value={form.prix_vente}
            onChange={(e) => setForm({ ...form, prix_vente: e.target.value })}
          />
          <input className="sb-input" placeholder="Seuil d'alerte" type="number" value={form.seuil} onChange={(e) => setForm({ ...form, seuil: e.target.value })} />
          <input
            className="sb-input"
            placeholder="URL de la photo du produit — facultatif"
            value={form.image_url}
            onChange={(e) => setForm({ ...form, image_url: e.target.value })}
            style={{ gridColumn: "1 / 3" }}
          />
          <button className="sb-btn sb-btn-emerald" type="submit" style={{ gridColumn: "1 / 3", justifyContent: "center" }}>
            Ajouter l&apos;article
          </button>
        </form>
      )}

      <div className="sb-toggle-group" style={{ marginBottom: 14, flexWrap: "wrap", display: "inline-flex" }}>
        {["Toutes", SANS_CATEGORIE, ...categories.map((c) => c.nom)].map((c) => (
          <button key={c} className={`sb-toggle-item${filtreCategorie === c ? " active" : ""}`} onClick={() => setFiltreCategorie(c)}>
            {c}
          </button>
        ))}
      </div>

      <div className="sb-card" style={{ marginBottom: 20 }}>
        <div className="sb-table-scroll">
          <table className="sb-table">
            <thead>
              <tr>
                <th></th>
                <th>Article</th>
                <th>Catégorie</th>
                <th>Achat</th>
                <th>Frais annexes</th>
                <th>Vente</th>
                <th>Marge réelle</th>
                <th>Stock</th>
                <th></th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {articlesFiltres.map((a) => {
                const margeReelle = a.prix_vente - a.prix_achat - (a.frais_annexes || 0);
                return (
                  <tr key={a.id}>
                    <td>
                      {a.image_url ? (
                        <div className="sb-thumb-upload">
                          <img src={a.image_url} alt="" />
                        </div>
                      ) : null}
                    </td>
                    <td>{a.nom}</td>
                    <td style={{ color: "#6B6A63" }}>{categorieName(a.categorie_id)}</td>
                    <td className="sb-mono">{fmt(a.prix_achat)}</td>
                    <td className="sb-mono">{fmt(a.frais_annexes || 0)}</td>
                    <td className="sb-mono">{fmt(a.prix_vente)}</td>
                    <td className="sb-mono" style={{ color: margeReelle >= 0 ? "#0E8F6E" : "#C24E37" }}>
                      {fmt(margeReelle)}
                    </td>
                    <td className="sb-mono">{a.stock}</td>
                    <td>
                      {a.stock === 0 ? (
                        <span className="sb-badge sb-badge-coral">Rupture</span>
                      ) : a.stock <= a.seuil ? (
                        <span className="sb-badge sb-badge-amber">Faible</span>
                      ) : (
                        <span className="sb-badge sb-badge-emerald">OK</span>
                      )}
                    </td>
                    <td>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        <button className="sb-btn sb-btn-ghost" style={{ padding: "4px 8px" }} onClick={() => ouvrirReappro(a)}>
                          <RefreshCw size={12} /> Réappro.
                        </button>
                        <button className="sb-btn sb-btn-ghost" style={{ padding: "4px 8px" }} onClick={() => ouvrirEdition(a)}>
                          <Pencil size={12} /> Modifier
                        </button>
                        <button
                          className="sb-btn sb-btn-ghost"
                          style={{ padding: "4px 8px", color: "#C24E37" }}
                          onClick={() => supprimerArticle(a)}
                        >
                          <Trash2 size={12} /> Supprimer
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="sb-card">
        <div className="sb-section-title">Marge réelle sur le stock actuel</div>
        <p style={{ fontSize: 12.5, color: "#6E6B68", margin: "0 0 12px" }}>
          Prend en compte les frais annexes (transport, importation...) pour estimer la marge réellement disponible sur les articles en stock.
        </p>
        <div className="sb-table-scroll">
          <table className="sb-table">
            <thead>
              <tr>
                <th>Article</th>
                <th>Coût réel / unité</th>
                <th>Marge réelle / unité</th>
                <th>Stock</th>
                <th>Marge réelle totale</th>
              </tr>
            </thead>
            <tbody>
              {articlesFiltres.map((a) => {
                const coutReel = a.prix_achat + (a.frais_annexes || 0);
                const margeUnitaire = a.prix_vente - coutReel;
                const margeTotale = margeUnitaire * a.stock;
                return (
                  <tr key={a.id}>
                    <td>{a.nom}</td>
                    <td className="sb-mono">{fmt(coutReel)}</td>
                    <td className="sb-mono" style={{ color: margeUnitaire >= 0 ? "#0E8F6E" : "#C24E37" }}>
                      {fmt(margeUnitaire)}
                    </td>
                    <td className="sb-mono">{a.stock}</td>
                    <td className="sb-mono" style={{ fontWeight: 600 }}>
                      {fmt(margeTotale)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td style={{ fontWeight: 600, borderTop: "1px solid var(--line)" }}>Total</td>
                <td style={{ borderTop: "1px solid var(--line)" }}></td>
                <td style={{ borderTop: "1px solid var(--line)" }}></td>
                <td style={{ borderTop: "1px solid var(--line)" }}></td>
                <td className="sb-mono" style={{ fontWeight: 700, borderTop: "1px solid var(--line)", color: "#E07A29" }}>
                  {fmt(articlesFiltres.reduce((s, a) => s + (a.prix_vente - a.prix_achat - (a.frais_annexes || 0)) * a.stock, 0))}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {reappros.length > 0 && (
        <div className="sb-card" style={{ marginTop: 20 }}>
          <div className="sb-section-title" style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <RefreshCw size={15} color="#E07A29" /> Historique des réapprovisionnements
          </div>
          <div className="sb-table-scroll">
            <table className="sb-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Article</th>
                  <th>Quantité ajoutée</th>
                  <th>Prix d&apos;achat</th>
                  <th>Frais annexes</th>
                </tr>
              </thead>
              <tbody>
                {reappros.map((r) => (
                  <tr key={r.id}>
                    <td>{new Date(r.created_at).toLocaleDateString("fr-FR")}</td>
                    <td>{r.articles?.nom ?? "—"}</td>
                    <td className="sb-mono">+{r.quantite}</td>
                    <td className="sb-mono">{fmt(r.prix_achat)}</td>
                    <td className="sb-mono">{fmt(r.frais_annexes || 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {reapproId &&
        (() => {
          const art = articles.find((a) => a.id === reapproId);
          return (
            <div className="sb-modal-overlay" onClick={() => setReapproId(null)}>
              <div className="sb-card" style={{ width: 340, background: "#fff" }} onClick={(e) => e.stopPropagation()}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
                  <div className="sb-section-title" style={{ margin: 0 }}>
                    Réapprovisionner
                  </div>
                  <button onClick={() => setReapproId(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "#6B6A63" }}>
                    <X size={16} />
                  </button>
                </div>
                <p style={{ fontSize: 12.5, color: "#6E6B68", margin: "0 0 14px" }}>{art?.nom}</p>

                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <div className="sb-field">
                    <label>Quantité ajoutée</label>
                    <input
                      className="sb-input"
                      placeholder="Ex. 10"
                      type="number"
                      min={1}
                      value={reapproForm.quantite}
                      onChange={(e) => setReapproForm({ ...reapproForm, quantite: e.target.value })}
                    />
                  </div>
                  <div className="sb-field">
                    <label>Nouveau prix d&apos;achat (FCFA)</label>
                    <input
                      className="sb-input"
                      placeholder="Ex. 8000"
                      type="number"
                      value={reapproForm.prix_achat}
                      onChange={(e) => setReapproForm({ ...reapproForm, prix_achat: e.target.value })}
                    />
                  </div>
                  <div className="sb-field">
                    <label>Frais annexes / unité (FCFA) — facultatif</label>
                    <input
                      className="sb-input"
                      placeholder="Ex. 1000"
                      type="number"
                      value={reapproForm.frais_annexes}
                      onChange={(e) => setReapproForm({ ...reapproForm, frais_annexes: e.target.value })}
                    />
                  </div>
                  <p style={{ fontSize: 11, color: "#6E6B68", margin: 0 }}>
                    Le stock, le prix d&apos;achat et les frais annexes de l&apos;article seront mis à jour avec ces valeurs.
                  </p>
                  <button className="sb-btn sb-btn-emerald" style={{ justifyContent: "center" }} onClick={validerReappro} disabled={!reapproForm.quantite}>
                    <CheckCircle2 size={14} /> Confirmer le réapprovisionnement
                  </button>
                </div>
              </div>
            </div>
          );
        })()}

      {editingId &&
        (() => {
          const art = articles.find((a) => a.id === editingId);
          if (!art) return null;
          return (
            <div className="sb-modal-overlay" onClick={() => setEditingId(null)}>
              <div
                className="sb-card"
                style={{ width: 380, background: "#fff", maxHeight: "90vh", overflowY: "auto" }}
                onClick={(e) => e.stopPropagation()}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
                  <div className="sb-section-title" style={{ margin: 0 }}>
                    Modifier l&apos;article
                  </div>
                  <button onClick={() => setEditingId(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "#6B6A63" }}>
                    <X size={16} />
                  </button>
                </div>

                <form onSubmit={validerEdition} style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 10 }}>
                  <div className="sb-field">
                    <label>Nom de l&apos;article</label>
                    <input
                      className="sb-input"
                      placeholder="Ex. Perruque Lace Front 20 pouces"
                      value={editForm.nom}
                      onChange={(e) => setEditForm({ ...editForm, nom: e.target.value })}
                    />
                  </div>
                  <div className="sb-field">
                    <label>Catégorie</label>
                    <select className="sb-input" value={editForm.categorie_id} onChange={(e) => setEditForm({ ...editForm, categorie_id: e.target.value })}>
                      <option value="">{SANS_CATEGORIE}</option>
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.nom}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="sb-form-grid">
                    <div className="sb-field">
                      <label>Prix d&apos;achat (FCFA)</label>
                      <input
                        className="sb-input"
                        placeholder="Ex. 8000"
                        type="number"
                        value={editForm.prix_achat}
                        onChange={(e) => setEditForm({ ...editForm, prix_achat: e.target.value })}
                      />
                    </div>
                    <div className="sb-field">
                      <label>Frais annexes / unité (FCFA)</label>
                      <input
                        className="sb-input"
                        placeholder="Ex. 1000"
                        type="number"
                        value={editForm.frais_annexes}
                        onChange={(e) => setEditForm({ ...editForm, frais_annexes: e.target.value })}
                      />
                    </div>
                    <div className="sb-field">
                      <label>Prix de vente (FCFA)</label>
                      <input
                        className="sb-input"
                        placeholder="Ex. 15000"
                        type="number"
                        value={editForm.prix_vente}
                        onChange={(e) => setEditForm({ ...editForm, prix_vente: e.target.value })}
                      />
                    </div>
                    <div className="sb-field">
                      <label>Seuil d&apos;alerte</label>
                      <input
                        className="sb-input"
                        placeholder="Ex. 3"
                        type="number"
                        value={editForm.seuil}
                        onChange={(e) => setEditForm({ ...editForm, seuil: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="sb-field">
                    <label>Stock actuel</label>
                    <input
                      className="sb-input"
                      placeholder="Ex. 12"
                      type="number"
                      min={0}
                      value={editForm.stock}
                      onChange={(e) => setEditForm({ ...editForm, stock: e.target.value })}
                    />
                    <p style={{ fontSize: 11, color: "#6E6B68", margin: 0 }}>
                      Corrige ici directement la quantité en stock (ex. erreur d&apos;inventaire). Pour un
                      réapprovisionnement lié à un achat, utilise plutôt le bouton « Réappro. » — il garde un
                      historique du prix d&apos;achat.
                    </p>
                  </div>
                  <div className="sb-field">
                    <label>Photo du produit (URL)</label>
                    <input
                      className="sb-input"
                      placeholder="https://... — facultatif"
                      value={editForm.image_url}
                      onChange={(e) => setEditForm({ ...editForm, image_url: e.target.value })}
                    />
                  </div>
                  {editError && <p style={{ fontSize: 12, color: "#C24E37", margin: 0 }}>{editError}</p>}
                  <button className="sb-btn sb-btn-emerald" type="submit" style={{ justifyContent: "center" }}>
                    <CheckCircle2 size={14} /> Enregistrer les modifications
                  </button>
                </form>
              </div>
            </div>
          );
        })()}
    </div>
  );
}
