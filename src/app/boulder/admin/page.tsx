'use client'

import Link from "next/link"
import Container from "@/components/Container"
import AccessDenied from "@/components/AccessDenied"
import { useUser } from "@clerk/nextjs"
import { useFirebaseAuth } from "@/hooks/useFirebaseAuth"
import { useUserRole, isStaffRole } from "@/hooks/useUserRole"
import { useMemo, useState } from "react"

type SetupItem = {
  id: string
  label: string
  ok: boolean
  actionLabel: string
  href: string
}

type Station = {
  id: string
  name: string
  categoryName: string
  detailLabel: string
  routeLabel: string
  ready: boolean
}

type AlertItem = {
  id: string
  text: string
  href: string
  tone?: "info" | "warn"
}

export default function BoulderAdminPage() {
  const { isLoaded, isSignedIn } = useUser()
  const { isFirebaseAuthenticated, error: firebaseError } = useFirebaseAuth()
  const { role, loading: roleLoading } = useUserRole()

  const waitingForFirebaseAuth = isSignedIn && !isFirebaseAuthenticated && !firebaseError
  if (!isLoaded || waitingForFirebaseAuth || roleLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-lg text-muted-foreground">Loading…</div>
      </div>
    )
  }

  if (!isSignedIn) {
    return <AccessDenied feature="Boulder Admin" message="Sign in with a staff/admin account to continue." />
  }

  if (!isStaffRole(role)) {
    return <AccessDenied feature="Boulder Admin (staff/admin only)" />
  }

  if (firebaseError) {
    return <AccessDenied feature="Boulder Admin" message="Firebase not available. Please refresh and try again." />
  }

  return <AdminInterface />
}

