import { Suspense } from "react";
import { DevModeNotice } from "@/components/DevModeNotice";
import { HomeHero } from "@/components/HomeHero";
import { HomeDashboardStats } from "@/components/HomeDashboardStats";
import { VerifiedNewsCarousel } from "@/components/VerifiedNewsCarousel";
import { HomeHeroSkeleton, DashboardStatsSkeleton, NewsCarouselSkeleton } from "@/components/HomeSkeletons";
import { CountryIntroModal } from "@/components/CountryIntroModal";
import { getActiveCountry, hasChosenCountry } from "@/lib/country-server";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [chosenCountry, country] = await Promise.all([hasChosenCountry(), getActiveCountry()]);
  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <CountryIntroModal initialOpen={!chosenCountry} />
      <DevModeNotice />
      <div className="flex flex-col gap-6">
        {/* Cada sección en su propio Suspense: el hero (datos internos, rápido)
            no debe esperar al carrusel de noticias (APIs externas, puede
            tardar varios segundos) — así la página se ve de inmediato en vez
            de quedar en blanco hasta que ambas terminen. */}
        <Suspense fallback={<HomeHeroSkeleton />}>
          <HomeHero />
        </Suspense>
        <Suspense fallback={<DashboardStatsSkeleton />}>
          <HomeDashboardStats />
        </Suspense>
        <Suspense fallback={<NewsCarouselSkeleton />}>
          <VerifiedNewsCarousel country={country} />
        </Suspense>
      </div>
    </div>
  );
}
