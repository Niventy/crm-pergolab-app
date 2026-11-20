import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Routes accessibles sans authentification. Les routes API publiques sont listées
// UNE PAR UNE (chacune gère sa propre auth, ex. Bearer secret du webhook) : une
// nouvelle route /api/* est protégée par défaut tant qu'elle n'est pas ajoutée ici.
// `/espace/<jeton>` = espace client (lien magique) : chaque page / route y
// vérifie elle-même le jeton (`lib/espace-client.ts › resoudreJeton`).
const PUBLIC_PATHS = ["/login", "/auth", "/api/leads/inbound", "/espace"];

// Server actions qu'un visiteur NON connecté peut appeler. Une server action
// s'appelle par un POST (en-tête `next-action`) sur N'IMPORTE QUELLE route : sans
// ce filtre, une route publique (/espace…) servirait de porte d'entrée aux
// actions du CRM, qui supposent un utilisateur authentifié.
const ACTIONS_PUBLIQUES = ["/login"];

function isPublic(pathname: string) {
  return PUBLIC_PATHS.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
}

// Rafraîchit la session Supabase et protège les routes privées.
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // IMPORTANT : ne rien exécuter entre createServerClient et getUser().
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  if (
    !user &&
    request.headers.has("next-action") &&
    !ACTIONS_PUBLIQUES.includes(pathname)
  ) {
    return new NextResponse("Non autorisé", { status: 401 });
  }

  // Non authentifié sur une route privée -> redirection vers /login.
  if (!user && !isPublic(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // Authentifié sur /login -> redirection vers l'accueil.
  if (user && pathname === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
