import Link from "next/link";
import { ArrowLeft } from "lucide-react";

// Lien de retour vers le site vitrine public (/), affiché sur les écrans
// d'entrée atteignables directement depuis ses boutons (Se connecter,
// S'inscrire, Commencer l'essai gratuit — voir components/LandingPage.js) :
// connexion/inscription et les deux écrans de paiement. Toujours un lien
// statique vers "/" plutôt que router.back() (contrairement à
// components/LegalBackLink.js) : ici on veut précisément revenir au site
// vitrine, pas à la page précédente quelle qu'elle soit.
export default function HomeLink() {
  return (
    <Link href="/" className="sb-entry-home-link">
      <ArrowLeft size={13} /> Accueil
    </Link>
  );
}
