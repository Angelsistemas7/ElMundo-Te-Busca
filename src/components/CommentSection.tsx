"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { CornerDownRight, Heart, ImagePlus, Loader2, MessageCircle, Reply, Send, X } from "lucide-react";
import type { Comment, CommentEntity } from "@/lib/types";
import { getMyProfileAction, getSessionUserAction, likeCommentAction, postCommentAction } from "@/app/actions";
import { uploadPhoto } from "@/lib/upload";
import { compressImage } from "@/lib/image";
import { cn, timeAgo } from "@/lib/utils";
import { Avatar } from "./Avatar";
import { Turnstile, type TurnstileHandle } from "./Turnstile";
import { PhotoView } from "./PhotoView";
import { useAuthorName } from "./AuthorNameField";

// Nombre de quien comenta sin cuenta: se recuerda por dispositivo (mismo
// patrón que la dedup de votos/"me gusta") para no tener que escribirlo cada
// vez, hasta que la persona cree una cuenta real.
const ANON_NAME_KEY = "vtb_anon_comment_name";

export function CommentSection({
  entityType,
  entityId,
  initialComments,
  title = "Comunidad",
  placeholder = "Aporta lo que sepas: lo vi, lo reconozco, dónde estaba...",
  prefix,
}: {
  entityType: CommentEntity;
  entityId: string;
  initialComments: Comment[];
  title?: string;
  placeholder?: string;
  /** Contenido opcional que se ve DENTRO de esta misma tarjeta, antes del
   * formulario (p. ej. reportes de estado en la ficha de persona) — para que
   * se sienta como una sola sección en vez de dos cajas separadas. */
  prefix?: React.ReactNode;
}) {
  const [comments, setComments] = useState<Comment[]>(initialComments);
  const author = useAuthorName(ANON_NAME_KEY);
  const [sessionName, setSessionName] = useState<string | null>(null);
  const [sessionAvatar, setSessionAvatar] = useState<string | null>(null);
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [replyTo, setReplyTo] = useState<{ id: string; authorName: string } | null>(null);
  // El comentario recién publicado en ESTA sesión (para darle la animación de
  // entrada); ya no se puede detectar por prefijo "tmp-" porque ahora usamos
  // el id real que devuelve el servidor.
  const [justPostedId, setJustPostedId] = useState<string | null>(null);
  const fileRef = useRef<File | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const turnstileRef = useRef<TurnstileHandle>(null);

  const canSubmit = author.name.trim().length >= 2 && (body.trim().length >= 2 || fileRef.current);

  // Con sesión, se comenta con la identidad de la cuenta (el servidor también lo
  // impone). Ocultamos el campo de nombre y usamos el del usuario.
  useEffect(() => {
    getSessionUserAction()
      .then((u) => {
        if (u) {
          setSessionName(u.username);
          getMyProfileAction()
            .then((p) => setSessionAvatar(p?.avatarUrl ?? null))
            .catch(() => {});
        }
      })
      .catch(() => {});
  }, []);

  // Profundidad de respuesta SIN límite (parent_id ya admite cualquier
  // comentario como padre, no solo la raíz) pero con UN SOLO nivel de sangría
  // visual: todo lo que cuelga de una raíz —sin importar cuántos niveles de
  // "respuesta a una respuesta" tenga— se aplana en una sola lista cronológica
  // bajo esa raíz. Cuando el padre directo de un comentario no es la raíz (una
  // respuesta a otra respuesta), se aclara a quién responde con una etiqueta,
  // en vez de seguir indentando y dejar el texto sin espacio en móvil.
  const { roots, threadByRoot, byId } = useMemo(() => {
    const byId = new Map(comments.map((c) => [c.id, c]));
    const childrenOf = new Map<string, Comment[]>();
    for (const c of comments) {
      if (!c.parentId) continue;
      const arr = childrenOf.get(c.parentId) ?? [];
      arr.push(c);
      childrenOf.set(c.parentId, arr);
    }
    const roots = comments
      .filter((c) => !c.parentId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    function collectDescendants(rootId: string): Comment[] {
      const out: Comment[] = [];
      const queue = [...(childrenOf.get(rootId) ?? [])];
      while (queue.length > 0) {
        const c = queue.shift()!;
        out.push(c);
        const kids = childrenOf.get(c.id);
        if (kids) queue.push(...kids);
      }
      return out.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    }

    const threadByRoot = new Map<string, Comment[]>();
    for (const r of roots) threadByRoot.set(r.id, collectDescendants(r.id));

    return { roots, threadByRoot, byId };
  }, [comments]);

  function startReply(c: Comment) {
    // Responde al comentario exacto que se tocó (root o respuesta): el padre
    // real se conserva, aunque visualmente todo se muestre al mismo nivel.
    setReplyTo({ id: c.id, authorName: c.authorName });
    textareaRef.current?.focus();
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const formEl = e.currentTarget as HTMLFormElement;
    if (submitting || !canSubmit) return;
    setSubmitting(true);
    setError(null);

    const parentId = replyTo?.id ?? null;
    const form = new FormData();
    form.set("entityType", entityType);
    form.set("entityId", entityId);
    form.set("authorName", author.name);
    form.set("body", body);
    if (parentId) form.set("parentId", parentId);

    // Anti-bot solo para anónimos; con sesión (identidad verificada) se omite.
    if (!sessionName) {
      const tokenEl = formEl.querySelector(
        'input[name="cf-turnstile-response"]',
      ) as HTMLInputElement | null;
      form.set("cf-turnstile-response", tokenEl?.value ?? "");
    }

    let photoUrl: string | null = null;
    if (fileRef.current) {
      try {
        photoUrl = await uploadPhoto(await compressImage(fileRef.current));
        if (photoUrl) form.set("photoUrl", photoUrl);
      } catch {
        setError("No se pudo subir la foto. Intenta de nuevo.");
        return;
      }
    }

    const res = await postCommentAction(form);
    if (res.ok) {
      author.commit();
      // Usamos el id REAL que devuelve el servidor (no uno temporal): si no,
      // dar "me gusta" a un comentario recién publicado (antes de recargar la
      // página) apuntaba a un id que no existía en la base de datos y el like
      // se perdía en silencio.
      const newId = res.id ?? `tmp-${Date.now()}`;
      setComments((prev) => [
        {
          id: newId,
          entityType,
          entityId,
          parentId,
          authorName: author.name,
          body,
          photoUrl: photoUrl ?? preview,
          likes: 0,
          createdAt: new Date().toISOString(),
          authorUsername: sessionName,
          authorAvatarUrl: sessionAvatar,
        },
        ...prev,
      ]);
      setJustPostedId(newId);
      setBody("");
      setPreview(null);
      setReplyTo(null);
      fileRef.current = null;
    } else {
      setError(res.error);
      turnstileRef.current?.reset();
    }
    setSubmitting(false);
  }

  // Avatar + burbuja (nombre+texto) + fila de acciones. `replyToName` solo se
  // pinta cuando el padre real NO es la raíz del hilo (una respuesta a otra
  // respuesta) — como todo se ve al mismo nivel, sin la etiqueta se perdería
  // a quién le estaban respondiendo.
  function renderCommentBody(c: Comment, replyToName?: string) {
    return (
      <div className="flex gap-2">
        <Avatar src={c.authorAvatarUrl} username={c.authorUsername} size="sm" className="mt-0.5" />
        <div className="min-w-0 flex-1">
          <div className="rounded-xl bg-zinc-100 px-3 py-2">
            {replyToName && (
              <p className="mb-0.5 flex items-center gap-1 text-xs font-medium text-zinc-400">
                <CornerDownRight className="h-3 w-3" />
                Respondiendo a {replyToName}
              </p>
            )}
            {c.authorUsername ? (
              <Link
                href={`/perfil/publico/${c.authorUsername}`}
                className="text-sm font-semibold text-zinc-800 hover:underline"
              >
                {c.authorName}
              </Link>
            ) : (
              <span className="inline-flex flex-wrap items-center gap-1.5">
                <span className="text-sm font-semibold text-zinc-800">{c.authorName}</span>
                <span className="rounded-full bg-zinc-200 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                  Sin verificar
                </span>
              </span>
            )}
            {c.body && <p className="mt-0.5 whitespace-pre-wrap text-sm text-zinc-600">{c.body}</p>}
            {c.photoUrl && (
              <PhotoView src={c.photoUrl} alt="Evidencia" className="mt-2 h-48 w-48 rounded-lg" />
            )}
          </div>
          <div className="mt-1 flex items-center gap-3 pl-1">
            <span className="text-xs text-zinc-400">{timeAgo(c.createdAt)}</span>
            <CommentLike id={c.id} likes={c.likes} />
            <button
              type="button"
              onClick={() => startReply(c)}
              className="press inline-flex items-center gap-1 text-xs font-medium text-zinc-500 transition hover:text-brand-700"
            >
              <Reply className="h-3.5 w-3.5" />
              Responder
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Una raíz + TODO su hilo (cualquier profundidad) aplanado en una sola
  // lista cronológica, con un único nivel de sangría.
  function renderRoot(root: Comment) {
    const thread = threadByRoot.get(root.id) ?? [];
    return (
      <li key={root.id} className={cn(root.id === justPostedId && "animate-rise")}>
        {renderCommentBody(root)}

        {thread.length > 0 && (
          <ul className="mt-2 space-y-2.5 border-l-2 border-zinc-200 pl-3">
            {thread.map((c) => {
              const parent = c.parentId ? byId.get(c.parentId) : undefined;
              const replyToName = parent && parent.id !== root.id ? parent.authorName : undefined;
              return (
                <li key={c.id} className={cn(c.id === justPostedId && "animate-rise")}>
                  {renderCommentBody(c, replyToName)}
                </li>
              );
            })}
          </ul>
        )}
      </li>
    );
  }

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-5">
      <h2 className="flex items-center gap-2 font-semibold text-zinc-900">
        <MessageCircle className="h-4.5 w-4.5 text-zinc-500" />
        {title}
        <span className="text-sm font-normal text-zinc-400">({comments.length})</span>
      </h2>

      {prefix && <div className="mt-4">{prefix}</div>}

      <form onSubmit={submit} className="mt-4 space-y-2">
        {replyTo && (
          <div className="flex items-center justify-between rounded-lg bg-brand-50 px-3 py-1.5 text-xs font-medium text-brand-800">
            <span className="inline-flex items-center gap-1">
              <CornerDownRight className="h-3.5 w-3.5" />
              Respondiendo a {replyTo.authorName}
            </span>
            <button
              type="button"
              onClick={() => setReplyTo(null)}
              className="hover:text-brand-900"
              aria-label="Cancelar respuesta"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
        {sessionName ? (
          <p className="text-xs text-zinc-500">
            Comentando como <span className="font-semibold text-zinc-700">{sessionName}</span>
          </p>
        ) : author.locked ? (
          <div className="flex items-center gap-2">
            <input
              value={author.name}
              readOnly
              aria-label="Tu nombre"
              className="w-full rounded-lg border border-zinc-300 bg-zinc-50 px-3 py-2 text-base text-zinc-700 outline-none sm:text-sm"
            />
            <button
              type="button"
              onClick={author.unlock}
              className="shrink-0 text-xs font-medium text-brand-700 underline underline-offset-2 hover:text-brand-800"
            >
              ¿No eres tú?
            </button>
          </div>
        ) : (
          <input
            value={author.name}
            onChange={(e) => author.setName(e.target.value)}
            placeholder="Tu nombre"
            aria-label="Tu nombre"
            className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-base outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100 sm:text-sm"
          />
        )}
        <div className="flex gap-2">
          {sessionName && <Avatar src={sessionAvatar} size="sm" className="mt-1.5" />}
          <textarea
            ref={textareaRef}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={replyTo ? `Responde a ${replyTo.authorName}...` : placeholder}
            aria-label={replyTo ? `Responder a ${replyTo.authorName}` : "Escribe un comentario"}
            rows={2}
            className="w-full resize-y rounded-lg border border-zinc-300 px-3 py-2 text-base outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100 sm:text-sm"
          />
          <div className="flex flex-col gap-1.5 self-end">
            <label className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-lg border border-zinc-300 text-zinc-500 hover:bg-zinc-50" title="Adjuntar foto">
              <ImagePlus className="h-4 w-4" />
              <span className="sr-only">Adjuntar foto</span>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                aria-label="Adjuntar foto"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  fileRef.current = file;
                  setPreview(URL.createObjectURL(file));
                }}
              />
            </label>
            <button
              type="submit"
              disabled={submitting || !canSubmit}
              aria-label="Enviar comentario"
              className="press flex h-10 w-10 items-center justify-center rounded-lg bg-zinc-900 text-white transition hover:bg-zinc-800 disabled:opacity-50"
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </button>
          </div>
        </div>
        {preview && (
          <div className="relative w-fit">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={preview} alt="Adjunto" className="h-20 rounded-lg object-cover" />
            <button
              type="button"
              onClick={() => {
                setPreview(null);
                fileRef.current = null;
              }}
              className="absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full bg-zinc-900 text-white"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        )}
        {!sessionName && <Turnstile ref={turnstileRef} />}
        {error && <p className="text-xs font-medium text-rose-600">{error}</p>}
      </form>

      <ul className="mt-5 space-y-3">
        {roots.length === 0 && (
          <li className="py-4 text-center text-sm text-zinc-500">
            Aún no hay comentarios. Sé el primero en aportar información.
          </li>
        )}
        {roots.map((c) => renderRoot(c))}
      </ul>
    </section>
  );
}

// "Me gusta" a un comentario. Uno por dispositivo (dedup con localStorage).
function CommentLike({ id, likes }: { id: string; likes: number }) {
  const [count, setCount] = useState(likes);
  const [liked, setLiked] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (localStorage.getItem(`vtb_clike_${id}`)) setLiked(true);
  }, [id]);

  async function like() {
    if (liked) return;
    setError(false);
    setLiked(true);
    setCount((n) => n + 1);
    localStorage.setItem(`vtb_clike_${id}`, "1");
    const res = await likeCommentAction(id);
    if (!res.ok) {
      setLiked(false);
      setCount((n) => Math.max(0, n - 1));
      localStorage.removeItem(`vtb_clike_${id}`);
      setError(true);
    }
  }

  return (
    <button
      type="button"
      onClick={like}
      disabled={liked}
      className={cn(
        "inline-flex items-center gap-1 text-xs font-medium transition",
        liked ? "text-rose-600" : "text-zinc-500 hover:text-rose-600",
      )}
    >
      <Heart className={cn("h-3.5 w-3.5", liked && "fill-rose-500 text-rose-500")} />
      <span className="tabular-nums">{count}</span>
      {error && (
        <span aria-live="polite" className="text-rose-600">
          No se pudo guardar. Intenta de nuevo.
        </span>
      )}
    </button>
  );
}
