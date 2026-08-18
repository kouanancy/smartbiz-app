"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/AuthProvider";
import LandingPage from "@/components/LandingPage";

// Site vitrine public — accessible sans connexion, jamais de redirection
// automatique vers /login pour un visiteur non connecté (contrairement à
// avant). Seul un compte déjà connecté qui atterrit ici (lien direct,
// signet...) est renvoyé vers /dashboard ; le site vitrine s'affiche donc
// immédiatement pour tout le monde, sans attendre la résolution de la
// session (session === undefined pendant le chargement initial).
export default function Home() {
  const router = useRouter();
  const { session } = useAuth();

  useEffect(() => {
    if (session) router.replace("/dashboard");
  }, [session, router]);

  if (session) return <div className="sb-loading-screen">Chargement…</div>;
  return <LandingPage />;
}
