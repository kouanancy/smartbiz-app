"use client";

import { useState } from "react";
import { Clock, RefreshCw, LogOut } from "lucide-react";
import { useAuth } from "@/lib/AuthProvider";
import { t as tBase } from "@/lib/i18n";

export default function PendingSubscription({ business }) {
  const { refreshBusiness, signOut } = useAuth();
  const [checking, setChecking] = useState(false);
  const t = (key, vars) => tBase(business?.langue, key, vars);

  const status = business?.subscription_status || "en_attente_paiement";
  const isExpired = status === "expire";
  const isSuspended = status === "suspendu";

  async function handleRefresh() {
    setChecking(true);
    await refreshBusiness();
    setChecking(false);
  }

  return (
    <div className="sb-pending-screen">
      <div className="sb-pending-card">
        <div className="sb-pending-icon">
          <Clock size={24} />
        </div>
        <h1 className="sb-h1" style={{ marginBottom: 8 }}>
          {isExpired ? t("pending.titleExpired") : isSuspended ? t("pending.titleSuspended") : t("pending.titleDefault")}
        </h1>
        <p className="sb-sub" style={{ marginBottom: 4 }}>
          {t("pending.statusLine", {
            name: business?.name || t("pending.defaultBusinessName"),
            status: t(`common.subscriptionStatus.${status}`),
          })}
        </p>
        <p style={{ fontSize: 13, color: "#6e6b68", margin: "12px 0 22px" }}>
          {isExpired ? t("pending.textExpired") : t("pending.textDefault")}
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <button className="sb-btn sb-btn-primary" style={{ justifyContent: "center" }} onClick={handleRefresh} disabled={checking}>
            <RefreshCw size={14} /> {checking ? t("pending.checking") : t("pending.checkStatus")}
          </button>
          <button className="sb-btn sb-btn-ghost" style={{ justifyContent: "center" }} onClick={signOut}>
            <LogOut size={14} /> {t("pending.logout")}
          </button>
        </div>
      </div>
    </div>
  );
}
