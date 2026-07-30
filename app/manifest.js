import { supabase } from "@/lib/supabaseClient";

const MANIFEST_BASE = {
  name: "Doka",
  short_name: "Doka",
  description: "Mini ERP pour petits commerçants",
  start_url: "/",
  display: "standalone",
  background_color: "#f7f5f2",
  theme_color: "#e07a29",
};

// Manifest PWA dynamique : les icônes d'écran d'accueil reflètent le logo
// Doka choisi par l'administratrice (parametres_globaux), sans build ni
// déploiement. En échec (pas de réseau, table vide…) on sert un manifest sans
// icônes plutôt que de casser l'installation de l'app.
export default async function manifest() {
  try {
    const { data } = await supabase
      .from("parametres_globaux")
      .select("icon_192_url, icon_512_url")
      .limit(1)
      .maybeSingle();
    const icons = [
      ...(data?.icon_192_url ? [{ src: data.icon_192_url, sizes: "192x192", type: "image/png" }] : []),
      ...(data?.icon_512_url ? [{ src: data.icon_512_url, sizes: "512x512", type: "image/png" }] : []),
    ];
    return icons.length ? { ...MANIFEST_BASE, icons } : MANIFEST_BASE;
  } catch {
    return MANIFEST_BASE;
  }
}
