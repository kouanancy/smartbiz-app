// Rend transparent le fond blanc d'une image, au niveau des pixels — pour
// un logo au fond blanc qui doit s'intégrer proprement sur n'importe quel
// fond (site vitrine à fond sombre, futur mode sombre général). Un simple
// CSS mix-blend-mode: multiply ferait disparaître le blanc mais écraserait
// aussi les couleurs de marque vers le noir sur un fond sombre
// (multiply(couleur, fond_sombre) ≈ fond_sombre pour toute couleur non
// blanche) — le traitement doit donc se faire ici, au niveau des pixels.
//
// minC (canal le plus faible) proche de 255 = pixel quasi blanc →
// transparent ; une bande de transition entre les deux seuils adoucit les
// bords anti-aliasés du logo plutôt qu'une découpe nette et dentelée.
const WHITE_LOW = 225;
const WHITE_HIGH = 250;

function whitenessToAlpha(r, g, b) {
  const minC = Math.min(r, g, b);
  if (minC <= WHITE_LOW) return 255;
  if (minC >= WHITE_HIGH) return 0;
  const t = (minC - WHITE_LOW) / (WHITE_HIGH - WHITE_LOW);
  return Math.round(255 * (1 - t));
}

// Utilisé à l'envoi (components/LogoPlatformUpload.js, toujours une image
// locale via URL.createObjectURL — jamais de souci CORS) et à l'affichage
// (components/PlatformLogo.js, image distante — getImageData peut échouer
// si le bucket ne renvoie pas d'en-tête CORS permissif ; l'appelant doit
// alors se replier sur l'image d'origine non traitée). Renvoie le canvas
// traité — au caller de choisir toBlob (upload) ou toDataURL (affichage).
export function removeWhiteBackgroundToCanvas(img) {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0);
    let imageData;
    try {
      imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    } catch (err) {
      reject(err);
      return;
    }
    const px = imageData.data;
    for (let i = 0; i < px.length; i += 4) {
      const alpha = whitenessToAlpha(px[i], px[i + 1], px[i + 2]);
      px[i + 3] = Math.min(px[i + 3], alpha);
    }
    ctx.putImageData(imageData, 0, 0);
    resolve(canvas);
  });
}
