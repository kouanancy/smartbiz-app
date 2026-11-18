"use client";

// Export PDF commun à toute l'app (confirmation de commande, stock,
// catalogue, trésorerie, réceptions d'achats, inventaire...) — un seul
// endroit pour la génération du fichier (jsPDF/html2canvas), l'aperçu
// avant impression (components/PrintPreviewModal.js) et le téléchargement,
// plutôt que de dupliquer cette logique dans chaque page.
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
//    corrige ce point en gardant l'élément dans la fenêtre visible —
//    invisible pour l'utilisatrice car recouvert par l'aperçu lui-même,
//    déjà ouvert au moment de la capture, voir components/PrintPreviewModal.js).
//
// Stratégie retenue, dans l'ordre : l'API Web Share avec fichiers quand le
// navigateur la supporte ET que l'appareil est un téléphone/une tablette
// (iOS Safari et Chrome Android la supportent tous les deux pour un PDF —
// elle délègue au sélecteur natif du téléphone, contourne à la fois 1 et
// 2) ; sinon, sur Safari spécifiquement, une fenêtre ouverte AVANT tout
// await (donc pendant que l'activation utilisateur est encore valide),
// repointée vers le PDF une fois prêt ; sinon (Chrome, Firefox...), le
// téléchargement direct déjà en place aujourd'hui, qui fonctionne très
// bien chez eux même après un await.
//
// 4. Régression ordinateur (Windows) : Chrome/Edge bureau ont commencé à
//    exposer navigator.canShare({ files }) à true, ce qui déclenchait à
//    tort la fenêtre « Partager » native de Windows au clic sur
//    « Télécharger en PDF » au lieu d'un téléchargement direct dans le
//    dossier de téléchargements — navigator.canShare ne dit rien, à lui
//    seul, sur le type d'appareil. Corrigé en réservant l'API Web Share
//    aux appareils réellement mobiles (estTelephoneOuTablette()
//    ci-dessous) ; un ordinateur, même équipé d'un écran tactile
//    secondaire, retombe désormais toujours sur la fenêtre réservée
//    (Safari) ou le téléchargement direct (Chrome, Edge, Firefox...),
//    jamais sur navigator.share.

const PAGE_MARGIN_MM = 16;
const PAGE_WIDTH_MM = 210;
const PAGE_HEIGHT_MM = 297;
const USABLE_WIDTH_MM = PAGE_WIDTH_MM - PAGE_MARGIN_MM * 2;
const USABLE_HEIGHT_MM = PAGE_HEIGHT_MM - PAGE_MARGIN_MM * 2;
// Largeur de rendu fixe (96 dpi, référence CSS standard), jamais déduite de
// la fenêtre du navigateur au moment de l'appel : html2canvas doit toujours
// mesurer le même nombre de pixels CSS pour cette largeur en mm, quelle que
// soit la taille réelle de la fenêtre (mobile ou bureau) — sinon la
// conversion pixels → mm plus bas (pxParMm) ne correspondrait plus à rien
// de fiable.
const CAPTURE_WIDTH_PX = Math.round((USABLE_WIDTH_MM * 96) / 25.4);
const SCALE = 2;

export { PAGE_WIDTH_MM, PAGE_HEIGHT_MM, USABLE_WIDTH_MM, USABLE_HEIGHT_MM };

function sliceCanvas(source, y, height) {
  const c = document.createElement("canvas");
  c.width = source.width;
  c.height = Math.max(1, Math.round(height));
  c.getContext("2d").drawImage(source, 0, y, source.width, height, 0, 0, source.width, height);
  return c;
}

