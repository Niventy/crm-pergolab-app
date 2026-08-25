import { db } from "@/db";
import { CommentairesFeed, type Commentaire } from "./feed";

export const dynamic = "force-dynamic";

// Vue globale : tous les commentaires laissés par l'équipe sur les fiches —
// conversation (notes) + activités commentées (échanges avec texte).
export default async function CommentairesPage() {
  const [echangesRows, notesRows, profiles] = await Promise.all([
    db.query.echanges.findMany({
      with: {
        lead: { columns: { id: true, nom: true } },
        auteur: { columns: { id: true, nom: true, email: true } },
      },
      orderBy: (e, { desc }) => [desc(e.date)],
      limit: 500,
    }),
    db.query.notes.findMany({
      with: {
        lead: { columns: { id: true, nom: true } },
        auteur: { columns: { id: true, nom: true, email: true } },
      },
      orderBy: (n, { desc }) => [desc(n.createdAt)],
      limit: 500,
    }),
    db.query.profiles.findMany({ orderBy: (p, { asc }) => [asc(p.nom)] }),
  ]);

  const items: Commentaire[] = [
    ...notesRows.map((n) => ({
      id: `n-${n.id}`,
      kind: "note" as const,
      type: "note",
      date: n.createdAt.toISOString(),
      contenu: n.contenu,
      auteurId: n.auteur?.id ?? null,
      auteurNom: n.auteur?.nom ?? n.auteur?.email ?? "—",
      leadId: n.lead?.id ?? "",
      leadNom: n.lead?.nom ?? "—",
    })),
    // Échanges : on ne garde que ceux qui portent un commentaire écrit.
    ...echangesRows
      .filter((e) => (e.contenu ?? "").trim())
      .map((e) => ({
        id: `e-${e.id}`,
        kind: "echange" as const,
        type: e.type,
        date: e.date.toISOString(),
        contenu: e.contenu ?? "",
        auteurId: e.auteur?.id ?? null,
        auteurNom: e.auteur?.nom ?? e.auteur?.email ?? "—",
        leadId: e.lead?.id ?? "",
        leadNom: e.lead?.nom ?? "—",
      })),
  ].sort((a, b) => b.date.localeCompare(a.date));

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 space-y-4 px-6 py-6">
      <div>
        <h1 className="text-display text-2xl">Commentaires</h1>
        <p className="text-sm text-muted-foreground">
          Tous les commentaires laissés par l&apos;équipe sur les fiches —
          conversation et activités. Filtre par personne, type ou mot-clé.
        </p>
      </div>
      <CommentairesFeed
        items={items}
        profiles={profiles.map((p) => ({
          id: p.id,
          nom: p.nom ?? p.email ?? "—",
        }))}
      />
    </main>
  );
}
