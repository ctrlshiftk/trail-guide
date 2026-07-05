import { TrailSearch } from "@/components/TrailSearch";

export default function Home() {
  return (
    <div className="min-h-full bg-gradient-to-b from-emerald-50/60 via-zinc-50 to-zinc-100 dark:from-zinc-950 dark:via-zinc-950 dark:to-black">
      <main className="mx-auto flex min-h-full w-full max-w-3xl flex-col gap-10 px-4 py-16 sm:px-6">
        <header className="space-y-3 text-center">
          <p className="text-sm font-medium uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
            Trail Guide
          </p>
          <h1 className="text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50 sm:text-4xl">
            Find links on the web
          </h1>
          <p className="mx-auto max-w-xl text-base leading-relaxed text-zinc-600 dark:text-zinc-400">
            Describe your problem in detail — even with code — and get links to
            relevant docs and references. No answers, just pointers.
          </p>
        </header>

        <TrailSearch />
      </main>
    </div>
  );
}
