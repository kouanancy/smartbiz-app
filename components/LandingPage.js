import Link from "next/link";
import {
  LayoutDashboard,
  ShoppingCart,
  ClipboardList,
  Wallet,
  Package,
  Users,
  LayoutGrid,
  Lock,
  ShieldCheck,
  MessageCircle,
  Tag,
  Palette,
  Sparkles,
  Mail,
} from "lucide-react";
import { fmt as fmtBase } from "@/lib/format";
import { t as tBase } from "@/lib/i18n";
import PlanGrid from "@/components/PlanGrid";
import FloatingBlobs from "@/components/FloatingBlobs";
import PlatformLogo from "@/components/PlatformLogo";

// Site vitrine public (/) — jamais connecté à une boutique précise (aucune
// session à ce stade), donc toujours en français comme app/login/page.js,
// avec la même raison : aucune autre chaîne ici ne passe par lib/i18n.
const t = (key, vars) => tBase("fr", key, vars);
const fmt = (n) => fmtBase(n);

const MODULES = [
  { key: "dashboard", icon: LayoutDashboard, titre: t("sidebar.nav.dashboard"), texte: t("dashboard.subtitle") },
  { key: "nouvelle", icon: ShoppingCart, titre: t("sidebar.nav.nouvelle"), texte: t("nouvelle.subtitle") },
  { key: "articles", icon: Package, titre: t("sidebar.nav.articles"), texte: "Suis ton stock article par article, avec une alerte avant la rupture." },
  { key: "clients", icon: Users, titre: t("sidebar.nav.clients"), texte: "Une fiche par cliente : coordonnées, historique de commandes et total des achats." },
  { key: "commandes", icon: ClipboardList, titre: t("sidebar.nav.commandes"), texte: "L'historique complet de tes commandes, du statut à la livraison." },
  { key: "catalogue", icon: LayoutGrid, titre: t("sidebar.nav.catalogue"), texte: "Ton catalogue de produits, prêt à partager sur WhatsApp ou Instagram." },
  { key: "tresorerie", icon: Wallet, titre: t("sidebar.nav.tresorerie"), texte: t("tresorerie.subtitle") },
];

const AVANTAGES = [
  {
    icon: Lock,
    titre: "Données cloisonnées",
    texte: "Chaque boutique a son propre espace, strictement isolé — aucun commerçant n'a jamais accès aux données d'un autre.",
  },
  {
    icon: ShieldCheck,
    titre: "Confidentialité réelle",
    texte: "L'équipe Doka n'a pas accès à ton stock, tes clients ni ton chiffre d'affaires dans le cadre normal du service.",
  },
  {
    icon: MessageCircle,
    titre: "Accompagnement humain",
    texte: "Une question ? Le support Doka répond par WhatsApp ou e-mail — jamais un chatbot.",
  },
  {
    icon: Tag,
    titre: "Prix accessible",
    texte: "À partir de 5 000 FCFA par mois, sans surprise ni frais caché.",
  },
  {
    icon: Palette,
    titre: "Personnalisable",
    texte: "Couleur, logo, langue, mode sombre : Doka s'adapte à l'image de ta boutique.",
  },
  {
    icon: Sparkles,
    titre: "Simple",
    texte: "Une prise en main immédiate, sans jargon ni formation nécessaire.",
  },
];

