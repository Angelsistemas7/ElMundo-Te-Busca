import { adminConfigured, getAdminLevel } from "@/lib/admin";
import { COUNTRY_CODES } from "@/lib/countries";
import {
  getAidPoints,
  getAllAppRoles,
  getAllResourceManagers,
  getComplaints,
  getHeroesForAdmin,
  getHospitals,
  getPendingExternalPosts,
  getPendingManagerRequests,
  getPendingReports,
  getPersons,
  getPersonsByIds,
  getPosts,
} from "@/lib/data";
import type { AppRoleGrant, Complaint, Hero, ResourceManager } from "@/lib/types";
import { AdminLogin } from "@/components/admin/AdminLogin";
import { AdminDashboard, type ReportWithName } from "@/components/admin/AdminDashboard";

export const dynamic = "force-dynamic";

// El panel de moderación cubre TODOS los países activos a la vez (un
// moderador no debería tener que cambiar la cookie de país para ver
// Colombia): las consultas por país se piden en paralelo y se juntan aquí,
// en vez de dejar que cada función caiga en su default `country = "ve"`.
async function getAllCountries<T>(fn: (country: string) => Promise<T[]>): Promise<T[]> {
  const perCountry = await Promise.all(COUNTRY_CODES.map((c) => fn(c)));
  return perCountry.flat();
}

export default async function AdminPage() {
  const level = await getAdminLevel();
  if (!level) {
    return <AdminLogin />;
  }
  const fullAdmin = level === "admin";

  const [pending, persons, aidPoints, hospitals, posts, pendingExternalPosts] = await Promise.all([
    getPendingReports(),
    getAllCountries((country) => getPersons({ sort: "recent", pageSize: 30, country }).then((r) => r.items)),
    getAllCountries((country) => getAidPoints(country)),
    getAllCountries((country) => getHospitals(country)),
    getAllCountries((country) => getPosts({ country })),
    getPendingExternalPosts(),
  ]);
  persons.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  posts.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  // Colaboradores, gestores, héroes y denuncias son solo para admin completo.
  // Se piden SOLO si `fullAdmin` — no basta con ocultarlos en el UI: como
  // `AdminDashboard` es "use client", cualquier prop que le pasemos viaja al
  // navegador, así que un moderador ni siquiera debe recibir estos datos.
  let managers: ResourceManager[] = [];
  let heroes: Hero[] = [];
  let complaintsByCountry: Complaint[] = [];
  let roles: AppRoleGrant[] = [];
  let pendingManagerRequests: Awaited<ReturnType<typeof getPendingManagerRequests>> = [];
  if (fullAdmin) {
    [managers, heroes, complaintsByCountry, roles, pendingManagerRequests] = await Promise.all([
      getAllResourceManagers(),
      getHeroesForAdmin(),
      getAllCountries((country) => getComplaints({ country }, 1, 25).then((r) => r.items)),
      getAllAppRoles(),
      // Tabla nueva (manager_requests): si la migración de supabase/schema.sql
      // todavía no corrió en producción, que falte esta tabla no debe tumbar
      // TODO el panel de admin — se degrada a "sin solicitudes" en su lugar.
      getPendingManagerRequests().catch(() => []),
    ]);
  }
  const complaintsPage = { items: complaintsByCountry.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt)) };

  // Enriquecemos cada reporte con el nombre de la persona (una sola consulta, no N+1).
  const personsById = await getPersonsByIds(pending.map((r) => r.personId));
  const reports: ReportWithName[] = pending.map((r) => {
    const person = personsById.get(r.personId);
    const personName = person
      ? `${person.firstName} ${person.lastName}`.trim() || "Sin identificar"
      : "Persona";
    return { ...r, personName };
  });

  // Hospitales de más recientes a más antiguos (para revisar lo nuevo primero).
  const hospitalsRecent = hospitals
    .slice()
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return (
    <AdminDashboard
      reports={reports}
      persons={persons}
      aidPoints={aidPoints}
      hospitals={hospitalsRecent}
      managers={managers}
      posts={posts.slice(0, 25)}
      heroes={heroes}
      complaints={complaintsPage.items}
      roles={roles}
      pendingExternalPosts={pendingExternalPosts}
      pendingManagerRequests={pendingManagerRequests}
      demoOpen={!adminConfigured}
      isFullAdmin={fullAdmin}
    />
  );
}
