"use client";

import { useCallback, useEffect, useState } from "react";
import {
  getActivityForEntities,
  getMyPublicationsAction,
  getSavedItemsAction,
  getSessionUserAction,
} from "@/app/actions";
import type { CommentEntity } from "./types";
import { getMyPubs, getSeen, managePath, markSeen, type Counts, type MyPubType } from "./myPubs";

// Compartido entre la campanita (NotificationBell, vista corta en desplegable)
// y /notificaciones (vista completa) — misma lógica, dos presentaciones.

type Activity = Record<string, Counts>;

// Clave estable por entidad (mismo formato que usa myPubs), pero admite todos
// los tipos comentables (los guardados pueden ser hospital, denuncia, etc.).
const keyOf = (type: CommentEntity, id: string) => `${type}:${id}`;

// Una entrada: o es TUYA (con enlace de gestión) o la GUARDASTE (con enlace
// público). Ambas avisan de comentarios nuevos.
export type NotificationEntry = {
  key: string;
  type: CommentEntity;
  id: string;
  title: string;
  saved: boolean;
  token: string;
};

export const TYPE_LABEL: Record<CommentEntity, string> = {
  person: "Persona",
  post: "Publicación",
  aid_point: "Punto de ayuda",
  march: "Caravana",
  hospital: "Hospital",
  complaint: "Denuncia",
  pet: "Mascota",
  hero: "Héroe",
  news_item: "Noticia",
};

// Enlace público para lo guardado. Lo que no tiene ficha propia va a su feed.
const PUBLIC_PATH: Record<CommentEntity, (id: string) => string> = {
  person: (id) => `/persona/${id}`,
  aid_point: (id) => `/ayuda/${id}`,
  march: (id) => `/caravanas/${id}`,
  hospital: (id) => `/hospitales/${id}`,
  post: () => "/comunidad",
  complaint: () => "/denuncias",
  pet: (id) => `/mascotas/${id}`,
  hero: () => "/ayuda",
  news_item: () => "/comunidad",
};

export function useNotifications() {
  const [entries, setEntries] = useState<NotificationEntry[]>([]);
  const [activity, setActivity] = useState<Activity>({});
  const [seen, setSeenState] = useState<Activity>({});
  const [loggedIn, setLoggedIn] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setLoggedIn(!!(await getSessionUserAction()));
    } catch {
      setLoggedIn(false);
    }

    // 1) Publicaciones propias: de este dispositivo (token) + de tu cuenta.
    const owned: NotificationEntry[] = getMyPubs().map((p) => ({
      key: keyOf(p.type, p.id),
      type: p.type,
      id: p.id,
      title: p.title,
      saved: false,
      token: p.token,
    }));
    const known = new Set(owned.map((e) => e.key));
    try {
      const account = await getMyPublicationsAction();
      for (const a of account) {
        const k = keyOf(a.type, a.id);
        if (!known.has(k)) {
          owned.push({ key: k, type: a.type, id: a.id, title: a.title, saved: false, token: "" });
          known.add(k);
        }
      }
    } catch {
      /* sin sesión o sin Supabase: solo las locales */
    }

    // 2) Guardados (solo con cuenta). Omite los que ya son tuyos.
    let saved: NotificationEntry[] = [];
    try {
      const items = await getSavedItemsAction();
      saved = items
        .filter((s) => !known.has(keyOf(s.type, s.id)))
        .map((s) => ({
          key: keyOf(s.type, s.id),
          type: s.type,
          id: s.id,
          title: s.title || TYPE_LABEL[s.type],
          saved: true,
          token: "",
        }));
    } catch {
      /* sin sesión: sin guardados */
    }

    const all = [...owned, ...saved];
    setEntries(all);
    setSeenState(getSeen());
    if (all.length === 0) {
      setActivity({});
      return;
    }

    try {
      const act = await getActivityForEntities(all.map((e) => ({ type: e.type, id: e.id })));
      setActivity(act);

      // Línea base de los guardados nuevos: lo que YA tienen no cuenta como
      // nuevo; solo la actividad posterior a guardarlos avisa.
      const seenNow = getSeen();
      const partial: Activity = {};
      for (const e of saved) {
        if (!seenNow[e.key]) partial[e.key] = act[e.key] ?? { comments: 0, reports: 0 };
      }
      if (Object.keys(partial).length > 0) {
        markSeen(partial);
        setSeenState(getSeen());
      }
    } catch {
      /* si falla la consulta, no rompemos la vista */
    }
  }, []);

  useEffect(() => {
    refresh();
    const onFocus = () => refresh();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refresh]);

  function newsOf(e: NotificationEntry) {
    const cur = activity[e.key] ?? { comments: 0, reports: 0 };
    const base = seen[e.key] ?? { comments: 0, reports: 0 };
    const comments = Math.max(0, cur.comments - base.comments);
    const reports = Math.max(0, cur.reports - base.reports);
    return { comments, reports, total: comments + reports };
  }

  const totalNew = entries.reduce((n, e) => n + newsOf(e).total, 0);

  function markRead() {
    markSeen(activity);
    setSeenState(getSeen());
  }

  function linkFor(e: NotificationEntry) {
    return e.saved ? PUBLIC_PATH[e.type](e.id) : managePath(e.type as MyPubType, e.id, e.token);
  }

  return { entries, newsOf, totalNew, markRead, linkFor, refresh, loggedIn };
}
