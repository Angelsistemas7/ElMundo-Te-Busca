import { getDashboardStats } from "@/lib/data";
import { getActiveCountry } from "@/lib/country-server";
import { DashboardStats } from "./DashboardStats";

// Widget de cifras (antes vivía en "Se busca"): se muestra en Inicio, justo
// debajo del hero, para que sea lo primero que se vea al entrar.
export async function HomeDashboardStats() {
  const country = await getActiveCountry();
  const stats = await getDashboardStats(country);
  return <DashboardStats stats={stats} />;
}
