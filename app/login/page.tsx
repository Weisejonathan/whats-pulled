import { loginAction } from "@/app/actions";
import { SiteHeader } from "@/app/site-header";
import { hasAdminSession, getSafeRedirectPath } from "@/lib/auth";

type LoginPageProps = {
  searchParams: Promise<{
    error?: string;
    next?: string;
  }>;
};

export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const nextPath = getSafeRedirectPath(params.next);
  const isLoggedIn = await hasAdminSession();

  return (
    <main className="page-shell">
      <SiteHeader
        links={[
          { href: "/", label: "Home" },
          { href: "/sports", label: "Sports" },
        ]}
      />

      <section className="access-layout">
        <form className="access-panel" action={loginAction}>
          <div className="form-heading">
            <p className="eyebrow">Private access</p>
            <h1>Login</h1>
            <p>
              Sign in to claim cards, report pulls, and update the database.
            </p>
          </div>

          {isLoggedIn ? (
            <div className="notice success">You are already logged in.</div>
          ) : null}

          {params.error ? (
            <div className="notice error">Access code was not accepted.</div>
          ) : null}

          <input name="next" type="hidden" value={nextPath} />
          <label className="field">
            <span>Access code</span>
            <input name="accessCode" type="password" autoComplete="current-password" required />
          </label>
          <button type="submit">{isLoggedIn ? "Continue" : "Login"}</button>
        </form>
      </section>
    </main>
  );
}
