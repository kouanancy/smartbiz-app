import Link from "next/link";
import { ArrowRight, Rocket } from "lucide-react";
import { fmt as fmtBase } from "@/lib/format";
import { t as tBase } from "@/lib/i18n";
import PlanGrid from "@/components/PlanGrid";
import FloatingBlobs from "@/components/FloatingBlobs";
import ModuleMockup from "@/components/ModuleMockup";
import DeviceComposition from "@/components/DeviceComposition";
import HeroCarousel from "@/components/HeroCarousel";
import LandingNav from "@/components/LandingNav";
import LandingFooter from "@/components/LandingFooter";
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
//
// image (optionnel, null pour l'instant) : dès que de vraies captures
// d'écran de l'app sont disponibles, il suffit de renseigner ici un chemin
// sous /public (ex. "/screenshots/dashboard.png") pour remplacer la
// maquette CSS de la carte correspondante — voir components/ModuleMockup.js.
const MODULES = [
  { key: "dashboard", titre: t("sidebar.nav.dashboard"), texte: t("dashboard.subtitle"), image: null },
  { key: "nouvelle", titre: t("sidebar.nav.nouvelle"), texte: t("nouvelle.subtitle"), image: null },
  { key: "articles", titre: t("sidebar.nav.articles"), texte: "Suis ton stock article par article, avec une alerte avant la rupture.", image: null },
  { key: "clients", titre: t("sidebar.nav.clients"), texte: "Une fiche par cliente : coordonnées, historique de commandes et total des achats.", image: null },
  { key: "commandes", titre: t("sidebar.nav.commandes"), texte: "L'historique complet de tes commandes, du statut à la livraison.", image: null },
  { key: "tresorerie", titre: t("sidebar.nav.tresorerie"), texte: t("tresorerie.subtitle"), image: null },
];

// Idem pour la composition ordinateur + téléphone du héros
// (components/DeviceComposition.js) : deux chemins sous /public à
// renseigner une fois les captures reçues (vue ordinateur, vue téléphone).
const HERO_LAPTOP_IMAGE = null;
const HERO_PHONE_IMAGE = null;

// Carrousel du visuel du héros (components/HeroCarousel.js) : tant que ce
// tableau est vide, le héros garde la composition ordinateur + téléphone
// ci-dessus (DeviceComposition, avec ou sans HERO_LAPTOP_IMAGE/
// HERO_PHONE_IMAGE) ; dès qu'au moins une image y est ajoutée (chemin sous
// /public, ex. "/hero/phone-dashboard.png"), le carrousel prend le relais
// et défile automatiquement entre toutes les images listées ici.
//
// Les trois photos ci-dessous montrent des commerçants en situation
// d'usage, avec le tableau de bord Doka affiché sur leur téléphone.
const HERO_CAROUSEL_IMAGES = [
  { src: "/hero/IMG_2662.PNG", alt: "Commerçante consultant le tableau de bord Doka sur son téléphone dans sa boutique" },
  { src: "/hero/IMG_2663.PNG", alt: "Commerçante consultant le tableau de bord Doka sur son téléphone dans son atelier" },
  { src: "/hero/IMG_2664.PNG", alt: "Commerçant consultant le tableau de bord Doka sur son téléphone sur son étal" },
];

