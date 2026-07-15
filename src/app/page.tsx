import { TrailSearch } from "@/components/TrailSearch";

export default function Home() {
  return (
    <div className="flex min-h-dvh flex-1 flex-col justify-center bg-background">
      <main className="mx-auto flex w-full max-w-3xl -translate-y-8 flex-col gap-10 px-4 py-8 sm:px-6">
        <TrailSearch />
      </main>
    </div>
  );
}
