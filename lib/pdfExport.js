"use client";

// Export PDF commun à toute l'app (confirmation de commande, stock,
// catalogue, trésorerie) — un seul endroit pour la génération du fichier
// (jsPDF/html2canvas) et pour le téléchargement, plutôt que de dupliquer
// cette logique dans chaque page.
//
// Cause exacte du téléchargement qui ne fonctionnait pas sur téléphone
// (voir README.md pour le détail complet) :
//
// 1. Safari (iOS et bureau) ne déclenche pas de façon fiable un vrai
//    téléchargement pour une URL blob: via <a download> — selon la
//    version, il ouvre le fichier dans son lecteur intégré au lieu de
//    l'enregistrer, ou ignore l'attribut. Chrome (Android comme bureau)
//    n'a pas ce problème.
// 2. Safari lie l'autorisation d'ouvrir une fenêtre/de naviguer à
//    l'activation utilisateur du clic d'origine — un seul await avant
//    d'agir (ici, la génération du PDF prend facilement 300ms à 2s) suffit
//    à la lui faire perdre, et l'action échoue silencieusement. Chrome
//    tolère un délai nettement plus long.
// 3. L'élément à capturer était positionné hors écran (left: -9999px) —
//    Safari/WebKit ne peint pas de façon fiable un élément aussi loin de
//    la fenêtre visible, ce qui pouvait rendre la capture html2canvas
//    vide ou incomplète (voir .sb-pdf-export-capture dans globals.css, qui
//    corrige ce point en gardant l'élément dans la fenêtre visible, caché
//    par le cache plein écran posé ci-dessous).
//
// Stratégie retenue, dans l'ordre : l'API Web Share avec fichiers quand le
// navigateur la supporte (iOS Safari et Chrome Android la supportent tous
// les deux pour un PDF — elle délègue au sélecteur natif du téléphone,
// contourne à la fois 1 et 2) ; sinon, sur Safari spécifiquement, une
// fenêtre ouverte AVANT tout await (donc pendant que l'activation
// utilisateur est encore valide), repointée vers le PDF une fois prêt ;
// sinon (Chrome, Firefox...), le téléchargement direct déjà en place
// aujourd'hui, qui fonctionne très bien chez eux même après un await.

const PAGE_MARGIN_MM = 16;
const PAGE_WIDTH_MM = 210;
const PAGE_HEIGHT_MM = 297;
const USABLE_WIDTH_MM = PAGE_WIDTH_MM - PAGE_MARGIN_MM * 2;
const USABLE_HEIGHT_MM = PAGE_HEIGHT_MM - PAGE_MARGIN_MM * 2;
// Largeur de rendu fixe (96 dpi, référence CSS standard), jamais déduite de
// la fenêtre du navigateur au moment de l'appel : html2canvas doit toujours
// mesurer le même nombre de pixels CSS pour cette largeur en mm, quelle que
// soit la taille réelle de la fenêtre (mobile ou bureau) — sinon la
// conversion pixels → mm plus bas (PX_PAR_MM) ne correspondrait plus à rien
// de fiable.
const CAPTURE_WIDTH_PX = Math.round((USABLE_WIDTH_MM * 96) / 25.4);
const SCALE = 2;

