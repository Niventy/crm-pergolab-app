"use client";

import { useState, useTransition } from "react";
import { Mail } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { sendLeadEmail } from "./email-actions";

export function EmailCompose({
  leadId,
  nom,
  email,
  configured,
  connectedEmail,
  senderFrom,
}: {
  leadId: string;
  nom: string;
  email: string | null;
  configured: boolean;
  connectedEmail?: string | null;
  senderFrom?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [to, setTo] = useState(email ?? "");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [pending, startTransition] = useTransition();

  const prenom = nom.split(/\s+/)[0];

  const TEMPLATES: Record<string, { label: string; subject: string; body: string }> = {
    relance: {
      label: "Relance",
      subject: "Votre projet de pergola — Pergolab",
      body: `Bonjour ${prenom},\n\nJe me permets de revenir vers vous au sujet de votre projet de pergola. Avez-vous pu avancer dans votre réflexion ?\n\nJe reste à votre disposition pour en discuter.\n\nBien à vous,`,
    },
    devis: {
      label: "Envoi de devis",
      subject: "Votre devis Pergolab",
      body: `Bonjour ${prenom},\n\nComme convenu, je vous transmets votre devis pour votre projet de pergola. N'hésitez pas si vous avez la moindre question.\n\nBien à vous,`,
    },
    contact: {
      label: "Prise de contact",
      subject: "Pergolab — votre demande",
      body: `Bonjour ${prenom},\n\nSuite à votre demande, je souhaitais faire le point sur votre projet. Quand seriez-vous disponible pour un court échange téléphonique ?\n\nBien à vous,`,
    },
  };

  function applyTemplate(key: string) {
    const t = TEMPLATES[key];
    if (!t) return;
    setSubject(t.subject);
    setBody(t.body);
  }

  function send() {
    startTransition(async () => {
      const res = await sendLeadEmail(leadId, { to, subject, body });
      if (res.ok) {
        toast.success("Email envoyé");
        setOpen(false);
        setSubject("");
        setBody("");
      } else {
        toast.error(res.error ?? "Échec de l'envoi");
      }
    });
  }

  if (!configured) {
    return (
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Mail className="size-3.5" />
        Envoi d&apos;email à configurer (OAuth Google : <code>GOOGLE_CLIENT_ID</code>,{" "}
        <code>GOOGLE_CLIENT_SECRET</code> et un expéditeur pour ton adresse, cf. .env.example).
      </p>
    );
  }

  if (!open) {
    return (
      <div className="space-y-1.5">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setOpen(true)}
        >
          <Mail className="size-3.5" /> Envoyer un email
        </Button>
        {senderFrom ? (
          <p className="text-[11px] text-muted-foreground">
            Connecté : <span className="font-medium">{connectedEmail}</span> →
            envoi depuis <span className="font-medium text-primary">{senderFrom}</span>
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-lg border border-border bg-muted/30 p-3">
      <div className="flex flex-wrap gap-1.5">
        <span className="self-center text-xs text-muted-foreground">Modèle :</span>
        {Object.entries(TEMPLATES).map(([key, t]) => (
          <button
            key={key}
            type="button"
            onClick={() => applyTemplate(key)}
            className="rounded-full border border-border bg-white px-2.5 py-1 text-xs font-medium hover:border-primary/40 hover:bg-primary/5"
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="space-y-1.5">
        <Label>Destinataire</Label>
        <Input
          type="email"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          placeholder="email@exemple.fr"
        />
      </div>
      <div className="space-y-1.5">
        <Label>Objet</Label>
        <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
      </div>
      <div className="space-y-1.5">
        <Label>Message</Label>
        <Textarea
          rows={7}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Votre message…"
        />
      </div>

      <p className="text-[11px] text-muted-foreground">
        Envoi depuis <span className="font-medium text-primary">{senderFrom}</span>
        {connectedEmail ? ` · réponses → ${connectedEmail}` : ""}
      </p>

      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setOpen(false)}
          disabled={pending}
        >
          Annuler
        </Button>
        <Button type="button" size="sm" onClick={send} disabled={pending}>
          {pending ? "Envoi…" : "Envoyer"}
        </Button>
      </div>
    </div>
  );
}
