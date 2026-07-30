"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, ShieldCheck, ShieldOff } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/lib/AuthProvider";
import { dateLocale } from "@/lib/format";
import { t as tBase } from "@/lib/i18n";

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
  const t = (key, vars) => tBase(business?.langue, key, vars);
  const [businesses, setBusinesses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    if (business && !business.is_admin) router.replace("/dashboard");
  }, [business, router]);

  useEffect(() => {
    if (!business?.is_admin) return;
    let active = true;
    async function load() {
      setLoading(true);
      const { data } = await supabase
        .from("businesses")
        .select("id, owner_id, name, email, subscription_status, subscription_expires_at, is_admin");
      if (!active) return;
      setBusinesses(
        (data || []).sort((a, b) => {
          if (!a.subscription_expires_at) return 1;
          if (!b.subscription_expires_at) return -1;
          return new Date(a.subscription_expires_at) - new Date(b.subscription_expires_at);
        })
      );
      setLoading(false);
    }
    load();
    return () => {
      active = false;
    };
  }, [business?.is_admin]);

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
    setMsg(t("admin.paidSuccess"));
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
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {businesses.map((b) => {
                  const soiMeme = b.owner_id === business.owner_id;
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
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                          <button className="sb-btn sb-btn-emerald" style={{ padding: "4px 8px" }} onClick={() => marquerPaye(b)}>
                            <CheckCircle2 size={12} /> {t("admin.marquerPaye")}
                          </button>
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
    </div>
  );
}
