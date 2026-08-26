import { createClient } from "@supabase/supabase-js";

// Suppression complète et définitive d'un compte commerçant depuis
// l'espace Administration (voir app/(app)/admin/commercants/[id]/page.js)
// — boutique + toutes ses données liées + le compte de connexion
// (auth.users) correspondant.
//
// Pourquoi une route serveur plutôt qu'une fonction RPC Postgres (comme
// admin_mark_subscription_paid/admin_reject_payment/admin_set_is_admin) :
// une fonction SQL ne peut pas appeler l'API Admin de Supabase Auth, et
// supprimer directement la ligne dans auth.users par un DELETE SQL manuel
// est explicitement déconseillé par Supabase (table gérée en interne par
// GoTrue — sessions, tokens de rafraîchissement...). Cette route utilise
// donc supabase.auth.admin.deleteUser(), qui exige la clé service_role
// (jamais exposée au navigateur, déjà utilisée par
// app/api/push-admin-paiement et app/api/cron/expiration-reminders).
//
// Toutes les tables métier (categories, zones_livraison, clients,
// articles, commandes, commande_lignes, reappros, paiements_abonnement,
// notifications, push_subscriptions) référencent déjà
// "businesses(id) on delete cascade", et businesses.owner_id référence
// "auth.users(id) on delete cascade" (voir smartbiz-schema.sql,
// supprimer-compte-test.sql) : supprimer le compte auth.users suffit
// donc, à lui seul, à tout supprimer en cascade dans une seule
// transaction Postgres atomique — aucune suppression manuelle table par
// table n'est nécessaire ici.
export async function POST(request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    console.error("[supprimer-commercant] Variables d'environnement Supabase manquantes.");
    return Response.json({ error: "server_misconfigured" }, { status: 500 });
  }

  const authHeader = request.headers.get("authorization") || "";
  const accessToken = authHeader.replace(/^Bearer\s+/i, "");
  if (!accessToken) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const { businessId } = await request.json().catch(() => ({}));
  if (!businessId) {
    return Response.json({ error: "missing_business_id" }, { status: 400 });
  }

  // Client scopé au jeton de l'appelant : is_admin_user() (même fonction
  // que partout ailleurs dans l'app) s'appuie sur auth.uid(), donc sur ce
  // jeton précis — jamais de vérification "faite maison" séparée qui
  // pourrait diverger du reste de l'application.
  const callerClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const {
    data: { user: caller },
    error: callerError,
  } = await callerClient.auth.getUser();
  if (callerError || !caller) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const { data: isAdmin, error: adminCheckError } = await callerClient.rpc("is_admin_user");
  if (adminCheckError || !isAdmin) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }

  // Lecture de la boutique ciblée via la clé service_role, jamais via
  // callerClient : la policy RLS "Le propriétaire gère sa boutique"
  // (owner_id = auth.uid()) ne laisse un compte voir QUE sa propre ligne
  // dans businesses — la policy qui donnait un accès direct aux admins a
  // été volontairement retirée au profit des fonctions RPC dédiées (voir
  // supabase-admin-scope-abonnement-migration.sql). callerClient.from
  // ("businesses").select(...) sur l'id d'un autre commerçant renvoie donc
  // toujours null ici (jamais une vraie erreur RLS), ce qui faisait
  // échouer systématiquement toute suppression avec "not_found" avant ce
  // correctif. Le statut admin de l'appelant est déjà vérifié ci-dessus
  // via is_admin_user() (RPC SECURITY DEFINER) — passer sur service_role
  // seulement à partir d'ici est donc sûr.
  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: cible, error: cibleError } = await supabaseAdmin
    .from("businesses")
    .select("id, owner_id, name")
    .eq("id", businessId)
    .maybeSingle();
  if (cibleError || !cible) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }

  // Garde-fou supplémentaire : jamais via cette route sur son propre
  // compte (self-service de suppression de compte = fonctionnalité
  // distincte, pas un clic depuis la liste des commerçants).
  if (cible.owner_id === caller.id) {
    return Response.json({ error: "cannot_delete_self" }, { status: 400 });
  }

  const { error: deleteUserError } = await supabaseAdmin.auth.admin.deleteUser(cible.owner_id);
  if (deleteUserError) {
    // Boutique orpheline (compte de connexion déjà supprimé/inexistant) :
    // la cascade auth.users -> businesses ne peut pas s'appliquer, on
    // supprime alors directement la ligne businesses — la même chaîne de
    // contraintes "on delete cascade" nettoie ensuite toutes les données
    // liées.
    if (deleteUserError.status === 404 || /user not found/i.test(deleteUserError.message || "")) {
      const { error: deleteBusinessError } = await supabaseAdmin.from("businesses").delete().eq("id", businessId);
      if (deleteBusinessError) {
        console.error("[supprimer-commercant] échec de la suppression de la boutique orpheline :", deleteBusinessError);
        return Response.json({ error: "delete_failed" }, { status: 500 });
      }
    } else {
      console.error("[supprimer-commercant] échec de la suppression du compte auth :", deleteUserError);
      return Response.json({ error: "delete_failed" }, { status: 500 });
    }
  }

  console.log(`[supprimer-commercant] boutique « ${cible.name || cible.id} » (${cible.id}) supprimée par ${caller.email || caller.id}.`);
  return Response.json({ success: true, businessName: cible.name || null });
}
