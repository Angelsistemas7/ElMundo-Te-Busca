import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { Bookmark, FileText, HeartHandshake, MessageCircle, ThumbsUp, UserCircle2 } from "lucide-react";
import { getPublicProfileByUsername } from "@/lib/auth";
import { getDigitalVolunteerStats } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function PublicVolunteerProfilePage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;
  const profile = await getPublicProfileByUsername(username);
  if (!profile) notFound();

  const stats = await getDigitalVolunteerStats(profile.id);
  const items = [
    { icon: FileText, label: "Publicaciones", value: stats.publications },
    { icon: MessageCircle, label: "Comentarios que hizo", value: stats.commentsMade },
    { icon: ThumbsUp, label: "Reacciones recibidas", value: stats.reactionsReceived },
    { icon: MessageCircle, label: "Comentarios recibidos", value: stats.commentsReceived },
    { icon: Bookmark, label: "Guardado por otros", value: stats.savedByOthers },
  ];

  return (
    <div className="mx-auto max-w-lg px-4 py-10 text-center">
      <div className="relative flex h-20 w-20 items-center justify-center overflow-hidden rounded-full bg-zinc-100 ring-4 ring-emerald-100 mx-auto">
        {profile.avatarUrl ? (
          <Image src={profile.avatarUrl} alt="" fill sizes="80px" className="object-cover" />
        ) : (
          <UserCircle2 className="h-12 w-12 text-zinc-400" />
        )}
      </div>

      <h1 className="mt-4 text-2xl font-bold tracking-tight text-zinc-900">{profile.username}</h1>
      <p className="mt-1 flex items-center justify-center gap-1.5 text-sm font-semibold text-emerald-700">
        <HeartHandshake className="h-4 w-4" />
        Voluntario digital de El Mundo Te Busca
      </p>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {items.map((it, i) => (
          <div
            key={it.label}
            className={`rounded-xl border border-zinc-200 bg-white p-3 ${
              i === items.length - 1 && items.length % 2 === 1 ? "col-span-2 sm:col-span-1" : ""
            }`}
          >
            <it.icon className="mx-auto h-4 w-4 text-emerald-600" />
            <p className="mt-1 text-lg font-bold text-zinc-900">{it.value}</p>
            <p className="text-[11px] leading-tight text-zinc-500">{it.label}</p>
          </div>
        ))}
      </div>

      <div className="mt-8 rounded-2xl border border-emerald-200 bg-emerald-50/60 p-5">
        <p className="text-sm text-emerald-900">
          Cada publicación, comentario y comparte ayuda a que más gente vea lo que importa. ¿Quieres
          ser voluntario digital también?
        </p>
        <Link
          href="/"
          className="press mt-3 inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700"
        >
          Súmate en El Mundo Te Busca
        </Link>
      </div>
    </div>
  );
}
