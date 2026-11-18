import { createHash } from "crypto";
import { createClient } from "@supabase/supabase-js";

// Partagé par toutes les routes app/api/boutique/v1/* (API externe pour le
// site e-commerce du module Boutique en ligne) : authentification par clé
// d'API, réponses d'erreur JSON uniformes. Jamais importé par un composant
// client -- uniquement par des route handlers (app/api/**/route.js), qui
// s'exécutent toujours côté serveur dans l'App Router.

export function supabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) return null;
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// {"error":{"code":"...","message":"..."}} -- format d'erreur unique pour
// toute l'API externe (docs/boutique-en-ligne-api.md).
export function erreurBoutique(code, message, status) {
  return Response.json({ error: { code, message } }, { status });
}

// Authentifie une requête entrante du site (en-tête Authorization: Bearer
// <clé>) : calcule le sha256 de la clé reçue (jamais une comparaison en
// clair) et retrouve la connexion correspondante par cle_hash, puis
// vérifie que le module Boutique en ligne est bien actif pour cette
// boutique. Renvoie { business, admin } en cas de succès (admin = client
// Supabase service_role, déjà prêt pour les requêtes suivantes de
// l'appelant), ou { erreur: Response } en cas d'échec -- prête à être
// renvoyée telle quelle par le route handler appelant.
export async function authentifierBoutique(request) {
  const admin = supabaseAdmin();
  if (!admin) {
    console.error("[boutique/v1] Variables d'environnement Supabase (service_role) manquantes.");
    return { erreur: erreurBoutique("erreur_interne", "Configuration serveur incomplète.", 500) };
  }

  const authHeader = request.headers.get("authorization") || "";
  const cle = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!cle) {
    return { erreur: erreurBoutique("non_autorise", "Clé d'API manquante (en-tête Authorization: Bearer <clé>).", 401) };
  }
  const cleHash = createHash("sha256").update(cle).digest("hex");

  const { data: connexion, error: connexionError } = await admin
    .from("boutique_en_ligne_connexions")
    .select("business_id")
    .eq("cle_hash", cleHash)
    .maybeSingle();
  if (connexionError || !connexion) {
    return { erreur: erreurBoutique("non_autorise", "Clé d'API invalide.", 401) };
  }

  const { data: business, error: businessError } = await admin
    .from("businesses")
    .select("id, name, module_boutique_en_ligne_actif")
    .eq("id", connexion.business_id)
    .maybeSingle();
  if (businessError || !business) {
    return { erreur: erreurBoutique("non_autorise", "Boutique introuvable pour cette clé.", 401) };
  }
  if (!business.module_boutique_en_ligne_actif) {
    return { erreur: erreurBoutique("module_inactif", "Module Boutique en ligne non activé pour cette boutique.", 403) };
  }

  return { business, admin };
}

// Les messages d'exception des RPC boutique_creer_commande/boutique_
// changer_statut (supabase-boutique-en-ligne-migration.sql) portent un
// préfixe machine-lisible ("code: message en français"), pour que cette
// fonction traduise directement l'erreur SQL en code/statut HTTP sans
// avoir à deviner la cause depuis un texte libre.
const CODES_VERS_STATUT = {
  donnees_invalides: 422,
  article_inconnu: 422,
  article_non_propose: 422,
  introuvable: 404,
  statut_incompatible: 409,
  non_autorise: 401,
};

export function erreurDepuisExceptionSql(error) {
  const message = error?.message || "";
  const m = /^([a-z_]+):\s*(.*)$/s.exec(message);
  if (m && CODES_VERS_STATUT[m[1]] !== undefined) {
    return erreurBoutique(m[1], m[2] || message, CODES_VERS_STATUT[m[1]]);
  }
  console.error("[boutique/v1] erreur SQL inattendue :", message);
  return erreurBoutique("erreur_interne", "Une erreur interne est survenue.", 500);
}
