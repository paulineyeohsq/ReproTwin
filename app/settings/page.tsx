import Link from "next/link";
import { ChevronRight, Navigation, Bell, MapPin, Shield, Database, Info } from "lucide-react";

interface SettingsRow {
  icon: typeof Navigation;
  label: string;
  value?: string;
  href?: string;
}

interface SettingsSection {
  title: string;
  rows: SettingsRow[];
}

const SECTIONS: SettingsSection[] = [
  {
    title: "Navigation",
    rows: [{ icon: Navigation, label: "Preferred route", value: "Balanced", href: "/route-advisor" }],
  },
  {
    title: "Environmental alerts",
    rows: [{ icon: Bell, label: "Alerts", value: "On", href: "/navigate" }],
  },
  {
    title: "Location",
    rows: [{ icon: MapPin, label: "Location permission", value: "Requested per ride" }],
  },
  {
    title: "Privacy",
    rows: [{ icon: Shield, label: "Trip history", value: "Stored on this device", href: "/trip-history" }],
  },
  {
    title: "Data",
    rows: [{ icon: Database, label: "Environmental data sources", href: "/system-status" }],
  },
  {
    title: "About",
    rows: [{ icon: Info, label: "About Exposure-Aware Navigation" }],
  },
];

export default function SettingsPage() {
  return (
    <div className="mx-auto max-w-lg space-y-6 pb-4">
      <h1 className="text-2xl font-bold tracking-tight text-slate-900">Settings</h1>

      {SECTIONS.map((section) => (
        <div key={section.title}>
          <p className="mb-1.5 px-1 text-xs font-semibold uppercase tracking-wide text-slate-400">{section.title}</p>
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
            {section.rows.map((row, i) => {
              const Icon = row.icon;
              const content = (
                <div
                  className={`flex min-h-[56px] items-center gap-3 px-4 py-3 ${
                    i > 0 ? "border-t border-slate-100" : ""
                  } ${row.href ? "hover:bg-slate-50 active:bg-slate-100" : ""}`}
                >
                  <Icon className="h-5 w-5 shrink-0 text-slate-400" />
                  <span className="flex-1 text-[15px] text-slate-800">{row.label}</span>
                  {row.value && <span className="text-sm text-slate-400">{row.value}</span>}
                  {row.href && <ChevronRight className="h-4 w-4 text-slate-300" />}
                </div>
              );
              return row.href ? (
                <Link key={row.label} href={row.href}>
                  {content}
                </Link>
              ) : (
                <div key={row.label}>{content}</div>
              );
            })}
          </div>
        </div>
      ))}

      <p className="px-1 text-xs text-slate-400">
        Exposure-Aware Navigation is a research prototype. It estimates air-pollution exposure using
        modelled and monitoring-station data — it is not a personal pollution sensor and not medical
        advice.
      </p>
    </div>
  );
}
