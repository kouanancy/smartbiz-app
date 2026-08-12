import { supabase } from "@/lib/supabaseClient";

// Utilisé par PremierPaiement.js et Reabonnement.js pour distinguer un
// blocage dû au rejet d'un justificatif (message dédié) d'un premier
// paiement ou d'une expiration classique jamais liée à un rejet : le
// statut du compte seul (en_attente_paiement/expire) ne permet pas de
// faire la différence, puisqu'il prend les mêmes valeurs dans les deux
// cas — voir admin_reject_payment (supabase-admin-reject-payment-migration.sql).
export async function dernierPaiementRejete(businessId) {
  const { data } = await supabase
    .from("paiements_abonnement")
    .select("statut")
    .eq("business_id", businessId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.statut === "echoue";
}
