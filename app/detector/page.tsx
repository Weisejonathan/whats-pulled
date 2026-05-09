import { SiteHeader } from "@/app/site-header";
import { DetectorClient } from "./detector-client";

export const dynamic = "force-dynamic";

export default function DetectorPage() {
  return (
    <main className="page-shell detector-page">
      <SiteHeader
        links={[
          { href: "/studio", label: "OBS Studio" },
          { href: "/detector", label: "Detector App" },
          { href: "/overlay/demo", label: "Demo Overlay" },
        ]}
      />
      <DetectorClient />
    </main>
  );
}