// Capture l'élément fourni (déjà mis en page pour l'A4, voir
// .sb-receipt-print/.sb-stock-print/.sb-catalogue-print/.sb-tresorerie-print
// dans globals.css) via html2canvas, puis découpe ce rendu en pages A4 avec
// jsPDF (addImage), et renvoie le PDF sous forme de Blob.
//
// jsPDF propose une méthode de haut niveau, pdf.html(), qui fait ce travail
// elle-même (et déléguait déjà le rendu à html2canvas en interne) — jamais
// utilisée ici : testée avec Playwright (voir README.md), elle produit un
// PDF corrompu (pages blanches, "Restoring state when no valid states to
// pop" à la relecture) avec la version 4.2.1 de jsPDF utilisée par l'app,
// aussi bien avec l'ancien positionnement hors écran (left: -9999px)
// qu'avec le nouveau — un bug de la bibliothèque, pas de ce composant, mais
// qui rendait TOUT téléchargement de cette confirmation de commande inutile
// depuis sa création, sur ordinateur comme sur téléphone. Piloter
// html2canvas nous-mêmes et composer les pages à la main avec la primitive
// la plus simple de jsPDF (une image par page) évite ce bug.
export async function genererPdfBlob(el) {
  if (!el) return null;
  const [{ default: jsPDF }, { default: html2canvas }] = await Promise.all([import("jspdf"), import("html2canvas")]);
  const canvas = await html2canvas(el, {
    scale: SCALE,
    useCORS: true,
    windowWidth: CAPTURE_WIDTH_PX,
  });
  const pxParMm = canvas.width / USABLE_WIDTH_MM;
  const pageHeightPx = USABLE_HEIGHT_MM * pxParMm;

  // Éléments qui ne doivent jamais être coupés entre deux pages (lignes du
  // tableau d'articles, bloc client/livraison, totaux, tampon confirmée —
  // voir le marqueur sb-pdf-no-split posé sur ces éléments dans Receipt.js
  // et les autres pages d'export). Coordonnées ramenées au repère du canvas
  // (origine = haut de l'élément capturé, échelle = SCALE) pour être
  // directement comparables aux découpes candidates ci-dessous.
  const rootTop = el.getBoundingClientRect().top;
  const zonesProtegees = Array.from(el.querySelectorAll(".sb-pdf-no-split")).map((node) => {
    const r = node.getBoundingClientRect();
    return { haut: (r.top - rootTop) * SCALE, bas: (r.bottom - rootTop) * SCALE };
  });

  // Si la découpe envisagée tombe en plein milieu d'une zone protégée, elle
  // recule juste avant cette zone — jamais en avant (qui risquerait de
  // dépasser la hauteur de page disponible). Si une seule zone protégée est
  // à elle seule plus haute qu'une page entière (ex. un très grand nombre de
  // cadeaux sur une seule ligne), impossible de l'éviter : la découpe reste
  // telle quelle plutôt que de tourner en boucle sans jamais avancer.
  function ajusterDecoupe(decoupeIdeale, hauteurDejaUtilisee) {
    if (decoupeIdeale >= canvas.height) return canvas.height;
    for (const zone of zonesProtegees) {
      if (decoupeIdeale > zone.haut && decoupeIdeale < zone.bas) {
        return zone.haut > hauteurDejaUtilisee ? zone.haut : decoupeIdeale;
      }
    }
    return decoupeIdeale;
  }

  const pdf = new jsPDF({ unit: "mm", format: "a4" });
  let y = 0;
  let pagePosee = false;
  while (y < canvas.height) {
    const decoupe = ajusterDecoupe(Math.min(y + pageHeightPx, canvas.height), y);
    const hauteurTranche = decoupe - y;
    const tranche = document.createElement("canvas");
    tranche.width = canvas.width;
    tranche.height = hauteurTranche;
    tranche.getContext("2d").drawImage(canvas, 0, y, canvas.width, hauteurTranche, 0, 0, canvas.width, hauteurTranche);
    if (pagePosee) pdf.addPage();
    pagePosee = true;
    pdf.addImage(tranche.toDataURL("image/jpeg", 0.92), "JPEG", PAGE_MARGIN_MM, PAGE_MARGIN_MM, USABLE_WIDTH_MM, hauteurTranche / pxParMm);
    y = decoupe;
  }
  return pdf.output("blob");
}

// Un Blob vide suffit à tester le support réel (type + capacité à
// partager un fichier), sans attendre d'avoir généré le PDF.
function peutPartagerFichier() {
  try {
    return (
      typeof navigator !== "undefined" &&
      typeof navigator.canShare === "function" &&
      navigator.canShare({ files: [new File([""], "x.pdf", { type: "application/pdf" })] })
    );
  } catch {
    return false;
  }
}

