"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/AuthProvider";
import { THEMES } from "@/lib/constants";
import { t as tBase } from "@/lib/i18n";
import Sidebar from "@/components/Sidebar";
import PendingSubscription from "@/components/PendingSubscription";

export default function AppLayout({ children }) {
  const { session, business, signOut } = useAuth();
  const router = useRouter();
  const t = (key) => tBase(business?.langue, key);

  useEffect(() => {
    if (session === null) router.replace("/login");
  }, [session, router]);

  // Applique le thème de la boutique aux variables CSS globales (--accent,
  // --accent-deep, --accent-soft) sur <html> plutôt que sur un seul wrapper :
  // ça couvre aussi bien la sidebar/les boutons que le reçu imprimé, qui est
  // rendu via un portail directement dans <body> (voir components/Receipt.js).
  useEffect(() => {
    if (!business) return;
    const theme = THEMES[business.theme_key] || THEMES.orange;
    const root = document.documentElement;
    root.style.setProperty("--accent", theme.accent);
    root.style.setProperty("--accent-deep", theme.deep);
    root.style.setProperty("--accent-soft", theme.soft);
    return () => {
      root.style.removeProperty("--accent");
      root.style.removeProperty("--accent-deep");
      root.style.removeProperty("--accent-soft");
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only theme_key matters, not the whole business object
  }, [business?.theme_key]);

  if (session === undefined || session === null) {
    return <div className="sb-loading-screen">{t("layout.loadingSession")}</div>;
  }

  if (business === undefined) {
    return <div className="sb-loading-screen">{t("layout.loadingBusiness")}</div>;
  }

  if (business === null) {
    return <div className="sb-loading-screen">{t("layout.loadError")}</div>;
  }

  // 'essai' donne un accès complet, au même titre que 'actif' — seule la
  // sidebar affiche un indicateur du temps d'essai restant (voir
  // Sidebar.js). L'expiration de l'essai est gérée en amont dans
  // AuthProvider (bascule vers 'en_attente_paiement' dès que la date est
  // dépassée), donc arriver ici avec 'essai' signifie qu'il reste du temps.
  // Un compte administrateur garde un accès complet quel que soit son
  // subscription_status : le blocage automatique à l'expiration ne
  // concerne que les comptes commerçants classiques.
  if (!business.is_admin && business.subscription_status !== "actif" && business.subscription_status !== "essai") {
    return <PendingSubscription business={business} />;
  }

  return (
    <div className="sb-root">
      <Sidebar business={business} onSignOut={signOut} />
      <main className="sb-main">{children}</main>
    </div>
  );
}
