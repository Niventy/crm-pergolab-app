"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, X, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { creerProspect } from "@/app/(app)/leads/creer-actions";

type Profil = { id: string; nom: string | null; email: string };

const champInput =
  "h-9 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

export function NouveauProspect({
  profiles,
  currentUserId,
}: {
  profiles: Profil[];
  currentUserId?: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();

  const [nom, setNom] = useState("");
  const [telephone, setTelephone] = useState("");
  const [email, setEmail] = useState("");
  const [entreprise, setEntreprise] = useState("");
  const [codePostal, setCodePostal] = useState("");
  const [ville, setVille] = useState("");
  const [typeProjet, setTypeProjet] = useState(""); // = dimensions saisies (cf. label)
  const [montant, setMontant] = useState("");
  const [source, setSource] = useState("");
  const [assignedTo, setAssignedTo] = useState<string>(currentUserId ?? "");

  function reset() {
    setNom("");
    setTelephone("");
    setEmail("");
    setEntreprise("");
    setCodePostal("");
    setVille("");
    setTypeProjet("");
    setMontant("");
    setSource("");
    setAssignedTo(currentUserId ?? "");
  }

  function fermer() {
    if (pending) return;
    setOpen(false);
  }

  // Échap ferme la modale.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") fermer();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, pending]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!nom.trim()) {
      toast.error("Le nom est obligatoire.");
      return;
    }
    start(async () => {
      const r = await creerProspect({
        nom,
        telephone,
        email,
        entreprise,
        codePostal,
        ville,
        dimensions: typeProjet,
        montant,
        source,
        assignedTo: assignedTo || null,
      });
      if (r.ok && r.leadId) {
        toast.success("Prospect créé");
        setOpen(false);
        reset();
        router.push(`/leads/${r.leadId}`);
      } else {
        toast.error(r.error ?? "Échec de la création");
      }
    });
  }

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <Plus className="size-4" /> Nouveau prospect
      </Button>

      {open ? (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:items-center"
          // onClick (pas onMouseDown) : sélectionner du texte et relâcher hors
          // du cadre ne fermait la modale et ne perdait plus la saisie.
          onClick={(e) => {
            if (e.target === e.currentTarget) fermer();
          }}
        >
          <div className="w-full max-w-lg rounded-2xl border border-border bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
              <h2 className="text-display text-lg">Nouveau prospect</h2>
              <button
                type="button"
                onClick={fermer}
                className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label="Fermer"
              >
                <X className="size-4" />
              </button>
            </div>

            <form onSubmit={submit} className="space-y-4 px-5 py-4">
              <div className="space-y-1.5">
                <Label htmlFor="np-nom">
                  Nom <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="np-nom"
                  value={nom}
                  onChange={(e) => setNom(e.target.value)}
                  placeholder="Nom du prospect"
                  autoFocus
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="np-tel">Téléphone</Label>
                  <Input
                    id="np-tel"
                    value={telephone}
                    onChange={(e) => setTelephone(e.target.value)}
                    placeholder="06 12 34 56 78"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="np-email">Email</Label>
                  <Input
                    id="np-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="client@email.fr"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="np-cp">Code postal</Label>
                  <Input
                    id="np-cp"
                    value={codePostal}
                    onChange={(e) => setCodePostal(e.target.value)}
                    placeholder="31000"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="np-ville">Ville</Label>
                  <Input
                    id="np-ville"
                    value={ville}
                    onChange={(e) => setVille(e.target.value)}
                    placeholder="Toulouse"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="np-type">Dimensions de la pergola</Label>
                  <Input
                    id="np-type"
                    value={typeProjet}
                    onChange={(e) => setTypeProjet(e.target.value)}
                    placeholder="ex. 4 x 3 m"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="np-montant">Montant estimé (€)</Label>
                  <Input
                    id="np-montant"
                    inputMode="decimal"
                    value={montant}
                    onChange={(e) => setMontant(e.target.value)}
                    placeholder="12000"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="np-source">Source</Label>
                  <Input
                    id="np-source"
                    value={source}
                    onChange={(e) => setSource(e.target.value)}
                    placeholder="Recommandation, salon…"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="np-resp">Responsable</Label>
                  <select
                    id="np-resp"
                    value={assignedTo}
                    onChange={(e) => setAssignedTo(e.target.value)}
                    className={champInput}
                  >
                    <option value="">Non assigné</option>
                    {profiles.map((p) => (
                      <option key={p.id} value={p.id}>
                        {(p.nom ?? p.email) +
                          (p.id === currentUserId ? " (moi)" : "")}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={fermer}
                  disabled={pending}
                >
                  Annuler
                </Button>
                <Button type="submit" size="sm" disabled={pending}>
                  {pending ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Plus className="size-4" />
                  )}
                  Créer le prospect
                </Button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
