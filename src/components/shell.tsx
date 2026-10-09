"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSyncExternalStore } from "react";
import {
  LayoutDashboard,
  BriefcaseBusiness,
  Users,
  Inbox,
  Clock3,
  Settings,
  Moon,
  Sun,
  ArrowUpRight,
  ShieldCheck,
  Menu,
  X,
} from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
const links = [
  ["/dashboard", "Overview", LayoutDashboard],
  ["/applications", "Applications", BriefcaseBusiness],
  ["/contacts", "Contacts", Users],
  ["/inbox", "Job inbox", Inbox],
  ["/follow-ups", "Follow-ups", Clock3],
  ["/settings", "Settings", Settings],
] as const;
const subscribe = (cb: () => void) => {
  window.addEventListener("theme-change", cb);
  return () => window.removeEventListener("theme-change", cb);
};
export function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const dark = useSyncExternalStore(
    subscribe,
    () => localStorage.getItem("jobhunt-theme") === "dark",
    () => false,
  );
  function toggle() {
    const theme = dark ? "light" : "dark";
    localStorage.setItem("jobhunt-theme", theme);
    document.documentElement.classList.toggle("dark", theme === "dark");
    window.dispatchEvent(new Event("theme-change"));
  }
  return (
    <div className="min-h-screen">
      <button
        aria-label="Toggle navigation"
        className="fixed top-4 left-4 z-50 rounded-lg bg-card p-2 shadow lg:hidden"
        onClick={() => setOpen(!open)}
      >
        {open ? <X size={20} /> : <Menu size={20} />}
      </button>
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-60 flex-col border-r border-border bg-card px-5 py-7 transition-transform lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <Link href="/dashboard" className="mb-1 flex items-center gap-3 px-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-600 text-white">
            <BriefcaseBusiness size={20} />
          </span>
          <span className="text-lg font-bold tracking-tight">
            JobHunt<span className="text-indigo-500">.</span>
          </span>
        </Link>
        <div className="mb-10 ml-14 text-[10px] text-muted-foreground">
          YOUR NEXT CHAPTER
        </div>
        <div className="eyebrow mb-3 px-3">Workspace</div>
        <nav className="space-y-1">
          {links.map(([href, label, Icon]) => (
            <Link
              key={href}
              href={href}
              onClick={() => setOpen(false)}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-3 text-[13px] font-medium",
                path.startsWith(href)
                  ? "bg-indigo-50 text-indigo-600 dark:bg-indigo-950 dark:text-indigo-300"
                  : "text-muted-foreground hover:bg-muted",
              )}
            >
              <Icon size={18} />
              {label}
            </Link>
          ))}
        </nav>
        <div className="mt-auto">
          <div className="mb-5 rounded-xl border border-border bg-background p-4">
            <ShieldCheck size={20} className="mb-2 text-indigo-500" />
            <p className="text-xs font-semibold">Your career. Your data.</p>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              Stored locally on this device. You stay in control.
            </p>
            <Link
              href="/settings"
              className="mt-3 flex items-center gap-1 text-xs text-indigo-500"
            >
              Privacy settings <ArrowUpRight size={13} />
            </Link>
          </div>
          <button
            onClick={toggle}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-xs text-muted-foreground"
          >
            {dark ? <Sun size={17} /> : <Moon size={17} />}{" "}
            {dark ? "Light mode" : "Dark mode"}
          </button>
          <div className="mt-4 flex items-center gap-3 border-t border-border pt-5">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-orange-100 text-sm font-bold text-orange-700">
              H
            </div>
            <div>
              <div className="text-xs font-semibold">Local workspace</div>
              <div className="mt-1 text-[10px] text-muted-foreground">
                Student · Internship search
              </div>
            </div>
            <span className="ml-auto h-2 w-2 rounded-full bg-emerald-500" />
          </div>
        </div>
      </aside>
      <main className="lg:ml-60">
        <header className="flex h-[76px] items-center justify-between border-b border-border bg-card px-6 pl-16 lg:px-9">
          <div className="text-xs text-muted-foreground">
            Workspace <span className="mx-3 text-border">/</span>
            <span className="font-medium text-foreground">
              {links.find(([href]) => path.startsWith(href))?.[1] ||
                "JobHunt Tracker"}
            </span>
          </div>
          <span className="flex items-center gap-2 rounded-full border border-border px-3 py-1.5 text-[10px] text-muted-foreground">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />{" "}
            Local-first
          </span>
        </header>
        <div className="mx-auto max-w-[1500px] p-5 lg:p-9">{children}</div>
      </main>
    </div>
  );
}
