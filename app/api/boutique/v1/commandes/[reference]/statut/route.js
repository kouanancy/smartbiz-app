import { authentifierBoutique, erreurBoutique, erreurDepuisExceptionSql } from "@/lib/boutiqueApi";

// Change le statut d'une commande déjà créée depuis le site ('livree' ou
// 'annulee') -- la RPC boutique_changer_statut (supabase-boutique-en-
// ligne-migration.sql) porte toute la logique (idempotence, vérification
// du stock réel avant livraison, déduction atomique). "stock_insuffisant"
// n'est jamais une exception SQL ici (elle a besoin de porter le détail
// structuré des articles manquants) : la RPC renvoie {"ok": false, "code":
// "stock_insuffisant", "articles": [...]} comme résultat normal, traduit
// ici en 409 avec ce même détail. Les autres échecs (commande introuvable,
// statut déjà incompatible) restent de vraies exceptions SQL, traduites
// par erreurDepuisExceptionSql comme pour /commandes.
export const dynamic = "force-dynamic";

export async function POST(request, { params }) {
  const { business, admin, erreur } = await authentifierBoutique(request);
  if (erreur) return erreur;

  const { reference } = await params;

  let payload;
  try {
    payload = await request.json();
  } catch {
    return erreurBoutique("donnees_invalides", "Corps de requête JSON invalide.", 422);
  }
  const statut = payload?.statut;
  if (statut !== "livree" && statut !== "annulee") {
    return erreurBoutique("donnees_invalides", "Le champ statut doit valoir \"livree\" ou \"annulee\".", 422);
  }

  const { data, error } = await admin.rpc("boutique_changer_statut", {
    p_business_id: business.id,
    p_reference: reference,
    p_statut: statut,
  });
  if (error) return erreurDepuisExceptionSql(error);

  if (!data.ok) {
    return Response.json({ error: { code: data.code, message: "Stock insuffisant pour livrer cette commande.", articles: data.articles } }, { status: 409 });
  }

  return Response.json({ numero: data.numero, statut: data.statut });
}
