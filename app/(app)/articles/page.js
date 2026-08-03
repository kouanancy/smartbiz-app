"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, FileSpreadsheet, Image as ImageIcon, Pencil, Plus, RefreshCw, Search, Trash2, X } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/lib/AuthProvider";
import { fmt as fmtBase, dateLocale } from "@/lib/format";
import { t as tBase } from "@/lib/i18n";
import { UNITES, PAGE_SIZE } from "@/lib/constants";
import { exportToExcel, dateFichier } from "@/lib/exportExcel";
import ImageUploadField from "@/components/ImageUploadField";
import Pagination from "@/components/Pagination";

const emptyForm = {
  nom: "",
  categorie_id: "",
  unite: "unite",
  prix_achat: "",
  frais_annexes: "",
  prix_vente: "",
  stock: "",
  seuil: "3",
  image_url: "",
};

const FILTRE_TOUTES = "toutes";
const FILTRE_SANS_CATEGORIE = "sans-categorie";

// Une paire label/valeur de la fiche article — évite de répéter la même
// structure pour chacun des 8 champs affichés dans la modale de détail.
function DetailField({ label, value, valueColor }) {
  return (
    <div>
      <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em", color: "#8A8682", marginBottom: 4 }}>{label}</div>
      <div className="sb-mono" style={{ fontSize: 14, fontWeight: 600, color: valueColor || "var(--ink)" }}>
        {value}
      </div>
    </div>
  );
}

