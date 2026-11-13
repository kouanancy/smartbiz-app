"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Ban, Banknote, CheckCircle2, Pencil, Plus, Printer, Trash2, TruckIcon, X } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/lib/AuthProvider";
import { fmt as fmtBase, dateLocale, tronquerMilieuNom } from "@/lib/format";
import { OPERATEURS_MOBILE_MONEY, MODES_PAIEMENT_ACOMPTE } from "@/lib/constants";
import { t as tBase } from "@/lib/i18n";
import Receipt from "@/components/Receipt";
import ArticleSelect from "@/components/ArticleSelect";
import ResumeCommandeTotaux from "@/components/ResumeCommandeTotaux";

const STATUT_BADGE_CLASS = {
  en_attente: "sb-badge-amber",
  livree: "sb-badge-emerald",
  annulee: "sb-badge-coral",
};

const COMMANDE_SELECT =
  "*, clients(nom, telephone, adresse, email), commande_lignes(id, article_id, quantite, prix_vente, prix_achat, frais_annexes, offert, articles(nom, unite, image_url)), commande_acomptes(id, montant, mode_paiement, date_versement, statut, created_at)";

// Un acompte "remboursé" (uniquement après annulation de la commande, voir
// supabase-commande-acomptes-migration.sql) n'est jamais compté comme
// versé : il ne réduit plus le reste à payer et ne rend plus la commande
// "réservée".
function totalAcompteVerse(commande) {
  return (commande.commande_acomptes || []).filter((a) => a.statut === "verse").reduce((s, a) => s + a.montant, 0);
}

// Même règle Mobile Money que ResumeCommandeTotaux.js/components/Receipt.js
// (le CA est déjà réglé, seuls les frais de livraison restent dus) —
// reprise ici pour en déduire le reste à payer une fois les acomptes
// soustraits, sans dupliquer cette règle sous une autre forme.
function totalDuCommande(commande) {
  const totalGeneral = commande.ca + (commande.livraison_frais || 0);
  return commande.paiement_mode === "mobile_money" ? commande.livraison_frais || 0 : totalGeneral;
}

