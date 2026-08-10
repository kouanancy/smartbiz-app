import { createClient } from "@supabase/supabase-js";

const RESEND_FROM = process.env.RESEND_FROM_EMAIL || "Doka <onboarding@resend.dev>";

// Route serveur (jamais exposée au navigateur) : même garde-fou que
// app/api/cron/expiration-reminders (CRON_SECRET + SUPABASE_SERVICE_ROLE_KEY
// obligatoires, sinon refus plutôt que fonctionnement non protégé/sans les
// droits nécessaires). Déclenchée toutes les heures par Vercel Cron (voir
// vercel.json) — heure d'Abidjan = UTC toute l'année, donc
// boutiques_dues_rapport_stock() compare directement à l'heure serveur
// sans conversion de fuseau (voir supabase-rapport-stock-horaire-migration.sql).
export async function GET(request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error("CRON_SECRET absente : rapport de stock désactivé.");
    return Response.json({ error: "CRON_SECRET manquante" }, { status: 500 });
  }
  if (request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return Response.json({ error: "Non autorisé" }, { status: 401 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    console.error("SUPABASE_SERVICE_ROLE_KEY absente : rapport de stock ignoré.");
    return Response.json({ error: "SUPABASE_SERVICE_ROLE_KEY manquante" }, { status: 500 });
  }

  const resendApiKey = process.env.RESEND_API_KEY;
  if (!resendApiKey) {
    // Contrairement au rappel d'expiration (qui a la notification en base
    // comme filet), le rapport de stock n'existe QUE par e-mail : sans
    // clé Resend il n'y a rien à envoyer, donc rien à faire ici.
    console.warn("RESEND_API_KEY absente : rapport de stock ignoré.");
    return Response.json({ envoyes: 0 });
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: boutiques, error } = await supabaseAdmin.rpc("boutiques_dues_rapport_stock");
  if (error) {
    console.error("Échec de boutiques_dues_rapport_stock :", error);
    return Response.json({ error: error.message }, { status: 500 });
  }

  const resultats = [];
  for (const b of boutiques || []) {
    try {
      const { data: articles, error: articlesError } = await supabaseAdmin
        .from("articles")
        .select("nom, stock, seuil")
        .eq("business_id", b.business_id)
        .order("stock", { ascending: true });
      if (articlesError) throw articlesError;

      const enAlerte = (articles || []).filter((a) => a.stock <= a.seuil);
      const corps =
        enAlerte.length === 0
          ? "Aucun article sous son seuil d'alerte pour le moment."
          : enAlerte.map((a) => `- ${a.nom} : ${a.stock} en stock (seuil ${a.seuil})`).join("\n");

      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: RESEND_FROM,
          to: b.notif_email,
          subject: `Rapport de stock — ${b.business_name || "ta boutique"}`,
          text: `Bonjour,\n\nVoici le rapport de stock de ${b.business_name || "ta boutique"} :\n\n${corps}\n\nConsulte la page Stock sur Doka pour le détail complet et réapprovisionner.`,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      resultats.push({ business_id: b.business_id, envoye: true, articlesEnAlerte: enAlerte.length });
    } catch (err) {
      console.error(`Échec du rapport de stock pour ${b.business_id} :`, err);
      resultats.push({ business_id: b.business_id, envoye: false });
    }
  }

  return Response.json({ envoyes: resultats.length, resultats });
}
