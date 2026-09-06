"use client";

import { toast } from "sonner";

// Ouvre une URL obtenue de façon ASYNCHRONE (PDF Pennylane, lien signé…) dans un
// onglet créé DANS le geste utilisateur — sinon le navigateur bloque la popup.
// Une seule implémentation (elle était copiée dans 4 composants).
export function ouvrirDans(
  getUrl: () => Promise<
    { ok?: boolean; url?: string | null; error?: string | null } | string
  >,
  onDone?: () => void,
) {
  const w = window.open("", "_blank");
  Promise.resolve(getUrl())
    .then((r) => {
      const url = typeof r === "string" ? r : r.url;
      if (url && w) w.location.href = url;
      else {
        if (w) w.close();
        toast.error((typeof r === "object" && r.error) || "Lien indisponible");
      }
    })
    .catch(() => {
      if (w) w.close();
      toast.error("Lien indisponible");
    })
    .finally(() => onDone?.());
}
