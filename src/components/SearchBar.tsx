import { Search } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";

export function SearchBar({ size = "lg", initial = "" }: { size?: "lg" | "md"; initial?: string }) {
  const navigate = useNavigate();
  const [q, setQ] = useState(initial);
  const big = size === "lg";
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        navigate({ to: "/search", search: { q } });
      }}
      className={`group relative flex w-full items-center gap-2 rounded-2xl border border-border bg-surface pl-4 pr-2 shadow-soft transition-shadow focus-within:shadow-elegant ${big ? "py-2.5" : "py-1.5"}`}
    >
      <Search className={`shrink-0 text-muted-foreground ${big ? "h-5 w-5" : "h-4 w-4"}`} />
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="What are you looking for?"
        className={`min-w-0 flex-1 bg-transparent text-foreground placeholder:text-muted-foreground focus:outline-none ${big ? "text-base" : "text-sm"}`}
      />
      <button
        type="submit"
        className={`shrink-0 rounded-xl bg-primary font-semibold text-primary-foreground transition-transform hover:scale-[1.02] active:scale-100 ${big ? "px-4 py-2 text-sm" : "px-3 py-1.5 text-xs"}`}
      >
        Search
      </button>
    </form>
  );
}
