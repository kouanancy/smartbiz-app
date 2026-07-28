"use client";

import { useRef, useState } from "react";
import { Image as ImageIcon, Upload, X } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";

const BUCKET = "article-photos";
const MAX_SIZE_MB = 5;

export default function ImageUploadField({ label, businessId, value, onChange }) {
  const fileInputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [previewUrl, setPreviewUrl] = useState(value || "");
  const [lastValue, setLastValue] = useState(value || "");

  // Reste synchronisé quand le formulaire parent est réinitialisé (après
  // enregistrement) ou quand on ouvre la modale d'édition sur un autre article.
  // Ajustement pendant le rendu plutôt que dans un effet, comme recommandé
  // pour "réinitialiser un état quand une prop change" (évite un rendu
  // supplémentaire après coup).
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
      const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
      const path = `${businessId}/${crypto.randomUUID()}.${ext}`;
      const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, file, {
        cacheControl: "3600",
        upsert: false,
        contentType: file.type,
      });
      if (uploadError) throw uploadError;

      const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
      onChange(data.publicUrl);
    } catch (err) {
      console.error("Erreur d'upload d'image :", err);
      const notFound = /bucket.*not.*found/i.test(err?.message || "");
      setError(
        notFound
          ? `Le bucket "${BUCKET}" n'existe pas encore sur ce projet Supabase — exécute supabase-storage-setup.sql dans l'éditeur SQL.`
          : "Échec de l'envoi de l'image. Réessaie."
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
    onChange("");
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
      <p style={{ fontSize: 11, color: "#8A8682", margin: 0 }}>
        Clique dans la zone puis colle une image (Ctrl+V), ou choisis un fichier — facultatif.
      </p>
      {error && <p style={{ fontSize: 11, color: "#C24E37", margin: 0 }}>{error}</p>}
    </div>
  );
}
