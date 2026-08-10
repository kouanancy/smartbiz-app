"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { FileSpreadsheet, Plus, RefreshCw, Search, X } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/lib/AuthProvider";
import { fmt as fmtBase, dateLocale } from "@/lib/format";
import { t as tBase } from "@/lib/i18n";
import { UNITES, PAGE_SIZE } from "@/lib/constants";
import { exportToExcel, dateFichier } from "@/lib/exportExcel";
import ImageUploadField from "@/components/ImageUploadField";
import Pagination from "@/components/Pagination";
import ClearableInput from "@/components/ClearableInput";

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

export default function ArticlesPage() {
  const { business } = useAuth();
  const router = useRouter();
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
          <p style={{ fontSize: 12.5, color: "var(--muted)", margin: "0 0 12px" }}>{t("articles.catManagerSub")}</p>
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
              <ClearableInput
                placeholder={t("articles.newCategoryPlaceholder")}
                value={newCat}
                onChange={(e) => setNewCat(e.target.value)}
                clearLabel={t("common.clearField")}
              />
            </div>
            <button className="sb-btn sb-btn-primary" onClick={addCategory}>
              <Plus size={14} /> {t("articles.addBtn")}
            </button>
          </div>
          {catMsg && <p style={{ fontSize: 12, color: "var(--coral)", margin: "8px 2px 0" }}>{catMsg}</p>}
        </div>
      )}

      {showForm && (
        <form onSubmit={submit} className="sb-card sb-form-grid" style={{ marginBottom: 18 }}>
          <div className="sb-field" style={{ gridColumn: "1 / 3" }}>
            <label>{t("articles.nomLabel")}</label>
            <ClearableInput
              placeholder={t("articles.nomPlaceholder")}
              value={form.nom}
              onChange={(e) => setForm({ ...form, nom: e.target.value })}
              clearLabel={t("common.clearField")}
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

      <ClearableInput
        wrapStyle={{ marginBottom: 14, maxWidth: 280 }}
        leftIcon={<Search size={14} style={{ position: "absolute", left: 10, top: 10, color: "var(--muted)" }} />}
        placeholder={t("articles.searchPlaceholder")}
        value={recherche}
        onChange={(e) => setRecherche(e.target.value)}
        clearLabel={t("common.clearField")}
      />

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
              </tr>
            </thead>
            <tbody>
              {articles.map((a) => {
                const margeReelle = a.prix_vente - a.prix_achat - (a.frais_annexes || 0);
                const theorique = stockTheorique(a);
                return (
                  <tr key={a.id} className="sb-row-clickable" onClick={() => router.push(`/articles/${a.id}`)}>
                    <td>
                      {a.image_url ? (
                        <div className="sb-thumb-upload">
                          <img src={a.image_url} alt="" />
                        </div>
                      ) : null}
                    </td>
                    <td>{a.nom}</td>
                    <td style={{ color: "var(--muted)" }}>{categorieName(a.categorie_id)}</td>
                    <td className="sb-mono">{fmt(a.prix_achat)}</td>
                    <td className="sb-mono">{fmt(a.frais_annexes || 0)}</td>
                    <td className="sb-mono">{fmt(a.prix_vente)}</td>
                    <td className="sb-mono" style={{ color: margeReelle >= 0 ? "var(--emerald)" : "var(--coral)" }}>
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
        <p style={{ fontSize: 12.5, color: "var(--muted)", margin: "0 0 12px" }}>{t("articles.margeReelleSub")}</p>
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
                    <td className="sb-mono" style={{ color: margeUnitaire >= 0 ? "var(--emerald)" : "var(--coral)" }}>
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
                <td className="sb-mono" style={{ fontWeight: 700, borderTop: "1px solid var(--line)", color: "var(--accent-text)" }}>
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
            <RefreshCw size={15} color="var(--accent-text)" /> {t("articles.historiqueReappro")}
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
    </div>
  );
}
