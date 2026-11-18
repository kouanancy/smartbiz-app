import { authentifierBoutique, erreurBoutique, erreurDepuisExceptionSql } from "@/lib/boutiqueApi";

// Crée une commande "en attente" dans Doka à partir d'une commande passée
// sur le site (stock réservé, comme toute commande en attente -- voir
// README/docs/boutique-en-ligne-api.md). Toute la validation métier
// (référence, client, lignes, article proposé/actif...) est faite par la
// RPC boutique_creer_commande (supabase-boutique-en-ligne-migration.sql),
// qui reste la seule source de vérité sur ces règles -- cette route se
// contente de vérifier que le corps est un JSON exploitable et de
// traduire le résultat/l'erreur de la RPC en réponse HTTP.
export const dynamic = "force-dynamic";

export async function POST(request) {
  const { business, admin, erreur } = await authentifierBoutique(request);
  if (erreur) return erreur;

  let payload;
  try {
    payload = await request.json();
  } catch {
    return erreurBoutique("donnees_invalides", "Corps de requête JSON invalide.", 422);
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return erreurBoutique("donnees_invalides", "Corps de requête invalide.", 422);
  }

  const { data, error } = await admin.rpc("boutique_creer_commande", {
    p_business_id: business.id,
    p_payload: payload,
  });
  if (error) return erreurDepuisExceptionSql(error);

  return Response.json(
    { commande_id: data.commande_id, numero: data.numero, statut: data.statut },
    { status: data.cree ? 201 : 200 }
  );
}
