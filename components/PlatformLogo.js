"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { removeWhiteBackgroundToCanvas } from "@/lib/removeWhiteBackground";

// Logo Doka partagé par tous les écrans d'entrée (connexion/inscription,
// premier paiement, réabonnement, compte suspendu, changement de formule) —
// lecture publique de parametres_globaux.logo_url (uploadé une seule fois
// pour toute la plateforme depuis Administration, voir
// components/LogoPlatformUpload.js ; aucune session requise à ce stade,
// donc rien à faire côté RLS). Jamais animé, contrairement au fond derrière
// lui (voir components/FloatingBlobs.js) : jamais de doute possible sur ce
// qui bouge et ce qui reste net.
//
// LogoPlatformUpload.js rend déjà le fond blanc transparent à l'envoi,
// mais un logo envoyé avant ce traitement (ou dont le fichier d'origine a
// un fond blanc que le prochain envoi n'a pas encore corrigé) reste
// affiché tel quel. Filet de sécurité ici : un même traitement
// (lib/removeWhiteBackground.js) est retenté à l'affichage sur l'image
// distante déjà publiée. getImageData peut échouer si le bucket Storage ne
// renvoie pas d'en-tête CORS permissif pour une image chargée depuis une
// autre origine (contrairement à l'envoi, toujours une image locale) — en
// cas d'échec, l'image d'origine reste affichée sans rien casser.
export default function PlatformLogo() {
  const [logoUrl, setLogoUrl] = useState("");
  const [processedUrl, setProcessedUrl] = useState("");

  useEffect(() => {
    supabase
      .from("parametres_globaux")
      .select("logo_url")
      .limit(1)
      .maybeSingle()
      .then(({ data }) => setLogoUrl(data?.logo_url || ""));
  }, []);

  // Tant que le traitement (asynchrone) n'a pas abouti, ou s'il échoue
  // (CORS, décodage), shownUrl reste logoUrl tel quel — jamais de logo
  // manquant en attendant.
  useEffect(() => {
    if (!logoUrl) return;
    let cancelled = false;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      removeWhiteBackgroundToCanvas(img)
        .then((canvas) => {
          if (!cancelled) setProcessedUrl(canvas.toDataURL("image/png"));
        })
        .catch(() => {
          // CORS ou décodage impossible : shownUrl reste logoUrl, déjà affiché.
        });
    };
    img.src = logoUrl;
    return () => {
      cancelled = true;
    };
  }, [logoUrl]);

  const shownUrl = processedUrl || logoUrl;

  return shownUrl ? (
    <img src={shownUrl} alt="Doka" className="sb-entry-logo" />
  ) : (
    <div className="sb-auth-brand">
      <span>Doka</span>
    </div>
  );
}
