import { Link, Outlet } from "react-router";

export function Layout() {
  return (
    <>
      <header className="topbar">
        <Link to="/" className="brand">
          <img src="/favicon.svg" alt="" width={22} height={22} />
          Test Results
        </Link>
      </header>
      <main className="page">
        <Outlet />
      </main>
    </>
  );
}
