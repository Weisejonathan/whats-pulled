import { logoutAction } from "@/app/actions";
import { hasAdminSession } from "@/lib/auth";

export async function AuthNav() {
  const isLoggedIn = await hasAdminSession();

  if (!isLoggedIn) {
    return <a href="/login">Login</a>;
  }

  return (
    <form action={logoutAction} className="nav-form">
      <button type="submit">Logout</button>
    </form>
  );
}
