import { loginAction, registerUserAction, userLoginAction } from "@/app/actions";
import { SiteHeader } from "@/app/site-header";
import { getSafeRedirectPath, getUserSession, hasAdminSession } from "@/lib/auth";

type LoginPageProps = {
  searchParams: Promise<{
    error?: string;
    next?: string;
    registerError?: string;
    userError?: string;
  }>;
};

export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const nextPath = getSafeRedirectPath(params.next);
  const isAdminLoggedIn = await hasAdminSession();
  const user = await getUserSession();

  return (
    <main className="page-shell">
      <SiteHeader
        links={[
          { href: "/", label: "Home" },
          { href: "/sports", label: "Sports" },
        ]}
      />

      <section className="access-layout">
        <form className="access-panel" action={userLoginAction}>
          <div className="form-heading">
            <p className="eyebrow">User account</p>
            <h1>Login</h1>
            <p>
              Log in to submit pulls, claim cards, add cards to your watchlist,
              and place bids.
            </p>
          </div>

          {user ? (
            <div className="notice success">You are logged in as {user.displayName}.</div>
          ) : null}

          {params.userError ? (
            <div className="notice error">Email or password was not accepted.</div>
          ) : null}

          <input name="next" type="hidden" value={nextPath} />
          <label className="field">
            <span>Email</span>
            <input name="email" type="email" autoComplete="email" required />
          </label>
          <label className="field">
            <span>Password</span>
            <input name="password" type="password" autoComplete="current-password" required />
          </label>
          <button type="submit">{user ? "Continue" : "Login"}</button>
        </form>

        <form className="access-panel" action={registerUserAction}>
          <div className="form-heading">
            <p className="eyebrow">Create account</p>
            <h2>Create account</h2>
            <p>Create an account for claims, pulls, favorites, and bids.</p>
          </div>

          {params.registerError ? (
            <div className="notice error">
              Registration failed. Use a new email address and at least 8 characters.
            </div>
          ) : null}

          <input name="next" type="hidden" value={nextPath} />
          <label className="field">
            <span>Name</span>
            <input name="displayName" autoComplete="name" required />
          </label>
          <label className="field">
            <span>Email</span>
            <input name="email" type="email" autoComplete="email" required />
          </label>
          <label className="field">
            <span>Password</span>
            <input
              name="password"
              type="password"
              autoComplete="new-password"
              minLength={8}
              required
            />
          </label>
          <button type="submit">Create account</button>
        </form>

        <form className="access-panel admin-login-panel" action={loginAction}>
          <div className="form-heading">
            <p className="eyebrow">Admin backend</p>
            <h2>Admin Login</h2>
            <p>Use the private access code for approvals and database updates.</p>
          </div>

          {isAdminLoggedIn ? (
            <div className="notice success">Admin access is active.</div>
          ) : null}

          {params.error ? (
            <div className="notice error">Access code was not accepted.</div>
          ) : null}

          <input name="next" type="hidden" value={nextPath} />
          <label className="field">
            <span>Access code</span>
            <input name="accessCode" type="password" autoComplete="current-password" required />
          </label>
          <button type="submit">{isAdminLoggedIn ? "Continue" : "Admin Login"}</button>
        </form>
      </section>
    </main>
  );
}
