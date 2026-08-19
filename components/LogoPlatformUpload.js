"use client";

import { useRef, useState } from "react";
import { Image as ImageIcon, Upload, X } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";

const BUCKET = "article-photos";
const MAX_SIZE_MB = 5;
// Tailles carrées à pré-générer pour l'icône d'écran d'accueil (PWA) :
// 192/512 pour le manifest, 180 pour l'icône Apple.
const ICON_SIZES = [
  { key: "icon_192_url", size: 192 },
  { key: "icon_512_url", size: 512 },
  { key: "icon_apple_180_url", size: 180 },
];

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Image illisible"));
    img.src = URL.createObjectURL(file);
  });
}

// Rend transparent le fond blanc d'un logo (plutôt qu'un fond blanc carré
// visible une fois posé sur un fond sombre — site vitrine, futur mode
// sombre général). Un simple CSS mix-blend-mode: multiply ferait
// disparaître le blanc mais écraserait aussi les couleurs de marque vers
// le noir sur un fond sombre (multiply(couleur, fond_sombre) ≈ fond_sombre
// pour toute couleur non blanche) — le traitement doit donc se faire au
// niveau des pixels, une seule fois, à l'envoi.
// minC (canal le plus faible) proche de 255 = pixel quasi blanc → transparent ;
// une bande de transition entre les deux seuils adoucit les bords
// anti-aliasés du logo plutôt qu'une découpe nette et dentelée.
const WHITE_LOW = 225;
const WHITE_HIGH = 250;

function whitenessToAlpha(r, g, b) {
  const minC = Math.min(r, g, b);
  if (minC <= WHITE_LOW) return 255;
  if (minC >= WHITE_HIGH) return 0;
  const t = (minC - WHITE_LOW) / (WHITE_HIGH - WHITE_LOW);
  return Math.round(255 * (1 - t));
}

function removeWhiteBackground(img) {
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
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("toBlob a échoué"))), "image/png");
  });
}

// Découpe centrée au carré (cover) puis redimensionne — un logo carré n'a
// pas de bandes vides, contrairement à un simple redimensionnement "contain".
function resizeToSquarePng(img, size) {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    const side = Math.min(img.naturalWidth, img.naturalHeight);
    const sx = (img.naturalWidth - side) / 2;
    const sy = (img.naturalHeight - side) / 2;
    ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size);
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("toBlob a échoué"))), "image/png");
  });
}

// Widget dédié au logo de la plateforme Doka (espace Administration) :
// contrairement à ImageUploadField (une image → une URL), un seul fichier
// choisi déclenche ici l'envoi du logo original ET la génération/upload de
// 3 icônes carrées, retournées ensemble via onChange. Le redimensionnement
// se fait depuis le File local (URL.createObjectURL, même origine) plutôt
// que depuis l'URL déjà hébergée, pour ne jamais dépendre des en-têtes
// CORS du bucket Storage lors du dessin sur canvas.
export default function LogoPlatformUpload({ label, businessId, value, onChange }) {
  const fileInputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [previewUrl, setPreviewUrl] = useState(value || "");
  const [lastValue, setLastValue] = useState(value || "");

  if (value !== lastValue) {
    setLastValue(value || "");
    setPreviewUrl(value || "");
  }

  async function uploadFile(file) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Le fichier doit être une image.");
      return;
    }
    if (file.size > MAX_SIZE_MB * 1024 * 1024) {
      setError(`Image trop lourde (max ${MAX_SIZE_MB} Mo).`);
      return;
    }

    setError("");
    setUploading(true);
    const localPreview = URL.createObjectURL(file);
    setPreviewUrl(localPreview);

    try {
      const uid = crypto.randomUUID();
      const img = await loadImage(file);

      // Le logo original est envoyé avec son fond blanc rendu transparent
      // (voir removeWhiteBackground ci-dessus) — les icônes carrées
      // ci-dessous, elles, restent générées depuis le fichier opaque
      // d'origine : une icône d'écran d'accueil transparente s'affiche avec
      // un fond noir sur iOS, ce n'est donc pas souhaitable là.
      let logoBlob;
      try {
        logoBlob = await removeWhiteBackground(img);
      } catch (err) {
        console.error("Suppression du fond blanc impossible, envoi du fichier original :", err);
        logoBlob = file;
      }
      const logoExt = logoBlob === file ? (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg" : "png";
      const basePath = `${businessId}/smartbiz-logo/${uid}.${logoExt}`;
      const { error: uploadError } = await supabase.storage.from(BUCKET).upload(basePath, logoBlob, {
        cacheControl: "3600",
        upsert: false,
        contentType: logoBlob === file ? file.type : "image/png",
      });
      if (uploadError) throw uploadError;
      const logoUrl = supabase.storage.from(BUCKET).getPublicUrl(basePath).data.publicUrl;

      const urls = { logo_url: logoUrl };
      for (const { key, size } of ICON_SIZES) {
        const blob = await resizeToSquarePng(img, size);
        const iconPath = `${businessId}/smartbiz-logo/icon-${size}-${uid}.png`;
        const { error: iconError } = await supabase.storage.from(BUCKET).upload(iconPath, blob, {
          cacheControl: "3600",
          upsert: false,
          contentType: "image/png",
        });
        if (iconError) throw iconError;
        urls[key] = supabase.storage.from(BUCKET).getPublicUrl(iconPath).data.publicUrl;
      }

      onChange(urls);
    } catch (err) {
      console.error("Erreur d'upload du logo Doka :", err);
      const notFound = /bucket.*not.*found/i.test(err?.message || "");
      setError(
        notFound
          ? `Le bucket "${BUCKET}" n'existe pas encore sur ce projet Supabase — exécute supabase-storage-setup.sql dans l'éditeur SQL.`
          : "Échec de l'envoi du logo. Réessaie."
      );
      setPreviewUrl(value || "");
    } finally {
      setUploading(false);
    }
  }

  function handleFileChange(e) {
    const file = e.target.files?.[0];
    uploadFile(file);
    e.target.value = "";
  }

  function handlePaste(e) {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (item.type.startsWith("image/")) {
        e.preventDefault();
        uploadFile(item.getAsFile());
        break;
      }
    }
  }

  function handleRemove() {
    setPreviewUrl("");
    setError("");
    onChange({ logo_url: "", icon_192_url: "", icon_512_url: "", icon_apple_180_url: "" });
  }

  return (
    <div className="sb-field">
      {label && <label>{label}</label>}
      <div className="sb-image-upload" onPaste={handlePaste} tabIndex={0}>
        {previewUrl ? (
          <div className="sb-image-upload-preview">
            <img src={previewUrl} alt="Aperçu" />
          </div>
        ) : (
          <div className="sb-image-upload-placeholder">
            <ImageIcon size={18} />
          </div>
        )}
        <div className="sb-image-upload-actions">
          <button
            type="button"
            className="sb-btn sb-btn-ghost"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
          >
            <Upload size={13} /> {uploading ? "Envoi…" : previewUrl ? "Changer" : "Choisir une image"}
          </button>
          {previewUrl && !uploading && (
            <button type="button" className="sb-btn sb-btn-ghost" onClick={handleRemove}>
              <X size={13} /> Retirer
            </button>
          )}
          <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileChange} style={{ display: "none" }} />
        </div>
      </div>
      <p style={{ fontSize: 11, color: "var(--text-faint)", margin: 0 }}>
        Clique dans la zone puis colle une image (Ctrl+V), ou choisis un fichier — idéalement carrée.
      </p>
      {error && <p style={{ fontSize: 11, color: "var(--coral)", margin: 0 }}>{error}</p>}
    </div>
  );
}
