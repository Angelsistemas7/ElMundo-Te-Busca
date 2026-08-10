import { PostFeedSkeleton } from "@/components/ListSkeletons";

export default function Loading() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <div className="mb-6 h-24 animate-pulse rounded-2xl bg-zinc-100" />
      <PostFeedSkeleton />
    </div>
  );
}