export default function ArticlesPage() {
  const { business } = useAuth();
  const fmt = (n) => fmtBase(n, business?.devise);
  const t = (key, vars) => tBase(business?.langue, key, vars);
  const [articles, setArticles] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [margeTotaleFiltre, setMargeTotaleFiltre] = useState(0);
  const [page, setPage] = useState(0);
  const [refreshTick, setRefreshTick] = useState(0);
  const [categories, setCategories] = useState([]);
  const [reappros, setReappros] = useState([]);
  const [loading, setLoading] = useState(true);

  const [form, setForm] = useState(emptyForm);
  const [showForm, setShowForm] = useState(false);
  const [showCatManager, setShowCatManager] = useState(false);
  const [newCat, setNewCat] = useState("");
  const [catMsg, setCatMsg] = useState("");
  const [filtreCategorie, setFiltreCategorie] = useState(FILTRE_TOUTES);
  const [recherche, setRecherche] = useState("");
  const [rechercheDebounced, setRechercheDebounced] = useState("");
  const [reapproId, setReapproId] = useState(null);
  const [reapproForm, setReapproForm] = useState({ quantite: "", prix_achat: "", frais_annexes: "" });
  const [detailId, setDetailId] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState(emptyForm);
  const [editError, setEditError] = useState("");
  const [enAttenteParArticle, setEnAttenteParArticle] = useState({});

  // Recherche tapée au fil de l'eau, mais requêtée après une courte pause
  // (300 ms) pour ne pas interroger Supabase à chaque frappe — la page
  // revient aussi au début, sinon on pourrait se retrouver sur une page
  // qui n'existe plus pour les nouveaux résultats.
  useEffect(() => {
    const id = setTimeout(() => {
      setRechercheDebounced(recherche.trim());
      setPage(0);
    }, 300);
    return () => clearTimeout(id);
  }, [recherche]);

  // Filtre catégorie + recherche appliqués côté serveur — partagé entre le
  // chargement paginé, l'agrégat de marge totale et l'export Excel (les
  // trois doivent respecter exactement le même filtre). Mémorisé pour ne
  // changer d'identité que si le filtre ou la recherche changent réellement,
  // afin de rester une dépendance stable des useEffect ci-dessous.
  const appliquerFiltresArticles = useCallback(
    (query) => {
      let q = query;
      if (filtreCategorie === FILTRE_SANS_CATEGORIE) q = q.is("categorie_id", null);
      else if (filtreCategorie !== FILTRE_TOUTES) q = q.eq("categorie_id", filtreCategorie);
      if (rechercheDebounced) q = q.ilike("nom", `%${rechercheDebounced}%`);
      return q;
    },
    [filtreCategorie, rechercheDebounced]
  );

  // Données indépendantes de la pagination du stock : catégories (peu
  // nombreuses), historique de réappro (déjà limité à 10) et quantités en
  // attente par article (nécessaires même pour les articles hors de la
  // page affichée si on les recroise ailleurs) — chargées une seule fois
  // par boutique, jamais reparcourues au changement de page/filtre.
  useEffect(() => {
    if (!business?.id) return;
    let active = true;
    async function loadStatique() {
      const [categoriesRes, reapprosRes, enAttenteRes] = await Promise.all([
        supabase.from("categories").select("*").eq("business_id", business.id).order("nom"),
        supabase
          .from("reappros")
          .select("*, articles(nom, unite)")
          .eq("business_id", business.id)
          .order("created_at", { ascending: false })
          .limit(10),
        supabase
          .from("commande_lignes")
          .select("article_id, quantite, commandes!inner(business_id, statut)")
          .eq("commandes.business_id", business.id)
          .eq("commandes.statut", "en_attente"),
      ]);
      if (!active) return;
      setCategories(categoriesRes.data || []);
      setReappros(reapprosRes.data || []);
      const parArticle = {};
      (enAttenteRes.data || []).forEach((l) => {
        parArticle[l.article_id] = (parArticle[l.article_id] || 0) + l.quantite;
      });
      setEnAttenteParArticle(parArticle);
    }
    loadStatique();
    return () => {
      active = false;
    };
  }, [business?.id]);

  // Page courante du stock, filtrée et recherchée côté serveur — seule
  // cette requête charge des lignes d'articles (25 à la fois), jamais la
  // liste complète.
  useEffect(() => {
    if (!business?.id) return;
    let active = true;
    async function load() {
      const { data, count } = await appliquerFiltresArticles(
        supabase.from("articles").select("*", { count: "exact" }).eq("business_id", business.id)
      )
        .order("nom")
        .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
      if (!active) return;
      const total = count || 0;
      const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
      // Une suppression peut vider la dernière page : on se rabat sur la
      // nouvelle dernière page plutôt que d'afficher une page vide.
      if (page > 0 && page >= totalPages) {
        setPage(totalPages - 1);
        return;
      }
      setArticles(data || []);
      setTotalCount(total);
      setLoading(false);
    }
    load();
    return () => {
      active = false;
    };
  }, [business?.id, page, appliquerFiltresArticles, refreshTick]);

  // Marge totale exposée en stock pour le filtre actif — calculée à part
  // (uniquement les 4 colonnes numériques nécessaires, sans pagination) car
  // la page affichée ne contient jamais tous les articles filtrés.
  useEffect(() => {
    if (!business?.id) return;
    let active = true;
    async function loadMargeTotale() {
      const { data } = await appliquerFiltresArticles(
        supabase.from("articles").select("prix_vente,prix_achat,frais_annexes,stock").eq("business_id", business.id)
      );
      if (!active) return;
      setMargeTotaleFiltre((data || []).reduce((s, a) => s + (a.prix_vente - a.prix_achat - (a.frais_annexes || 0)) * a.stock, 0));
    }
    loadMargeTotale();
    return () => {
      active = false;
    };
  }, [business?.id, appliquerFiltresArticles, refreshTick]);

  const categorieName = (id) => categories.find((c) => c.id === id)?.nom ?? t("common.sansCategorie");
  const uniteLabel = (u) => t(`common.unites.${u || "unite"}`);
  const stockTheorique = (article) => article.stock - (enAttenteParArticle[article.id] || 0);

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

    // Un réappro ne change ni le nom ni la catégorie : l'article reste à sa
    // place sur la page actuelle, une simple mise à jour locale suffit pour
    // le tableau — mais la marge totale (agrégat séparé) doit être
    // recalculée puisque le stock/prix d'achat viennent de changer.
    setArticles((prev) => prev.map((a) => (a.id === reapproId ? updated : a)));
    if (reappro) setReappros((prev) => [{ ...reappro, articles: { nom: article.nom, unite: article.unite } }, ...prev].slice(0, 10));
    setRefreshTick((t) => t + 1);
    setReapproId(null);
  }

  function ouvrirEdition(article) {
    setEditingId(article.id);
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
      .eq("id", editingId)
      .select()
      .single();
    if (error) {
      setEditError(error.message);
      return;
    }
    // Le nom (tri) ou la catégorie (filtre) ont pu changer : on recharge la
    // page depuis le serveur plutôt que de corriger la position localement.
    setRefreshTick((t) => t + 1);
    setEditingId(null);
    setEditError("");
  }

  async function supprimerArticle(article) {
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
    setRefreshTick((t) => t + 1);
  }

  async function submit(e) {
    e.preventDefault();
    if (!form.nom || !form.prix_vente) return;
    const { error } = await supabase.from("articles").insert({
      business_id: business.id,
      nom: form.nom,
      categorie_id: form.categorie_id || null,
      unite: form.unite || "unite",
      prix_achat: Number(form.prix_achat) || 0,
      frais_annexes: Number(form.frais_annexes) || 0,
      prix_vente: Number(form.prix_vente) || 0,
      stock: Math.max(0, Number(form.stock) || 0),
      seuil: Number(form.seuil) || 3,
      image_url: form.image_url || null,
    });
    if (error) return;
    setRefreshTick((t) => t + 1);
    setForm(emptyForm);
    setShowForm(false);
  }

  async function addCategory() {
    const nom = newCat.trim();
    if (!nom) return;
    if (nom.toLowerCase() === t("common.sansCategorie").toLowerCase()) {
      setCatMsg(t("articles.catReservedMsg", { nom: t("common.sansCategorie") }));
      return;
    }
    if (categories.some((c) => c.nom.toLowerCase() === nom.toLowerCase())) {
      setCatMsg(t("articles.catExistsMsg"));
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
    // La page affichée ne contient qu'un sous-ensemble des articles : on ne
    // peut plus se fier au tableau local pour savoir si la catégorie est
    // utilisée ailleurs, d'où cette vérification directement en base.
    const { count } = await supabase
      .from("articles")
      .select("id", { count: "exact", head: true })
      .eq("business_id", business.id)
      .eq("categorie_id", cat.id);
    if (count > 0) {
      setCatMsg(t("articles.catUsedMsg", { nom: cat.nom }));
      return;
    }
    const { error } = await supabase.from("categories").delete().eq("id", cat.id);
    if (error) {
      setCatMsg(error.message);
      return;
    }
    setCategories((prev) => prev.filter((c) => c.id !== cat.id));
    setCatMsg("");
    if (filtreCategorie === cat.id) setFiltreCategorie(FILTRE_TOUTES);
  }

  const filtresCategorie = [
    { key: FILTRE_TOUTES, label: t("common.toutes") },
    { key: FILTRE_SANS_CATEGORIE, label: t("common.sansCategorie") },
    ...categories.map((c) => ({ key: c.id, label: c.nom })),
  ];

  // L'export doit couvrir tout le stock filtré, pas seulement la page
  // affichée à l'écran — nouvelle requête dédiée, sans pagination.
  async function exporterExcel() {
    const { data } = await appliquerFiltresArticles(supabase.from("articles").select("*").eq("business_id", business.id)).order("nom");
    const rows = (data || []).map((a) => ({
      [t("articles.colArticle")]: a.nom,
      [t("articles.colCategorie")]: categorieName(a.categorie_id),
      [t("articles.colAchat")]: a.prix_achat,
      [t("articles.colFraisAnnexes")]: a.frais_annexes || 0,
      [t("articles.colVente")]: a.prix_vente,
      [t("articles.colMargeReelle")]: a.prix_vente - a.prix_achat - (a.frais_annexes || 0),
      [t("articles.colStock")]: a.stock,
      [t("articles.uniteLabel")]: uniteLabel(a.unite),
    }));
    exportToExcel(`stock-${dateFichier()}.xlsx`, "Stock", rows);
  }

  if (loading) return <p className="sb-sub">{t("common.loading")}</p>;

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h1 className="sb-h1">{t("articles.title")}</h1>
          <p className="sb-sub">{t("articles.subtitleCount", { n: totalCount })}</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="sb-btn sb-btn-ghost" onClick={() => setShowCatManager((s) => !s)}>
            {t("articles.categoriesBtn")}
          </button>
          <button className="sb-btn sb-btn-ghost" onClick={exporterExcel}>
            <FileSpreadsheet size={14} /> {t("common.exporterExcel")}
          </button>
          <button className="sb-btn sb-btn-primary" onClick={() => setShowForm((s) => !s)}>
            <Plus size={14} /> {t("articles.newArticle")}
          </button>
        </div>
      </div>

      {showCatManager && (
        <div className="sb-card" style={{ marginBottom: 16 }}>
          <div className="sb-section-title">{t("articles.catManagerTitle")}</div>
          <p style={{ fontSize: 12.5, color: "#6E6B68", margin: "0 0 12px" }}>{t("articles.catManagerSub")}</p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
            {categories.map((c) => (
              <span key={c.id} className="sb-badge sb-badge-emerald" style={{ padding: "5px 10px", fontSize: 12 }}>
                {c.nom}
                <X size={11} style={{ cursor: "pointer", marginLeft: 4 }} onClick={() => removeCategory(c)} />
              </span>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
            <div className="sb-field" style={{ flex: 1 }}>
              <label>{t("articles.newCategoryLabel")}</label>
              <input
                className="sb-input"
                placeholder={t("articles.newCategoryPlaceholder")}
                value={newCat}
                onChange={(e) => setNewCat(e.target.value)}
              />
            </div>
            <button className="sb-btn sb-btn-primary" onClick={addCategory}>
              <Plus size={14} /> {t("articles.addBtn")}
            </button>
          </div>
          {catMsg && <p style={{ fontSize: 12, color: "#C24E37", margin: "8px 2px 0" }}>{catMsg}</p>}
        </div>
      )}

      {showForm && (
        <form onSubmit={submit} className="sb-card sb-form-grid" style={{ marginBottom: 18 }}>
          <div className="sb-field" style={{ gridColumn: "1 / 3" }}>
            <label>{t("articles.nomLabel")}</label>
            <input
              className="sb-input"
              placeholder={t("articles.nomPlaceholder")}
              value={form.nom}
              onChange={(e) => setForm({ ...form, nom: e.target.value })}
            />
          </div>
          <div className="sb-field">
            <label>{t("articles.categorieLabel")}</label>
            <select className="sb-input" value={form.categorie_id} onChange={(e) => setForm({ ...form, categorie_id: e.target.value })}>
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
            <select className="sb-input" value={form.unite} onChange={(e) => setForm({ ...form, unite: e.target.value })}>
              {UNITES.map((u) => (
                <option key={u} value={u}>
                  {uniteLabel(u)}
                </option>
              ))}
            </select>
          </div>
          <div className="sb-field">
            <label>{t("articles.stockInitialLabel")}</label>
            <input
              className="sb-input"
              placeholder={t("articles.stockInitialPlaceholder")}
              type="number"
              min={0}
              value={form.stock}
              onChange={(e) => setForm({ ...form, stock: e.target.value })}
            />
          </div>
          <div className="sb-field">
            <label>{t("articles.prixAchatLabel")}</label>
            <input
              className="sb-input"
              placeholder={t("articles.prixAchatPlaceholder")}
              type="number"
              value={form.prix_achat}
              onChange={(e) => setForm({ ...form, prix_achat: e.target.value })}
            />
          </div>
          <div className="sb-field">
            <label>{t("articles.fraisAnnexesLabel")}</label>
            <input
              className="sb-input"
              placeholder={t("articles.fraisAnnexesPlaceholder")}
              type="number"
              value={form.frais_annexes}
              onChange={(e) => setForm({ ...form, frais_annexes: e.target.value })}
            />
          </div>
          <div className="sb-field">
            <label>{t("articles.prixVenteLabel")}</label>
            <input
              className="sb-input"
              placeholder={t("articles.prixVentePlaceholder")}
              type="number"
              value={form.prix_vente}
              onChange={(e) => setForm({ ...form, prix_vente: e.target.value })}
            />
          </div>
          <div className="sb-field">
            <label>{t("articles.seuilLabel")}</label>
            <input
              className="sb-input"
              placeholder={t("articles.seuilPlaceholder")}
              type="number"
              value={form.seuil}
              onChange={(e) => setForm({ ...form, seuil: e.target.value })}
            />
          </div>
          <div style={{ gridColumn: "1 / 3" }}>
            <ImageUploadField
              label={t("articles.photoLabel")}
              businessId={business.id}
              value={form.image_url}
              onChange={(url) => setForm((f) => ({ ...f, image_url: url }))}
            />
          </div>
          <button className="sb-btn sb-btn-emerald" type="submit" style={{ gridColumn: "1 / 3", justifyContent: "center" }}>
            {t("articles.addSubmit")}
          </button>
        </form>
      )}

      <div style={{ position: "relative", marginBottom: 14, maxWidth: 280 }}>
        <Search size={14} style={{ position: "absolute", left: 10, top: 10, color: "#6B6A63" }} />
        <input
          className="sb-input"
          style={{ paddingLeft: 30 }}
          placeholder={t("articles.searchPlaceholder")}
          value={recherche}
          onChange={(e) => setRecherche(e.target.value)}
        />
      </div>

      <div className="sb-toggle-group" style={{ marginBottom: 14, flexWrap: "wrap", display: "inline-flex" }}>
        {filtresCategorie.map((opt) => (
          <button
            key={opt.key}
            className={`sb-toggle-item${filtreCategorie === opt.key ? " active" : ""}`}
            onClick={() => {
              setFiltreCategorie(opt.key);
              setPage(0);
            }}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <div className="sb-card" style={{ marginBottom: 20 }}>
        <div className="sb-table-scroll">
          <table className="sb-table">
            <thead>
              <tr>
                <th></th>
                <th>{t("articles.colArticle")}</th>
                <th>{t("articles.colCategorie")}</th>
                <th>{t("articles.colAchat")}</th>
                <th>{t("articles.colFraisAnnexes")}</th>
                <th>{t("articles.colVente")}</th>
                <th>{t("articles.colMargeReelle")}</th>
                <th>{t("articles.colStock")}</th>
                <th>{t("articles.colStockTheorique")}</th>
                <th></th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {articles.map((a) => {
                const margeReelle = a.prix_vente - a.prix_achat - (a.frais_annexes || 0);
                const theorique = stockTheorique(a);
                return (
                  <tr key={a.id} className="sb-row-clickable" onClick={() => setDetailId(a.id)}>
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
                    <td className="sb-mono">
                      {a.stock} {uniteLabel(a.unite)}
                    </td>
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span className="sb-mono">
                          {theorique} {uniteLabel(a.unite)}
                        </span>
                        {/* Comme dans Nouvelle commande : un stock théorique ≤ 0
                            ne signifie "totalement commandé" que s'il y a
                            réellement des commandes en attente derrière — sinon
                            c'est juste un stock réel à 0 (déjà signalé par le
                            badge "Rupture" de la colonne suivante). */}
                        {theorique <= 0 && (enAttenteParArticle[a.id] || 0) > 0 && (
                          <span className="sb-badge sb-badge-coral">{t("common.badgeTotalementCommande")}</span>
                        )}
                      </div>
                    </td>
                    <td>
                      {a.stock === 0 ? (
                        <span className="sb-badge sb-badge-coral">{t("common.badgeRupture")}</span>
                      ) : a.stock <= a.seuil ? (
                        <span className="sb-badge sb-badge-amber">{t("common.badgeFaible")}</span>
                      ) : (
                        <span className="sb-badge sb-badge-emerald">{t("common.badgeOk")}</span>
                      )}
                    </td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        <button className="sb-btn sb-btn-ghost" style={{ padding: "4px 8px" }} onClick={() => ouvrirReappro(a)}>
                          <RefreshCw size={12} /> {t("articles.reappro")}
                        </button>
                        <button className="sb-btn sb-btn-ghost" style={{ padding: "4px 8px" }} onClick={() => ouvrirEdition(a)}>
                          <Pencil size={12} /> {t("articles.modifier")}
                        </button>
                        <button
                          className="sb-btn sb-btn-ghost"
                          style={{ padding: "4px 8px", color: "#C24E37" }}
                          onClick={() => supprimerArticle(a)}
                        >
                          <Trash2 size={12} /> {t("articles.supprimer")}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <Pagination page={page} totalPages={totalPages} onChange={setPage} label={t("common.pageSur", { page: page + 1, total: totalPages })} />
      </div>

      <div className="sb-card">
        <div className="sb-section-title">{t("articles.margeReelleTitle")}</div>
        <p style={{ fontSize: 12.5, color: "#6E6B68", margin: "0 0 12px" }}>{t("articles.margeReelleSub")}</p>
        <div className="sb-table-scroll">
          <table className="sb-table">
            <thead>
              <tr>
                <th>{t("articles.colArticle")}</th>
                <th>{t("articles.colCoutReel")}</th>
                <th>{t("articles.colMargeUnitaire")}</th>
                <th>{t("articles.colStock")}</th>
                <th>{t("articles.colMargeTotale")}</th>
              </tr>
            </thead>
            <tbody>
              {articles.map((a) => {
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
                    <td className="sb-mono">
                      {a.stock} {uniteLabel(a.unite)}
                    </td>
                    <td className="sb-mono" style={{ fontWeight: 600 }}>
                      {fmt(margeTotale)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td style={{ fontWeight: 600, borderTop: "1px solid var(--line)" }}>{t("articles.total")}</td>
                <td style={{ borderTop: "1px solid var(--line)" }}></td>
                <td style={{ borderTop: "1px solid var(--line)" }}></td>
                <td style={{ borderTop: "1px solid var(--line)" }}></td>
                <td className="sb-mono" style={{ fontWeight: 700, borderTop: "1px solid var(--line)", color: "var(--accent-deep)" }}>
                  {fmt(margeTotaleFiltre)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {reappros.length > 0 && (
        <div className="sb-card" style={{ marginTop: 20 }}>
          <div className="sb-section-title" style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <RefreshCw size={15} color="var(--accent-deep)" /> {t("articles.historiqueReappro")}
          </div>
          <div className="sb-table-scroll">
            <table className="sb-table">
              <thead>
                <tr>
                  <th>{t("dashboard.colDate")}</th>
                  <th>{t("articles.colArticle")}</th>
                  <th>{t("articles.colQuantiteAjoutee")}</th>
                  <th>{t("articles.colPrixAchat")}</th>
                  <th>{t("articles.colFraisAnnexes")}</th>
                </tr>
              </thead>
              <tbody>
                {reappros.map((r) => (
                  <tr key={r.id}>
                    <td>{new Date(r.created_at).toLocaleDateString(dateLocale(business?.langue))}</td>
                    <td>{r.articles?.nom ?? "—"}</td>
                    <td className="sb-mono">
                      +{r.quantite} {uniteLabel(r.articles?.unite)}
                    </td>
                    <td className="sb-mono">{fmt(r.prix_achat)}</td>
                    <td className="sb-mono">{fmt(r.frais_annexes || 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {detailId &&
        (() => {
          const art = articles.find((a) => a.id === detailId);
          if (!art) return null;
          const margeReelle = art.prix_vente - art.prix_achat - (art.frais_annexes || 0);
          const theorique = stockTheorique(art);
          return (
            <div className="sb-modal-overlay" onClick={() => setDetailId(null)}>
              <div
                className="sb-card"
                style={{ width: 400, maxWidth: "92vw", background: "#fff", maxHeight: "90vh", overflowY: "auto" }}
                onClick={(e) => e.stopPropagation()}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                  <div className="sb-section-title" style={{ margin: 0 }}>
                    {t("articles.detailModalTitle")}
                  </div>
                  <button onClick={() => setDetailId(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "#6B6A63" }}>
                    <X size={16} />
                  </button>
                </div>

                {art.image_url ? (
                  <div style={{ width: "100%", aspectRatio: "1", borderRadius: 12, overflow: "hidden", marginBottom: 14, background: "var(--paper)" }}>
                    <img src={art.image_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
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
                      color: "#A6A29D",
                    }}
                  >
                    <ImageIcon size={40} />
                  </div>
                )}

                <div className="sb-section-title" style={{ fontSize: 16, margin: "0 0 2px" }}>
                  {art.nom}
                </div>
                <p style={{ fontSize: 12.5, color: "#6E6B68", margin: "0 0 16px" }}>{categorieName(art.categorie_id)}</p>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 20 }}>
                  <DetailField label={t("articles.colAchat")} value={fmt(art.prix_achat)} />
                  <DetailField label={t("articles.colFraisAnnexes")} value={fmt(art.frais_annexes || 0)} />
                  <DetailField label={t("articles.colVente")} value={fmt(art.prix_vente)} />
                  <DetailField
                    label={t("articles.colMargeReelle")}
                    value={fmt(margeReelle)}
                    valueColor={margeReelle >= 0 ? "#0E8F6E" : "#C24E37"}
                  />
                  <DetailField label={t("articles.colStock")} value={`${art.stock} ${uniteLabel(art.unite)}`} />
                  <DetailField label={t("articles.colStockTheorique")} value={`${theorique} ${uniteLabel(art.unite)}`} />
                  <DetailField label={t("articles.seuilLabel")} value={`${art.seuil} ${uniteLabel(art.unite)}`} />
                  <DetailField label={t("articles.uniteLabel")} value={uniteLabel(art.unite)} />
                </div>

                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    className="sb-btn sb-btn-ghost"
                    style={{ flex: 1, justifyContent: "center" }}
                    onClick={() => {
                      setDetailId(null);
                      ouvrirReappro(art);
                    }}
                  >
                    <RefreshCw size={14} /> {t("articles.reappro")}
                  </button>
                  <button
                    className="sb-btn sb-btn-primary"
                    style={{ flex: 1, justifyContent: "center" }}
                    onClick={() => {
                      setDetailId(null);
                      ouvrirEdition(art);
                    }}
                  >
                    <Pencil size={14} /> {t("articles.modifier")}
                  </button>
                </div>
              </div>
            </div>
          );
        })()}

      {reapproId &&
        (() => {
          const art = articles.find((a) => a.id === reapproId);
          return (
            <div className="sb-modal-overlay" onClick={() => setReapproId(null)}>
              <div className="sb-card" style={{ width: 340, background: "#fff" }} onClick={(e) => e.stopPropagation()}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
                  <div className="sb-section-title" style={{ margin: 0 }}>
                    {t("articles.reapproModalTitle")}
                  </div>
                  <button onClick={() => setReapproId(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "#6B6A63" }}>
                    <X size={16} />
                  </button>
                </div>
                <p style={{ fontSize: 12.5, color: "#6E6B68", margin: "0 0 14px" }}>{art?.nom}</p>

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
                  <p style={{ fontSize: 11, color: "#6E6B68", margin: 0 }}>{t("articles.reapproNote")}</p>
                  <button className="sb-btn sb-btn-emerald" style={{ justifyContent: "center" }} onClick={validerReappro} disabled={!reapproForm.quantite}>
                    <CheckCircle2 size={14} /> {t("articles.confirmerReappro")}
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
                    {t("articles.editModalTitle")}
                  </div>
                  <button onClick={() => setEditingId(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "#6B6A63" }}>
                    <X size={16} />
                  </button>
                </div>

                <form onSubmit={validerEdition} style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 10 }}>
                  <div className="sb-field">
                    <label>{t("articles.nomLabel")}</label>
                    <input
                      className="sb-input"
                      placeholder={t("articles.nomPlaceholder")}
                      value={editForm.nom}
                      onChange={(e) => setEditForm({ ...editForm, nom: e.target.value })}
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
                    <p style={{ fontSize: 11, color: "#6E6B68", margin: 0 }}>{t("articles.stockActuelNote")}</p>
                  </div>
                  <ImageUploadField
                    label={t("articles.photoLabel")}
                    businessId={business.id}
                    value={editForm.image_url}
                    onChange={(url) => setEditForm((f) => ({ ...f, image_url: url }))}
                  />
                  {editError && <p style={{ fontSize: 12, color: "#C24E37", margin: 0 }}>{editError}</p>}
                  <button className="sb-btn sb-btn-emerald" type="submit" style={{ justifyContent: "center" }}>
                    <CheckCircle2 size={14} /> {t("articles.saveEdits")}
                  </button>
                </form>
              </div>
            </div>
          );
        })()}
    </div>
  );
}
