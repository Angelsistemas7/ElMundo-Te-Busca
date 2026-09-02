// Esqueletos de carga para las páginas de listado (evitan el salto de layout
// y el spinner genérico mientras el servidor trae los datos — mismo patrón
// que HomeSkeletons.tsx pero para las rutas /ayuda, /hospitales, etc.).

function Bar({ className }: { className: string }) {
  return <div className={`rounded bg-zinc-200 ${className}`} />;
}

// Tarjeta con foto arriba: ayuda, mascotas.
export function PhotoCardSkeleton() {
  return (
    <div className="animate-pulse overflow-hidden rounded-3xl border border-zinc-200 bg-white">
      <div className="h-40 w-full bg-zinc-200" />
      <div className="flex flex-col gap-2 p-4">
        <div className="flex gap-2">
          <Bar className="h-5 w-20" />
          <Bar className="h-5 w-16" />
        </div>
        <Bar className="h-4 w-3/4" />
        <Bar className="h-3.5 w-1/2" />
        <Bar className="mt-2 h-3.5 w-2/3" />
      </div>
    </div>
  );
}

// Tarjeta sin foto: hospitales, caravanas.
export function TextCardSkeleton() {
  return (
    <div className="animate-pulse flex flex-col gap-3 rounded-3xl border border-zinc-200 bg-white p-5">
      <div className="flex items-start justify-between gap-3">
        <Bar className="h-5 w-2/5" />
        <Bar className="h-5 w-20 rounded-full" />
      </div>
      <Bar className="h-4 w-1/3" />
      <Bar className="h-3.5 w-3/4" />
      <Bar className="h-3.5 w-1/2" />
      <div className="mt-2 flex items-center justify-between border-t border-zinc-100 pt-3">
        <Bar className="h-4 w-16" />
        <Bar className="h-4 w-12" />
      </div>
    </div>
  );
}

export function CardGridSkeleton({
  variant = "photo",
  count = 6,
}: {
  variant?: "photo" | "text";
  count?: number;
}) {
  const Item = variant === "photo" ? PhotoCardSkeleton : TextCardSkeleton;
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: count }).map((_, i) => (
        <Item key={i} />
      ))}
    </div>
  );
}

// Foto cuadrada: /se-busca, /sin-identificar.
export function PersonGridSkeleton({ count = 10 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="animate-pulse overflow-hidden rounded-3xl border border-zinc-200 bg-white">
          <div className="aspect-square w-full bg-zinc-200" />
          <div className="flex flex-col gap-1.5 p-4">
            <Bar className="h-4 w-4/5" />
            <Bar className="h-3 w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );
}

// Fila horizontal: /voluntarios, /denuncias.
export function ListRowSkeleton({ count = 6 }: { count?: number }) {
  return (
    <ul className="flex flex-col gap-3">
      {Array.from({ length: count }).map((_, i) => (
        <li key={i} className="animate-pulse flex gap-3 rounded-2xl border border-zinc-200 bg-white p-4">
          <div className="h-10 w-10 shrink-0 rounded-full bg-zinc-200" />
          <div className="flex flex-1 flex-col gap-2">
            <Bar className="h-4 w-1/3" />
            <Bar className="h-3.5 w-2/3" />
            <Bar className="h-3.5 w-1/2" />
          </div>
        </li>
      ))}
    </ul>
  );
}

// Publicación de Comunidad (avatar + texto).
export function PostCardSkeleton() {
  return (
    <div className="animate-pulse rounded-3xl border border-zinc-200 bg-white p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <div className="h-9 w-9 shrink-0 rounded-full bg-zinc-200" />
        <div className="flex-1 space-y-2">
          <Bar className="h-3.5 w-1/3" />
          <Bar className="h-5 w-24 rounded-full" />
        </div>
      </div>
      <div className="mt-3 space-y-2">
        <Bar className="h-3.5 w-full" />
        <Bar className="h-3.5 w-5/6" />
        <Bar className="h-3.5 w-2/3" />
      </div>
    </div>
  );
}

export function PostFeedSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="flex flex-col gap-4">
      {Array.from({ length: count }).map((_, i) => (
        <PostCardSkeleton key={i} />
      ))}
    </div>
  );
}

// Sección de comentarios/reportes en una ficha individual (persona, ayuda,
// hospital, caravana): título + 2 filas simuladas de comentario.
export function CommentSectionSkeleton() {
  return (
    <div className="animate-pulse rounded-2xl border border-zinc-200 bg-white p-5">
      <Bar className="h-4 w-40" />
      <div className="mt-4 space-y-3">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="flex gap-3">
            <div className="h-8 w-8 shrink-0 rounded-full bg-zinc-200" />
            <div className="flex-1 space-y-2">
              <Bar className="h-3.5 w-1/4" />
              <Bar className="h-3.5 w-3/4" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Botón "Guardar" mientras se resuelve si el visitante es el autor (que no lo ve).
export function SaveButtonSkeleton() {
  return <div className="animate-pulse h-11 w-full rounded-xl bg-zinc-100" />;
}
