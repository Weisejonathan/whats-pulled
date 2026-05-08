import { logoutAction } from "@/app/actions";
import { getUserSession, hasAdminSession } from "@/lib/auth";

export async function AuthNav() {
  const isLoggedIn = await hasAdminSession();
  const user = await getUserSession();

  if (!isLoggedIn && !user) {
    return <a href="/login">Login</a>;
  }

  return (
    <>
      {user ? <a href="/account">{user.displayName}</a> : null}
      {isLoggedIn ? <a href="/admin/requests">Admin</a> : null}
      <form action={logoutAction} className="nav-form">
        <button type="submit">Logout</button>
      </form>
    </>
  );
}
