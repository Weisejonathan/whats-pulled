import { desc, eq } from "drizzle-orm";
import { SiteHeader } from "@/app/site-header";
import { getUserSession } from "@/lib/auth";
import { getDb } from "@/lib/db/client";
import { cardBids, cardFavorites, cards, claims } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const user = await getUserSession();
  const db = getDb();

  if (!user || !db) {
    return (
      <main className="page-shell">
        <SiteHeader links={[{ href: "/", label: "Home" }]} />
        <section className="access-layout">
          <div className="access-required">
            <div>
              <p className="eyebrow">Account</p>
              <h1>Login required</h1>
              <p>Registriere dich oder logge dich ein, um deine Watchlist zu sehen.</p>
            </div>
            <a className="button-link" href="/login?next=/account">
              Login / Registrieren
            </a>
          </div>
        </section>
      </main>
    );
  }

  const [favorites, bids, claimRequests] = await Promise.all([
    db
      .select({
        cardSlug: cards.slug,
        player: cards.playerName,
        parallel: cards.parallel,
        serial: cards.serialNumber,
      })
      .from(cardFavorites)
      .innerJoin(cards, eq(cardFavorites.cardId, cards.id))
      .where(eq(cardFavorites.userId, user.id))
      .orderBy(desc(cardFavorites.updatedAt))
      .limit(12),
    db
      .select({
        cardSlug: cards.slug,
        player: cards.playerName,
        amount: cardBids.amount,
        currency: cardBids.currency,
        status: cardBids.status,
      })
      .from(cardBids)
      .innerJoin(cards, eq(cardBids.cardId, cards.id))
      .where(eq(cardBids.userId, user.id))
      .orderBy(desc(cardBids.createdAt))
      .limit(12),
    db
      .select({
        cardSlug: cards.slug,
        player: cards.playerName,
        status: claims.verificationStatus,
      })
      .from(claims)
      .innerJoin(cards, eq(claims.cardId, cards.id))
      .where(eq(claims.userId, user.id))
      .orderBy(desc(claims.createdAt))
      .limit(12),
  ]);

  return (
    <main className="page-shell">
      <SiteHeader links={[{ href: "/", label: "Home" }]} />
      <section className="catalog-hero">
        <p className="eyebrow">Account</p>
        <h1>{user.displayName}</h1>
        <p>{user.email}</p>
      </section>

      <section className="account-grid">
        <AccountPanel
          title="Watchlist"
          items={favorites.map((item) => ({
            href: `/cards/${item.cardSlug}`,
            title: item.player,
            meta: [item.parallel, item.serial].filter(Boolean).join(" · "),
          }))}
        />
        <AccountPanel
          title="Gebote"
          items={bids.map((item) => ({
            href: `/cards/${item.cardSlug}`,
            title: item.player,
            meta: `${item.currency} ${item.amount} · ${item.status}`,
          }))}
        />
        <AccountPanel
          title="Claims"
          items={claimRequests.map((item) => ({
            href: `/cards/${item.cardSlug}`,
            title: item.player,
            meta: item.status,
          }))}
        />
      </section>
    </main>
  );
}

function AccountPanel({
  items,
  title,
}: {
  items: { href: string; meta: string; title: string }[];
  title: string;
}) {
  return (
    <section className="account-panel">
      <h2>{title}</h2>
      {items.length ? (
        <div className="account-list">
          {items.map((item) => (
            <a href={item.href} key={`${title}-${item.href}-${item.meta}`}>
              <strong>{item.title}</strong>
              <span>{item.meta}</span>
            </a>
          ))}
        </div>
      ) : (
        <p>Noch keine Eintrage.</p>
      )}
    </section>
  );
}
