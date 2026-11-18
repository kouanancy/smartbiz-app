import { authentifierBoutique, erreurBoutique } from "@/lib/boutiqueApi";

// Tous les articles proposés en ligne de la boutique (actifs ou non -- le
// site masque lui-même actif = false, voir docs/boutique-en-ligne-api.md)
// : sert à la synchronisation initiale du catalogue côté site et au
// rattrapage en cas de doute sur l'état connu.
export const dynamic = "force-dynamic";

export async function GET(request) {
  const { business, admin, erreur } = await authentifierBoutique(request);
  if (erreur) return erreur;

  const { data, error } = await admin.rpc("boutique_articles_proposes_json", { p_business_id: business.id });
  if (error) {
    console.error("[boutique/v1/articles] échec de lecture :", error);
    return erreurBoutique("erreur_interne", "Une erreur interne est survenue.", 500);
  }

  return Response.json({ articles: data || [] });
}
