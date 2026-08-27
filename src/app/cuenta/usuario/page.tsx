import Link from "next/link";
import { redirect } from "next/navigation";
import { AtSign, ShieldX } from "lucide-react";
import { getCurrentUser, getPendingOAuthUser } from "@/lib/auth";
import { ChooseUsernameForm } from "@/components/ChooseUsernameForm";
import { PageHeader } from "@/components/PageHeader";
import { safeNextPath } from "@/lib/safeNext";

export const dynamic = "force-dynamic";

// Último paso del primer ingreso con Google: Google da correo y nombre real,
// pero el nombre con el que se ve a alguien en el sitio (comentarios, ficha
// pública, gestores) es el nombre de usuario, y ese lo elige la persona.
export default async function ElegirUsuarioPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const safeNext = safeNextPath(next);

  const pending = await getPendingOAuthUser();
  if (!pending) {
    // La cuenta ya tiene nombre (p. ej. se volvió aquí con el botón atrás):
    // no hay nada que elegir, se sigue viaje.
    if (await getCurrentUser()) redirect(safeNext);

    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-rose-100 text-rose-600">
          <ShieldX className="h-6 w-6" />
        </span>
        <h1 className="mt-4 text-xl font-bold text-zinc-900">Tu sesión expiró</h1>
        <p className="mt-2 text-sm text-zinc-500">
          Vuelve a entrar con Google para terminar de crear tu cuenta.
        </p>
        <Link
          href="/"
          className="press mt-6 inline-block rounded-xl bg-zinc-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-zinc-800"
        >
          Ir al inicio
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md px-4 py-12">
      <div className="mb-6">
        <PageHeader
          icon={AtSign}
          title="Elige tu nombre de usuario"
          description="Es el nombre con el que te verán en tus publicaciones y comentarios. No es tu correo ni tu nombre real: puedes usar un alias."
        />
      </div>
      <ChooseUsernameForm next={safeNext} />
    </div>
  );
}
