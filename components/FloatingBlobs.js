// Fond animé façon lampe à lave, partagé par tous les écrans d'entrée
// (connexion/inscription, premier paiement, réabonnement, compte suspendu,
// changement de formule) ainsi que par les sections du site vitrine
// (components/LandingPage.js). Purement décoratif (aria-hidden) : six
// formes arrondies distinctes plutôt que deux pseudo-éléments, pour des
// cycles vraiment désynchronisés (voir app/globals.css, .sb-blob-*) — un
// pseudo-élément est limité à ::before/::after, donc à deux formes par
// écran.
//
// count (2 ou 6, défaut 6) réduit le nombre de bulles pour les sections
// secondaires du site vitrine — plus léger que le héros (6 bulles) sans
// répéter le même nombre partout sur une seule page. subtle applique une
// opacité globale réduite (.sb-blob-field-subtle) pour ne jamais gêner la
// lecture d'une section pleine de texte/cartes, contrairement au héros où
// les bulles sont seules derrière un titre court.
export default function FloatingBlobs({ count = 6, subtle = false }) {
  const blobs = [1, 2, 3, 4, 5, 6].slice(0, count);
  return (
    <div className={`sb-blob-field${subtle ? " sb-blob-field-subtle" : ""}`} aria-hidden="true">
      {blobs.map((n) => (
        <span className={`sb-blob sb-blob-${n}`} key={n} />
      ))}
    </div>
  );
}
