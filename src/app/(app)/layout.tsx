import { AppNav } from "@/components/app-nav";
import { GlobalSearch } from "@/components/global-search";
import { createClient } from "@/lib/supabase/server";
import { currentProfile } from "@/lib/current-user";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const [{ data: { user } }, profil] = await Promise.all([
    supabase.auth.getUser(),
    currentProfile(),
  ]);

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <AppNav email={user?.email ?? null} role={profil?.role} />
      {children}
      <GlobalSearch />
    </div>
  );
}
