import { AppNav } from "@/components/app-nav";
import { GlobalSearch } from "@/components/global-search";
import { createClient } from "@/lib/supabase/server";
import { currentProfile } from "@/lib/current-user";
import { getMesNotifications } from "./notifications-actions";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const [{ data: { user } }, profil, notifs] = await Promise.all([
    supabase.auth.getUser(),
    currentProfile(),
    getMesNotifications(),
  ]);

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <AppNav email={user?.email ?? null} role={profil?.role} notifs={notifs} />
      {children}
      <GlobalSearch />
    </div>
  );
}
