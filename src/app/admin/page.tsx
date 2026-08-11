import { adminConfigured, isAdmin } from "@/lib/admin";
import { COUNTRY_CODES } from "@/lib/countries";
import {
  getAidPoints,
  getAllAppRoles,
  getAllResourceManagers,
  getComplaints,
  getHeroesForAdmin,
  getHospitals,
  getPendingExternalPosts,
  getPendingReports,
  getPersons,
  getPersonsByIds,
  getPosts,
} from "@/lib/data";
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
  if (!(await isAdmin())) {
    return <AdminLogin />;
  }

  const [
    pending,
    persons,
    aidPoints,
    hospitals,
    managers,
    posts,
    heroes,
    complaintsByCountry,
    roles,
    pendingExternalPosts,
  ] = await Promise.all([
    getPendingReports(),
    getAllCountries((country) => getPersons({ sort: "recent", pageSize: 30, country }).then((r) => r.items)),
    getAllCountries((country) => getAidPoints(country)),
    getAllCountries((country) => getHospitals(country)),
    getAllResourceManagers(),
    getAllCountries((country) => getPosts({ country })),
    getHeroesForAdmin(),
    getAllCountries((country) => getComplaints({ country }, 1, 25).then((r) => r.items)),
    getAllAppRoles(),
    getPendingExternalPosts(),
  ]);
  const complaintsPage = { items: complaintsByCountry.sort((a, b) => b.createdAt.localeCompare(a.createdAt)) };
  persons.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  posts.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

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
      demoOpen={!adminConfigured}
    />
  );
}
