import Link from "next/link";
import { Plus, ArrowUpRight, BriefcaseBusiness } from "lucide-react";
import { Button } from "./ui/button";
export function PageHeading({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="mb-7 flex flex-wrap items-center justify-between gap-4">
      <div>
        <h1 className="text-[27px] font-bold tracking-tight">{title}</h1>
        <p className="mt-2 text-[13px] text-muted-foreground">{description}</p>
      </div>
      <div className="flex items-center gap-2">{children}</div>
    </div>
  );
}
export function NewApplication() {
  return (
    <Button asChild>
      <Link href="/applications/new">
        <Plus size={16} /> Add application
      </Link>
    </Button>
  );
}
export function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`badge status-${status.replaceAll(" ", "-")}`}>
      {status}
    </span>
  );
}
export function Empty({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="p-12 text-center">
      <BriefcaseBusiness className="mx-auto mb-4 text-indigo-400" size={30} />
      <p className="font-semibold">{title}</p>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
        {description}
      </p>
    </div>
  );
}
export function ViewLink({
  href,
  label = "View all",
}: {
  href: string;
  label?: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-1 text-xs font-medium text-indigo-500"
    >
      {label}
      <ArrowUpRight size={14} />
    </Link>
  );
}
