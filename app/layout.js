import "./globals.css";
import { AuthProvider } from "@/lib/AuthProvider";
import { supabase } from "@/lib/supabaseClient";

const METADATA_BASE = {
  title: "Doka",
  description: "Mini ERP pour petits commerçants",
  manifest: "/manifest.webmanifest",
};

// Icônes dynamiques : dépendent du logo Doka choisi par l'administratrice
// (parametres_globaux), lu ici côté serveur à chaque requête. En échec (pas de
// réseau, table vide…) on retombe sur les métadonnées de base sans icônes.
export async function generateMetadata() {
  try {
    const { data } = await supabase
      .from("parametres_globaux")
      .select("icon_192_url, icon_512_url, icon_apple_180_url")
      .limit(1)
      .maybeSingle();
    if (!data) return METADATA_BASE;
    const icons = {};
    if (data.icon_192_url || data.icon_512_url) {
      icons.icon = [
        ...(data.icon_192_url ? [{ url: data.icon_192_url, sizes: "192x192", type: "image/png" }] : []),
        ...(data.icon_512_url ? [{ url: data.icon_512_url, sizes: "512x512", type: "image/png" }] : []),
      ];
    }
    if (data.icon_apple_180_url) {
      icons.apple = [{ url: data.icon_apple_180_url, sizes: "180x180", type: "image/png" }];
    }
    return Object.keys(icons).length ? { ...METADATA_BASE, icons } : METADATA_BASE;
  } catch {
    return METADATA_BASE;
  }
}

export default function RootLayout({ children }) {
  return (
    <html lang="fr">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600&family=IBM+Plex+Mono:wght@500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
