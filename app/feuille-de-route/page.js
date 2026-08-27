import { Fragment } from "react";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import FloatingBlobs from "@/components/FloatingBlobs";
import LandingNav from "@/components/LandingNav";
import LandingFooter from "@/components/LandingFooter";
import Reveal from "@/components/Reveal";
import { ROADMAP_PHASES } from "@/lib/roadmap";

export const metadata = {
  title: "Feuille de route — Doka",
  description: "Découvrez les prochaines étapes de Doka : mieux piloter votre activité, grandir en équipe, puis vous structurer.",
};

export default function FeuilleDeRoutePage() {
  return (
    <div className="sb-landing">
      <LandingNav />

      <section className="sb-landing-hero">
        <FloatingBlobs />
        <div className="sb-roadmap-hero-inner">
          <h1 className="sb-landing-hero-title sb-landing-hero-line sb-landing-hero-line-1" style={{ textAlign: "center" }}>
            Doka grandit avec <span className="sb-landing-doka-word">vous</span>
          </h1>
          <p className="sb-landing-hero-tagline sb-landing-hero-line sb-landing-hero-line-2" style={{ textAlign: "center", margin: "0 auto 8px" }}>
            Voici les grandes étapes déjà pensées pour faire évoluer Doka avec votre commerce.
          </p>
        </div>

        <div className="sb-roadmap-schema sb-landing-hero-line sb-landing-hero-line-cta">
          {ROADMAP_PHASES.map((phase, i) => (
            <Fragment key={phase.numero}>
              <div className="sb-roadmap-schema-node" style={{ "--phase-color": phase.couleur }}>
                <span className="sb-roadmap-schema-badge">Phase {phase.numero}</span>
                <span className="sb-roadmap-schema-nom">{phase.nom}</span>
              </div>
              {i < ROADMAP_PHASES.length - 1 && <ArrowRight className="sb-roadmap-schema-arrow" size={22} aria-hidden="true" />}
            </Fragment>
          ))}
        </div>
      </section>

      <section className="sb-landing-section sb-landing-blobby-section">
        <FloatingBlobs count={2} subtle />
        <div className="sb-roadmap-phases sb-landing-blobby-content">
          {ROADMAP_PHASES.map((phase) => {
            const IconePhase = phase.icone;
            return (
              <Reveal key={phase.numero}>
                <div className="sb-roadmap-phase" style={{ "--phase-color": phase.couleur, "--phase-bg": phase.couleurBg }}>
                  <div className="sb-roadmap-phase-head">
                    <span className="sb-roadmap-phase-num-bg" aria-hidden="true">
                      {phase.numero}
                    </span>
                    <div className="sb-roadmap-phase-icon">
                      <IconePhase size={34} />
                    </div>
                    <div className="sb-roadmap-phase-titre">
                      <span className="sb-roadmap-phase-badge">Phase {phase.numero}</span>
                      <h3 className="sb-roadmap-phase-nom">{phase.nom}</h3>
                    </div>
                  </div>
                  <ul className="sb-roadmap-feature-list">
                    {phase.fonctionnalites.map((f) => {
                      const IconeFeature = f.icone;
                      return (
                        <li className="sb-roadmap-feature" key={f.nom}>
                          <span className="sb-roadmap-feature-icon">
                            <IconeFeature size={18} />
                          </span>
                          <div className="sb-roadmap-feature-text">
                            <div className="sb-roadmap-feature-nom">{f.nom}</div>
                            <p className="sb-roadmap-feature-desc">{f.description}</p>
                          </div>
                          <span
                            className={`sb-roadmap-feature-statut${f.disponible ? " sb-roadmap-feature-statut-ok" : ""}`}
                            title={f.disponible ? "Disponible dans Doka" : "Pas encore disponible"}
                          >
                            <CheckCircle2 size={18} />
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              </Reveal>
            );
          })}
        </div>
      </section>

      <LandingFooter />
    </div>
  );
}
