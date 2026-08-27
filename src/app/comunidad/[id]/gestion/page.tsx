import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, KeyRound, ShieldX } from "lucide-react";
import { getPostById, verifyResourceOwner } from "@/lib/data";
import { POST_TYPE_LABEL } from "@/lib/types";
import { PostManagePanel } from "@/components/PostManagePanel";
import { PageHeader } from "@/components/PageHeader";
import { type SearchParams, str } from "@/lib/searchParams";

export const dynamic = "force-dynamic";

export default async function PostGestionPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: SearchParams;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const token = str(sp.token) ?? "";

  const post = await getPostById(id);
  if (!post) notFound();

  const isOwner = await verifyResourceOwner("post", id, token);

  if (!isOwner) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-rose-100 text-rose-600">
          <ShieldX className="h-6 w-6" />
        </span>
        <h1 className="mt-4 text-xl font-bold text-zinc-900">Enlace de gestión no válido</h1>
        <p className="mt-2 text-sm text-zinc-500">
          Este enlace privado no es correcto o ha cambiado. Solo quien publicó tiene el enlace de
          gestión que se mostró al momento de publicar.
        </p>
        <Link href="/comunidad" className="press mt-6 inline-block rounded-xl bg-zinc-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-zinc-800">
          Ir a la comunidad
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <Link href="/comunidad" className="press mb-5 inline-flex items-center gap-1.5 text-sm font-medium text-zinc-500 transition hover:text-zinc-900">
        <ArrowLeft className="h-4 w-4" />
        Volver a la comunidad
      </Link>

      <div className="mb-6">
        <PageHeader
          icon={KeyRound}
          title="Gestionar publicación"
          description={`${POST_TYPE_LABEL[post.type]} · Estás identificado como autor mediante tu enlace privado.`}
        />
      </div>

      <PostManagePanel post={post} token={token} />
    </div>
  );
}
