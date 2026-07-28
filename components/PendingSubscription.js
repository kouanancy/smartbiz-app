"use client";

import { useState } from "react";
import { Clock, RefreshCw, LogOut } from "lucide-react";
import { SUBSCRIPTION_LABELS } from "@/lib/constants";
import { useAuth } from "@/lib/AuthProvider";

export default function PendingSubscription({ business }) {
  const { refreshBusiness, signOut } = useAuth();
  const [checking, setChecking] = useState(false);

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
          {isExpired
            ? "Abonnement expiré"
            : isSuspended
            ? "Compte suspendu"
            : "Abonnement en attente de paiement"}
        </h1>
        <p className="sb-sub" style={{ marginBottom: 4 }}>
          {business?.name || "Ta boutique"} — statut : {SUBSCRIPTION_LABELS[status] || status}
        </p>
        <p style={{ fontSize: 13, color: "#6e6b68", margin: "12px 0 22px" }}>
          {isExpired
            ? "Ton abonnement est arrivé à expiration. Renouvelle-le pour retrouver l'accès à ton tableau de bord et à tes données."
            : "Ton compte a bien été créé. L'accès à l'application (tableau de bord, commandes, stock...) s'active automatiquement dès la confirmation de ton paiement. Le paiement en ligne (CinetPay) sera bientôt disponible directement ici."}
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <button className="sb-btn sb-btn-primary" style={{ justifyContent: "center" }} onClick={handleRefresh} disabled={checking}>
            <RefreshCw size={14} /> {checking ? "Vérification…" : "J'ai payé, vérifier mon statut"}
          </button>
          <button className="sb-btn sb-btn-ghost" style={{ justifyContent: "center" }} onClick={signOut}>
            <LogOut size={14} /> Déconnexion
          </button>
        </div>
      </div>
    </div>
  );
}
