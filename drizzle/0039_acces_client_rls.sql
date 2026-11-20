-- Espace client : la table des liens magiques porte des JETONS D'ACCÈS. RLS
-- activée SANS AUCUNE politique : ni anon ni authenticated ne la lisent via
-- l'API REST. Seule l'app (Drizzle, connexion directe) y accède.
alter table public.acces_client enable row level security;
