import { authentifierBoutique } from "@/lib/boutiqueApi";

// Vérifie qu'une clé d'API est valide et que le module est actif, sans
// rien lire d'autre -- utile au site pour un contrôle de connexion rapide
// avant une synchronisation plus lourde.
export const dynamic = "force-dynamic";

export async function GET(request) {
  const { business, erreur } = await authentifierBoutique(request);
  if (erreur) return erreur;
  return Response.json({ ok: true, boutique: business.name });
}
