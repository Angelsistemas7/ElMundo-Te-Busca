"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { LogOut, Settings, ShieldCheck, UserCircle2, UserRound } from "lucide-react";
import { getMyProfileAction, signOutAction } from "@/app/actions";
import { getAdminLevelAction } from "@/app/admin/actions";

type BasicUser = { id: string; username: string };

// Reemplaza el óvalo estático de "Fulano · Salir" por un menú desplegable con
// accesos directos: perfil, configuración, salir. Igual patrón que la
// campanita (NotificationBell): botón + panel flotante que se cierra al
// tocar afuera o con Escape.
//
// `user` lo pasa `AuthMenu`, que YA verificó la sesión para decidir si
// mostrar este componente en vez del botón "Entrar" — pedirla otra vez aquí
// sería una segunda ida y vuelta al servidor redundante en CADA carga de
// página para cualquiera con sesión iniciada. Solo se pide aparte lo que
// AuthMenu no tiene: la foto de perfil.
export function ProfileMenu({ user }: { user: BasicUser }) {
  const router = useRouter();
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [adminLevel, setAdminLevel] = useState<"admin" | "moderator" | null>(null);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    getMyProfileAction()
      .then((full) => setAvatarUrl(full?.avatarUrl ?? null))
      .catch(() => setAvatarUrl(null));
    // Atajo a /admin: solo se muestra si esta cuenta tiene acceso (admin o
    // moderador), para no ofrecer un enlace muerto a quien no lo tiene.
    getAdminLevelAction()
      .then(setAdminLevel)
      .catch(() => setAdminLevel(null));
  }, []);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function logout() {
    setOpen(false);
    await signOutAction();
    router.refresh();
    window.location.reload();
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="press flex items-center gap-1.5 rounded-full bg-zinc-100 py-1 pl-1 pr-3 text-sm font-medium text-zinc-700 transition hover:bg-zinc-200"
      >
        {avatarUrl ? (
          <Image src={avatarUrl} alt="" width={28} height={28} className="h-7 w-7 rounded-full object-cover" />
        ) : (
          <UserCircle2 className="h-7 w-7 text-zinc-500" />
        )}
        <span className="hidden max-w-[9rem] truncate sm:inline">{user.username}</span>
      </button>

      {open && (
        <div className="absolute right-0 top-11 z-50 w-52 overflow-hidden rounded-2xl border border-zinc-200 bg-white py-1.5 shadow-xl">
          <Link
            href="/perfil"
            onClick={() => setOpen(false)}
            className="press flex items-center gap-2.5 px-4 py-2.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
          >
            <UserRound className="h-4 w-4 text-zinc-400" />
            Mi perfil
          </Link>
          <Link
            href="/configuracion"
            onClick={() => setOpen(false)}
            className="press flex items-center gap-2.5 px-4 py-2.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
          >
            <Settings className="h-4 w-4 text-zinc-400" />
            Configuración
          </Link>
          {adminLevel && (
            <Link
              href="/admin"
              onClick={() => setOpen(false)}
              className="press flex items-center gap-2.5 px-4 py-2.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
            >
              <ShieldCheck className="h-4 w-4 text-zinc-400" />
              Panel de moderación
            </Link>
          )}
          <div className="my-1 border-t border-zinc-100" />
          <button
            onClick={logout}
            className="press flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm font-medium text-rose-600 hover:bg-rose-50"
          >
            <LogOut className="h-4 w-4" />
            Cerrar sesión
          </button>
        </div>
      )}
    </div>
  );
}
