-- 1) Date de passage en K.O (leads.perdu_at) tenue par un TRIGGER : posée quand
--    le statut DEVIENT « perdue », effacée quand il le quitte (réactivation),
--    quel que soit le chemin d'écriture (Kanban, fiche, « Tout modifier »…).
CREATE OR REPLACE FUNCTION public.leads_perdu_at() RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.statut = 'perdue' THEN
    IF TG_OP = 'INSERT' OR OLD.statut IS DISTINCT FROM 'perdue' THEN
      NEW.perdu_at := now();
    END IF;
  ELSE
    NEW.perdu_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint
DROP TRIGGER IF EXISTS leads_perdu_at ON public.leads;--> statement-breakpoint
CREATE TRIGGER leads_perdu_at
  BEFORE INSERT OR UPDATE OF statut ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.leads_perdu_at();--> statement-breakpoint

-- Rattrapage : dernier changement d'étape journalisé, sinon dernière modification.
UPDATE public.leads l
SET perdu_at = COALESCE(
  (SELECT max(e.date) FROM public.echanges e WHERE e.lead_id = l.id AND e.type = 'etape'),
  l.updated_at,
  l.created_at
)
WHERE l.statut = 'perdue' AND l.perdu_at IS NULL;--> statement-breakpoint

-- 2) Nouvelle étape de prospection « Projet à venir » (cycle 1), avant les K.O.
UPDATE public.stages SET position = position + 1
WHERE position >= 6 AND NOT EXISTS (SELECT 1 FROM public.stages WHERE code = 'projet_a_venir');--> statement-breakpoint
INSERT INTO public.stages (nom, code, position, couleur, cycle, is_gagnee, is_perdue)
SELECT 'Projet à venir', 'projet_a_venir', 6, '#84cc16', 1, false, false
WHERE NOT EXISTS (SELECT 1 FROM public.stages WHERE code = 'projet_a_venir');
