"use client";

import { useActionState, useEffect, useRef } from "react";
import { addNote, type NoteState } from "./actions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

const initial: NoteState = { error: null };

export function AddNoteForm({ leadId }: { leadId: string }) {
  const action = addNote.bind(null, leadId);
  const [state, formAction, pending] = useActionState(action, initial);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (!pending && !state.error) formRef.current?.reset();
  }, [pending, state]);

  return (
    <form ref={formRef} action={formAction} className="space-y-2">
      <Textarea
        name="contenu"
        placeholder="Ajouter une note…"
        rows={3}
        required
      />
      {state.error ? (
        <p className="text-sm text-red-600">{state.error}</p>
      ) : null}
      <div className="flex justify-end">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Enregistrement…" : "Ajouter la note"}
        </Button>
      </div>
    </form>
  );
}
