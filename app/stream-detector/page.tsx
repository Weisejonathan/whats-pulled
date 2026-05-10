import { SiteHeader } from "@/app/site-header";
import { StreamDetectorClient } from "./stream-detector-client";

export const dynamic = "force-dynamic";

export default function StreamDetectorPage() {
  return (
    <main className="page-shell detector-page">
      <SiteHeader
        links={[
          { href: "/studio", label: "OBS Studio" },
          { href: "/detector", label: "Detector App" },
          { href: "/stream-detector", label: "Stream Detector" },
          { href: "/direct-uploader", label: "Direct Uploader" },
          { href: "/overlay/demo", label: "Demo Overlay" },
        ]}
      />
      <StreamDetectorClient />
    </main>
  );
}
