import { TrailChat } from "@/components/TrailChat";

export default function Home() {
  return (
    <div className="min-h-full bg-gradient-to-b from-emerald-50/60 via-zinc-50 to-zinc-100 dark:from-zinc-950 dark:via-zinc-950 dark:to-black">
      <main className="mx-auto flex min-h-full w-full max-w-3xl flex-col gap-8 px-4 py-10 sm:px-6">
        <header className="space-y-2">
          <p className="text-sm font-medium uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
            Trail Guide
          </p>
          <h1 className="text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            Find your way, at your pace
          </h1>
          <p className="max-w-2xl text-base leading-relaxed text-zinc-600 dark:text-zinc-400">
            An AI guide that points you toward the right trails — docs,
            tutorials, and references — instead of doing the walk for you.
          </p>
        </header>

        <TrailChat />
      </main>
    </div>
  );
}
