import { UserCheck } from "lucide-react";
import { getAidPoints, getHospitals } from "@/lib/data";
import { getCurrentUser } from "@/lib/auth";
import { getActiveCountry } from "@/lib/country-server";
import { PageHeader } from "@/components/PageHeader";
import { ManagerRequestForm } from "@/components/ManagerRequestForm";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Solicitar rol de gestor — El Mundo Te Busca",
  description: "Pide permiso para mantener actualizado un hospital o punto de ayuda concreto.",
};

export default async function SolicitarGestorPage() {
  const country = await getActiveCountry();
  const [user, aidPoints, hospitals] = await Promise.all([
    getCurrentUser(),
    getAidPoints(country),
    getHospitals(country),
  ]);

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <PageHeader
        icon={UserCheck}
        tone="brand"
        title="Solicitar rol de gestor"
        description="Pide permiso para mantener actualizado un hospital o punto de ayuda concreto. Un moderador revisa tu solicitud antes de darte acceso."
      />

      <div className="mt-8">
        <ManagerRequestForm
          loggedIn={Boolean(user)}
          hospitals={hospitals.map((h) => ({ id: h.id, name: h.name, location: h.locationText }))}
          aidPoints={aidPoints.map((a) => ({ id: a.id, name: a.name, location: a.locationText }))}
        />
      </div>
    </div>
  );
}
