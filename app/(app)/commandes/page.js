"use client";

import { useCallback, useState, useEffect } from "react";
import { Ban, CheckCircle2, FileSpreadsheet, Pencil, Plus, Printer, TruckIcon, Trash2, X } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/lib/AuthProvider";
import { fmt as fmtBase, dateLocale } from "@/lib/format";
import { OPERATEURS_MOBILE_MONEY, PAGE_SIZE } from "@/lib/constants";
import { t as tBase } from "@/lib/i18n";
import { exportToExcel, dateFichier } from "@/lib/exportExcel";
import Receipt from "@/components/Receipt";
import Pagination from "@/components/Pagination";

const STATUT_BADGE_CLASS = {
  en_attente: "sb-badge-amber",
  livree: "sb-badge-emerald",
  annulee: "sb-badge-coral",
};

const COMMANDE_SELECT =
  "*, clients(nom, telephone, adresse, email), commande_lignes(id, article_id, quantite, prix_vente, prix_achat, frais_annexes, articles(nom, unite))";

export default function CommandesPage() {
  const { business } = useAuth();
  const fmt = (n) => fmtBase(n, business?.devise);
  const t = (key, vars) => tBase(business?.langue, key, vars);
  const uniteLabel = (u) => t(`common.unites.${u || "unite"}`);
  const [commandes, setCommandes] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(0);
  const [refreshTick, setRefreshTick] = useState(0);
  const [nbEnAttente, setNbEnAttente] = useState(0);
  const [clients, setClients] = useState([]);
  const [articles, setArticles] = useState([]);
  const [zones, setZones] = useState([]);
  const [loading, setLoading] = useState(true);
  const [receipt, setReceipt] = useState(null);
  const [filtreStatut, setFiltreStatut] = useState("toutes");

  const [editingId, setEditingId] = useState(null);
  const [editClientId, setEditClientId] = useState("");
  const [editLignes, setEditLignes] = useState([]);
  const [editArticleSel, setEditArticleSel] = useState("");
  const [editQte, setEditQte] = useState(1);
  const [editTypeLivraison, setEditTypeLivraison] = useState("boutique");
  const [editZoneLivraison, setEditZoneLivraison] = useState("");
  const [editModePaiement, setEditModePaiement] = useState("livraison");
  const [editOperateur, setEditOperateur] = useState(OPERATEURS_MOBILE_MONEY[0]);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState("");

  // Filtre statut appliqué côté serveur — partagé entre le chargement
  // paginé et l'export Excel, qui doivent respecter le même filtre.
  const appliquerFiltreStatut = useCallback(
    (query) => (filtreStatut === "toutes" ? query : query.eq("statut", filtreStatut)),
    [filtreStatut]
  );

  // Listes complètes nécessaires aux menus déroulants de la modale de
  // modification (client, article, zone) — indépendantes de la pagination
  // des commandes, chargées une seule fois par boutique. Le stock des
  // articles est corrigé localement après une livraison (marquerLivree),
  // donc pas besoin de les rafraîchir à chaque mutation de commande.
  useEffect(() => {
    if (!business?.id) return;
    let active = true;
    async function loadStatique() {
      const [clientsRes, articlesRes, zonesRes] = await Promise.all([
        supabase.from("clients").select("*").eq("business_id", business.id).order("nom"),
        supabase.from("articles").select("*").eq("business_id", business.id).order("nom"),
        supabase.from("zones_livraison").select("*").eq("business_id", business.id).order("zone"),
      ]);
      if (!active) return;
      setClients(clientsRes.data || []);
      setArticles(articlesRes.data || []);
      setZones(zonesRes.data || []);
    }
    loadStatique();
    return () => {
      active = false;
    };
  }, [business?.id]);

  // Compteur "en attente" du badge, toujours global (indépendant du filtre
  // statut affiché) — rafraîchi après chaque mutation de commande.
  useEffect(() => {
    if (!business?.id) return;
    let active = true;
    supabase
      .from("commandes")
      .select("id", { count: "exact", head: true })
      .eq("business_id", business.id)
      .eq("statut", "en_attente")
      .then(({ count }) => {
        if (active) setNbEnAttente(count || 0);
      });
    return () => {
      active = false;
    };
  }, [business?.id, refreshTick]);

  // Page courante des commandes, filtrée par statut côté serveur.
  useEffect(() => {
    if (!business?.id) return;
    let active = true;
    async function load() {
      const { data, count } = await appliquerFiltreStatut(
        supabase.from("commandes").select(COMMANDE_SELECT, { count: "exact" }).eq("business_id", business.id)
      )
        .order("created_at", { ascending: false })
        .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
      if (!active) return;
      const total = count || 0;
      const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
      if (page > 0 && page >= totalPages) {
        setPage(totalPages - 1);
        return;
      }
      setCommandes(data || []);
      setTotalCount(total);
      setLoading(false);
    }
    load();
    return () => {
      active = false;
    };
  }, [business?.id, page, appliquerFiltreStatut, refreshTick]);

  function reprint(c) {
    setReceipt({
      numero: c.numero,
      created_at: c.created_at,
      client: c.clients,
      lignes: c.commande_lignes.map((l) => ({
        nom: l.articles?.nom ?? "—",
        unite: l.articles?.unite,
        quantite: l.quantite,
        prix_vente: l.prix_vente,
        prix_achat: l.prix_achat,
        frais_annexes: l.frais_annexes,
      })),
      ca: c.ca,
      livraison_type: c.livraison_type,
      livraison_zone: c.livraison_zone,
      livraison_frais: c.livraison_frais,
      paiement_mode: c.paiement_mode,
      paiement_operateur: c.paiement_operateur,
    });
  }

  // ---------- Livraison (déclenche le déstockage définitif) ----------

  async function marquerLivree(commande) {
    const stockUpdates = [];
    for (const l of commande.commande_lignes) {
      const art = articles.find((a) => a.id === l.article_id);
      const nouveauStock = (art?.stock || 0) - l.quantite;
      if (nouveauStock < 0) {
        window.alert(t("commandes.stockInsuffisant", { nom: l.articles?.nom ?? t("commandes.stockInsuffisantDefaultNom") }));
        return;
      }
      stockUpdates.push({ articleId: l.article_id, nouveauStock });
    }

    const { error: statutError } = await supabase.from("commandes").update({ statut: "livree" }).eq("id", commande.id);
    if (statutError) {
      window.alert(t("commandes.livrerError", { message: statutError.message }));
      return;
    }

    await Promise.all(
      stockUpdates.map(({ articleId, nouveauStock }) =>
        supabase.from("articles").update({ stock: nouveauStock }).eq("id", articleId)
      )
    );

    // La liste complète des articles (menu déroulant de la modale) n'est
    // pas paginée : une correction locale du stock reste valide ici.
    setArticles((prev) =>
      prev.map((a) => {
        const upd = stockUpdates.find((u) => u.articleId === a.id);
        return upd ? { ...a, stock: upd.nouveauStock } : a;
      })
    );
    // La commande elle-même peut disparaître de la page affichée (filtre
    // "en attente" par exemple) : on recharge depuis le serveur plutôt que
    // de corriger la liste locale.
    setRefreshTick((t2) => t2 + 1);
  }

  // ---------- Modification (uniquement tant qu'en attente : le stock n'a pas encore bougé) ----------

  function ouvrirEdition(commande) {
    setEditingId(commande.id);
    setEditClientId(commande.client_id);
    setEditLignes(commande.commande_lignes.map((l) => ({ articleId: l.article_id, quantite: l.quantite })));
    setEditArticleSel("");
    setEditQte(1);
    setEditTypeLivraison(commande.livraison_type);
    setEditZoneLivraison(commande.livraison_zone || zones[0]?.zone || "");
    setEditModePaiement(commande.paiement_mode);
    setEditOperateur(commande.paiement_operateur || OPERATEURS_MOBILE_MONEY[0]);
    setEditError("");
  }

  // Le stock n'étant déduit qu'à la livraison, modifier une commande encore
  // en attente ne fait que limiter les quantités au stock réel disponible
  // (moins ce qui est déjà dans le brouillon) — rien à réajuster ailleurs.
  function stockDispoEdition(articleId) {
    const art = articles.find((a) => a.id === articleId);
    if (!art) return 0;
    const dejaDansForm = editLignes.filter((l) => l.articleId === articleId).reduce((s, l) => s + l.quantite, 0);
    return art.stock - dejaDansForm;
  }

  function addEditLigne() {
    if (!editArticleSel || editQte < 1 || editQte > stockDispoEdition(editArticleSel)) return;
    setEditLignes((prev) => {
      const existe = prev.find((l) => l.articleId === editArticleSel);
      if (existe) return prev.map((l) => (l.articleId === editArticleSel ? { ...l, quantite: l.quantite + editQte } : l));
      return [...prev, { articleId: editArticleSel, quantite: editQte }];
    });
    setEditQte(1);
  }

  function removeEditLigne(articleId) {
    setEditLignes((prev) => prev.filter((l) => l.articleId !== articleId));
  }

  const editFraisLivraison =
    editTypeLivraison === "livraison" ? zones.find((z) => z.zone === editZoneLivraison)?.frais || 0 : 0;
  const editTotalCa = editLignes.reduce((s, l) => {
    const art = articles.find((a) => a.id === l.articleId);
    return s + (art ? art.prix_vente * l.quantite : 0);
  }, 0);
  const editTotalMarge = editLignes.reduce((s, l) => {
    const art = articles.find((a) => a.id === l.articleId);
    return s + (art ? (art.prix_vente - art.prix_achat - (art.frais_annexes || 0)) * l.quantite : 0);
  }, 0);
  const editTotalAvecLivraison = editTotalCa + editFraisLivraison;

  async function validerEdition() {
    if (editLignes.length === 0 || !editClientId) {
      setEditError(t("commandes.editRequireClientArticle"));
      return;
    }

    const fullLignes = editLignes.map((l) => {
      const art = articles.find((a) => a.id === l.articleId);
      return {
        articleId: l.articleId,
        nom: art.nom,
        unite: art.unite,
        quantite: l.quantite,
        prix_vente: art.prix_vente,
        prix_achat: art.prix_achat,
        frais_annexes: art.frais_annexes || 0,
      };
    });
    const ca = fullLignes.reduce((s, l) => s + l.prix_vente * l.quantite, 0);
    const marge = fullLignes.reduce((s, l) => s + (l.prix_vente - l.prix_achat - l.frais_annexes) * l.quantite, 0);

    setEditError("");
    setEditSaving(true);
    try {
      const { error: commandeError } = await supabase
        .from("commandes")
        .update({
          client_id: editClientId,
          ca,
          marge,
          livraison_type: editTypeLivraison,
          livraison_zone: editTypeLivraison === "livraison" ? editZoneLivraison : null,
          livraison_frais: editFraisLivraison,
          paiement_mode: editModePaiement,
          paiement_operateur: editModePaiement === "mobile_money" ? editOperateur : null,
        })
        .eq("id", editingId);
      if (commandeError) throw commandeError;

      const { error: deleteError } = await supabase.from("commande_lignes").delete().eq("commande_id", editingId);
      if (deleteError) throw deleteError;

      const { error: insertError } = await supabase.from("commande_lignes").insert(
        fullLignes.map((l) => ({
          commande_id: editingId,
          article_id: l.articleId,
          quantite: l.quantite,
          prix_vente: l.prix_vente,
          prix_achat: l.prix_achat,
          frais_annexes: l.frais_annexes,
        }))
      );
      if (insertError) throw insertError;

      setRefreshTick((t2) => t2 + 1);
      setEditingId(null);
    } catch (err) {
      setEditError(err.message || t("commandes.editGenericError"));
    } finally {
      setEditSaving(false);
    }
  }

  // ---------- Annulation (uniquement tant qu'en attente — aucun stock à restituer) ----------

  async function annulerCommande(commande) {
    const confirmed = window.confirm(t("commandes.confirmAnnuler"));
    if (!confirmed) return;

    const { error } = await supabase.from("commandes").update({ statut: "annulee" }).eq("id", commande.id);
    if (error) {
      window.alert(t("commandes.annulerError", { message: error.message }));
      return;
    }
    setRefreshTick((t2) => t2 + 1);
  }

  const filtresStatut = [
    { key: "toutes", label: t("common.toutes") },
    { key: "en_attente", label: t("common.commandeStatut.en_attente") },
    { key: "livree", label: t("commandes.filterLivrees") },
  ];

  // L'export doit couvrir tout l'historique filtré, pas seulement la page
  // affichée à l'écran — nouvelle requête dédiée, sans pagination.
  async function exporterExcel() {
    const { data } = await appliquerFiltreStatut(
      supabase.from("commandes").select(COMMANDE_SELECT).eq("business_id", business.id)
    ).order("created_at", { ascending: false });
    const rows = (data || []).map((c) => ({
      [t("dashboard.colNumero")]: c.numero,
      [t("dashboard.colDate")]: new Date(c.created_at).toLocaleDateString(dateLocale(business?.langue)),
      [t("commandes.colCliente")]: c.clients?.nom ?? "—",
      [t("commandes.colArticles")]: c.commande_lignes
        .map((l) => `${l.articles?.nom ?? "—"} ×${l.quantite} ${uniteLabel(l.articles?.unite)}`)
        .join(", "),
      [t("commandes.colCa")]: c.ca,
      [t("commandes.colMargeReelle")]: c.marge,
      [t("commandes.colStatut")]: t(`common.commandeStatut.${c.statut}`) || c.statut,
    }));
    exportToExcel(`commandes-${dateFichier()}.xlsx`, "Commandes", rows);
  }

  if (loading) return <p className="sb-sub">{t("common.loading")}</p>;

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 10 }}>
        <div>
          <h1 className="sb-h1">{t("commandes.title")}</h1>
          <p className="sb-sub">{t("commandes.subtitle", { n: totalCount })}</p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <button className="sb-btn sb-btn-ghost" onClick={exporterExcel}>
            <FileSpreadsheet size={14} /> {t("common.exporterExcel")}
          </button>
          <span className="sb-badge sb-badge-amber" style={{ fontSize: 12.5, padding: "6px 10px" }}>
            {t("commandes.nbEnAttente", { n: nbEnAttente })}
          </span>
        </div>
      </div>

      <div className="sb-toggle-group" style={{ margin: "14px 0", flexWrap: "wrap", display: "inline-flex" }}>
        {filtresStatut.map((opt) => (
          <button
            key={opt.key}
            className={`sb-toggle-item${filtreStatut === opt.key ? " active" : ""}`}
            onClick={() => {
              setFiltreStatut(opt.key);
              setPage(0);
            }}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <div className="sb-card">
        <div className="sb-table-scroll">
          <table className="sb-table">
            <thead>
              <tr>
                <th>{t("dashboard.colNumero")}</th>
                <th>{t("dashboard.colDate")}</th>
                <th>{t("commandes.colCliente")}</th>
                <th>{t("commandes.colArticles")}</th>
                <th>{t("commandes.colCa")}</th>
                <th>{t("commandes.colMargeReelle")}</th>
                <th>{t("commandes.colStatut")}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {commandes.map((c) => {
                const enAttente = c.statut === "en_attente";
                return (
                  <tr key={c.id} style={c.statut === "annulee" ? { opacity: 0.55 } : undefined}>
                    <td className="sb-mono">{c.numero}</td>
                    <td>{new Date(c.created_at).toLocaleDateString(dateLocale(business?.langue))}</td>
                    <td>{c.clients?.nom ?? "—"}</td>
                    <td style={{ color: "var(--muted)", fontSize: 12.5 }}>
                      {c.commande_lignes
                        .map((l) => `${l.articles?.nom ?? "—"} ×${l.quantite} ${uniteLabel(l.articles?.unite)}`)
                        .join(", ")}
                    </td>
                    <td className="sb-mono">{fmt(c.ca)}</td>
                    <td className="sb-mono" style={{ color: "var(--emerald)" }}>{fmt(c.marge)}</td>
                    <td>
                      <span className={`sb-badge ${STATUT_BADGE_CLASS[c.statut] || "sb-badge-amber"}`}>
                        {t(`common.commandeStatut.${c.statut}`) || c.statut}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        <button className="sb-btn sb-btn-ghost" style={{ padding: "4px 8px" }} onClick={() => reprint(c)}>
                          <Printer size={12} />
                        </button>
                        {enAttente && (
                          <>
                            <button
                              className="sb-btn sb-btn-emerald"
                              style={{ padding: "4px 8px" }}
                              onClick={() => marquerLivree(c)}
                            >
                              <TruckIcon size={12} /> {t("commandes.livre")}
                            </button>
                            <button className="sb-btn sb-btn-ghost" style={{ padding: "4px 8px" }} onClick={() => ouvrirEdition(c)}>
                              <Pencil size={12} /> {t("commandes.modifier")}
                            </button>
                            <button
                              className="sb-btn sb-btn-ghost"
                              style={{ padding: "4px 8px", color: "var(--coral)" }}
                              onClick={() => annulerCommande(c)}
                            >
                              <Ban size={12} /> {t("commandes.annuler")}
                            </button>
                          </>
                        )}
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

      {receipt && <Receipt commande={receipt} business={business} onClose={() => setReceipt(null)} />}

      {editingId && (
        <div className="sb-modal-overlay" onClick={() => setEditingId(null)}>
          <div
            className="sb-card"
            style={{ width: 520, maxWidth: "95vw", maxHeight: "88vh", overflowY: "auto", background: "var(--card)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
              <div className="sb-section-title" style={{ margin: 0 }}>
                {t("commandes.editModalTitle", { numero: commandes.find((c) => c.id === editingId)?.numero })}
              </div>
              <button onClick={() => setEditingId(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted)" }}>
                <X size={16} />
              </button>
            </div>

            <div className="sb-field" style={{ marginBottom: 16 }}>
              <label>{t("commandes.clienteLabel")}</label>
              <select className="sb-input" value={editClientId} onChange={(e) => setEditClientId(e.target.value)}>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nom} — {c.telephone}
                  </option>
                ))}
              </select>
            </div>

            <div className="sb-section-title" style={{ fontSize: 13 }}>
              {t("commandes.articlesTitle")}
            </div>
            <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
              <div className="sb-field" style={{ flex: 2, minWidth: 160 }}>
                <label>{t("commandes.articleLabel")}</label>
                <select className="sb-input" value={editArticleSel} onChange={(e) => setEditArticleSel(e.target.value)}>
                  <option value="">{t("commandes.selectArticle")}</option>
                  {articles.map((a) => (
                    <option key={a.id} value={a.id} disabled={stockDispoEdition(a.id) < 1}>
                      {a.nom} — {fmt(a.prix_vente)}{" "}
                      {t("commandes.dispoSuffix", { n: stockDispoEdition(a.id), unite: uniteLabel(a.unite) })}
                    </option>
                  ))}
                </select>
              </div>
              <div className="sb-field" style={{ flex: 0.5, minWidth: 70 }}>
                <label>{t("commandes.quantiteLabel")}</label>
                <input
                  className="sb-input"
                  type="number"
                  min={1}
                  max={editArticleSel ? stockDispoEdition(editArticleSel) : undefined}
                  value={editQte}
                  onChange={(e) => setEditQte(Number(e.target.value))}
                />
              </div>
              <button
                className="sb-btn sb-btn-primary"
                onClick={addEditLigne}
                disabled={!editArticleSel || stockDispoEdition(editArticleSel) < 1}
              >
                <Plus size={14} /> {t("commandes.ajouter")}
              </button>
            </div>

            {editLignes.length === 0 ? (
              <p style={{ fontSize: 13, color: "var(--muted)", marginBottom: 16 }}>{t("commandes.aucunArticle")}</p>
            ) : (
              <div className="sb-table-scroll" style={{ marginBottom: 16 }}>
                <table className="sb-table">
                  <thead>
                    <tr>
                      <th>{t("commandes.articleLabel")}</th>
                      <th>{t("commandes.colQte")}</th>
                      <th>{t("commandes.colSousTotal")}</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {editLignes.map((l) => {
                      const art = articles.find((a) => a.id === l.articleId);
                      return (
                        <tr key={l.articleId}>
                          <td>{art?.nom ?? "—"}</td>
                          <td className="sb-mono">
                            {l.quantite} {uniteLabel(art?.unite)}
                          </td>
                          <td className="sb-mono">{fmt((art?.prix_vente || 0) * l.quantite)}</td>
                          <td>
                            <button className="sb-btn sb-btn-ghost" style={{ padding: "3px 6px" }} onClick={() => removeEditLigne(l.articleId)}>
                              <Trash2 size={12} />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            <div className="sb-section-title" style={{ fontSize: 13 }}>
              {t("commandes.livraisonTitle")}
            </div>
            <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
              <button
                className={`sb-btn ${editTypeLivraison === "boutique" ? "sb-btn-primary" : "sb-btn-ghost"}`}
                onClick={() => setEditTypeLivraison("boutique")}
              >
                {t("commandes.recuperationBoutique")}
              </button>
              <button
                className={`sb-btn ${editTypeLivraison === "livraison" ? "sb-btn-primary" : "sb-btn-ghost"}`}
                onClick={() => setEditTypeLivraison("livraison")}
                disabled={zones.length === 0}
              >
                {t("commandes.livraison")}
              </button>
            </div>
            {editTypeLivraison === "livraison" && (
              <div className="sb-field" style={{ marginBottom: 16 }}>
                <label>{t("commandes.zoneLivraisonLabel")}</label>
                <select className="sb-input" value={editZoneLivraison} onChange={(e) => setEditZoneLivraison(e.target.value)}>
                  {zones.map((z) => (
                    <option key={z.id} value={z.zone}>
                      {z.zone} — {fmt(z.frais)}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="sb-section-title" style={{ fontSize: 13 }}>
              {t("commandes.paiementTitle")}
            </div>
            <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
              <button
                className={`sb-btn ${editModePaiement === "livraison" ? "sb-btn-primary" : "sb-btn-ghost"}`}
                onClick={() => setEditModePaiement("livraison")}
              >
                {t("commandes.paiementLivraison")}
              </button>
              <button
                className={`sb-btn ${editModePaiement === "mobile_money" ? "sb-btn-primary" : "sb-btn-ghost"}`}
                onClick={() => setEditModePaiement("mobile_money")}
              >
                {t("commandes.mobileMoney")}
              </button>
            </div>
            {editModePaiement === "mobile_money" && (
              <div className="sb-field" style={{ marginBottom: 16 }}>
                <label>{t("commandes.operateurLabel")}</label>
                <select className="sb-input" value={editOperateur} onChange={(e) => setEditOperateur(e.target.value)}>
                  {OPERATEURS_MOBILE_MONEY.map((op) => (
                    <option key={op} value={op}>
                      {op}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="sb-resume-commande" style={{ marginBottom: 16 }}>
              <div>
                <span>{t("commandes.totalArticles")}</span>
                <strong>{fmt(editTotalCa)}</strong>
              </div>
              <div>
                <span>{t("commandes.fraisLivraison")}</span>
                <strong>{fmt(editFraisLivraison)}</strong>
              </div>
              <div className="sb-resume-total">
                <span>{t("commandes.totalAPayer")}</span>
                <strong>{fmt(editTotalAvecLivraison)}</strong>
              </div>
              <div>
                <span>{t("commandes.margeEstimee")}</span>
                <strong style={{ color: editTotalMarge >= 0 ? "var(--emerald)" : "var(--coral)" }}>{fmt(editTotalMarge)}</strong>
              </div>
            </div>

            {editError && <p style={{ fontSize: 12, color: "var(--coral)", margin: "0 0 12px" }}>{editError}</p>}

            <button
              className="sb-btn sb-btn-emerald"
              style={{ width: "100%", justifyContent: "center" }}
              onClick={validerEdition}
              disabled={editSaving || editLignes.length === 0 || !editClientId}
            >
              <CheckCircle2 size={14} /> {editSaving ? t("commandes.saving") : t("commandes.saveEdits")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
