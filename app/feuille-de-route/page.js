import { Fragment } from "react";
import {
  ArrowRight,
  Banknote,
  Building2,
  CheckCircle2,
  CreditCard,
  FileSpreadsheet,
  Gauge,
  Handshake,
  Heart,
  History,
  MessageCircle,
  Percent,
  Receipt,
  Share2,
  Store,
  Truck,
  TrendingUp,
  UserCog,
} from "lucide-react";
import FloatingBlobs from "@/components/FloatingBlobs";
import LandingNav from "@/components/LandingNav";
import LandingFooter from "@/components/LandingFooter";
import Reveal from "@/components/Reveal";

export const metadata = {
  title: "Feuille de route — Doka",
  description: "Découvrez les prochaines étapes de Doka : mieux piloter votre activité, grandir en équipe, puis vous structurer.",
};

// Contenu de la feuille de route publique — trois phases à venir, chacune
// avec sa couleur pour bien les distinguer visuellement (schéma du haut +
// bordure des capsules ci-dessous). Jamais de nouvelle palette : les trois
// couleurs sémantiques déjà posées sur .sb-landing (--emerald/--amber/
// --coral, app/globals.css) et déjà visibles ailleurs sur le site vitrine
// (badges de formule, statuts) — référencées ici via var(...) plutôt que
// recopiées en dur, pour rester automatiquement synchronisées si ces
// couleurs venaient à changer. Aucune fonctionnalité listée n'est encore
// construite : "disponible" reste à false partout — passer une entrée à
// true (une fois livrée dans l'app) suffira à faire passer sa coche du
// gris au vert, sans autre changement.
const ROADMAP_PHASES = [
  {
    numero: 2,
    nom: "Mieux piloter",
    couleur: "var(--emerald)",
    couleurBg: "var(--emerald-bg)",
    icone: Gauge,
    fonctionnalites: [
      {
        icone: History,
        nom: "Historique client enrichi",
        description: "Date du dernier achat et produit favori directement sur la fiche cliente",
        disponible: false,
      },
      {
        icone: TrendingUp,
        nom: "Statistiques des produits les plus vendus",
        description: "Savoir quoi remettre en avant et quoi arrêter de stocker",
        disponible: false,
      },
      {
        icone: Percent,
        nom: "Comparaison du chiffre d'affaires au mois dernier",
        description: "Une variation en % mise en avant, pas juste des chiffres côte à côte",
        disponible: false,
      },
      {
        icone: MessageCircle,
        nom: "Rapport hebdomadaire enrichi",
        description: "Un résumé de toute l'activité (CA, marge, points clés) par WhatsApp ou notification, pas seulement le stock",
        disponible: false,
      },
      {
        icone: FileSpreadsheet,
        nom: "Export comptable consolidé",
        description: "Un récapitulatif mensuel ou annuel (ventes, marge, stock réunis) prêt à transmettre à un comptable ou une banque",
        disponible: false,
      },
    ],
  },
  {
    numero: 3,
    nom: "Grandir en équipe",
    couleur: "var(--amber)",
    couleurBg: "var(--amber-bg)",
    icone: Handshake,
    fonctionnalites: [
      {
        icone: Banknote,
        nom: "Paiement partiel par acompte",
        description: "Accepter une commande sans exiger le paiement complet",
        disponible: false,
      },
      {
        icone: UserCog,
        nom: "Plusieurs utilisateurs, droits limités",
        description: "Déléguer sans donner accès à toutes les données",
        disponible: false,
      },
      {
        icone: Truck,
        nom: "Suivi des fournisseurs et des achats",
        description: "Savoir combien on doit, et à qui",
        disponible: false,
      },
      {
        icone: CreditCard,
        nom: "Diversification des moyens de paiement",
        description: "Ne pas dépendre d'une seule option de paiement",
        disponible: false,
      },
    ],
  },
  {
    numero: 4,
    nom: "Se structurer",
    couleur: "var(--coral)",
    couleurBg: "var(--coral-bg)",
    icone: Building2,
    fonctionnalites: [
      {
        icone: Share2,
        nom: "Programme de parrainage",
        description: "Être récompensé(e) pour avoir fait connaître Doka",
        disponible: false,
      },
      {
        icone: Receipt,
        nom: "Facturation",
        description: "Émettre des factures conformes, directement depuis Doka",
        disponible: false,
      },
      {
        icone: Store,
        nom: "Gestion multi-boutique",
        description: "Piloter plusieurs points de vente depuis un seul compte",
        disponible: false,
      },
      {
        icone: Heart,
        nom: "Fidélisation des clientes",
        description: "Donner une raison de plus de revenir",
        disponible: false,
      },
    ],
  },
];

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
