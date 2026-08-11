import { createClient } from "@supabase/supabase-js";

const RESEND_FROM = process.env.RESEND_FROM_EMAIL || "Doka <onboarding@resend.dev>";

// Route serveur (jamais exposée au navigateur) : même garde-fou que
// app/api/cron/expiration-reminders (CRON_SECRET + SUPABASE_SERVICE_ROLE_KEY
// obligatoires, sinon refus plutôt que fonctionnement non protégé/sans les
// droits nécessaires). Déclenchée une fois par jour à 7h fixe pour toutes
// les boutiques (voir vercel.json) — le plan Vercel Hobby limite les Cron
// Jobs à une exécution/jour, donc pas de choix d'heure exposé au
// commerçant (voir supabase-rapport-stock-retrait-heure-migration.sql).
// Le jour choisi pour l'hebdomadaire (rapport_stock_jour_semaine), lui,
// est pleinement respecté : une comparaison par jour suffit avec un
// déclenchement quotidien.
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
    // clé Resend il n'y a rien à envoyer, donc rien à faire ici. Lue
    // indépendamment de app/api/notify-admin-payment (chaque route lit sa
    // propre variable d'environnement à l'exécution — aucun partage
    // possible entre les deux, donc rien à faire ici même si l'autre
    // route fonctionne).
    console.warn("RESEND_API_KEY absente : rapport de stock ignoré.");
    return Response.json({ destinatairesTrouves: 0, envoyes: 0, raison: "RESEND_API_KEY absente" });
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // select id, name, notif_email, langue, devise from businesses
  // where notif_email is not null
  //   and (
  //     rapport_stock = 'journalier'
  //     or (rapport_stock = 'hebdomadaire' and rapport_stock_jour_semaine = extract(dow from now())::int)
  //   )
  //   and (rapport_stock_dernier_envoi is null or rapport_stock_dernier_envoi < current_date)
  // — voir boutiques_dues_rapport_stock() dans
  // supabase-rapport-stock-heure-fixe-migration.sql pour la requête exacte
  // (marque aussi rapport_stock_dernier_envoi = current_date dans le même
  // mouvement, pour ne jamais renvoyer deux fois le même jour).
  const { data: boutiques, error } = await supabaseAdmin.rpc("boutiques_dues_rapport_stock");
  if (error) {
    console.error("Échec de boutiques_dues_rapport_stock :", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
  console.log(`Rapport de stock : ${boutiques?.length || 0} boutique(s) due(s) trouvée(s).`);

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

  const envoyes = resultats.filter((r) => r.envoye).length;
  console.log(
    `Rapport de stock : ${boutiques?.length || 0} destinataire(s) trouvé(s), ${envoyes} e-mail(s) effectivement envoyé(s).`
  );

  return Response.json({ destinatairesTrouves: boutiques?.length || 0, envoyes, resultats });
}
