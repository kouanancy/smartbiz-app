import { supabase } from "@/lib/supabaseClient";

// Appelé depuis AuthProvider (ensureBusiness) à chaque connexion et à
// chaque revérification d'accès (voir app/(app)/layout.js) : le dernier
// paiement d'une boutique fait foi, indépendamment de
// businesses.subscription_status — qui peut, par erreur de manipulation
// ou par un chemin qu'on n'a pas prévu, ne pas refléter un rejet (voir
// admin_reject_payment, supabase-admin-reject-payment-migration.sql, qui
// fait déjà cette mise à jour au moment du rejet ; ce contrôle est une
// deuxième ligne de défense, pas un remplacement). PremierPaiement.js/
// Reabonnement.js réutilisent le même résultat (via le contexte Auth)
// pour afficher le message dédié.
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
