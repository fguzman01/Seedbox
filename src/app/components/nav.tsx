import Link from "next/link";

const LINKS = [
  { href: "/", label: "Oportunidades", key: "opportunities" },
  { href: "/?fav=1", label: "★ Favoritas", key: "favorites" },
  { href: "/activity", label: "Actividad", key: "activity" },
] as const;

export function Nav({ current }: { current: "opportunities" | "favorites" | "activity" }) {
  const links =
    process.env.NODE_ENV === "production"
      ? LINKS
      : [...LINKS, { href: "/labeling", label: "Etiquetado", key: "labeling" } as const];
  return (
    <nav className="mb-8 flex items-center justify-between gap-4">
      <Link href="/" className="text-sm font-medium tracking-widest text-emerald-400 uppercase">
        Seedbox
      </Link>
      <ul className="flex gap-4 text-sm">
        {links.map((link) => (
          <li key={link.key}>
            <Link
              href={link.href}
              aria-current={link.key === current ? "page" : undefined}
              className={link.key === current ? "text-zinc-100" : "text-zinc-500 hover:text-zinc-300"}
            >
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
