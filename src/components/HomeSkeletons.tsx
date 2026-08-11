// Placeholders con el mismo tamaño que HomeHero/VerifiedNewsCarousel para que
// la página no "salte" cuando el contenido real reemplaza al esqueleto.

export function HomeHeroSkeleton() {
  return (
    <section className="animate-pulse overflow-hidden rounded-3xl border-2 border-zinc-200 bg-white">
      <div className="grid gap-6 p-6 sm:p-8 lg:grid-cols-[1fr_320px] lg:gap-8">
        <div className="flex flex-col justify-center gap-4">
          <div className="h-9 w-4/5 rounded-lg bg-zinc-200" />
          <div className="h-9 w-3/5 rounded-lg bg-zinc-200" />
          <div className="h-4 w-2/3 rounded bg-zinc-100" />
          <div className="mt-2 flex gap-3">
            <div className="h-10 w-40 rounded-full bg-zinc-200" />
            <div className="h-10 w-40 rounded-full bg-zinc-100" />
          </div>
        </div>
        <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-5">
          <div className="h-3 w-32 rounded bg-zinc-200" />
          <div className="mt-5 flex flex-col gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="h-9 w-9 shrink-0 rounded-full bg-zinc-200" />
                <div className="flex flex-1 flex-col gap-1.5">
                  <div className="h-4 w-12 rounded bg-zinc-200" />
                  <div className="h-3 w-24 rounded bg-zinc-100" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

export function DashboardStatsSkeleton() {
  return (
    <div className="no-scrollbar -mx-4 flex animate-pulse gap-2 overflow-x-auto px-4 sm:mx-0 sm:grid sm:grid-cols-4 sm:gap-3 sm:overflow-visible sm:px-0 lg:grid-cols-8">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="h-[4.5rem] w-28 shrink-0 rounded-2xl bg-zinc-100 sm:w-auto" />
      ))}
    </div>
  );
}

export function NewsCarouselSkeleton() {
  return (
    <section className="animate-pulse rounded-3xl border-2 border-zinc-200 bg-white p-5 sm:p-6">
      <div className="h-5 w-56 rounded bg-zinc-200" />
      <div className="mt-4 flex gap-4 overflow-hidden">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="w-56 shrink-0 overflow-hidden rounded-2xl border border-zinc-200 sm:w-64">
            <div className="aspect-[16/10] w-full bg-zinc-200" />
            <div className="flex flex-col gap-2 p-3">
              <div className="h-3 w-full rounded bg-zinc-200" />
              <div className="h-3 w-4/5 rounded bg-zinc-200" />
              <div className="h-3 w-1/2 rounded bg-zinc-100" />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
