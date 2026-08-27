import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, KeyRound, ShieldX } from "lucide-react";
import { getPersonById, verifyOwner } from "@/lib/data";
import { OwnerManagePanel } from "@/components/OwnerManagePanel";
import { PageHeader } from "@/components/PageHeader";
import { type SearchParams, str } from "@/lib/searchParams";

export const dynamic = "force-dynamic";

export default async function GestionPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: SearchParams;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const token = str(sp.token) ?? "";

  const person = await getPersonById(id);
  if (!person) notFound();

  const isOwner = await verifyOwner(id, token);
  const displayName =
    person.isUnidentified && !`${person.firstName} ${person.lastName}`.trim()
      ? "Persona sin identificar"
      : `${person.firstName} ${person.lastName}`.trim();

  if (!isOwner) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-rose-100 text-rose-600">
          <ShieldX className="h-6 w-6" />
        </span>
        <h1 className="mt-4 text-xl font-bold text-zinc-900">Enlace de gestión no válido</h1>
        <p className="mt-2 text-sm text-zinc-500">
          Este enlace privado no es correcto o ha cambiado. Solo quien publicó el registro tiene el
          enlace de gestión que se mostró al momento de publicar.
        </p>
        <Link href={`/persona/${id}`} className="press mt-6 inline-block rounded-xl bg-zinc-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-zinc-800">
          Ver la publicación
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <Link href={`/persona/${id}`} className="press mb-5 inline-flex items-center gap-1.5 text-sm font-medium text-zinc-500 hover:text-zinc-900">
        <ArrowLeft className="h-4 w-4" />
        Ver la publicación
      </Link>

      <div className="mb-6">
        <PageHeader
          icon={KeyRound}
          title="Gestionar publicación"
          description={`${displayName} · Estás identificado como autor mediante tu enlace privado.`}
        />
      </div>

      <OwnerManagePanel person={person} token={token} />
    </div>
  );
}
