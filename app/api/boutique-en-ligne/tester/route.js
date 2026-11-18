import { createClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/boutiqueApi";

// Appelée depuis Paramètres (bouton « Tester la connexion ») : envoie un
// simple ping au webhook du site pour vérifier que l'adresse et la clé
// enregistrées fonctionnent réellement, sans attendre le prochain
// changement d'article. Exige la session du commerçant (comme
// app/api/admin/supprimer-commercant, même principe : callerClient scopé
// au jeton de l'appelant pour les vérifications, supabaseAdmin
// (service_role) seulement pour lire boutique_en_ligne_connexions, qui
// n'a aucune policy RLS pour authenticated -- voir supabase-boutique-en-
// ligne-migration.sql). Le ping lui-même part directement de ce serveur
// Next.js (fetch), jamais de pg_net : ce n'est pas un trigger déclenché
// par une écriture en base, juste un clic explicite du commerçant.
export const dynamic = "force-dynamic";

export async function POST(request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) {
    console.error("[boutique-en-ligne/tester] Variables d'environnement Supabase manquantes.");
    return Response.json({ ok: false, message: "Configuration serveur incomplète." }, { status: 500 });
  }

  const authHeader = request.headers.get("authorization") || "";
  const accessToken = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!accessToken) {
    return Response.json({ ok: false, message: "Non authentifié." }, { status: 401 });
  }

  const callerClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const {
    data: { user: caller },
    error: callerError,
  } = await callerClient.auth.getUser();
  if (callerError || !caller) {
    return Response.json({ ok: false, message: "Non authentifié." }, { status: 401 });
  }

  const { data: business, error: businessError } = await callerClient
    .from("businesses")
    .select("id, module_boutique_en_ligne_actif")
    .eq("owner_id", caller.id)
    .maybeSingle();
  if (businessError || !business) {
    return Response.json({ ok: false, message: "Boutique introuvable." }, { status: 404 });
  }
  if (!business.module_boutique_en_ligne_actif) {
    return Response.json({ ok: false, message: "Module Boutique en ligne non activé." }, { status: 403 });
  }

  const admin = supabaseAdmin();
  if (!admin) {
    console.error("[boutique-en-ligne/tester] Variables d'environnement Supabase (service_role) manquantes.");
    return Response.json({ ok: false, message: "Configuration serveur incomplète." }, { status: 500 });
  }

  const { data: connexion } = await admin
    .from("boutique_en_ligne_connexions")
    .select("site_url, cle")
    .eq("business_id", business.id)
    .maybeSingle();

  if (!connexion?.site_url || !connexion?.cle) {
    return Response.json({ ok: false, status: null, message: "Adresse du site ou clé de connexion manquante." });
  }

  try {
    const reponse = await fetch(`${connexion.site_url}/api/doka/webhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${connexion.cle}` },
      body: JSON.stringify({ evenement: "ping", envoye_le: new Date().toISOString() }),
    });
    return Response.json({
      ok: reponse.ok,
      status: reponse.status,
      message: reponse.ok
        ? `Connexion réussie (réponse ${reponse.status}).`
        : `Le site a répondu avec une erreur (${reponse.status}).`,
    });
  } catch (err) {
    return Response.json({ ok: false, status: null, message: `Impossible de contacter le site : ${err.message}` });
  }
}
