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
            <a href="/sports/tennis">Tennis</a>
            <a href="/breakers">Breakers</a>
            <a href="/leaderboard">Leaderboard</a>
          </div>
        </details>
        <AuthNav />
      </nav>
      <details className="mobile-menu">
        <summary aria-label="Open navigation menu">
          <span aria-hidden="true" />
          <span aria-hidden="true" />
          <span aria-hidden="true" />
        </summary>
        <div className="mobile-menu-panel">
          <nav className="mobile-menu-links" aria-label="Mobile navigation">
            {links.map((link) => (
              <a href={link.href} key={`mobile-${link.href}-${link.label}`}>
                {link.label}
              </a>
            ))}
            <a href="/sports">Sports</a>
            <a href="/sports/tennis">Tennis</a>
            <a href="/breakers">Breakers</a>
            <a href="/leaderboard">Leaderboard</a>
          </nav>
          <div className="mobile-auth">
            <AuthNav />
          </div>
        </div>
      </details>
    </header>
  );
}