// Capture l'élément fourni (déjà mis en page pour l'A4, voir
// .sb-receipt-print/.sb-stock-print/.sb-catalogue-print/.sb-tresorerie-print
// etc. dans globals.css) via html2canvas, puis le découpe en pages A4 —
// chaque page renvoyée est un <canvas> autonome, prêt aussi bien pour
// l'aperçu (affiché tel quel dans une <img>) que pour le PDF final
// (assemblerPdfDepuisPages ci-dessous) : une seule source de rendu pour
// les deux, jamais deux versions qui pourraient diverger.
//
// jsPDF propose une méthode de haut niveau, pdf.html(), qui fait ce travail
// elle-même (et déléguait déjà le rendu à html2canvas en interne) — jamais
// utilisée ici : testée avec Playwright (voir README.md), elle produit un
// PDF corrompu (pages blanches, "Restoring state when no valid states to
// pop" à la relecture) avec la version 4.2.1 de jsPDF utilisée par l'app.
// Piloter html2canvas nous-mêmes et composer les pages à la main évite ce
// bug.
export async function capturerPages(el, { stampElement, footerElement } = {}) {
  if (!el) return { pages: [], pxParMm: 1 };
  const { default: html2canvas } = await import("html2canvas");
  const canvas = await html2canvas(el, {
    scale: SCALE,
    useCORS: true,
    windowWidth: CAPTURE_WIDTH_PX,
  });
  const pxParMm = canvas.width / USABLE_WIDTH_MM;
  const pageHeightPx = USABLE_HEIGHT_MM * pxParMm;

  // Éléments qui ne doivent jamais être coupés entre deux pages (lignes du
  // tableau d'articles, carrés de cadeaux offerts, bloc client/livraison,
  // totaux... — voir le marqueur sb-pdf-no-split posé sur ces éléments dans
  // Receipt.js et les autres pages d'export). Coordonnées ramenées au
  // repère du canvas (origine = haut de l'élément capturé, échelle =
  // SCALE) pour être directement comparables aux découpes candidates
  // ci-dessous.
  const rootTop = el.getBoundingClientRect().top;
  const zonesProtegees = Array.from(el.querySelectorAll(".sb-pdf-no-split")).map((node) => {
    const r = node.getBoundingClientRect();
    return { haut: (r.top - rootTop) * SCALE, bas: (r.bottom - rootTop) * SCALE };
  });

  // Si la découpe envisagée tombe en plein milieu d'une zone protégée, elle
  // recule juste avant cette zone — jamais en avant (qui risquerait de
  // dépasser la hauteur de page disponible). Si une seule zone protégée est
  // à elle seule plus haute qu'une page entière, impossible de l'éviter :
  // la découpe reste telle quelle plutôt que de tourner en boucle sans
  // jamais avancer.
  function ajusterDecoupe(decoupeIdeale, hauteurDejaUtilisee) {
    if (decoupeIdeale >= canvas.height) return canvas.height;
    for (const zone of zonesProtegees) {
      if (decoupeIdeale > zone.haut && decoupeIdeale < zone.bas) {
        return zone.haut > hauteurDejaUtilisee ? zone.haut : decoupeIdeale;
      }
    }
    return decoupeIdeale;
  }

  // En-tête de tableau à répéter en haut de chaque page suivante (ex. la
  // fiche/le rapport d'inventaire) — marqué .sb-pdf-repeat-header sur
  // l'élément concerné (typiquement un <thead>). Pur ajout de capacité :
  // un document sans ce marqueur se comporte exactement comme avant
  // (headerCanvas reste null).
  const headerEl = el.querySelector(".sb-pdf-repeat-header");
  let headerCanvas = null;
  let headerHeightPx = 0;
  if (headerEl) {
    const headerRect = headerEl.getBoundingClientRect();
    headerHeightPx = headerRect.height * SCALE;
    const headerTop = (headerRect.top - rootTop) * SCALE;
    headerCanvas = sliceCanvas(canvas, headerTop, headerHeightPx);
  }

  const pages = [];
  let y = 0;
  let pageIndex = 0;
  while (y < canvas.height) {
    const budgetPx = pageIndex === 0 ? pageHeightPx : pageHeightPx - headerHeightPx;
    const decoupe = ajusterDecoupe(Math.min(y + budgetPx, canvas.height), y);
    const hauteurTranche = decoupe - y;
    const tranche = sliceCanvas(canvas, y, hauteurTranche);
    if (pageIndex > 0 && headerCanvas) {
      const pageCanvas = document.createElement("canvas");
      pageCanvas.width = canvas.width;
      pageCanvas.height = headerHeightPx + hauteurTranche;
      const ctx = pageCanvas.getContext("2d");
      ctx.drawImage(headerCanvas, 0, 0);
      ctx.drawImage(tranche, 0, headerHeightPx);
      pages.push(pageCanvas);
    } else {
      pages.push(tranche);
    }
    y = decoupe;
    pageIndex++;
  }
  if (pages.length === 0) pages.push(sliceCanvas(canvas, 0, 1));

  // Tampon « Confirmée » + pied de page « Propulsé par Doka » (confirmation
  // de commande) : capturés séparément (jamais inclus dans `el`, voir
  // Receipt.js, qui masque ses propres versions nichées pendant cette
  // capture) et composés directement dans le bon canvas de page ci-dessous,
  // dans cet ordre précis — tampon puis pied de page, qui reste ainsi
  // toujours le tout dernier élément du document. Ni superposé à du
  // contenu, ni coupé par un saut de page, avec un rendu strictement
  // identique entre aperçu et PDF final puisque c'est le même canvas qui
  // sert aux deux.
  if (stampElement && footerElement) {
    await composerTamponEtPiedDePage(pages, stampElement, footerElement, pageHeightPx);
  }

  return { pages, pxParMm };
}

