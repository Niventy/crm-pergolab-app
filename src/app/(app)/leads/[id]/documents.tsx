"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Upload,
  FileText,
  FileImage,
  File as FileIcon,
  ExternalLink,
  Camera,
  Trash2,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { tempsRelatif } from "@/lib/format";
import { ouvrirDans } from "@/lib/ouvrir-dans";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { PARTAGES } from "@/lib/chantier-validation";
import { cn } from "@/lib/utils";
import { reduireImage } from "@/lib/reduire-image";
import {
  uploadDocument,
  getDocumentUrl,
  deleteDocument,
  setPartageDocument,
} from "./documents-actions";

export type DocItem = {
  id: string;
  nom: string;
  mime: string | null;
  taille: number | null;
  createdAt: Date | string;
  auteur: string | null;
  partage: string;
  categorie: string | null;
};

const PARTAGE_CLS: Record<string, string> = {
  interne: "border-border text-muted-foreground",
  client: "border-sky-300 bg-sky-50 text-sky-800",
  a_valider: "border-amber-300 bg-amber-50 text-amber-800",
};

function formatTaille(o: number | null): string {
  if (!o) return "";
  if (o < 1024) return `${o} o`;
  if (o < 1024 * 1024) return `${Math.round(o / 1024)} Ko`;
  return `${(o / (1024 * 1024)).toFixed(1)} Mo`;
}

function IconeType({ mime }: { mime: string | null }) {
  if (mime?.startsWith("image/"))
    return <FileImage className="size-4 text-violet-600" />;
  if (mime === "application/pdf")
    return <FileText className="size-4 text-red-600" />;
  return <FileIcon className="size-4 text-muted-foreground" />;
}

export function Documents({
  leadId,
  docs,
  partageClient = false,
  photosVisite = false,
}: {
  leadId: string;
  docs: DocItem[];
  /** Fiche client : choix du partage avec l'espace client. */
  partageClient?: boolean;
  /** Fiche client : bouton « Photos de la visite technique » (galerie de l'espace client). */
  photosVisite?: boolean;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const photosRef = useRef<HTMLInputElement>(null);
  const [pending, start] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [aSupprimer, setASupprimer] = useState<DocItem | null>(null);

  function onFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    start(async () => {
      for (const file of Array.from(files)) {
        const fd = new FormData();
        fd.append("file", file);
        const r = await uploadDocument(leadId, fd);
        if (r.ok) toast.success(`« ${file.name} » ajouté`);
        else toast.error(r.error ?? "Échec de l'envoi");
      }
      if (inputRef.current) inputRef.current.value = "";
      router.refresh();
    });
  }

  // Photos de la visite technique : réduites dans le navigateur, partagées client.
  function onPhotos(files: FileList | null) {
    if (!files || files.length === 0) return;
    start(async () => {
      let ok = 0;
      for (const file of Array.from(files)) {
        try {
          const blob = await reduireImage(file);
          const fd = new FormData();
          fd.append("file", new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", { type: blob.type || "image/jpeg" }));
          fd.append("categorie", "visite_technique");
          const r = await uploadDocument(leadId, fd);
          if (r.ok) ok++;
          else toast.error(r.error ?? `Échec : ${file.name}`);
        } catch {
          toast.error(`« ${file.name} » illisible (essaie en JPG)`);
        }
      }
      if (ok) toast.success(`${ok} photo${ok > 1 ? "s" : ""} de visite ajoutée${ok > 1 ? "s" : ""} (visible${ok > 1 ? "s" : ""} par le client)`);
      if (photosRef.current) photosRef.current.value = "";
      router.refresh();
    });
  }

  function ouvrir(id: string) {
    setBusyId(id);
    ouvrirDans(() => getDocumentUrl(id), () => setBusyId(null));
  }

  function partager(id: string, partage: string) {
    setBusyId(id);
    setPartageDocument(id, partage).then((r) => {
      setBusyId(null);
      if (r.ok) router.refresh();
      else toast.error(r.error ?? "Échec");
    });
  }

  function supprimer() {
    const d = aSupprimer;
    if (!d) return;
    setBusyId(d.id);
    deleteDocument(d.id).then((r) => {
      setBusyId(null);
      setASupprimer(null);
      if (r.ok) {
        toast.success("Document supprimé");
        router.refresh();
      } else toast.error(r.error ?? "Échec");
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          Factures, plans, PV de réception, photos… (max 25 Mo par fichier)
        </p>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={pending}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {pending ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
          Ajouter un document
        </button>
        {photosVisite ? (
          <>
            <button
              type="button"
              onClick={() => photosRef.current?.click()}
              disabled={pending}
              title="Photos prises lors de la visite technique : affichées dans l'espace client"
              className="inline-flex items-center gap-1.5 rounded-md border border-primary px-3 py-1.5 text-sm font-semibold text-primary hover:bg-primary/5 disabled:opacity-50"
            >
              <Camera className="size-4" /> Photos visite technique
            </button>
            <input ref={photosRef} type="file" accept="image/*" multiple hidden onChange={(e) => onPhotos(e.target.files)} />
          </>
        ) : null}
        <input
          ref={inputRef}
          type="file"
          multiple
          hidden
          onChange={(e) => onFiles(e.target.files)}
        />
      </div>

      {docs.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
          Aucun document. Ajoute des factures, plans ou photos du chantier.
        </p>
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {docs.map((d) => (
            <li key={d.id} className="flex items-center gap-3 px-3 py-2">
              <IconeType mime={d.mime} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-foreground">
                  {d.nom}
                  {d.categorie === "visite_technique" ? (
                    <span className="ml-1.5 rounded bg-violet-100 px-1.5 py-0.5 text-[10px] font-semibold text-violet-800">
                      Visite technique
                    </span>
                  ) : null}
                </div>
                <div className="text-xs text-muted-foreground">
                  {[
                    formatTaille(d.taille),
                    tempsRelatif(d.createdAt),
                    d.auteur,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </div>
              </div>
              {partageClient ? (
                <select
                  value={d.partage}
                  onChange={(e) => partager(d.id, e.target.value)}
                  disabled={busyId === d.id}
                  aria-label="Partage avec l'espace client"
                  title="Partage avec l'espace client"
                  className={cn(
                    "rounded-md border px-1.5 py-1 text-xs font-medium outline-none",
                    PARTAGE_CLS[d.partage] ?? PARTAGE_CLS.interne,
                  )}
                >
                  {PARTAGES.map((p) => (
                    <option key={p.value} value={p.value}>
                      {p.label}
                    </option>
                  ))}
                </select>
              ) : null}
              <button
                type="button"
                onClick={() => ouvrir(d.id)}
                disabled={busyId === d.id}
                className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-primary hover:bg-primary/5 disabled:opacity-50"
              >
                {busyId === d.id ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <ExternalLink className="size-3.5" />
                )}
                Ouvrir
              </button>
              <button
                type="button"
                onClick={() => setASupprimer(d)}
                disabled={busyId === d.id}
                className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                aria-label="Supprimer"
              >
                <Trash2 className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={aSupprimer !== null}
        titre={`Supprimer « ${aSupprimer?.nom ?? ""} » ?`}
        description="Le fichier est effacé du stockage. Cette action est irréversible."
        confirmLabel="Supprimer"
        danger
        pending={busyId !== null && busyId === aSupprimer?.id}
        onConfirm={supprimer}
        onCancel={() => setASupprimer(null)}
      />
    </div>
  );
}
