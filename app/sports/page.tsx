import { SiteHeader } from "@/app/site-header";
import { getSportsOverview } from "@/lib/db/catalog";
import { SportsSearch } from "./sports-search";

export const dynamic = "force-dynamic";

export default async function SportsPage() {
  const sports = await getSportsOverview();

  return (
    <main className="page-shell">
      <SiteHeader links={[{ href: "/", label: "Home" }]} />

      <SportsSearch sports={sports} />
    </main>
  );
}
