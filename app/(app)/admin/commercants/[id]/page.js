"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, CheckCircle2, ShieldCheck, ShieldOff, Trash2, X, XCircle } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/lib/AuthProvider";
import { fmt as fmtBase, dateLocale } from "@/lib/format";
import { t as tBase } from "@/lib/i18n";

const STATUT_BADGE_CLASS = {
  essai: "sb-badge-amber",
  actif: "sb-badge-emerald",
  en_attente_paiement: "sb-badge-amber",
  expire: "sb-badge-coral",
  suspendu: "sb-badge-coral",
};

export default function CommercantDetailPage() {
  const { business: moi, session, refreshBusiness } = useAuth();
  const router = useRouter();
  const params = useParams();
  const fmt = (n) => fmtBase(n, moi?.devise);
  const t = (key, vars) => tBase(moi?.langue, key, vars);

  const [commercant, setCommercant] = useState(undefined);
  const [paiementEnAttente, setPaiementEnAttente] = useState(null);
  const [msg, setMsg] = useState("");
  const [rejetOpen, setRejetOpen] = useState(false);
  const [raisonRejet, setRaisonRejet] = useState("");
  const [zoomOpen, setZoomOpen] = useState(false);
  const [supprimerOpen, setSupprimerOpen] = useState(false);
  const [confirmationNom, setConfirmationNom] = useState("");
  const [suppressionEnCours, setSuppressionEnCours] = useState(false);
  const [erreurSuppression, setErreurSuppression] = useState("");

  useEffect(() => {
    if (!moi?.is_admin || !params.id) return;
    let active = true;
    async function load() {
      const [{ data: liste }, { data: paiements }] = await Promise.all([
        supabase.rpc("admin_list_businesses"),
        supabase
          .from("paiements_abonnement")
          .select("*")
          .eq("business_id", params.id)
          .eq("statut", "en_attente")
          .order("created_at", { ascending: false })
          .limit(1),
      ]);
      if (!active) return;
      setCommercant((liste || []).find((b) => b.id === params.id) || null);
      setPaiementEnAttente(paiements?.[0] || null);
    }
    load();
    return () => {
      active = false;
    };
  }, [moi?.is_admin, params.id]);

  async function marquerPaye() {
    // La date d'expiration (prolonge depuis l'existante si elle n'est pas
    // encore passée, repart d'aujourd'hui sinon) et le passage du
    // justificatif à 'reussi' sont désormais calculés/appliqués côté
    // serveur, en une seule opération atomique — voir
    // admin_mark_subscription_paid,
    // supabase-validation-paiement-installation-migration.sql.
    const { data, error } = await supabase
      .rpc("admin_mark_subscription_paid", { p_business_id: commercant.id, p_paiement_id: paiementEnAttente?.id || null })
      .single();
    if (error) {
      setMsg(t("admin.paidError", { message: error.message }));
      return;
    }
    setCommercant(data);
    if (commercant.owner_id === moi.owner_id) refreshBusiness();
    setPaiementEnAttente(null);
    setMsg(t("admin.paidSuccess"));

    // Notification push au commerçant, en plus de la cloche déjà posée par
    // admin_mark_subscription_paid ci-dessus — best effort (voir
    // app/api/admin/push-paiement-valide) : le paiement est déjà validé
    // quoi qu'il arrive ici, un échec de notification ne doit jamais
    // remonter comme une erreur de validation.
    fetch("/api/admin/push-paiement-valide", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
      body: JSON.stringify({ businessId: commercant.id, expiresAt: data.subscription_expires_at }),
    }).catch((err) => console.error("[admin] échec de la notification push de paiement validé :", err));
  }

  async function confirmerRejet() {
    if (!raisonRejet.trim()) return;
    const { data, error } = await supabase
      .rpc("admin_reject_payment", { p_paiement_id: paiementEnAttente.id, p_raison: raisonRejet.trim() })
      .single();
    if (error) {
      setMsg(t("admin.rejectError", { message: error.message }));
      return;
    }
    setCommercant(data);
    if (commercant.owner_id === moi.owner_id) refreshBusiness();
    setPaiementEnAttente(null);
    setRejetOpen(false);
    setRaisonRejet("");
    setMsg(t("admin.rejectSuccess"));
  }

  // Suppression complète et définitive (boutique + toutes ses données
  // liées + compte de connexion) — voir app/api/admin/supprimer-commercant
  // pour le détail : passe par une route serveur (clé service_role) plutôt
  // que par une fonction RPC, seule capable d'appeler l'API Admin de
  // Supabase Auth pour supprimer le compte auth.users correspondant.
  async function supprimerCommercant() {
    setSuppressionEnCours(true);
    setErreurSuppression("");
    try {
      const res = await fetch("/api/admin/supprimer-commercant", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ businessId: commercant.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || `${res.status}`);
      }
      router.push("/admin");
    } catch (err) {
      setErreurSuppression(t("admin.supprimerError", { message: err.message }));
      setSuppressionEnCours(false);
    }
  }

  async function toggleAdmin() {
    const { data, error } = await supabase.rpc("admin_set_is_admin", { p_business_id: commercant.id, p_is_admin: !commercant.is_admin }).single();
    if (error) {
      setMsg(t("admin.adminToggleError", { message: error.message }));
      return;
    }
    setCommercant(data);
    if (commercant.owner_id === moi.owner_id) refreshBusiness();
  }

  if (!moi?.is_admin) return null;

  if (commercant === undefined) return <p className="sb-sub">{t("common.loading")}</p>;

  if (commercant === null) {
    return (
      <div>
        <button className="sb-back-link" onClick={() => router.push("/admin")}>
          <ArrowLeft size={15} /> {t("admin.detailBackToList")}
        </button>
        <p className="sb-sub">{t("clients.detailNotFound")}</p>
      </div>
    );
  }

  const estMoi = commercant.owner_id === moi.owner_id;

  return (
    <div>
      <button className="sb-back-link" onClick={() => router.push("/admin")}>
        <ArrowLeft size={15} /> {t("admin.detailBackToList")}
      </button>

      {msg && (
        <div className="sb-badge sb-badge-emerald" style={{ marginBottom: 12, fontSize: 12.5, padding: "6px 10px" }}>
          {msg}
        </div>
      )}

      <div className="sb-card" style={{ maxWidth: 520 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
          <div className="sb-section-title" style={{ fontSize: 18, margin: 0 }}>
            {commercant.name || t("common.defaultBusinessName")}
          </div>
          <span className={`sb-badge ${STATUT_BADGE_CLASS[commercant.subscription_status] || "sb-badge-amber"}`}>
            {t(`common.subscriptionStatus.${commercant.subscription_status}`)}
          </span>
        </div>

        <div className="sb-detail-field-grid" style={{ marginTop: 16, marginBottom: 4 }}>
          <div>
            <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-faint)", marginBottom: 4 }}>
              {t("admin.colEmail")}
            </div>
            <div style={{ fontSize: 14, fontWeight: 600 }}>{commercant.email || "—"}</div>
          </div>
          <div>
            <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-faint)", marginBottom: 4 }}>
              {t("admin.colExpiration")}
            </div>
            <div className="sb-mono" style={{ fontSize: 14, fontWeight: 600 }}>
              {estMoi
                ? t("admin.aucuneExpiration")
                : commercant.subscription_expires_at
                  ? new Date(commercant.subscription_expires_at).toLocaleDateString(dateLocale(moi?.langue))
                  : t("admin.aucuneExpiration")}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-faint)", marginBottom: 4 }}>
              {t("admin.colFormule")}
            </div>
            <div style={{ fontSize: 14, fontWeight: 600 }}>{t(`common.plans.${commercant.plan || "autonome"}.nom`)}</div>
          </div>
          <div>
            <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-faint)", marginBottom: 4 }}>
              {t("admin.colJustificatif")}
            </div>
            <div style={{ fontSize: 14, fontWeight: 600 }}>
              {paiementEnAttente ? t("admin.voirJustificatif", { montant: fmt(paiementEnAttente.montant) }) : "—"}
            </div>
          </div>
        </div>

        {paiementEnAttente && (
          <div style={{ marginTop: 16 }}>
            <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-faint)", marginBottom: 6 }}>
              {t("admin.colDateSoumission")}
            </div>
            <div className="sb-mono" style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>
              {new Date(paiementEnAttente.created_at).toLocaleString(dateLocale(moi?.langue), {
                day: "2-digit",
                month: "2-digit",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </div>

            {/* Cliquable pour zoomer — un commerçant peut envoyer une photo
                prise de loin ou peu lisible en aperçu, l'administratrice doit
                pouvoir vérifier le montant/la référence sans avoir à deviner. */}
            <img
              src={paiementEnAttente.justificatif_url}
              alt=""
              onClick={() => setZoomOpen(true)}
              style={{ width: "100%", maxWidth: 480, borderRadius: 10, border: "1px solid var(--line)", cursor: "zoom-in" }}
            />
            <p style={{ fontSize: 11.5, color: "var(--text-faint)", margin: "6px 2px 0" }}>{t("admin.justificatifZoomHint")}</p>

            <div className="sb-verification-actions">
              <button className="sb-btn sb-btn-emerald sb-btn-verification" onClick={marquerPaye}>
                <CheckCircle2 size={17} /> {t("admin.valider")}
              </button>
              <button
                className="sb-btn sb-btn-verification"
                style={{ background: "var(--coral)", color: "#fff" }}
                onClick={() => {
                  setRejetOpen(true);
                  setRaisonRejet("");
                }}
              >
                <XCircle size={17} /> {t("admin.rejeter")}
              </button>
            </div>
          </div>
        )}

        <div className="sb-detail-actions">
          {!commercant.is_admin && !paiementEnAttente && (
            <button className="sb-btn sb-btn-emerald" onClick={marquerPaye}>
              <CheckCircle2 size={15} /> {t("admin.marquerPaye")}
            </button>
          )}
          <button className="sb-btn sb-btn-ghost" onClick={toggleAdmin}>
            {commercant.is_admin ? <ShieldOff size={15} /> : <ShieldCheck size={15} />}{" "}
            {commercant.is_admin ? t("admin.retirerAdmin") : t("admin.donnerAdmin")}
          </button>
          {!estMoi && (
            <button
              className="sb-btn"
              style={{ background: "var(--coral)", color: "#fff" }}
              onClick={() => {
                setConfirmationNom("");
                setErreurSuppression("");
                setSupprimerOpen(true);
              }}
            >
              <Trash2 size={15} /> {t("admin.supprimerDefinitivement")}
            </button>
          )}
        </div>
      </div>

      {zoomOpen && paiementEnAttente && (
        <div className="sb-modal-overlay" onClick={() => setZoomOpen(false)}>
          <img
            src={paiementEnAttente.justificatif_url}
            alt=""
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: "95vw", maxHeight: "90vh", objectFit: "contain", borderRadius: 10 }}
          />
        </div>
      )}

      {rejetOpen && (
        <div className="sb-modal-overlay" onClick={() => setRejetOpen(false)}>
          <div className="sb-card" style={{ width: 360, background: "var(--card)" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
              <div className="sb-section-title" style={{ margin: 0 }}>
                {t("admin.rejeterModalTitle")}
              </div>
              <button onClick={() => setRejetOpen(false)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted)" }}>
                <X size={16} />
              </button>
            </div>
            <p style={{ fontSize: 12.5, color: "var(--muted)", margin: "0 0 12px" }}>{t("admin.rejeterModalSub")}</p>
            <div className="sb-field">
              <label>{t("admin.raisonRejetLabel")}</label>
              <textarea
                className="sb-input"
                rows={3}
                style={{ resize: "vertical", fontFamily: "inherit" }}
                placeholder={t("admin.raisonRejetPlaceholder")}
                value={raisonRejet}
                onChange={(e) => setRaisonRejet(e.target.value)}
              />
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <button className="sb-btn sb-btn-ghost" style={{ flex: 1, justifyContent: "center" }} onClick={() => setRejetOpen(false)}>
                {t("admin.annuler")}
              </button>
              <button
                className="sb-btn"
                style={{ flex: 1, justifyContent: "center", background: "var(--coral)", color: "#fff" }}
                onClick={confirmerRejet}
                disabled={!raisonRejet.trim()}
              >
                {t("admin.confirmerRejet")}
              </button>
            </div>
          </div>
        </div>
      )}

      {supprimerOpen && (
        <div className="sb-modal-overlay" onClick={() => !suppressionEnCours && setSupprimerOpen(false)}>
          <div className="sb-card" style={{ width: 380, background: "var(--card)" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
              <div className="sb-section-title" style={{ margin: 0, color: "var(--coral)" }}>
                {t("admin.supprimerModalTitle")}
              </div>
              {!suppressionEnCours && (
                <button onClick={() => setSupprimerOpen(false)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted)" }}>
                  <X size={16} />
                </button>
              )}
            </div>
            <p style={{ fontSize: 12.5, color: "var(--muted)", margin: "0 0 12px" }}>{t("admin.supprimerModalWarning")}</p>
            <div className="sb-field">
              <label>{t("admin.supprimerModalConfirmLabel", { nom: commercant.name || t("common.defaultBusinessName") })}</label>
              <input
                className="sb-input"
                type="text"
                placeholder={t("admin.supprimerModalConfirmPlaceholder")}
                value={confirmationNom}
                onChange={(e) => setConfirmationNom(e.target.value)}
                disabled={suppressionEnCours}
                autoComplete="off"
              />
            </div>
            {erreurSuppression && (
              <p style={{ fontSize: 12.5, color: "var(--coral)", margin: "8px 0 0" }}>{erreurSuppression}</p>
            )}
            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <button
                className="sb-btn sb-btn-ghost"
                style={{ flex: 1, justifyContent: "center" }}
                onClick={() => setSupprimerOpen(false)}
                disabled={suppressionEnCours}
              >
                {t("admin.annuler")}
              </button>
              <button
                className="sb-btn"
                style={{ flex: 1, justifyContent: "center", background: "var(--coral)", color: "#fff" }}
                onClick={supprimerCommercant}
                disabled={suppressionEnCours || confirmationNom.trim() !== (commercant.name || t("common.defaultBusinessName"))}
              >
                {suppressionEnCours ? t("admin.supprimerEnCours") : t("admin.supprimerDefinitivement")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
