"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

// Logo Doka partagé par tous les écrans d'entrée (connexion/inscription,
// premier paiement, réabonnement, compte suspendu, changement de formule) —
// lecture publique de parametres_globaux.logo_url (uploadé une seule fois
// pour toute la plateforme depuis Administration, voir
// components/LogoPlatformUpload.js ; aucune session requise à ce stade,
// donc rien à faire côté RLS). Jamais animé, contrairement au fond derrière
// lui (voir components/FloatingBlobs.js) : jamais de doute possible sur ce
// qui bouge et ce qui reste net.
export default function PlatformLogo() {
  const [logoUrl, setLogoUrl] = useState("");

  useEffect(() => {
    supabase
      .from("parametres_globaux")
      .select("logo_url")
      .limit(1)
      .maybeSingle()
      .then(({ data }) => setLogoUrl(data?.logo_url || ""));
  }, []);

  return logoUrl ? (
    <img src={logoUrl} alt="Doka" className="sb-entry-logo" />
  ) : (
    <div className="sb-auth-brand">
      <span>Doka</span>
    </div>
  );
}