function resteAPayerCommande(commande) {
  return Math.max(0, totalDuCommande(commande) - totalAcompteVerse(commande));
}

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

  const [acompteOpen, setAcompteOpen] = useState(false);
  const [acompteMontant, setAcompteMontant] = useState("");
  const [acompteMode, setAcompteMode] = useState(MODES_PAIEMENT_ACOMPTE[0]);
  const [acompteSaving, setAcompteSaving] = useState(false);
  const [acompteError, setAcompteError] = useState("");

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
        offert: l.offert,
      })),
      ca: commande.ca,
      livraison_type: commande.livraison_type,
      livraison_zone: commande.livraison_zone,
      livraison_frais: commande.livraison_frais,
      paiement_mode: commande.paiement_mode,
      paiement_operateur: commande.paiement_operateur,
      acompteVerse: totalAcompteVerse(commande),
    });
  }

  async function marquerLivree() {
    // Une commande avec au moins un acompte versé ne peut être livrée que
    // soldée — ce contrôle existe déjà via le bouton désactivé plus bas
    // (voir le rendu), répété ici en garde-fou direct.
    if (resteAPayerCommande(commande) > 0 && totalAcompteVerse(commande) > 0) {
      window.alert(t("commandes.livraisonBloqueeAcompte", { montant: fmt(resteAPayerCommande(commande)) }));
      return;
    }

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

  function ouvrirAcompte() {
    setAcompteMontant("");
    setAcompteMode(MODES_PAIEMENT_ACOMPTE[0]);
    setAcompteError("");
    setAcompteOpen(true);
  }

  async function validerAcompte() {
    const montant = Number(acompteMontant);
    if (!montant || montant <= 0) return;
    setAcompteError("");
    setAcompteSaving(true);
    // Le trigger trg_verifier_stock_theorique_acompte (voir
    // supabase-commande-acomptes-migration.sql) refuse l'insertion si le
    // stock théorique d'un article de la commande est déjà négatif —
    // message d'erreur du trigger directement affiché, jamais recalculé
    // côté client pour ne pas dupliquer cette vérification.
    const { error } = await supabase.from("commande_acomptes").insert({
      commande_id: commande.id,
      business_id: business.id,
      montant,
      mode_paiement: acompteMode,
    });
    setAcompteSaving(false);
    if (error) {
      setAcompteError(t("commandes.acompteError", { message: error.message }));
      return;
    }
    setAcompteOpen(false);
    chargerCommande();
  }

  function ouvrirEdition() {
    setEditClientId(commande.client_id);
    // offert préservé tel quel depuis la ligne existante : la modale de
    // modification ne permet pas d'ajouter de nouveaux cadeaux (voir
    // addEditLigne, toujours offert: false) — seulement de ne pas perdre
    // le statut d'un cadeau déjà présent quand la commande est modifiée
    // pour une autre raison (livraison, paiement, quantité d'un autre
    // article...).
    setEditLignes(commande.commande_lignes.map((l) => ({ articleId: l.article_id, quantite: l.quantite, offert: l.offert })));
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

  // Fusionne uniquement avec une ligne déjà "vendue" existante — jamais
  // avec une ligne "offerte" préservée (voir ouvrirEdition) : rallonger
  // la quantité d'un cadeau via ce simple champ d'ajout le transformerait
  // silencieusement en vente partielle, jamais voulu ici (cette modale
  // n'offre aucun moyen d'ajouter un nouveau cadeau, seulement de ne pas
  // perdre ceux déjà présents).
  function addEditLigne() {
    if (!editArticleSel || editQte < 1 || editQte > stockDispoEdition(editArticleSel)) return;
    setEditLignes((prev) => {
      const existe = prev.find((l) => l.articleId === editArticleSel && !l.offert);
      if (existe) return prev.map((l) => (l === existe ? { ...l, quantite: l.quantite + editQte } : l));
      return [...prev, { articleId: editArticleSel, quantite: editQte, offert: false }];
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
    if (!art) return s;
    return s + (l.offert ? 0 : art.prix_vente) * l.quantite;
  }, 0);
  const editTotalMarge = editLignes.reduce((s, l) => {
    const art = articles.find((a) => a.id === l.articleId);
    if (!art) return s;
    const prixVente = l.offert ? 0 : art.prix_vente;
    return s + (prixVente - art.prix_achat - (art.frais_annexes || 0)) * l.quantite;
  }, 0);
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
        // Toujours 0 pour une ligne offerte, jamais le prix catalogue —
        // même principe qu'à la création (voir app/(app)/nouvelle/page.js).
        prix_vente: l.offert ? 0 : art.prix_vente,
        prix_achat: art.prix_achat,
        frais_annexes: art.frais_annexes || 0,
        offert: l.offert,
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
          offert: l.offert,
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
  const acomptes = commande.commande_acomptes || [];
  const totalAcompte = totalAcompteVerse(commande);
  const resteAPayer = resteAPayerCommande(commande);
  const aUnAcompte = totalAcompte > 0;
  const soldee = resteAPayer <= 0;

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
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {enAttente && aUnAcompte && (
            <span className="sb-badge sb-badge-muted" style={{ fontSize: 13, padding: "7px 12px" }}>
              {t("commandes.reservee")}
            </span>
          )}
          <span className={`sb-badge ${STATUT_BADGE_CLASS[commande.statut] || "sb-badge-amber"}`} style={{ fontSize: 13, padding: "7px 12px" }}>
            {t(`common.commandeStatut.${commande.statut}`) || commande.statut}
          </span>
        </div>
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
                  <td style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span className="sb-nom-tronque" title={l.articles?.nom ?? ""} style={{ flex: 1, minWidth: 0 }}>
                      {l.articles?.nom ? tronquerMilieuNom(l.articles.nom) : "—"}
                    </span>
                    {l.offert && (
                      <span className="sb-badge sb-badge-amber" style={{ fontSize: 11, flexShrink: 0 }}>
                        🎁 {t("receipt.cadeauOffertBadge")}
                      </span>
                    )}
                  </td>
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
        <ResumeCommandeTotaux
          t={t}
          fmt={fmt}
          totalArticles={commande.ca}
          fraisLivraison={commande.livraison_frais || 0}
          paiementMode={commande.paiement_mode}
          margeReelle={commande.marge}
        />
      </div>

      <div className="sb-card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, flexWrap: "wrap", gap: 10 }}>
          <div className="sb-section-title" style={{ margin: 0, fontSize: 13 }}>
            {t("commandes.acomptesTitle")}
          </div>
          {enAttente && (
            <button className="sb-btn sb-btn-primary" onClick={ouvrirAcompte}>
              <Banknote size={14} /> {t("commandes.ajouterAcompte")}
            </button>
          )}
        </div>

        {acomptes.length === 0 ? (
          <p style={{ fontSize: 13, color: "var(--muted)" }}>{t("commandes.aucunAcompte")}</p>
        ) : (
          <div className="sb-table-scroll" style={{ marginBottom: 14 }}>
            <table className="sb-table">
              <thead>
                <tr>
                  <th>{t("commandes.colAcompteDate")}</th>
                  <th style={{ textAlign: "right" }}>{t("commandes.colAcompteMontant")}</th>
                  <th>{t("commandes.colAcompteMode")}</th>
                  <th>{t("commandes.colAcompteStatut")}</th>
                </tr>
              </thead>
              <tbody>
                {acomptes.map((a) => (
                  <tr key={a.id}>
                    <td>{new Date(a.date_versement).toLocaleDateString(dateLocale(business?.langue))}</td>
                    <td className="sb-mono" style={{ textAlign: "right" }}>
                      {fmt(a.montant)}
                    </td>
                    <td>{a.mode_paiement}</td>
                    <td>
                      <span className={`sb-badge ${a.statut === "verse" ? "sb-badge-emerald" : "sb-badge-coral"}`}>
                        {a.statut === "verse" ? t("commandes.acompteStatutVerse") : t("commandes.acompteStatutRembourse")}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {aUnAcompte && (
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              fontWeight: 700,
              fontSize: 14,
              paddingTop: 10,
              borderTop: "1px dashed var(--line)",
            }}
          >
            <span>{t("commandes.resteAPayerLabel")}</span>
            <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <strong className="sb-mono" style={{ color: soldee ? "var(--emerald)" : "var(--coral)" }}>
                {fmt(resteAPayer)}
              </strong>
              {soldee && (
                <span className="sb-badge sb-badge-emerald" style={{ fontSize: 10.5 }}>
                  {t("commandes.commandeSoldee")}
                </span>
              )}
            </span>
          </div>
        )}
      </div>

      <div className="sb-detail-actions">
        {enAttente && (
          <button className="sb-btn sb-btn-emerald" onClick={marquerLivree} disabled={aUnAcompte && !soldee}>
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
      {enAttente && aUnAcompte && !soldee && (
        <p style={{ fontSize: 12.5, color: "var(--coral)", marginTop: 8 }}>
          {t("commandes.livraisonBloqueeAcompte", { montant: fmt(resteAPayer) })}
        </p>
      )}

      {receipt && <Receipt commande={receipt} business={business} onClose={() => setReceipt(null)} />}

      {acompteOpen && (
        <div className="sb-modal-overlay" onClick={() => setAcompteOpen(false)}>
          <div className="sb-card" style={{ width: 380, maxWidth: "95vw" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
              <div className="sb-section-title" style={{ margin: 0 }}>
                {t("commandes.ajouterAcompte")}
              </div>
              <button onClick={() => setAcompteOpen(false)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted)" }}>
                <X size={16} />
              </button>
            </div>

            <div className="sb-field" style={{ marginBottom: 14 }}>
              <label>{t("commandes.acompteMontantLabel")}</label>
              <input
                className="sb-input"
                type="number"
                min={1}
                value={acompteMontant}
                onChange={(e) => setAcompteMontant(e.target.value)}
              />
            </div>
            <div className="sb-field" style={{ marginBottom: 16 }}>
              <label>{t("commandes.acompteModePaiementLabel")}</label>
              <select className="sb-input" value={acompteMode} onChange={(e) => setAcompteMode(e.target.value)}>
                {MODES_PAIEMENT_ACOMPTE.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>

            {acompteError && <p style={{ fontSize: 12, color: "var(--coral)", margin: "0 0 12px" }}>{acompteError}</p>}

            <button
              className="sb-btn sb-btn-primary"
              style={{ width: "100%", justifyContent: "center" }}
              onClick={validerAcompte}
              disabled={acompteSaving || !acompteMontant || Number(acompteMontant) <= 0}
            >
              <Banknote size={14} /> {acompteSaving ? t("commandes.saving") : t("commandes.enregistrerAcompte")}
            </button>
          </div>
        </div>
      )}

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
                  getLabel={(a) => `${a.code} · ${tronquerMilieuNom(a.nom, 28)} — ${fmt(a.prix_vente)} ${t("commandes.dispoSuffix", { n: stockDispoEdition(a.id), unite: uniteLabel(a.unite) })}`}
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
                    {editLignes.map((l, i) => {
                      const art = articles.find((a) => a.id === l.articleId);
                      return (
                        <tr key={i}>
                          <td style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <span className="sb-nom-tronque" title={art?.nom ?? ""} style={{ flex: 1, minWidth: 0 }}>
                              {art?.nom ? tronquerMilieuNom(art.nom) : "—"}
                            </span>
                            {l.offert && (
                              <span className="sb-badge sb-badge-amber" style={{ fontSize: 11, flexShrink: 0 }}>
                                🎁 {t("receipt.cadeauOffertBadge")}
                              </span>
                            )}
                          </td>
                          <td className="sb-mono">
                            {l.quantite} {uniteLabel(art?.unite)}
                          </td>
                          <td className="sb-mono">{fmt((l.offert ? 0 : art?.prix_vente || 0) * l.quantite)}</td>
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

            <div style={{ marginBottom: 16 }}>
              <ResumeCommandeTotaux
                t={t}
                fmt={fmt}
                totalArticles={editTotalCa}
                fraisLivraison={editFraisLivraison}
                paiementMode={editModePaiement}
                margeReelle={editTotalMarge}
                toujoursAfficherFraisLivraison
              />
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
