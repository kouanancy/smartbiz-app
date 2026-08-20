import Link from "next/link";
import { Mail } from "lucide-react";
import FooterSupport from "@/components/FooterSupport";

// Pied de page du site vitrine — extrait de LandingPage.js pour être
// partagé tel quel avec les autres pages publiques (ex.
// app/feuille-de-route/page.js) sans dupliquer ce balisage.
export default function LandingFooter() {
  return (
    <footer className="sb-landing-footer">
      <div className="sb-landing-footer-inner">
        <div className="sb-landing-footer-row">
          <div className="sb-landing-footer-brand">Doka — Mini ERP pour petits commerçants.</div>
          <div className="sb-landing-footer-links">
            <Link href="/cgu">CGU</Link>
            <Link href="/confidentialite">Confidentialité</Link>
            <Link href="/mentions-legales">Mentions légales</Link>
            <a href="mailto:contact@doka.ci">
              <Mail size={12} style={{ verticalAlign: "-2px", marginRight: 4 }} />
              contact@doka.ci
            </a>
          </div>
        </div>
        <FooterSupport />
      </div>
    </footer>
  );
}