// Un canvas nouvellement créé (document.createElement("canvas")) est
// transparent par défaut (rgba(0,0,0,0) partout) ; stampCanvas/footerCanvas
// sont eux-mêmes capturés avec backgroundColor: null (transparents hors de
// leur contenu réel, pour se composer proprement par-dessus n'importe quel
// fond). Cette transparence ne pose aucun problème à l'écran (l'aperçu
// insère directement le <canvas> dans .sb-print-preview-page, qui a son
// propre fond blanc opaque en CSS — la zone transparente se fond
// naturellement avec lui) mais devient un bandeau NOIR une fois le canvas
// composé encodé en JPEG dans assemblerPdfDepuisPages plus bas (le JPEG n'a
// pas de canal alpha ; un navigateur qui aplatit un canvas semi-transparent
// vers ce format le fait sur un fond noir, jamais blanc) — cause exacte du
// tampon apparaissant sur un bandeau noir dans le PDF téléchargé/ouvert sur
// téléphone, jamais visible dans l'aperçu. D'où ce remplissage explicite en
// blanc (couleur du papier, voir .sb-receipt-print dans globals.css) avant
// tout drawImage sur CHAQUE canvas nouvellement créé ci-dessous : aucune
// zone ne reste jamais transparente une fois ce document rendu en JPEG.
function remplirFondBlanc(ctx, largeur, hauteur) {
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, largeur, hauteur);
}

async function composerTamponEtPiedDePage(pages, stampElement, footerElement, pageHeightPx) {
  const { default: html2canvas } = await import("html2canvas");
  const options = { scale: SCALE, useCORS: true, windowWidth: CAPTURE_WIDTH_PX, backgroundColor: null };
  const stampCanvas = await html2canvas(stampElement, options);
  const footerCanvas = await html2canvas(footerElement, options);
  const hauteurBloc = stampCanvas.height + footerCanvas.height;
  const lastIndex = pages.length - 1;
  const lastPage = pages[lastIndex];
  const freeSpace = pageHeightPx - lastPage.height;

  function dessinerBloc(ctx, y) {
    ctx.drawImage(stampCanvas, 0, y);
    ctx.drawImage(footerCanvas, 0, y + stampCanvas.height);
  }

  if (freeSpace >= hauteurBloc) {
    // Assez de place libre sous le contenu de la dernière page (totaux,
    // cadeaux offerts éventuels) : la page s'agrandit pour inclure le
    // tampon puis le pied de page juste en-dessous, jamais superposés.
    const merged = document.createElement("canvas");
    merged.width = lastPage.width;
    merged.height = lastPage.height + hauteurBloc;
    const ctx = merged.getContext("2d");
    remplirFondBlanc(ctx, merged.width, merged.height);
    ctx.drawImage(lastPage, 0, 0);
    dessinerBloc(ctx, lastPage.height);
    pages[lastIndex] = merged;
  } else if (pageHeightPx >= hauteurBloc) {
    // Pas assez de place : une nouvelle page plutôt qu'un chevauchement.
    const page = document.createElement("canvas");
    page.width = lastPage.width;
    page.height = hauteurBloc;
    const ctx = page.getContext("2d");
    remplirFondBlanc(ctx, page.width, page.height);
    dessinerBloc(ctx, 0);
    pages.push(page);
  } else {
    // Repli (jamais atteint en pratique, le tampon et le pied de page
    // tiennent largement ensemble dans une page entière) : réduit le bloc
    // pour qu'il tienne sur sa propre page.
    const echelle = pageHeightPx / hauteurBloc;
    const page = document.createElement("canvas");
    page.width = lastPage.width;
    page.height = pageHeightPx;
    const ctx = page.getContext("2d");
    remplirFondBlanc(ctx, page.width, page.height);
    ctx.drawImage(stampCanvas, 0, 0, stampCanvas.width * echelle, stampCanvas.height * echelle);
    ctx.drawImage(footerCanvas, 0, stampCanvas.height * echelle, footerCanvas.width * echelle, footerCanvas.height * echelle);
    pages.push(page);
  }
}

