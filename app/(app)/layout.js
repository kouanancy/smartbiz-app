"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/AuthProvider";
import Sidebar from "@/components/Sidebar";
import PendingSubscription from "@/components/PendingSubscription";

export default function AppLayout({ children }) {
  const { session, business, signOut } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (session === null) router.replace("/login");
  }, [session, router]);

  if (session === undefined || session === null) {
    return <div className="sb-loading-screen">Chargement…</div>;
  }

  if (business === undefined) {
    return <div className="sb-loading-screen">Chargement de ta boutique…</div>;
  }

  if (business === null) {
    return (
      <div className="sb-loading-screen">
        Impossible de charger ta boutique. Rafraîchis la page ou reconnecte-toi.
      </div>
    );
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
