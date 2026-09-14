-- Amorçage des options du configurateur (liste jusqu'ici codée en dur) +
-- RLS comme les autres tables de réglages (l'app passe par Drizzle ; la REST
-- anonyme est fermée). Insertion seule : une option déjà modifiée n'est pas écrasée.
INSERT INTO "options_configurateur" ("id", "label", "type", "prix", "forfait", "def_l", "def_h", "position", "actif")
VALUES
  ('zip', 'Store Motorisé', 'surface_forfait', 189, 255.5, 4.76, 2.33, 10, true),
  ('baie', 'Rideau Verre', 'surface', 413, NULL, 2.76, 2.33, 20, true),
  ('volet_fixe', 'Persienne fixe', 'surface', 420, NULL, 4.63, 2.33, 30, true),
  ('volet_coul', 'Persienne coulissante', 'surface', 476, NULL, 4.63, 2.33, 40, true),
  ('volet_pliant', 'Persienne pliante (bi-folding)', 'surface', 518, NULL, 4.63, 2.33, 50, true),
  ('mur_fixe', 'Mur alu fixe', 'surface', 333, NULL, 4.63, 2.33, 60, true),
  ('lames_motor', 'Lames alu motorisées', 'surface_forfait', 437.5, 595, 4.63, 2.33, 70, true),
  ('chauffage', 'Chauffage (1500 W)', 'unite', 875, NULL, NULL, NULL, 80, true),
  ('ventilo', 'Ventilateur (sans LED)', 'unite', 332, NULL, NULL, NULL, 90, true),
  ('ventilo_led', 'Ventilateur (avec LED)', 'unite', 420, NULL, NULL, NULL, 100, true),
  ('capteur', 'Capteur vent & pluie', 'unite', 175, NULL, NULL, NULL, 110, true),
  ('coffre', 'Coffre bois pour vitrage', 'unite', 230, NULL, NULL, NULL, 120, true)
ON CONFLICT ("id") DO NOTHING;--> statement-breakpoint
alter table public.options_configurateur enable row level security;--> statement-breakpoint
drop policy if exists "options_configurateur_all_authenticated" on public.options_configurateur;--> statement-breakpoint
create policy "options_configurateur_all_authenticated"
  on public.options_configurateur for all to authenticated using (true) with check (true);
