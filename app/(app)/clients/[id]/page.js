"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, CheckCircle2, Pencil, RotateCcw, Trash2, UserX, X } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/lib/AuthProvider";
import { fmt as fmtBase, dateLocale } from "@/lib/format";
import { t as tBase } from "@/lib/i18n";
import ClearableInput from "@/components/ClearableInput";

const normalizeTel = (tel) => (tel || "").replace(/\D/g, "");

export default function ClientDetailPage() {
  const { business } = useAuth();
  const router = useRouter();
  const params = useParams();
  const fmt = (n) => fmtBase(n, business?.devise);
  const t = (key, vars) => tBase(business?.langue, key, vars);

  const [client, setClient] = useState(undefined);
  const [stats, setStats] = useState({ count: 0, total: 0 });
  const [clientsPourDoublon, setClientsPourDoublon] = useState([]);
  const [historique, setHistorique] = useState({ dernierAchat: null, produitFavori: null });

  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState(null);
  const [editOriginalTelephone, setEditOriginalTelephone] = useState("");
  const [editErreurTel, setEditErreurTel] = useState(false);
  const [editError, setEditError] = useState("");

  async function chargerClient() {
    const { data } = await supabase.from("clients").select("*").eq("id", params.id).eq("business_id", business.id).maybeSingle();
    setClient(data || null);
  }

  useEffect(() => {
    if (!business?.id || !params.id) return;
    let active = true;
    async function load() {
      const [, commandesRes, clientsRes, achatsRes] = await Promise.all([
        chargerClient(),
        supabase.from("commandes").select("ca").eq("business_id", business.id).eq("client_id", params.id),
        supabase.from("clients").select("id,nom,telephone").eq("business_id", business.id),
        // Historique enrichi (dernier achat, produit favori) : uniquement
        // les commandes livrées, comme partout ailleurs dans l'app (une
        // commande en attente ou annulée n'a jamais été "achetée"). Jointure
        // commande_lignes -> commandes!inner(...) exactement comme dans
        // app/(app)/articles/[id]/page.js (stock réservé), seul le statut
        // filtré diffère ('livree' ici, 'en_attente' là-bas).
        supabase
          .from("commande_lignes")
          .select("quantite, articles(nom), commandes!inner(business_id, client_id, statut, created_at)")
          .eq("commandes.business_id", business.id)
          .eq("commandes.client_id", params.id)
          .eq("commandes.statut", "livree"),
      ]);
      if (!active) return;
      const lignes = commandesRes.data || [];
      setStats({ count: lignes.length, total: lignes.reduce((s, c) => s + c.ca, 0) });
      setClientsPourDoublon(clientsRes.data || []);

      let dernierAchat = null;
      const quantitesParArticle = new Map();
      (achatsRes.data || []).forEach((ligne) => {
        const createdAt = ligne.commandes?.created_at;
        if (createdAt && (!dernierAchat || createdAt > dernierAchat)) dernierAchat = createdAt;
        const nom = ligne.articles?.nom;
        if (!nom) return;
        quantitesParArticle.set(nom, (quantitesParArticle.get(nom) || 0) + ligne.quantite);
      });
      let produitFavori = null;
      let quantiteMax = 0;
      quantitesParArticle.forEach((quantite, nom) => {
        if (quantite > quantiteMax) {
          quantiteMax = quantite;
          produitFavori = nom;
        }
      });
      setHistorique({ dernierAchat, produitFavori });
    }
    load();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- chargerClient ferme sur business/params.id, redéfinie à chaque rendu mais toujours équivalente pour ces mêmes valeurs
  }, [business?.id, params.id]);

  function trouverDoublonTelephone(telephone) {
    const norm = normalizeTel(telephone);
    if (!norm) return null;
    return clientsPourDoublon.find((c) => c.id !== client.id && normalizeTel(c.telephone) === norm) || null;
  }

  function ouvrirEdition() {
    setEditForm({
      nom: client.nom || "",
      adresse: client.adresse || "",
      email: client.email || "",
      telephone: client.telephone || "",
    });
    setEditOriginalTelephone(client.telephone || "");
    setEditErreurTel(false);
    setEditError("");
    setEditOpen(true);
  }

  async function validerEdition(e) {
    e.preventDefault();
    if (!editForm.telephone.trim()) {
      setEditErreurTel(true);
      return;
    }
    setEditErreurTel(false);

    const telephoneChange = normalizeTel(editForm.telephone) !== normalizeTel(editOriginalTelephone);
    if (telephoneChange) {
      const doublon = trouverDoublonTelephone(editForm.telephone);
      if (doublon) {
        setEditError(t("clients.duplicatePhoneNoPrefix", { nom: doublon.nom || t("clients.autreClientCap") }));
        return;
      }
    }

    const { error } = await supabase
      .from("clients")
      .update({
        nom: editForm.nom.trim(),
        adresse: editForm.adresse.trim() || null,
        email: editForm.email.trim() || null,
        telephone: editForm.telephone.trim(),
      })
      .eq("id", client.id);
    if (error) {
      setEditError(error.message);
      return;
    }
    await chargerClient();
    setEditOpen(false);
  }

  async function desactiverClient() {
    const { error } = await supabase.from("clients").update({ actif: false }).eq("id", client.id);
    if (error) {
      window.alert(t("clients.desactiverError", { message: error.message }));
      return;
    }
    chargerClient();
  }

  async function reactiverClient() {
    const { error } = await supabase.from("clients").update({ actif: true }).eq("id", client.id);
    if (error) {
      window.alert(t("clients.reactiverError", { message: error.message }));
      return;
    }
    chargerClient();
  }

  async function supprimerClient() {
    const confirmed = window.confirm(t("clients.confirmDelete", { nom: client.nom }));
    if (!confirmed) return;
    const { error } = await supabase.from("clients").delete().eq("id", client.id);
    if (error) {
      if (error.code === "23503") {
        window.alert(t("clients.deleteLinkedError", { nom: client.nom }));
      } else {
        window.alert(t("clients.deleteGenericError", { message: error.message }));
      }
      return;
    }
    router.push("/clients");
  }

  if (client === undefined) return <p className="sb-sub">{t("common.loading")}</p>;

  if (client === null) {
    return (
      <div>
        <button className="sb-back-link" onClick={() => router.push("/clients")}>
          <ArrowLeft size={15} /> {t("clients.detailBackToList")}
        </button>
        <p className="sb-sub">{t("clients.detailNotFound")}</p>
      </div>
    );
  }

  const desactive = client.actif === false;

  return (
    <div>
      <button className="sb-back-link" onClick={() => router.push("/clients")}>
        <ArrowLeft size={15} /> {t("clients.detailBackToList")}
      </button>

      <div className="sb-card" style={{ maxWidth: 480 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
          <div className="sb-section-title" style={{ fontSize: 18, margin: 0 }}>
            {client.nom}
          </div>
          {desactive ? (
            <span className="sb-badge sb-badge-amber">{t("common.badgeDesactive")}</span>
          ) : (
            <span className="sb-badge sb-badge-emerald">{t("common.badgeActif")}</span>
          )}
        </div>

        <div className="sb-detail-field-grid" style={{ marginTop: 16, marginBottom: 4 }}>
          <div>
            <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-faint)", marginBottom: 4 }}>
              {t("clients.colTelephone")}
            </div>
            <div className="sb-mono" style={{ fontSize: 14, fontWeight: 600 }}>{client.telephone}</div>
          </div>
          <div>
            <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-faint)", marginBottom: 4 }}>
              {t("clients.colAdresse")}
            </div>
            <div style={{ fontSize: 14, fontWeight: 600 }}>{client.adresse || "—"}</div>
          </div>
          <div>
            <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-faint)", marginBottom: 4 }}>
              {t("clients.colEmail")}
            </div>
            <div style={{ fontSize: 14, fontWeight: 600 }}>{client.email || "—"}</div>
          </div>
          <div>
            <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-faint)", marginBottom: 4 }}>
              {t("clients.colCommandes")}
            </div>
            <div className="sb-mono" style={{ fontSize: 14, fontWeight: 600 }}>{stats.count}</div>
          </div>
          <div>
            <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-faint)", marginBottom: 4 }}>
              {t("clients.colTotalAchats")}
            </div>
            <div className="sb-mono" style={{ fontSize: 14, fontWeight: 600 }}>{fmt(stats.total)}</div>
          </div>
          <div>
            <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-faint)", marginBottom: 4 }}>
              {t("clients.colDernierAchat")}
            </div>
            <div style={{ fontSize: 14, fontWeight: 600 }}>
              {historique.dernierAchat ? new Date(historique.dernierAchat).toLocaleDateString(dateLocale(business?.langue)) : "—"}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-faint)", marginBottom: 4 }}>
              {t("clients.colProduitFavori")}
            </div>
            <div style={{ fontSize: 14, fontWeight: 600 }}>{historique.produitFavori || "—"}</div>
          </div>
        </div>

        <div className="sb-detail-actions">
          <button className="sb-btn sb-btn-primary" onClick={ouvrirEdition}>
            <Pencil size={15} /> {t("clients.modifier")}
          </button>
          {desactive ? (
            <button className="sb-btn sb-btn-ghost" onClick={reactiverClient}>
              <RotateCcw size={15} /> {t("clients.reactiver")}
            </button>
          ) : stats.count === 0 ? (
            <button className="sb-btn sb-btn-ghost" style={{ color: "var(--coral)" }} onClick={supprimerClient}>
              <Trash2 size={15} /> {t("clients.supprimer")}
            </button>
          ) : (
            <button className="sb-btn sb-btn-ghost" onClick={desactiverClient}>
              <UserX size={15} /> {t("clients.desactiver")}
            </button>
          )}
        </div>
      </div>

      {editOpen && editForm && (
        <div className="sb-modal-overlay" onClick={() => setEditOpen(false)}>
          <div className="sb-card" style={{ width: 380, background: "var(--card)" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
              <div className="sb-section-title" style={{ margin: 0 }}>
                {t("clients.editModalTitle")}
              </div>
              <button onClick={() => setEditOpen(false)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted)" }}>
                <X size={16} />
              </button>
            </div>

            <form onSubmit={validerEdition} style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 10 }}>
              <div className="sb-field">
                <label>{t("clients.nomLabel")}</label>
                <ClearableInput
                  placeholder={t("clients.nomPlaceholder")}
                  value={editForm.nom}
                  onChange={(e) => setEditForm({ ...editForm, nom: e.target.value })}
                  clearLabel={t("common.clearField")}
                />
              </div>
              <div className="sb-field">
                <label>{t("clients.adresseLabel")}</label>
                <input
                  className="sb-input"
                  placeholder={t("clients.adressePlaceholder")}
                  value={editForm.adresse}
                  onChange={(e) => setEditForm({ ...editForm, adresse: e.target.value })}
                />
              </div>
              <div className="sb-field">
                <label>{t("clients.emailLabel")}</label>
                <input
                  className="sb-input"
                  placeholder={t("clients.emailPlaceholder")}
                  type="email"
                  value={editForm.email}
                  onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                />
              </div>
              <div className="sb-field">
                <label>{t("clients.telephoneLabel")}</label>
                <input
                  className="sb-input"
                  placeholder={t("clients.telephonePlaceholder")}
                  value={editForm.telephone}
                  onChange={(e) => {
                    setEditForm({ ...editForm, telephone: e.target.value });
                    if (editErreurTel) setEditErreurTel(false);
                  }}
                  style={editErreurTel ? { borderColor: "var(--coral)" } : undefined}
                />
                <p style={{ fontSize: 11, color: editErreurTel ? "var(--coral)" : "var(--muted)", margin: "5px 2px 0" }}>
                  {editErreurTel ? t("clients.telephoneRequiredError") : t("clients.telephoneHint")}
                </p>
              </div>
              {editError && <p style={{ fontSize: 12, color: "var(--coral)", margin: 0 }}>{editError}</p>}
              <button className="sb-btn sb-btn-emerald" type="submit" style={{ justifyContent: "center" }}>
                <CheckCircle2 size={14} /> {t("clients.saveEdits")}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
