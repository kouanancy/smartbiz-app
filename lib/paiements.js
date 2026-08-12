import { supabase } from "@/lib/supabaseClient";

// Statuts du dernier paiement d'une boutique qui *peuvent* bloquer
// l'accès (voir app/(app)/layout.js) : 'en_attente' — justificatif
// envoyé, pas encore vérifié par l'administratrice — et 'echoue' —
// justificatif rejeté (voir admin_reject_payment, qui applique déjà la
// même nuance ci-dessous côté serveur au moment du rejet ; ce contrôle
// est une deuxième ligne de défense, indépendante, pas un remplacement —
// voir aussi supabase-businesses-colonnes-restreintes-migration.sql).
// 'reussi' ou aucun paiement encore envoyé : jamais bloquant.
const STATUTS_BLOQUANTS = ["en_attente", "echoue"];

// Un paiement en_attente/echoue ne doit bloquer l'accès QUE si le compte
// n'a pas déjà un accès valide en cours — sinon un renouvellement
// anticipé (carte Abonnement, changement de formule, pendant que le
// compte est encore 'actif' ou en 'essai' et pas encore expiré) couperait
// l'accès à un commerçant qui a pourtant déjà payé sa période en cours.
// Même logique que EXPIRATION_SUIVANTE (lib/AuthProvider.js) pour définir
// "déjà valide" : 'actif' ou 'essai', avec une échéance encore dans le
// futur.
function accesDejaValide(business) {
  return (
    (business.subscription_status === "actif" || business.subscription_status === "essai") &&
    Boolean(business.subscription_expires_at) &&
    new Date(business.subscription_expires_at) > new Date()
  );
}

// `business` doit porter au minimum id, subscription_status et
// subscription_expires_at. Renvoie :
// - `statut` : le statut du dernier paiement s'il est en_attente/echoue,
//   sinon null — utilisé même quand ce n'est pas bloquant, pour afficher
//   une information non bloquante (renouvellement anticipé en cours de
//   vérification ou rejeté) sans jamais couper l'accès déjà valide.
// - `bloquant` : si l'accès doit réellement être coupé pour ce paiement
//   (jamais vrai si accesDejaValide(business), même si `statut` est
//   renseigné).
export async function dernierPaiementBlocage(business) {
  const { data } = await supabase
    .from("paiements_abonnement")
    .select("statut")
    .eq("business_id", business.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const statut = STATUTS_BLOQUANTS.includes(data?.statut) ? data.statut : null;
  if (!statut) return { statut: null, bloquant: false };

  return { statut, bloquant: !accesDejaValide(business) };
}
