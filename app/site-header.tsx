import { AuthNav } from "@/app/auth-nav";

type HeaderLink = {
  href: string;
  label: string;
};

type SiteHeaderProps = {
  links?: HeaderLink[];
};

export function SiteHeader({ links = [] }: SiteHeaderProps) {
  return (
    <header className="topbar">
      <a className="brand" href="/" aria-label="Whats Pulled home">
        <span className="brand-mark" aria-hidden="true">W</span>
      </a>
      <nav className="nav-links" aria-label="Main navigation">
        {links.map((link) => (
          <a href={link.href} key={`${link.href}-${link.label}`}>
            {link.label}
          </a>
        ))}
        <details className="nav-dropdown">
          <summary>Catalog</summary>
          <div className="nav-dropdown-panel">
            <a href="/sports">Sports</a>
            <a href="/sports/tennis">Tennis Chrome 2025</a>
            <a href="/sets/topps-chrome-tennis-2025">Topps Chrome Tennis</a>
          </div>
        </details>
        <AuthNav />
      </nav>
    </header>
  );
}
