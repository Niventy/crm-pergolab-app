import { AppNav } from "@/components/app-nav";
import { GlobalSearch } from "@/components/global-search";
import { createClient } from "@/lib/supabase/server";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <AppNav email={user?.email ?? null} />
      {children}
      <GlobalSearch />
    </div>
  );
}
