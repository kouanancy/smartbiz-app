import Link from "next/link";
import PlatformLogo from "@/components/PlatformLogo";

// Barre de navigation du site vitrine — extraite de LandingPage.js pour
// être partagée telle quelle avec les autres pages publiques (ex.
// app/feuille-de-route/page.js) sans dupliquer ce balisage.
export default function LandingNav() {
  return (
    <header className="sb-landing-nav">
      <div className="sb-landing-nav-inner">
        <div className="sb-landing-nav-brand">
          <PlatformLogo />
        </div>
        <div className="sb-landing-nav-actions">
          <Link href="/" className="sb-landing-nav-link">
            Accueil
          </Link>
          <Link href="/login" className="sb-btn sb-btn-ghost">
            Se connecter
          </Link>
          <Link href="/login#signup" className="sb-btn sb-btn-primary">
            S&apos;inscrire
          </Link>
        </div>
      </div>
    </header>
  );
}
