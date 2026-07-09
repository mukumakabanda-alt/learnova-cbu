import { Link, useRouterState } from "@tanstack/react-router";
import { BookOpen, LayoutDashboard, Search, Compass, ShieldCheck, User } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";

export function Logo({ className = "" }: { className?: string }) {
  return (
    <Link to="/" className={`flex items-center gap-2 ${className}`}>
      <span className="relative grid h-9 w-9 place-items-center rounded-xl bg-primary text-primary-foreground shadow-soft">
        <span className="font-display text-xl leading-none">L</span>
        <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-gold-gradient ring-2 ring-background" />
      </span>
      <span className="font-display text-2xl leading-none tracking-tight text-foreground">
        Learn<span className="text-gradient-gold">ova</span>
      </span>
    </Link>
  );
}

export function SiteHeader() {
  const { user, profile, signOut } = useAuth();

  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Logo />
        <div className="flex items-center gap-2">
          <Link to="/search" aria-label="Search" className="grid h-9 w-9 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
            <Search className="h-4 w-4" />
          </Link>
          {user ? (
            <button onClick={() => signOut()} className="hidden rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground sm:inline-block">
              {profile?.full_name?.split(" ")[0] || "Sign out"}
            </button>
          ) : (
            <>
              <Link to="/auth" className="hidden rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground sm:inline-block">Sign in</Link>
              <Link to="/auth" className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-sm font-semibold text-primary-foreground shadow-soft transition-transform hover:scale-[1.02] active:scale-100">
                Get started
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

// One nav dock. Active tab glows copper — subtle neon, not carnival.
export function MobileTabBar() {
  const { isAdmin } = useAuth();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const items = [
    { to: "/", label: "Home", icon: BookOpen },
    { to: "/browse", label: "Browse", icon: Compass },
    { to: "/study", label: "Study", icon: LayoutDashboard },
    { to: "/dashboard", label: "You", icon: User },
    ...(isAdmin ? [{ to: "/admin", label: "Admin", icon: ShieldCheck }] : []),
  ];

  const isActive = (to: string) => (to === "/" ? pathname === "/" : pathname.startsWith(to));

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border/70 bg-background/95 backdrop-blur-xl">
      <div className="mx-auto grid max-w-md" style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
        {items.map(({ to, label, icon: Icon }) => {
          const active = isActive(to);
          return (
            <Link
              key={to}
              to={to}
              className={`group flex flex-col items-center gap-1 py-2.5 text-[11px] font-semibold transition-colors ${
                active ? "text-copper" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon
                className={`h-5 w-5 transition-all ${
                  active ? "drop-shadow-[0_0_10px_oklch(0.7_0.16_48_/_0.9)]" : ""
                }`}
              />
              <span className={active ? "drop-shadow-[0_0_6px_oklch(0.7_0.16_48_/_0.7)]" : ""}>{label}</span>
            </Link>
          );
        })}
      </div>
      <div className="h-[env(safe-area-inset-bottom)]" />
    </nav>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t border-border/60 bg-surface-muted">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 sm:px-6 md:grid-cols-4">
        <div className="md:col-span-2">
          <Logo />
          <p className="mt-3 max-w-sm text-sm text-muted-foreground">
            Built by a CBU student, for CBU students — fast, focused, and organised the way you'd actually look for things.
          </p>
        </div>
        <div>
          <div className="text-sm font-semibold text-foreground">Study</div>
          <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
            <li><Link to="/browse" className="hover:text-foreground">Browse programmes</Link></li>
            <li><Link to="/study" className="hover:text-foreground">Study catalogue</Link></li>
            <li><Link to="/dashboard" className="hover:text-foreground">My dashboard</Link></li>
          </ul>
        </div>
        <div>
          <div className="text-sm font-semibold text-foreground">About</div>
          <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
            <li>Independent · Student built</li>
            <li>Not affiliated with CBU</li>
            <li>Kitwe, Zambia</li>
          </ul>
        </div>
      </div>
      <div className="flex flex-col items-center gap-1 border-t border-border/60 py-4 text-center text-xs text-muted-foreground">
        <span>© {new Date().getFullYear()} Learnova. Built for students, by students.</span>
        {/* Unlisted admin door — nothing labels it as admin. */}
        <Link to="/admin" className="text-[10px] text-muted-foreground/40 transition-colors hover:text-copper">
          ·
        </Link>
      </div>
      <div className="h-20" />
    </footer>
  );
}
