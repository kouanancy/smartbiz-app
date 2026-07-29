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

  if (business.subscription_status !== "actif") {
    return <PendingSubscription business={business} />;
  }

  return (
    <div className="sb-root">
      <Sidebar business={business} onSignOut={signOut} />
      <main className="sb-main">{children}</main>
    </div>
  );
}
