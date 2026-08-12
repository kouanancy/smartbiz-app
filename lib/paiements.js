import { supabase } from "@/lib/supabaseClient";

// Statuts du dernier paiement d'une boutique qui doivent bloquer l'accès
// même si business.subscription_status vaut encore 'actif'/'essai' (un
// renouvellement anticipé pendant que le compte est encore valide, voir
// app/(app)/layout.js) : 'en_attente' — justificatif envoyé, pas encore
// vérifié par l'administratrice — et 'echoue' — justificatif rejeté (voir
// admin_reject_payment, qui met déjà subscription_status à jour au
// moment du rejet ; ce contrôle est une deuxième ligne de défense,
// indépendante, pas un remplacement — voir aussi
// supabase-businesses-colonnes-restreintes-migration.sql). 'reussi' ou
// aucun paiement encore envoyé ('en_attente_paiement'/'expire' sans
// aucun justificatif) : pas de blocage lié au paiement, seul
// subscription_status fait foi dans ce cas.
const STATUTS_BLOQUANTS = ["en_attente", "echoue"];

export async function dernierPaiementBlocage(businessId) {
  const { data } = await supabase
    .from("paiements_abonnement")
    .select("statut")
    .eq("business_id", businessId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return STATUTS_BLOQUANTS.includes(data?.statut) ? data.statut : null;
}
