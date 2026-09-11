import { SiteHeader } from "@/app/site-header";
import { DetectorWorkspace } from "./detector-workspace";
import { requireAdminSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function DetectorPage() {
  await requireAdminSession("/detector");
  return (
    <main className="page-shell detector-page">
      <SiteHeader
        links={[
          { href: "/studio", label: "OBS Studio" },
          { href: "/detector", label: "Detector App" },
          { href: "/overlay/demo", label: "Demo Overlay" },
        ]}
      />
      <DetectorWorkspace mode="camera" />
    </main>
  );
}