export default function LandingPage() {
  return (
    <div className="sb-landing">
      <header className="sb-landing-nav">
        <div className="sb-landing-nav-inner">
          <div className="sb-landing-nav-brand">
            <PlatformLogo />
          </div>
          <div className="sb-landing-nav-actions">
            <Link href="/login" className="sb-btn sb-btn-ghost">
              Se connecter
            </Link>
            <Link href="/login#signup" className="sb-btn sb-btn-primary">
              Commencer l&apos;essai gratuit
            </Link>
          </div>
        </div>
      </header>

      <section className="sb-landing-hero">
        <FloatingBlobs />
        <div className="sb-landing-hero-content">
          <h1 className="sb-landing-hero-title">
            <span>Doka</span>
          </h1>
          <p className="sb-landing-hero-tagline">Pilotez votre commerce, simplement.</p>
          <p className="sb-landing-hero-text">
            Le mini ERP pensé pour les petits commerces ivoiriens : commandes, stock, clients et trésorerie, au même
            endroit.
          </p>
          <div className="sb-landing-hero-ctas">
            <Link href="/login#signup" className="sb-btn sb-btn-primary sb-landing-cta-btn">
              Commencer l&apos;essai gratuit
            </Link>
            <Link href="/login" className="sb-btn sb-btn-ghost sb-landing-cta-btn">
              Se connecter
            </Link>
          </div>
          <p className="sb-landing-hero-note">7 jours d&apos;essai gratuit, sans carte bancaire.</p>
        </div>
      </section>

      <section className="sb-landing-constat">
        <div className="sb-landing-section" style={{ paddingTop: 48, paddingBottom: 48 }}>
          <div className="sb-landing-section-head">
            <h2 className="sb-landing-section-title">Gérer un commerce ne devrait pas rimer avec cahier et calculs à la main</h2>
          </div>
          <div className="sb-landing-constat-text">
            <p>
              Beaucoup de commerçantes et commerçants suivent encore leurs commandes sur WhatsApp, leur stock sur un
              cahier, et leur trésorerie... nulle part. Résultat : des ruptures de stock qui arrivent sans prévenir,
              une marge réelle impossible à connaître, et des heures perdues chaque semaine à tout recalculer à la
              main.
            </p>
            <p>Doka réunit ces informations dans un seul outil pensé pour rester simple — même sans connaissances techniques.</p>
          </div>
        </div>
      </section>

      <section className="sb-landing-section" id="modules">
        <div className="sb-landing-section-head">
          <h2 className="sb-landing-section-title">Tout Doka, module par module</h2>
        </div>
        <div className="sb-landing-grid">
          {MODULES.map(({ key, icon: Icon, titre, texte }) => (
            <div className="sb-landing-card" key={key}>
              <div className="sb-landing-card-icon">
                <Icon size={19} />
              </div>
              <div className="sb-landing-card-title">{titre}</div>
              <p className="sb-landing-card-text">{texte}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="sb-landing-section sb-landing-avantages" id="avantages">
        <div className="sb-landing-section-head">
          <h2 className="sb-landing-section-title">Pourquoi Doka plutôt qu&apos;autre chose ?</h2>
        </div>
        <div className="sb-landing-grid">
          {AVANTAGES.map(({ icon: Icon, titre, texte }) => (
            <div className="sb-landing-card" key={titre}>
              <div className="sb-landing-card-icon">
                <Icon size={19} />
              </div>
              <div className="sb-landing-card-title">{titre}</div>
              <p className="sb-landing-card-text">{texte}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="sb-landing-section" id="tarifs">
        <div className="sb-landing-section-head">
          <h2 className="sb-landing-section-title">Une formule pour chaque commerce</h2>
          <p className="sb-landing-section-sub">{t("parametres.formuleSub")}</p>
        </div>
        <PlanGrid
          t={t}
          fmt={fmt}
          planActuel={null}
          disableActive={false}
          activeLabel={t("parametres.formuleActive")}
          chooseLabel={t("parametres.formuleChoisir")}
          onChoose={() => {
            window.location.href = "/login#signup";
          }}
        />
        <p className="sb-landing-tarifs-note">{`Formule Clé en main : ${fmt(15000)} à l'installation, en plus de l'abonnement mensuel.`}</p>
      </section>

      <section className="sb-landing-cta-section">
        <h2 className="sb-landing-section-title">Prêt(e) à simplifier la gestion de ta boutique ?</h2>
        <p className="sb-landing-section-sub">Essai gratuit de 7 jours, sans carte bancaire.</p>
        <div className="sb-landing-hero-ctas" style={{ marginTop: 22 }}>
          <Link href="/login#signup" className="sb-btn sb-btn-primary sb-landing-cta-btn">
            Commencer l&apos;essai gratuit
          </Link>
        </div>
      </section>

      <footer className="sb-landing-footer">
        <div className="sb-landing-footer-inner">
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
      </footer>
    </div>
  );
}
