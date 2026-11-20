import { NextResponse } from "next/server";
import { COOKIE_ESPACE } from "@/lib/supabase/middleware";

// Oublie le projet mémorisé sur cet appareil et revient à la page de connexion.
export async function GET(req: Request) {
  const res = NextResponse.redirect(new URL("/espace", req.url), 303);
  res.cookies.set(COOKIE_ESPACE, "", { path: "/espace", maxAge: 0 });
  return res;
}
