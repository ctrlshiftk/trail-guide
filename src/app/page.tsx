import { TrailSearch } from "@/components/TrailSearch";

export default function Home() {
  return (
    <div className="flex min-h-dvh flex-1 flex-col justify-center bg-background">
      <main className="mx-auto flex w-full max-w-3xl -translate-y-8 flex-col gap-10 px-4 py-8 sm:px-6">
        <header className="space-y-3 text-center">
          <p className="text-sm font-medium uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
            Trail Guide
          </p>
          <h1 className="text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50 sm:text-4xl">
            Build your own answers
          </h1>
          <p className="mx-auto max-w-xl text-base leading-relaxed text-zinc-600 dark:text-zinc-400">
            Describe your problem in detail and get links to
            relevant docs and references. No answers, just pointers.
          </p>
        </header>

        <TrailSearch />
      </main>
    </div>
  );
}