// Isole Safari (bureau et iOS) des autres navigateurs qui tournent aussi
// sur WebKit par obligation du système iOS (Chrome/Firefox pour iOS,
// identifiables par "CriOS"/"FxOS"/"EdgiOS" dans le user-agent) : eux ne
// perdent pas l'activation utilisateur après un await et gèrent très bien
// <a download> sur une URL blob, donc n'ont pas besoin du détour par une
// fenêtre pré-ouverte ci-dessous.
function estSafari() {
  if (typeof navigator === "undefined") return false;
  return /^((?!chrome|android|crios|fxios|edgios).)*safari/i.test(navigator.userAgent);
}

function telechargerBlobDirect(blob, nomFichier) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nomFichier;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// Cache plein écran, posé juste avant de démarrer la capture et retiré
// juste après : l'élément à capturer doit rester dans la fenêtre visible
// (voir le point 3 plus haut), ce cache est ce qui l'empêche malgré tout
// d'apparaître à l'utilisateur, quelle que soit la page d'où exporterPdf
// est appelée (modale ou simple bouton de page).
function afficherCache(label) {
  const div = document.createElement("div");
  div.style.position = "fixed";
  div.style.inset = "0";
  div.style.zIndex = "500";
  div.style.background = "#fff";
  div.style.display = "flex";
  div.style.alignItems = "center";
  div.style.justifyContent = "center";
  div.style.fontFamily = "Inter, sans-serif";
  div.style.fontSize = "14px";
  div.style.color = "#6e6b68";
  div.textContent = label || "";
  document.body.appendChild(div);
  return div;
}

// Point d'entrée unique pour tous les exports PDF de l'app. `getElement`
// peut être async (ex. le stock doit d'abord refaire une requête Supabase
// pour la liste complète, pas seulement la page affichée, avant de pouvoir
// afficher/capturer son bloc d'impression) : il est appelé APRÈS
// l'éventuelle ouverture de fenêtre ci-dessous, qui elle doit impérativement
// rester avant le premier await, quelle que soit la durée de ce qui suit —
// une fois la fenêtre ouverte, la rediriger plus tard (fenetreReservee.
// location.href, tout en bas) ne redemande pas l'activation utilisateur,
// seule l'OUVERTURE l'exigeait. `onCaptured` (optionnel) est appelé dès que
// la capture de l'élément est terminée, avant même de partager/télécharger
// le PDF — chaque appelant s'en sert pour retirer sa classe de capture
// (sb-pdf-export-capture, qui sort l'élément de son emplacement normal dans
// la page) tout de suite, plutôt que d'attendre la fin de tout l'appel
// (partage natif compris, qui peut laisser l'utilisateur plusieurs
// secondes sur le sélecteur du système) : sans ça, l'élément resterait
// affiché en position fixe, hors du cache (retiré juste avant, lui, voir
// plus bas) pendant tout ce temps.
export async function exporterPdf({ getElement, nomFichier, labelGeneration, onCaptured }) {
  const partage = peutPartagerFichier();
  // Ouverte ICI, avant tout await : sur Safari, l'autorisation d'ouvrir une
  // fenêtre est liée au geste utilisateur synchrone du clic, elle ne
  // survit pas à un await (voir point 2 plus haut) — inutile ailleurs,
  // où le téléchargement direct plus bas fonctionne déjà très bien.
  const fenetreReservee = !partage && estSafari() ? window.open("", "_blank") : null;
  const cache = afficherCache(labelGeneration);
  try {
    const el = await getElement();
    const blob = await genererPdfBlob(el);
    onCaptured?.();
    cache.remove();
    if (!blob) {
      fenetreReservee?.close();
      return false;
    }
    if (partage) {
      try {
        const file = new File([blob], nomFichier, { type: "application/pdf" });
        await navigator.share({ files: [file] });
      } catch (err) {
        // L'utilisateur a simplement fermé le sélecteur de partage.
        if (err?.name !== "AbortError") throw err;
      }
    } else if (fenetreReservee) {
      fenetreReservee.location.href = URL.createObjectURL(blob);
    } else {
      telechargerBlobDirect(blob, nomFichier);
    }
    return true;
  } catch (err) {
    onCaptured?.();
    cache.remove();
    fenetreReservee?.close();
    throw err;
  }
}
