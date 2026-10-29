const STATUS_STYLE: Record<string, string> = {
  drafting: "bg-muted text-muted-foreground",
  under_review: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  revise: "bg-orange-500/15 text-orange-700 dark:text-orange-300",
  accepted: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  rejected: "bg-red-500/15 text-red-700 dark:text-red-300",
  published: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  final: "bg-muted text-muted-foreground",
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[status] ?? STATUS_STYLE.drafting}`}
    >
      {status.replace("_", " ")}
    </span>
  );
}
