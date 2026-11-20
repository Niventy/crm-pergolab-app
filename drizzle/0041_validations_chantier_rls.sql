-- Validations de chantier (espace client) : RLS activée SANS politique, comme
-- acces_client — seule l'app (Drizzle, connexion directe) y accède.
alter table public.validations_chantier enable row level security;