export default function LandingPage() {
  return (
    <div className="sb-landing">
      <LandingNav />

      <section className="sb-landing-hero">
        <FloatingBlobs />
        <div className="sb-landing-hero-grid">
          <div>
            <h1 className="sb-landing-hero-title sb-landing-hero-line sb-landing-hero-line-1">
              Découvrez <span className="sb-landing-doka-word">Doka</span>
            </h1>
            <p className="sb-landing-hero-tagline sb-landing-hero-line sb-landing-hero-line-2">
              Votre mini ERP pensée pour les entrepreneurs d&apos;aujourd&apos;hui.
            </p>
            <div className="sb-landing-hero-ctas sb-landing-hero-line sb-landing-hero-line-cta">
              <Link href="/login#signup" className="sb-btn sb-btn-primary sb-landing-cta-btn">
                Commencer l&apos;essai gratuit
              </Link>
            </div>
            <p className="sb-landing-hero-note sb-landing-hero-line sb-landing-hero-line-cta">7 jours d&apos;essai gratuit, sans carte bancaire.</p>
          </div>
          {HERO_CAROUSEL_IMAGES.length > 0 ? (
            <HeroCarousel images={HERO_CAROUSEL_IMAGES} />
          ) : (
            <DeviceComposition laptopImage={HERO_LAPTOP_IMAGE} phoneImage={HERO_PHONE_IMAGE} />
          )}
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
                Doka est né d&apos;un vrai besoin. Avant d&apos;être un produit, c&apos;était un problème que je
                vivais moi-même : gérer mon activité de vente de perruques et mèches, entre le suivi du stock, les
                commandes clientes et le calcul de ma vraie marge. J&apos;ai d&apos;abord bricolé mes propres outils
                pour m&apos;en sortir — jusqu&apos;à ce que je réalise que ce besoin n&apos;était pas juste le mien,
                mais que des dizaines de petits commerçants autour de moi vivaient exactement la même chose, avec les
                mêmes cahiers, les mêmes tableurs, et les mêmes ERP trop chers pour leur taille. Doka est né de cette
                conviction simple : un petit commerce mérite un outil aussi sérieux qu&apos;une grande entreprise,
                sans complexité, et accessible à tous.
              </p>
              <div className="sb-landing-histoire-signature">
                <p>Nancy Koné</p>
                <p>Fondatrice de Doka</p>
              </div>
            </div>
          </div>
        </Reveal>
      </section>

      <section className="sb-landing-section sb-landing-blobby-section">
        <FloatingBlobs count={2} subtle />
        <Reveal className="sb-landing-blobby-content">
          <div className="sb-landing-section-head" style={{ marginBottom: 0 }}>
            <h2 className="sb-landing-section-title">Pourquoi Doka pour ton commerce</h2>
            <p className="sb-landing-pourquoi-text">
              Doka est pensé pour les commerçantes et commerçants qui gèrent tout eux-mêmes, pas d&apos;équipe
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
            {MODULES.map(({ key, titre, texte, image }) => (
              <div className="sb-landing-card" key={key}>
                <ModuleMockup type={key} imageSrc={image} imageAlt={titre} />
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

      <section className="sb-landing-section sb-landing-blobby-section" id="avis">
        <FloatingBlobs count={2} subtle />
        <Reveal className="sb-landing-blobby-content">
          <div className="sb-landing-section-head">
            <h2 className="sb-landing-section-title">Ce qu&apos;en disent les commerçants</h2>
          </div>
          <div className="sb-landing-avis-grid">
            {[0, 1, 2].map((i) => (
              <div className="sb-landing-avis-card" key={i} aria-hidden="true">
                <span className="sb-landing-avis-quote-mark">&ldquo;</span>
                <div className="sb-landing-avis-line" />
                <div className="sb-landing-avis-line" style={{ width: "70%" }} />
                <div className="sb-landing-avis-author">
                  <span className="sb-landing-avis-avatar" />
                  <div className="sb-landing-avis-line" style={{ width: "40%", height: 6 }} />
                </div>
              </div>
            ))}
          </div>
          <p className="sb-landing-avis-note">Les premiers retours de nos commerçants arriveront bientôt ici.</p>
        </Reveal>
      </section>

      <section className="sb-landing-section sb-landing-blobby-section" id="feuille-de-route">
        <FloatingBlobs count={2} subtle />
        <Reveal className="sb-landing-blobby-content">
          <Link href="/feuille-de-route" className="sb-roadmap-teaser">
            <div className="sb-roadmap-teaser-icon">
              <Rocket size={26} />
            </div>
            <div className="sb-roadmap-teaser-text">
              <div className="sb-roadmap-teaser-title">Doka grandit avec vous</div>
              <p className="sb-roadmap-teaser-sub">Découvrez notre feuille de route</p>
            </div>
            <ArrowRight className="sb-roadmap-teaser-arrow" size={20} aria-hidden="true" />
          </Link>
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
        </Reveal>
      </section>

      <LandingFooter />
    </div>
  );
}
