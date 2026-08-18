import Link from "next/link";
import { Mail } from "lucide-react";
import { fmt as fmtBase } from "@/lib/format";
import { t as tBase } from "@/lib/i18n";
import PlanGrid from "@/components/PlanGrid";
import FloatingBlobs from "@/components/FloatingBlobs";
import PlatformLogo from "@/components/PlatformLogo";
import ModuleMockup from "@/components/ModuleMockup";
import DeviceComposition from "@/components/DeviceComposition";
import FooterSupport from "@/components/FooterSupport";
import Reveal from "@/components/Reveal";
import Counter from "@/components/Counter";

// Site vitrine public (/) — jamais connecté à une boutique précise (aucune
// session à ce stade), donc toujours en français comme app/login/page.js,
// avec la même raison : aucune autre chaîne ici ne passe par lib/i18n.
const t = (key, vars) => tBase("fr", key, vars);
const fmt = (n) => fmtBase(n);

// 6 modules (pas les 7 de la sidebar — Catalogue volontairement laissé de
// côté ici pour un site vitrine plus resserré) avec leur maquette
// (components/ModuleMockup.js) et leur description, reprise telle quelle
// quand elle existait déjà dans lib/i18n/fr.js, sinon rédigée à partir des
// fonctionnalités réelles plutôt qu'inventée.
const MODULES = [
  { key: "dashboard", titre: t("sidebar.nav.dashboard"), texte: t("dashboard.subtitle") },
  { key: "nouvelle", titre: t("sidebar.nav.nouvelle"), texte: t("nouvelle.subtitle") },
  { key: "articles", titre: t("sidebar.nav.articles"), texte: "Suis ton stock article par article, avec une alerte avant la rupture." },
  { key: "clients", titre: t("sidebar.nav.clients"), texte: "Une fiche par cliente : coordonnées, historique de commandes et total des achats." },
  { key: "commandes", titre: t("sidebar.nav.commandes"), texte: "L'historique complet de tes commandes, du statut à la livraison." },
  { key: "tresorerie", titre: t("sidebar.nav.tresorerie"), texte: t("tresorerie.subtitle") },
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

      <section className="sb-landing-hero">
        <FloatingBlobs />
        <div className="sb-landing-hero-grid">
          <div>
            <h1 className="sb-landing-hero-title sb-landing-hero-line sb-landing-hero-line-1">
              Découvrez <span className="sb-landing-doka-word">Doka</span>
            </h1>
            <p className="sb-landing-hero-tagline sb-landing-hero-line sb-landing-hero-line-2">
              Votre ERP pensé pour les entrepreneurs d&apos;aujourd&apos;hui.
            </p>
            <div className="sb-landing-hero-ctas sb-landing-hero-line sb-landing-hero-line-cta">
              <Link href="/login#signup" className="sb-btn sb-btn-primary sb-landing-cta-btn">
                Commencer l&apos;essai gratuit
              </Link>
              <Link href="/login" className="sb-btn sb-btn-ghost sb-landing-cta-btn">
                Se connecter
              </Link>
            </div>
            <p className="sb-landing-hero-note sb-landing-hero-line sb-landing-hero-line-cta">7 jours d&apos;essai gratuit, sans carte bancaire.</p>
          </div>
          <DeviceComposition />
        </div>
      </section>

      <section className="sb-landing-histoire sb-landing-blobby-section" id="histoire">
        <FloatingBlobs count={2} subtle />
        <Reveal className="sb-landing-blobby-content">
          <div className="sb-landing-section">
            <div className="sb-landing-section-head">
              <h2 className="sb-landing-section-title">Notre histoire</h2>
            </div>
            <div className="sb-landing-histoire-text">
              <p>
                Doka est né d&apos;un vrai besoin, pas d&apos;une idée en l&apos;air. Avant d&apos;être un produit,
                c&apos;était un problème que je vivais moi-même : gérer mon activité de vente de perruques et mèches,
                entre le suivi du stock, les commandes clientes et le calcul de ma vraie marge. J&apos;ai d&apos;abord
                bricolé mes propres outils pour m&apos;en sortir — jusqu&apos;à ce que je réalise que ce besoin
                n&apos;était pas juste le mien : des dizaines de petits commerçants autour de moi vivaient exactement
                la même chose, avec les mêmes cahiers, les mêmes tableurs, et les mêmes ERP trop chers pour leur
                taille. Doka est né de cette conviction simple : un petit commerce mérite un outil aussi sérieux
                qu&apos;une grande entreprise, sans la complexité ni le prix qui vont avec.
              </p>
            </div>
          </div>
        </Reveal>
      </section>

      <section className="sb-landing-section sb-landing-blobby-section">
        <FloatingBlobs count={2} subtle />
        <Reveal className="sb-landing-blobby-content">
          <div className="sb-landing-section-head" style={{ marginBottom: 0 }}>
            <h2 className="sb-landing-section-title">Pourquoi Doka te convient</h2>
            <p className="sb-landing-pourquoi-text">
              Doka est pensé pour les commerçantes et commerçants qui gèrent tout eux-mêmes — pas d&apos;équipe
              informatique, pas de temps à perdre en formation. Une prise en main immédiate, un prix accessible dès
              5 000 FCFA par mois, et des données qui restent les tiennes : exactement ce qu&apos;il te faut pour
              professionnaliser ta boutique sans la compliquer.
            </p>
          </div>
        </Reveal>
      </section>

      <section className="sb-landing-section sb-landing-blobby-section" id="modules">
        <FloatingBlobs count={2} subtle />
        <Reveal className="sb-landing-blobby-content">
          <div className="sb-landing-section-head">
            <h2 className="sb-landing-section-title">Tout Doka, module par module</h2>
          </div>
          <div className="sb-landing-grid">
            {MODULES.map(({ key, titre, texte }) => (
              <div className="sb-landing-card" key={key}>
                <ModuleMockup type={key} />
                <div className="sb-landing-card-title">{titre}</div>
                <p className="sb-landing-card-text">{texte}</p>
              </div>
            ))}
          </div>
        </Reveal>
      </section>

      <section className="sb-landing-stats sb-landing-blobby-section">
        <FloatingBlobs count={2} subtle />
        <Reveal className="sb-landing-blobby-content">
          <div className="sb-landing-stats-grid">
            <div>
              <div className="sb-landing-stat-value">
                <Counter to={7} />
              </div>
              <p className="sb-landing-stat-label">jours d&apos;essai gratuit</p>
            </div>
            <div>
              <div className="sb-landing-stat-value">
                <Counter to={3} />
              </div>
              <p className="sb-landing-stat-label">formules adaptées à chaque commerce</p>
            </div>
            <div>
              <div className="sb-landing-stat-value">
                <Counter to={100} suffix="%" />
              </div>
              <p className="sb-landing-stat-label">des données isolées par boutique</p>
            </div>
          </div>
        </Reveal>
      </section>

      <section className="sb-landing-section sb-landing-blobby-section" id="tarifs">
        <FloatingBlobs count={2} subtle />
        <Reveal className="sb-landing-blobby-content">
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
        </Reveal>
      </section>

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
    </div>
  );
}
