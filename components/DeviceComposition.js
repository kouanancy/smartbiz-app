import ModuleMockup from "@/components/ModuleMockup";

// Composition « ordinateur + téléphone » pour la colonne droite du héros
// du site vitrine — construite par défaut avec les mêmes maquettes CSS que
// les cartes module (components/ModuleMockup.js), posées dans un cadre
// d'appareil. laptopImage/phoneImage (optionnels) : une fois de vraies
// captures d'écran de l'app disponibles, il suffit de renseigner un chemin
// sous /public ici pour les afficher à la place des maquettes CSS, rien
// d'autre à changer.
export default function DeviceComposition({ laptopImage, phoneImage }) {
  return (
    <div className="sb-landing-devices" aria-hidden="true">
      <div className="sb-landing-device-laptop">
        <div className="sb-landing-device-topbar">
          <span className="sb-landing-device-dot" />
          <span className="sb-landing-device-dot" />
          <span className="sb-landing-device-dot" />
        </div>
        <div className="sb-landing-device-screen">
          <ModuleMockup type="dashboard" imageSrc={laptopImage} />
        </div>
      </div>
      <div className="sb-landing-device-phone">
        <div className="sb-landing-device-notch" />
        <ModuleMockup type="nouvelle" imageSrc={phoneImage} />
      </div>
    </div>
  );
}