function AdminInterface() {
  // Mocked selections and status; to be wired to Firestore later
  const [selectedComp, setSelectedComp] = useState("youth-boulder-2025")
  const competitions = useMemo(
    () => [
      { id: "youth-boulder-2025", name: "Youth Boulder Challenge 2025", status: "Setup" },
      { id: "summer-open", name: "Summer Open", status: "Live" },
    ],
    []
  )
  const statusLabel = competitions.find((c) => c.id === selectedComp)?.status || "Setup"
  const statusTone =
    statusLabel.toLowerCase() === "live"
      ? "bg-emerald-500/20 text-emerald-200 border border-emerald-500/40"
      : statusLabel.toLowerCase() === "setup"
        ? "bg-amber-500/15 text-amber-200 border border-amber-400/40"
        : "bg-neutral-700/40 text-neutral-200 border border-neutral-500/40"

  const setupItems: SetupItem[] = [
    {
      id: "categories",
      label: "Categories configured",
      ok: true,
      actionLabel: "View setup",
      href: "/boulder/setup",
    },
    {
      id: "routes",
      label: "Routes missing in 2 categories",
      ok: false,
      actionLabel: "Go to setup",
      href: "/boulder/setup",
    },
    {
      id: "import",
      label: "Athletes imported",
      ok: true,
      actionLabel: "Open import",
      href: "/boulder/import",
    },
    {
      id: "scorecards",
      label: "Scorecards not printed",
      ok: false,
      actionLabel: "Go to scorecards",
      href: "/boulder/scorecards",
    },
  ]

  const stations: Station[] = [
    {
      id: "station-1",
      name: "Station 1",
      categoryName: "Youth C Girls",
      detailLabel: "Group 1",
      routeLabel: "B1",
      ready: true,
    },
    {
      id: "station-2",
      name: "Station 2",
      categoryName: "Youth C Girls",
      detailLabel: "Group 2",
      routeLabel: "B2",
      ready: false,
    },
    {
      id: "station-3",
      name: "Station 3",
      categoryName: "Youth C Boys",
      detailLabel: "Group 1",
      routeLabel: "B3",
      ready: true,
    },
  ]

  const alerts: AlertItem[] = [
    { id: "no-routes", text: "No routes configured for Youth C Girls.", href: "/boulder/setup", tone: "warn" },
    { id: "no-bibs", text: "8 athletes have no bib number.", href: "/boulder/import", tone: "warn" },
    { id: "scorecards", text: "Scorecards have not been generated yet.", href: "/boulder/scorecards", tone: "info" },
  ]

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-50">
      <div className="border-b border-neutral-800 bg-gradient-to-b from-neutral-900 via-neutral-950 to-black">
        <Container className="py-8">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm uppercase tracking-[0.2em] text-blue-400">Boulder Admin</p>
              <h1 className="mt-2 text-4xl font-black leading-tight md:text-5xl">
                Tools and status for running your boulder competitions
              </h1>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <select
                className="rounded-xl border border-border bg-input px-4 py-3 text-sm text-foreground focus:border-ring focus:outline-none"
                value={selectedComp}
                onChange={(e) => setSelectedComp(e.target.value)}
              >
                {competitions.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name || c.id}
                  </option>
                ))}
              </select>
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusTone}`}>{statusLabel}</span>
            </div>
          </div>
        </Container>
      </div>

      <Container className="py-8 space-y-10">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <section className="rounded-2xl border border-neutral-800 bg-neutral-900/70 p-6 shadow-xl shadow-black/20">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h2 className="text-2xl font-bold">
                  Setup for: {competitions.find((c) => c.id === selectedComp)?.name || "No competition selected"}
                </h2>
                <p className="text-sm text-neutral-400">Check setup health before you go live.</p>
              </div>
            </div>
            <div className="mt-4 divide-y divide-neutral-800 rounded-xl border border-neutral-800 bg-neutral-950/40">
              {setupItems.map((item) => (
                <div key={item.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="flex items-center gap-3">
                    <span
                      className={`flex h-6 w-6 items-center justify-center rounded-full text-sm font-semibold ${
                        item.ok ? "bg-emerald-500/15 text-emerald-300" : "bg-amber-500/15 text-amber-200"
                      }`}
                    >
                      {item.ok ? "✓" : "!"}
                    </span>
                    <span className="text-sm text-neutral-100">{item.label}</span>
                  </div>
                  <Link
                    href={item.href}
                    className="text-sm font-semibold text-blue-300 hover:text-blue-200 hover:underline"
                  >
                    {item.actionLabel}
                  </Link>
                </div>
              ))}
            </div>
            <div className="mt-4">
              <Link
                href="/boulder/setup"
                className="inline-flex items-center justify-center rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-primary/20 transition hover:opacity-90"
              >
                Continue setup
              </Link>
            </div>
          </section>

          <section className="rounded-2xl border border-neutral-800 bg-neutral-900/70 p-6 shadow-xl shadow-black/20">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h2 className="text-2xl font-bold">Run today</h2>
                <p className="text-sm text-neutral-400">Open judge tools and check stations.</p>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
              <QuickAction href="/boulder/judge" label="Open Judge Panel" />
              <QuickAction href="/boulder/chief" label="Open Chief Judge" />
              <QuickAction href="/boulder/leaderboard" label="View Leaderboard" />
            </div>

            <div className="mt-5">
              <h3 className="text-sm font-semibold text-neutral-200">Judge stations</h3>
              <div className="mt-3 space-y-3">
                {stations.map((station) => (
                  <div
                    key={station.id}
                    className="rounded-xl border border-neutral-800 bg-neutral-950/40 px-4 py-3 shadow-inner shadow-black/10"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-semibold text-neutral-100">{station.name}</div>
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                          station.ready
                            ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30"
                            : "bg-amber-500/15 text-amber-200 border border-amber-400/30"
                        }`}
                      >
                        {station.ready ? "Ready" : "Not ready"}
                      </span>
                    </div>
                    <div className="mt-1 grid grid-cols-1 gap-1 text-xs text-neutral-300 sm:grid-cols-3">
                      <span>
                        <strong className="text-neutral-200">Category:</strong> {station.categoryName}
                      </span>
                      <span>
                        <strong className="text-neutral-200">Detail:</strong> {station.detailLabel}
                      </span>
                      <span>
                        <strong className="text-neutral-200">Route:</strong> {station.routeLabel}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
              <p className="mt-3 text-xs text-neutral-500">
                Legend: Ready = judge has confirmed this station on their device. Not ready = no confirmation yet.
              </p>
            </div>
          </section>
        </div>

        <section className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-xl font-semibold">Tools</h3>
              <p className="text-sm text-neutral-400">Quick links to common tasks.</p>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            <ToolTile
              title="Setup competition"
              description="Configure categories, rounds and routes."
              href="/boulder/setup"
            />
            <ToolTile
              title="Import athletes"
              description="Upload athlete list from CSV/TSV."
              href="/boulder/import"
            />
            <ToolTile
              title="Scorecards"
              description="Generate printable athlete scorecards."
              href="/boulder/scorecards"
            />
            <ToolTile
              title="Judge Panel"
              description="Per-station input for judges."
              href="/boulder/judge"
            />
            <ToolTile
              title="Chief Judge"
              description="Live oversight and attempt corrections."
              href="/boulder/chief"
            />
            <ToolTile
              title="Live Leaderboard"
              description="Public results view for parents and athletes."
              href="/boulder/leaderboard"
            />
            <ToolTile
              title="Export results"
              description="Coming soon."
              href="#"
              disabled
            />
            <ToolTile
              title="Lock competition"
              description="Coming soon."
              href="#"
              disabled
            />
          </div>
        </section>

        <section className="space-y-3">
          <h3 className="text-xl font-semibold">Issues & warnings</h3>
          <div className="space-y-2 rounded-2xl border border-neutral-800 bg-neutral-900/70 p-4">
            {alerts.map((alert) => (
              <div
                key={alert.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-neutral-800 bg-neutral-950/40 px-3 py-2"
              >
                <div className="flex items-center gap-2 text-sm">
                  <span
                    className={`flex h-6 w-6 items-center justify-center rounded-full text-sm font-semibold ${
                      alert.tone === "warn" ? "bg-amber-500/15 text-amber-200" : "bg-blue-500/15 text-blue-200"
                    }`}
                  >
                    {alert.tone === "warn" ? "!" : "i"}
                  </span>
                  <span className="text-neutral-100">{alert.text}</span>
                </div>
                <Link href={alert.href} className="text-sm font-semibold text-blue-300 hover:text-blue-200 hover:underline">
                  View
                </Link>
              </div>
            ))}
          </div>
        </section>
      </Container>
    </div>
  )
}

function QuickAction({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="flex items-center justify-center rounded-xl border border-neutral-800 bg-neutral-950/60 px-4 py-3 text-sm font-semibold text-neutral-100 shadow-inner shadow-black/10 transition hover:border-neutral-700 hover:bg-neutral-900"
    >
      {label}
    </Link>
  )
}

function ToolTile({
  title,
  description,
  href,
  disabled,
}: {
  title: string
  description: string
  href: string
  disabled?: boolean
}) {
  const className = disabled
    ? "cursor-not-allowed opacity-50"
    : "hover:border-neutral-700 hover:bg-neutral-900"
  return (
    <Link
      href={disabled ? "#" : href}
      className={`flex h-full flex-col justify-between rounded-2xl border border-neutral-800 bg-neutral-950/60 p-4 shadow-inner shadow-black/10 transition ${className}`}
    >
      <div>
        <h4 className="text-base font-semibold text-neutral-100">{title}</h4>
        <p className="mt-1 text-sm text-neutral-400">{description}</p>
      </div>
      {!disabled && <span className="mt-3 text-xs font-semibold text-blue-300">Open</span>}
      {disabled && <span className="mt-3 text-xs font-semibold text-neutral-400">Coming soon</span>}
    </Link>
  )
}