// Assemble des pages déjà capturées (capturerPages) en un seul PDF —
// jamais de nouvelle capture ici : l'aperçu et le PDF téléchargé
// proviennent donc exactement des mêmes images.
export async function assemblerPdfDepuisPages(pages, pxParMm) {
  const { default: jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ unit: "mm", format: "a4" });
  pages.forEach((page, i) => {
    if (i > 0) pdf.addPage();
    pdf.addImage(page.toDataURL("image/jpeg", 0.92), "JPEG", PAGE_MARGIN_MM, PAGE_MARGIN_MM, USABLE_WIDTH_MM, page.height / pxParMm);
  });
  return pdf.output("blob");
}

// Téléphone/tablette uniquement : écran tactile principal (pointer:
// coarse — faux sur un ordinateur, même équipé d'un écran tactile
// secondaire, puisque c'est le pointeur PRINCIPAL qui est mesuré) ou
// agent utilisateur mobile explicite. Les deux signaux combinés (OU)
// plutôt qu'un seul : un iPad en UA « bureau » (iPadOS récent, par
// défaut) échapperait à la détection par user-agent seule, mais reste
// correctement détecté via pointer: coarse.
function estTelephoneOuTablette() {
  if (typeof navigator === "undefined") return false;
  const pointeurGrossier = typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(pointer: coarse)").matches;
  const uaMobile = /android|iphone|ipad|ipod|mobi/i.test(navigator.userAgent);
  return pointeurGrossier || uaMobile;
}

// Un Blob vide suffit à tester le support réel (type + capacité à
// partager un fichier), sans attendre d'avoir généré le PDF. Réservé aux
// téléphones/tablettes (voir le point 4 plus haut) : un ordinateur ne
// doit jamais passer par l'API Web Share, même quand le navigateur
// l'expose.
function peutPartagerFichier() {
  try {
    return (
      estTelephoneOuTablette() &&
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

// Point d'entrée pour un téléchargement/partage à partir de pages DÉJÀ
// capturées (voir components/PrintPreviewModal.js, qui capture une fois
// pour l'aperçu puis réutilise ces mêmes pages ici plutôt que de refaire
// toute la capture html2canvas) — point d'entrée PDF unique de l'app,
// utilisé par tous les documents imprimables de Doka via l'aperçu commun.
// Fenêtre ouverte avant tout await quand c'est nécessaire (Safari, voir le
// point 2 plus haut) : le clic qui a ouvert l'aperçu ne compte plus comme
// activation utilisateur ici, mais celui sur le bouton « Télécharger en
// PDF » de l'aperçu, lui, est direct — seule l'ouverture de fenêtre doit
// rester synchrone avec CE clic.
export async function telechargerPagesEnPdf({ pages, pxParMm, nomFichier }) {
  const partage = peutPartagerFichier();
  const fenetreReservee = !partage && estSafari() ? window.open("", "_blank") : null;
  try {
    const blob = await assemblerPdfDepuisPages(pages, pxParMm);
    if (!blob) {
      fenetreReservee?.close();
      return false;
    }
    if (partage) {
      try {
        const file = new File([blob], nomFichier, { type: "application/pdf" });
        await navigator.share({ files: [file] });
      } catch {
        // Partage annulé ou échoué (sélecteur fermé, application cible
        // indisponible...) : repli silencieux sur le téléchargement
        // direct plutôt que de remonter une erreur — la personne a quand
        // même cliqué sur « Télécharger en PDF », pas sur « Partager ».
        telechargerBlobDirect(blob, nomFichier);
      }
    } else if (fenetreReservee) {
      fenetreReservee.location.href = URL.createObjectURL(blob);
    } else {
      telechargerBlobDirect(blob, nomFichier);
    }
    return true;
  } catch (err) {
    fenetreReservee?.close();
    throw err;
  }
}
