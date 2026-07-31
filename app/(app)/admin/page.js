"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, ShieldCheck, ShieldOff, XCircle, X } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/lib/AuthProvider";
import { fmt as fmtBase, dateLocale } from "@/lib/format";
import { t as tBase } from "@/lib/i18n";
import LogoPlatformUpload from "@/components/LogoPlatformUpload";
import ImageUploadField from "@/components/ImageUploadField";

const STATUT_BADGE_CLASS = {
  essai: "sb-badge-amber",
  actif: "sb-badge-emerald",
  en_attente_paiement: "sb-badge-amber",
  expire: "sb-badge-coral",
  suspendu: "sb-badge-coral",
};

function expireBientot(b) {
  if (!["actif", "essai"].includes(b.subscription_status) || !b.subscription_expires_at) return false;
  const diffJours = (new Date(b.subscription_expires_at) - new Date()) / (1000 * 60 * 60 * 24);
  return diffJours >= 0 && diffJours <= 7;
}

export default function AdminPage() {
  const { business, refreshBusiness } = useAuth();
  const router = useRouter();
  const fmt = (n) => fmtBase(n, business?.devise);
  const t = (key, vars) => tBase(business?.langue, key, vars);
  const [businesses, setBusinesses] = useState([]);
  const [paiementsEnAttente, setPaiementsEnAttente] = useState([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");
  const [rejetId, setRejetId] = useState(null);
  const [raisonRejet, setRaisonRejet] = useState("");
  const [previewPaiement, setPreviewPaiement] = useState(null);
  const [logoMsg, setLogoMsg] = useState("");
  const [parametresGlobaux, setParametresGlobaux] = useState(null);
  const [waveQrDraft, setWaveQrDraft] = useState("");
  const [waveTelDraft, setWaveTelDraft] = useState("");
  const [prixDraft, setPrixDraft] = useState("");
  const [waveMsg, setWaveMsg] = useState("");
  const [supportTelDraft, setSupportTelDraft] = useState("");
  const [supportMsg, setSupportMsg] = useState("");

  useEffect(() => {
    if (business && !business.is_admin) router.replace("/dashboard");
  }, [business, router]);

  useEffect(() => {
    if (!business?.is_admin) return;
    let active = true;
    async function load() {
      setLoading(true);
      const [businessesRes, paiementsRes, parametresRes] = await Promise.all([
        supabase.rpc("admin_list_businesses"),
        supabase.from("paiements_abonnement").select("*").eq("statut", "en_attente").order("created_at", { ascending: true }),
        supabase.from("parametres_globaux").select("*").maybeSingle(),
      ]);
      if (!active) return;
      setBusinesses(
        (businessesRes.data || []).sort((a, b) => {
          if (!a.subscription_expires_at) return 1;
          if (!b.subscription_expires_at) return -1;
          return new Date(a.subscription_expires_at) - new Date(b.subscription_expires_at);
        })
      );
      setPaiementsEnAttente(paiementsRes.data || []);
      const parametres = parametresRes.data || null;
      setParametresGlobaux(parametres);
      if (parametres) {
        setWaveQrDraft(parametres.wave_qr_url || "");
        setWaveTelDraft(parametres.wave_telephone || "");
        setPrixDraft(String(parametres.abonnement_prix ?? ""));
        setSupportTelDraft(parametres.support_telephone || "");
      }
      setLoading(false);
    }
    load();
    return () => {
      active = false;
    };
  }, [business?.is_admin]);

  function paiementEnAttentePour(businessId) {
    return paiementsEnAttente.find((p) => p.business_id === businessId) || null;
  }

  async function marquerPaye(b) {
    const nouvelleExpiration = new Date();
    nouvelleExpiration.setMonth(nouvelleExpiration.getMonth() + 1);
    const { data, error } = await supabase
      .rpc("admin_mark_subscription_paid", { p_business_id: b.id, p_expires_at: nouvelleExpiration.toISOString() })
      .single();
    if (error) {
      setMsg(t("admin.paidError", { message: error.message }));
      return;
    }
    setBusinesses((prev) => prev.map((x) => (x.id === b.id ? data : x)));
    // Le contexte AuthProvider (donc la sidebar) garde sa propre copie de
    // "business" : sans ce rafraîchissement, une action sur sa propre
    // boutique (ex. marquer son propre abonnement comme payé) resterait
    // invisible dans la sidebar jusqu'à la prochaine reconnexion.
    if (b.owner_id === business.owner_id) refreshBusiness();

    const paiement = paiementEnAttentePour(b.id);
    if (paiement) {
      const { error: paiementError } = await supabase.from("paiements_abonnement").update({ statut: "reussi" }).eq("id", paiement.id);
      if (!paiementError) setPaiementsEnAttente((prev) => prev.filter((p) => p.id !== paiement.id));
    }
    setMsg(t("admin.paidSuccess"));
  }

  async function confirmerRejet() {
    if (!raisonRejet.trim()) return;
    const { error } = await supabase
      .from("paiements_abonnement")
      .update({ statut: "echoue", raison_rejet: raisonRejet.trim() })
      .eq("id", rejetId);
    if (error) {
      setMsg(t("admin.rejectError", { message: error.message }));
      return;
    }
    setPaiementsEnAttente((prev) => prev.filter((p) => p.id !== rejetId));
    setRejetId(null);
    setRaisonRejet("");
    setMsg(t("admin.rejectSuccess"));
  }

  async function enregistrerLogoPlatform(urls) {
    if (!parametresGlobaux?.id) return;
    const { data, error } = await supabase.from("parametres_globaux").update(urls).eq("id", parametresGlobaux.id).select().single();
    if (error) {
      setLogoMsg(t("admin.logoSaveError", { message: error.message }));
      return;
    }
    setParametresGlobaux(data);
    setLogoMsg(t("admin.logoSaveSuccess"));
  }

  async function enregistrerParametresGlobaux() {
    if (!parametresGlobaux) return;
    const prix = Number(prixDraft);
    if (Number.isNaN(prix) || prix < 0) {
      setWaveMsg(t("admin.waveMontantInvalide"));
      return;
    }
    const { data, error } = await supabase
      .from("parametres_globaux")
      .update({
        wave_qr_url: waveQrDraft.trim() || null,
        wave_telephone: waveTelDraft.trim() || null,
        abonnement_prix: prix,
      })
      .eq("id", parametresGlobaux.id)
      .select()
      .single();
    if (error) {
      setWaveMsg(t("common.error", { message: error.message }));
      return;
    }
    setParametresGlobaux(data);
    setWaveMsg(t("admin.waveSavedMsg"));
  }

  async function enregistrerSupport() {
    if (!parametresGlobaux) return;
    const { data, error } = await supabase
      .from("parametres_globaux")
      .update({ support_telephone: supportTelDraft.trim() || null })
      .eq("id", parametresGlobaux.id)
      .select()
      .single();
    if (error) {
      setSupportMsg(t("common.error", { message: error.message }));
      return;
    }
    setParametresGlobaux(data);
    setSupportMsg(t("admin.supportSavedMsg"));
  }

  async function toggleAdmin(b) {
    const { data, error } = await supabase.rpc("admin_set_is_admin", { p_business_id: b.id, p_is_admin: !b.is_admin }).single();
    if (error) {
      setMsg(t("admin.adminToggleError", { message: error.message }));
      return;
    }
    setBusinesses((prev) => prev.map((x) => (x.id === b.id ? data : x)));
    if (b.owner_id === business.owner_id) refreshBusiness();
  }

  if (!business?.is_admin) return null;
  if (loading) return <p className="sb-sub">{t("common.loading")}</p>;

  return (
    <div>
      <h1 className="sb-h1">{t("admin.title")}</h1>
      <p className="sb-sub">{t("admin.subtitleCount", { n: businesses.length })}</p>

      {msg && (
        <div className="sb-badge sb-badge-emerald" style={{ marginBottom: 12, fontSize: 12.5, padding: "6px 10px" }}>
          {msg}
        </div>
      )}

      <div className="sb-card" style={{ marginBottom: 16, maxWidth: 420 }}>
        <div className="sb-section-title" style={{ margin: "0 0 4px" }}>
          {t("admin.logoTitle")}
        </div>
        <p style={{ fontSize: 12.5, color: "#6E6B68", margin: "0 0 12px" }}>{t("admin.logoSub")}</p>
        <LogoPlatformUpload
          label={t("admin.logoLabel")}
          businessId={business.id}
          value={parametresGlobaux?.logo_url || ""}
          onChange={enregistrerLogoPlatform}
        />
        {logoMsg && (
          <div className="sb-badge sb-badge-emerald" style={{ marginTop: 12, fontSize: 12.5, padding: "6px 10px" }}>
            {logoMsg}
          </div>
        )}
      </div>

      <div className="sb-card" style={{ marginBottom: 16, maxWidth: 480 }}>
        <div className="sb-section-title">{t("admin.waveTitle")}</div>
        <p style={{ fontSize: 12.5, color: "#6E6B68", margin: "0 0 12px" }}>{t("admin.waveSub")}</p>
        {waveMsg && (
          <div className="sb-badge sb-badge-emerald" style={{ marginBottom: 12, fontSize: 12.5, padding: "6px 10px" }}>
            {waveMsg}
          </div>
        )}
        <div style={{ marginBottom: 14 }}>
          <ImageUploadField
            label={t("admin.waveQrLabel")}
            businessId={business.id}
            folder="wave-qr"
            value={waveQrDraft}
            onChange={(url) => {
              setWaveQrDraft(url);
              setWaveMsg("");
            }}
          />
        </div>
        <div className="sb-form-grid">
          <div className="sb-field">
            <label>{t("admin.waveTelLabel")}</label>
            <input
              className="sb-input"
              placeholder={t("admin.waveTelPlaceholder")}
              value={waveTelDraft}
              onChange={(e) => {
                setWaveTelDraft(e.target.value);
                setWaveMsg("");
              }}
            />
          </div>
          <div className="sb-field">
            <label>{t("admin.wavePrixLabel")}</label>
            <input
              className="sb-input"
              type="number"
              placeholder={t("admin.wavePrixPlaceholder")}
              value={prixDraft}
              onChange={(e) => {
                setPrixDraft(e.target.value);
                setWaveMsg("");
              }}
            />
          </div>
        </div>
        <button className="sb-btn sb-btn-primary" style={{ marginTop: 12 }} onClick={enregistrerParametresGlobaux}>
          {t("parametres.enregistrer")}
        </button>
      </div>

      <div className="sb-card" style={{ marginBottom: 16, maxWidth: 480 }}>
        <div className="sb-section-title">{t("admin.supportTitle")}</div>
        <p style={{ fontSize: 12.5, color: "#6E6B68", margin: "0 0 12px" }}>{t("admin.supportSub")}</p>
        {supportMsg && (
          <div className="sb-badge sb-badge-emerald" style={{ marginBottom: 12, fontSize: 12.5, padding: "6px 10px" }}>
            {supportMsg}
          </div>
        )}
        {!parametresGlobaux?.support_telephone && (
          <div className="sb-badge sb-badge-amber" style={{ display: "block", marginBottom: 12, fontSize: 12.5, padding: "8px 12px" }}>
            {t("admin.supportTelMissing")}
          </div>
        )}
        <div className="sb-field">
          <label>{t("admin.supportTelLabel")}</label>
          <input
            className="sb-input"
            placeholder={t("admin.supportTelPlaceholder")}
            value={supportTelDraft}
            onChange={(e) => {
              setSupportTelDraft(e.target.value);
              setSupportMsg("");
            }}
          />
        </div>
        <button className="sb-btn sb-btn-primary" style={{ marginTop: 12 }} onClick={enregistrerSupport}>
          {t("parametres.enregistrer")}
        </button>
      </div>

      {businesses.length === 0 ? (
        <p style={{ fontSize: 13, color: "#6B6A63" }}>{t("admin.aucunCommercant")}</p>
      ) : (
        <div className="sb-card">
          <div className="sb-table-scroll">
            <table className="sb-table">
              <thead>
                <tr>
                  <th>{t("admin.colBoutique")}</th>
                  <th>{t("admin.colEmail")}</th>
                  <th>{t("admin.colStatut")}</th>
                  <th>{t("admin.colExpiration")}</th>
                  <th>{t("admin.colJustificatif")}</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {businesses.map((b) => {
                  const paiement = paiementEnAttentePour(b.id);
                  // La date d'expiration ne concerne jamais l'admin connecté
                  // lui-même (accès permanent, quel que soit son abonnement) :
                  // elle ne doit apparaître que pour les autres commerçants
                  // listés, jamais comme information personnelle le concernant.
                  const estMoi = b.owner_id === business.owner_id;
                  return (
                    <tr key={b.id} style={expireBientot(b) && !estMoi ? { background: "#FBF1E6" } : undefined}>
                      <td>{b.name || t("common.defaultBusinessName")}</td>
                      <td style={{ color: "#6B6A63" }}>{b.email || "—"}</td>
                      <td>
                        <span className={`sb-badge ${STATUT_BADGE_CLASS[b.subscription_status] || "sb-badge-amber"}`}>
                          {t(`common.subscriptionStatus.${b.subscription_status}`)}
                        </span>
                      </td>
                      <td>
                        {estMoi ? (
                          <span style={{ color: "#A6A29D" }}>{t("admin.aucuneExpiration")}</span>
                        ) : (
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <span>
                              {b.subscription_expires_at
                                ? new Date(b.subscription_expires_at).toLocaleDateString(dateLocale(business?.langue))
                                : t("admin.aucuneExpiration")}
                            </span>
                            {expireBientot(b) && <span className="sb-badge sb-badge-amber">{t("admin.badgeExpireBientot")}</span>}
                          </div>
                        )}
                      </td>
                      <td>
                        {paiement ? (
                          <div
                            className="sb-thumb-upload"
                            style={{ width: 44, height: 44 }}
                            onClick={() => setPreviewPaiement(paiement)}
                            title={t("admin.voirJustificatif", { montant: fmt(paiement.montant) })}
                          >
                            <img src={paiement.justificatif_url} alt="" />
                          </div>
                        ) : (
                          <span style={{ color: "#A6A29D", fontSize: 12.5 }}>—</span>
                        )}
                      </td>
                      <td>
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                          {!b.is_admin && (
                            <button className="sb-btn sb-btn-emerald" style={{ padding: "4px 8px" }} onClick={() => marquerPaye(b)}>
                              <CheckCircle2 size={12} /> {t("admin.marquerPaye")}
                            </button>
                          )}
                          {paiement && (
                            <button
                              className="sb-btn sb-btn-ghost"
                              style={{ padding: "4px 8px", color: "#C24E37" }}
                              onClick={() => {
                                setRejetId(paiement.id);
                                setRaisonRejet("");
                              }}
                            >
                              <XCircle size={12} /> {t("admin.rejeter")}
                            </button>
                          )}
                          <button className="sb-btn sb-btn-ghost" style={{ padding: "4px 8px" }} onClick={() => toggleAdmin(b)}>
                            {b.is_admin ? <ShieldOff size={12} /> : <ShieldCheck size={12} />}{" "}
                            {b.is_admin ? t("admin.retirerAdmin") : t("admin.donnerAdmin")}
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
      )}

      {rejetId && (
        <div className="sb-modal-overlay" onClick={() => setRejetId(null)}>
          <div className="sb-card" style={{ width: 360, background: "#fff" }} onClick={(e) => e.stopPropagation()}>
            <div className="sb-section-title" style={{ margin: "0 0 4px" }}>
              {t("admin.rejeterModalTitle")}
            </div>
            <p style={{ fontSize: 12.5, color: "#6E6B68", margin: "0 0 12px" }}>{t("admin.rejeterModalSub")}</p>
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
              <button className="sb-btn sb-btn-ghost" style={{ flex: 1, justifyContent: "center" }} onClick={() => setRejetId(null)}>
                {t("admin.annuler")}
              </button>
              <button
                className="sb-btn"
                style={{ flex: 1, justifyContent: "center", background: "#C24E37", color: "#fff" }}
                onClick={confirmerRejet}
                disabled={!raisonRejet.trim()}
              >
                {t("admin.confirmerRejet")}
              </button>
            </div>
          </div>
        </div>
      )}

      {previewPaiement && (
        <div className="sb-modal-overlay" onClick={() => setPreviewPaiement(null)}>
          <div className="sb-card" style={{ width: 420, maxWidth: "92vw", background: "#fff" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
              <div className="sb-section-title" style={{ margin: 0 }}>
                {t("admin.justificatifModalTitle")}
              </div>
              <button
                onClick={() => setPreviewPaiement(null)}
                style={{ background: "none", border: "none", cursor: "pointer", color: "#6B6A63" }}
              >
                <X size={16} />
              </button>
            </div>
            <p style={{ fontSize: 12.5, color: "#6E6B68", margin: "0 0 10px" }}>
              {t("paiement.colMontant")} : <strong>{fmt(previewPaiement.montant)}</strong> —{" "}
              {new Date(previewPaiement.created_at).toLocaleDateString(dateLocale(business?.langue))}
            </p>
            <img
              src={previewPaiement.justificatif_url}
              alt=""
              style={{ width: "100%", borderRadius: 10, border: "1px solid var(--line)" }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
