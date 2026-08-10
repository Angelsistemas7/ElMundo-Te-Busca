import { CardGridSkeleton } from "@/components/ListSkeletons";

export default function Loading() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <div className="mb-6 h-24 animate-pulse rounded-2xl bg-zinc-100" />
      <CardGridSkeleton variant="photo" />
    </div>
  );
}
