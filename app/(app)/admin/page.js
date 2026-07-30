"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, ShieldCheck, ShieldOff, XCircle, X } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/lib/AuthProvider";
import { fmt as fmtBase, dateLocale } from "@/lib/format";
import { t as tBase } from "@/lib/i18n";
import LogoPlatformUpload from "@/components/LogoPlatformUpload";

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
  const { business } = useAuth();
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
  const [platformLogo, setPlatformLogo] = useState(null);
  const [logoMsg, setLogoMsg] = useState("");

  useEffect(() => {
    if (business && !business.is_admin) router.replace("/dashboard");
  }, [business, router]);

  useEffect(() => {
    if (!business?.is_admin) return;
    let active = true;
    async function load() {
      setLoading(true);
      const [businessesRes, paiementsRes, parametresRes] = await Promise.all([
        supabase.from("businesses").select("id, owner_id, name, email, subscription_status, subscription_expires_at, is_admin"),
        supabase.from("paiements_abonnement").select("*").eq("statut", "en_attente").order("created_at", { ascending: true }),
        supabase.from("parametres_globaux").select("id, logo_url, icon_192_url, icon_512_url, icon_apple_180_url").maybeSingle(),
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
      setPlatformLogo(parametresRes.data || null);
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
      .from("businesses")
      .update({ subscription_status: "actif", subscription_expires_at: nouvelleExpiration.toISOString() })
      .eq("id", b.id)
      .select()
      .single();
    if (error) {
      setMsg(t("admin.paidError", { message: error.message }));
      return;
    }
    setBusinesses((prev) => prev.map((x) => (x.id === b.id ? data : x)));

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
    if (!platformLogo?.id) return;
    const { data, error } = await supabase.from("parametres_globaux").update(urls).eq("id", platformLogo.id).select().single();
    if (error) {
      setLogoMsg(t("admin.logoSaveError", { message: error.message }));
      return;
    }
    setPlatformLogo(data);
    setLogoMsg(t("admin.logoSaveSuccess"));
  }

  async function toggleAdmin(b) {
    const { data, error } = await supabase.from("businesses").update({ is_admin: !b.is_admin }).eq("id", b.id).select().single();
    if (error) {
      setMsg(t("admin.adminToggleError", { message: error.message }));
      return;
    }
    setBusinesses((prev) => prev.map((x) => (x.id === b.id ? data : x)));
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
          value={platformLogo?.logo_url || ""}
          onChange={enregistrerLogoPlatform}
        />
        {logoMsg && (
          <div className="sb-badge sb-badge-emerald" style={{ marginTop: 12, fontSize: 12.5, padding: "6px 10px" }}>
            {logoMsg}
          </div>
        )}
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
                  const soiMeme = b.owner_id === business.owner_id;
                  const paiement = paiementEnAttentePour(b.id);
                  return (
                    <tr key={b.id} style={expireBientot(b) ? { background: "#FBF1E6" } : undefined}>
                      <td>{b.name || t("common.defaultBusinessName")}</td>
                      <td style={{ color: "#6B6A63" }}>{b.email || "—"}</td>
                      <td>
                        <span className={`sb-badge ${STATUT_BADGE_CLASS[b.subscription_status] || "sb-badge-amber"}`}>
                          {t(`common.subscriptionStatus.${b.subscription_status}`)}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <span>
                            {b.subscription_expires_at
                              ? new Date(b.subscription_expires_at).toLocaleDateString(dateLocale(business?.langue))
                              : t("admin.aucuneExpiration")}
                          </span>
                          {expireBientot(b) && <span className="sb-badge sb-badge-amber">{t("admin.badgeExpireBientot")}</span>}
                        </div>
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
                          <button className="sb-btn sb-btn-emerald" style={{ padding: "4px 8px" }} onClick={() => marquerPaye(b)}>
                            <CheckCircle2 size={12} /> {t("admin.marquerPaye")}
                          </button>
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
                          <button
                            className="sb-btn sb-btn-ghost"
                            style={{ padding: "4px 8px" }}
                            onClick={() => toggleAdmin(b)}
                            disabled={soiMeme && b.is_admin}
                            title={soiMeme && b.is_admin ? t("admin.retirerAdminSoiMemeTitre") : undefined}
                          >
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
