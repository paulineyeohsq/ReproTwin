import Link from "next/link";

export function Footer() {
  return (
    <footer className="mt-auto border-t border-[var(--card-border)] bg-white">
      <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-5 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <p>
          ReproTwin is a research prototype for urban motorcycle riders. All
          demo location, environmental and physiological data shown are
          synthetic unless a real dataset has been loaded.
        </p>
        <div className="flex items-center gap-4">
          <Link href="/data" className="hover:text-slate-700">
            Data sources
          </Link>
          <Link href="/privacy" className="hover:text-slate-700">
            Privacy &amp; data governance
          </Link>
        </div>
      </div>
    </footer>
  );
}
