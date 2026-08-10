"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Ban, CheckCircle2, Pencil, Plus, Printer, Trash2, TruckIcon, X } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/lib/AuthProvider";
import { fmt as fmtBase, dateLocale } from "@/lib/format";
import { OPERATEURS_MOBILE_MONEY } from "@/lib/constants";
import { t as tBase } from "@/lib/i18n";
import Receipt from "@/components/Receipt";
import ArticleSelect from "@/components/ArticleSelect";

const STATUT_BADGE_CLASS = {
  en_attente: "sb-badge-amber",
  livree: "sb-badge-emerald",
  annulee: "sb-badge-coral",
};

const COMMANDE_SELECT =
  "*, clients(nom, telephone, adresse, email), commande_lignes(id, article_id, quantite, prix_vente, prix_achat, frais_annexes, articles(nom, unite, image_url))";

export default function CommandeDetailPage() {
  const { business } = useAuth();
  const router = useRouter();
  const params = useParams();
  const fmt = (n) => fmtBase(n, business?.devise);
  const t = (key, vars) => tBase(business?.langue, key, vars);
  const uniteLabel = (u) => t(`common.unites.${u || "unite"}`);

  const [commande, setCommande] = useState(undefined);
  const [clients, setClients] = useState([]);
  const [articles, setArticles] = useState([]);
  const [zones, setZones] = useState([]);
  const [receipt, setReceipt] = useState(null);

  const [editing, setEditing] = useState(false);
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

  async function chargerCommande() {
    const { data } = await supabase
      .from("commandes")
      .select(COMMANDE_SELECT)
      .eq("id", params.id)
      .eq("business_id", business.id)
      .maybeSingle();
    setCommande(data || null);
  }

  // La commande elle-même vient d'un chargement dédié (pas de la liste
  // paginée, qui ne connaît pas forcément cette commande) ; clients/
  // articles/zones ne servent qu'aux menus déroulants de la modale de
  // modification, chargés une seule fois par boutique comme avant sur la
  // page liste.
  useEffect(() => {
    if (!business?.id || !params.id) return;
    let active = true;
    async function load() {
      const [, clientsRes, articlesRes, zonesRes] = await Promise.all([
        chargerCommande(),
        supabase.from("clients").select("*").eq("business_id", business.id).order("nom"),
        supabase.from("articles").select("*").eq("business_id", business.id).order("nom"),
        supabase.from("zones_livraison").select("*").eq("business_id", business.id).order("zone"),
      ]);
      if (!active) return;
      setClients(clientsRes.data || []);
      setArticles(articlesRes.data || []);
      setZones(zonesRes.data || []);
    }
    load();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- chargerCommande ferme sur business/params.id, redéfinie à chaque rendu mais toujours équivalente pour ces mêmes valeurs
  }, [business?.id, params.id]);

  function reprint() {
    setReceipt({
      numero: commande.numero,
      created_at: commande.created_at,
      client: commande.clients,
      lignes: commande.commande_lignes.map((l) => ({
        nom: l.articles?.nom ?? "—",
        unite: l.articles?.unite,
        image_url: l.articles?.image_url,
        quantite: l.quantite,
        prix_vente: l.prix_vente,
        prix_achat: l.prix_achat,
        frais_annexes: l.frais_annexes,
      })),
      ca: commande.ca,
      livraison_type: commande.livraison_type,
      livraison_zone: commande.livraison_zone,
      livraison_frais: commande.livraison_frais,
      paiement_mode: commande.paiement_mode,
      paiement_operateur: commande.paiement_operateur,
    });
  }

  async function marquerLivree() {
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
    setArticles((prev) =>
      prev.map((a) => {
        const upd = stockUpdates.find((u) => u.articleId === a.id);
        return upd ? { ...a, stock: upd.nouveauStock } : a;
      })
    );
    chargerCommande();
  }

  async function annulerCommande() {
    const confirmed = window.confirm(t("commandes.confirmAnnuler"));
    if (!confirmed) return;
    const { error } = await supabase.from("commandes").update({ statut: "annulee" }).eq("id", commande.id);
    if (error) {
      window.alert(t("commandes.annulerError", { message: error.message }));
      return;
    }
    chargerCommande();
  }

  function ouvrirEdition() {
    setEditClientId(commande.client_id);
    setEditLignes(commande.commande_lignes.map((l) => ({ articleId: l.article_id, quantite: l.quantite })));
    setEditArticleSel("");
    setEditQte(1);
    setEditTypeLivraison(commande.livraison_type);
    setEditZoneLivraison(commande.livraison_zone || zones[0]?.zone || "");
    setEditModePaiement(commande.paiement_mode);
    setEditOperateur(commande.paiement_operateur || OPERATEURS_MOBILE_MONEY[0]);
    setEditError("");
    setEditing(true);
  }

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
        .eq("id", commande.id);
      if (commandeError) throw commandeError;

      const { error: deleteError } = await supabase.from("commande_lignes").delete().eq("commande_id", commande.id);
      if (deleteError) throw deleteError;

      const { error: insertError } = await supabase.from("commande_lignes").insert(
        fullLignes.map((l) => ({
          commande_id: commande.id,
          article_id: l.articleId,
          quantite: l.quantite,
          prix_vente: l.prix_vente,
          prix_achat: l.prix_achat,
          frais_annexes: l.frais_annexes,
        }))
      );
      if (insertError) throw insertError;

      await chargerCommande();
      setEditing(false);
    } catch (err) {
      setEditError(err.message || t("commandes.editGenericError"));
    } finally {
      setEditSaving(false);
    }
  }

  if (commande === undefined) return <p className="sb-sub">{t("common.loading")}</p>;

  if (commande === null) {
    return (
      <div>
        <button className="sb-back-link" onClick={() => router.push("/commandes")}>
          <ArrowLeft size={15} /> {t("commandes.detailBackToList")}
        </button>
        <p className="sb-sub">{t("commandes.detailNotFound")}</p>
      </div>
    );
  }

  const enAttente = commande.statut === "en_attente";
  const totalGeneral = commande.ca + (commande.livraison_frais || 0);

  return (
    <div>
      <button className="sb-back-link" onClick={() => router.push("/commandes")}>
        <ArrowLeft size={15} /> {t("commandes.detailBackToList")}
      </button>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 10, marginBottom: 18 }}>
        <div>
          <h1 className="sb-h1 sb-mono">{commande.numero}</h1>
          <p className="sb-sub">{new Date(commande.created_at).toLocaleDateString(dateLocale(business?.langue))}</p>
        </div>
        <span className={`sb-badge ${STATUT_BADGE_CLASS[commande.statut] || "sb-badge-amber"}`} style={{ fontSize: 13, padding: "7px 12px" }}>
          {t(`common.commandeStatut.${commande.statut}`) || commande.statut}
        </span>
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
            <div>
              <span>{t("receipt.printEmail")}</span>
              <strong>{commande.clients?.email || "—"}</strong>
            </div>
          </div>
          <div className="sb-receipt-print-info-block">
            <h3>{t("receipt.printLivraisonPaiement")}</h3>
            <div>
              <span>{t("receipt.printLivraison")}</span>
              <strong>{commande.livraison_type === "livraison" ? commande.livraison_zone : t("receipt.recuperationBoutique")}</strong>
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
      </div>

      <div className="sb-card" style={{ marginBottom: 16 }}>
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
              </tr>
            </thead>
            <tbody>
              {commande.commande_lignes.map((l) => (
                <tr key={l.id}>
                  <td style={{ width: 44 }}>
                    {l.articles?.image_url ? (
                      <div className="sb-thumb-upload">
                        <img src={l.articles.image_url} alt="" />
                      </div>
                    ) : null}
                  </td>
                  <td>{l.articles?.nom ?? "—"}</td>
                  <td className="sb-mono" style={{ textAlign: "right" }}>
                    {fmt(l.prix_vente)}
                  </td>
                  <td className="sb-mono" style={{ textAlign: "center" }}>
                    {l.quantite} {uniteLabel(l.articles?.unite)}
                  </td>
                  <td className="sb-mono" style={{ textAlign: "right" }}>
                    {fmt(l.prix_vente * l.quantite)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="sb-card">
        <div className="sb-resume-commande">
          <div>
            <span>{t("receipt.totalArticles")}</span>
            <strong>{fmt(commande.ca)}</strong>
          </div>
          {commande.livraison_frais > 0 && (
            <div>
              <span>{t("commandes.fraisLivraison")}</span>
              <strong>{fmt(commande.livraison_frais)}</strong>
            </div>
          )}
          <div className="sb-resume-total">
            <span>{t("receipt.totalAPayer")}</span>
            <strong>{fmt(totalGeneral)}</strong>
          </div>
          <div>
            <span>{t("commandes.margeEstimee")}</span>
            <strong style={{ color: commande.marge >= 0 ? "var(--emerald)" : "var(--coral)" }}>{fmt(commande.marge)}</strong>
          </div>
        </div>
      </div>

      <div className="sb-detail-actions">
        {enAttente && (
          <button className="sb-btn sb-btn-emerald" onClick={marquerLivree}>
            <TruckIcon size={15} /> {t("commandes.livre")}
          </button>
        )}
        {enAttente && (
          <button className="sb-btn sb-btn-ghost" onClick={ouvrirEdition}>
            <Pencil size={15} /> {t("commandes.modifier")}
          </button>
        )}
        <button className="sb-btn sb-btn-ghost" onClick={reprint}>
          <Printer size={15} /> {t("commandes.imprimerPdf")}
        </button>
        {enAttente && (
          <button className="sb-btn sb-btn-ghost" style={{ color: "var(--coral)" }} onClick={annulerCommande}>
            <Ban size={15} /> {t("commandes.annuler")}
          </button>
        )}
      </div>

      {receipt && <Receipt commande={receipt} business={business} onClose={() => setReceipt(null)} />}

      {editing && (
        <div className="sb-modal-overlay" onClick={() => setEditing(false)}>
          <div
            className="sb-card"
            style={{ width: 520, maxWidth: "95vw", maxHeight: "88vh", overflowY: "auto", background: "var(--card)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
              <div className="sb-section-title" style={{ margin: 0 }}>
                {t("commandes.editModalTitle", { numero: commande.numero })}
              </div>
              <button onClick={() => setEditing(false)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted)" }}>
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
                <ArticleSelect
                  articles={articles}
                  value={editArticleSel}
                  onChange={setEditArticleSel}
                  isDisabled={(a) => stockDispoEdition(a.id) < 1}
                  placeholder={t("commandes.selectArticle")}
                  emptyLabel={t("common.aucunResultatArticle")}
                  getLabel={(a) => `${a.nom} — ${fmt(a.prix_vente)} ${t("commandes.dispoSuffix", { n: stockDispoEdition(a.id), unite: uniteLabel(a.unite) })}`}
                />
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
