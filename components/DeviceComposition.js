import ModuleMockup from "@/components/ModuleMockup";

// Composition « ordinateur + téléphone » pour la colonne droite du héros
// du site vitrine — aucune vraie capture d'écran de l'app dans ce dépôt à
// réutiliser (pas de dossier de présentation/pitch ici), donc reconstruite
// avec les mêmes maquettes CSS que les cartes module
// (components/ModuleMockup.js), posées dans un cadre d'appareil plutôt
// qu'une photo, jamais périmée puisqu'elle ne dépend d'aucune image.
export default function DeviceComposition() {
  return (
    <div className="sb-landing-devices" aria-hidden="true">
      <div className="sb-landing-device-laptop">
        <div className="sb-landing-device-topbar">
          <span className="sb-landing-device-dot" />
          <span className="sb-landing-device-dot" />
          <span className="sb-landing-device-dot" />
        </div>
        <div className="sb-landing-device-screen">
          <ModuleMockup type="dashboard" />
        </div>
      </div>
      <div className="sb-landing-device-phone">
        <div className="sb-landing-device-notch" />
        <ModuleMockup type="nouvelle" />
      </div>
    </div>
  );
}
