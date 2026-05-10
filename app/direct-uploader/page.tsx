import { SiteHeader } from "@/app/site-header";
import { DirectUploaderClient } from "./direct-uploader-client";

export const dynamic = "force-dynamic";

export default function DirectUploaderPage() {
  return (
    <main className="page-shell detector-page">
      <SiteHeader
        links={[
          { href: "/studio", label: "OBS Studio" },
          { href: "/detector", label: "Detector App" },
          { href: "/direct-uploader", label: "Direct Uploader" },
          { href: "/overlay/demo", label: "Demo Overlay" },
        ]}
      />
      <DirectUploaderClient />
    </main>
  );
}
