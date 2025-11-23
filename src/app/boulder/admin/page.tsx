'use client'

import Link from "next/link"
import Image from "next/image"
import Container from "@/components/Container"
import AccessDenied from "@/components/AccessDenied"
import { UserButton, useUser } from "@clerk/nextjs"
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
  const { user } = useUser()

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
    <main className="py-6 min-h-screen bg-[#0b1220] text-gray-200">
      <Container>
        <div className="max-w-[1100px] mx-auto space-y-6">
          {/* Header - Consistent with Judge/Chief/Import/Scorecards pages */}
          <header className="flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <Link href="/" className="inline-block">
                <Image
                  src="/logo_header.png"
                  alt="GripRank"
                  width={4001}
                  height={1228}
                  priority
                  className="h-11 w-auto"
                />
              </Link>
              <span className="text-gray-400">Admin Dashboard</span>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-sm text-gray-400">
              <span className="truncate max-w-[240px]">
                {user?.emailAddresses[0]?.emailAddress || 'Signed in'}
              </span>
              <UserButton afterSignOutUrl="/" />
            </div>
          </header>

          {/* Competition Selector */}
          <section className="bg-[#0e1730] border border-[#19bcd6] rounded-xl p-5">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="text-xl font-bold text-gray-100">Competition Dashboard</h2>
                <p className="text-sm text-gray-400">Tools and status for running your boulder competitions</p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <select
                  className="px-3 py-2.5 bg-[#101a34] text-gray-200 border border-[#19bcd6] rounded-lg focus:outline-none focus:border-[#27a9e1]"
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
          </section>
          {/* Setup Health Panel */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <section className="bg-[#0e1730] border border-[#19bcd6] rounded-xl p-5">
              <div className="flex items-center justify-between gap-2 mb-4">
                <div>
                  <h2 className="text-xl font-bold text-gray-100">
                    Setup: {competitions.find((c) => c.id === selectedComp)?.name || "No competition selected"}
                  </h2>
                  <p className="text-sm text-gray-400">Check setup health before you go live.</p>
                </div>
              </div>
              <div className="mt-4 divide-y divide-[#19bcd6]/30 rounded-xl border border-[#19bcd6]/50 bg-[#101a34]/40">
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
                      <span className="text-sm text-gray-200">{item.label}</span>
                    </div>
                    <Link
                      href={item.href}
                      className="text-sm font-semibold text-[#27a9e1] hover:text-[#19bcd6] hover:underline"
                    >
                      {item.actionLabel}
                    </Link>
                  </div>
                ))}
              </div>
              <div className="mt-4">
                <Link
                  href="/boulder/setup"
                  className="inline-flex items-center justify-center rounded-lg bg-[#27a9e1] border border-[#27a9e1] text-[#031726] px-4 py-2.5 text-sm font-semibold hover:opacity-90 transition-opacity"
                >
                  Continue setup
                </Link>
              </div>
            </section>

            <section className="bg-[#0e1730] border border-[#19bcd6] rounded-xl p-5">
              <div className="flex items-center justify-between gap-2 mb-4">
                <div>
                  <h2 className="text-xl font-bold text-gray-100">Run today</h2>
                  <p className="text-sm text-gray-400">Open judge tools and check stations.</p>
                </div>
              </div>
              <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
                <QuickAction href="/boulder/judge" label="Open Judge Panel" />
                <QuickAction href="/boulder/chief" label="Open Chief Judge" />
                <QuickAction href="/boulder/leaderboard" label="View Leaderboard" />
              </div>

              <div className="mt-5">
                <h3 className="text-sm font-semibold text-gray-200 mb-3">Judge stations</h3>
                <div className="space-y-3">
                  {stations.map((station) => (
                    <div
                      key={station.id}
                      className="rounded-xl border border-[#19bcd6]/50 bg-[#101a34]/40 px-4 py-3"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="font-semibold text-gray-100">{station.name}</div>
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
                      <div className="mt-1 grid grid-cols-1 gap-1 text-xs text-gray-300 sm:grid-cols-3">
                        <span>
                          <strong className="text-gray-200">Category:</strong> {station.categoryName}
                        </span>
                        <span>
                          <strong className="text-gray-200">Detail:</strong> {station.detailLabel}
                        </span>
                        <span>
                          <strong className="text-gray-200">Route:</strong> {station.routeLabel}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
                <p className="mt-3 text-xs text-gray-500">
                  Legend: Ready = judge has confirmed this station on their device. Not ready = no confirmation yet.
                </p>
              </div>
            </section>
          </div>

          {/* Tools Section */}
          <section className="bg-[#0e1730] border border-[#19bcd6] rounded-xl p-5">
            <div className="flex items-center justify-between gap-3 mb-4">
              <div>
                <h3 className="text-xl font-bold text-gray-100">Tools</h3>
                <p className="text-sm text-gray-400">Quick links to common tasks.</p>
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

          {/* Issues & Warnings Section */}
          <section className="bg-[#0e1730] border border-[#19bcd6] rounded-xl p-5">
            <h3 className="text-xl font-bold text-gray-100 mb-4">Issues & warnings</h3>
            <div className="space-y-2">
              {alerts.map((alert) => (
                <div
                  key={alert.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#19bcd6]/50 bg-[#101a34]/40 px-3 py-2"
                >
                  <div className="flex items-center gap-2 text-sm">
                    <span
                      className={`flex h-6 w-6 items-center justify-center rounded-full text-sm font-semibold ${
                        alert.tone === "warn" ? "bg-amber-500/15 text-amber-200" : "bg-blue-500/15 text-blue-200"
                      }`}
                    >
                      {alert.tone === "warn" ? "!" : "i"}
                    </span>
                    <span className="text-gray-200">{alert.text}</span>
                  </div>
                  <Link href={alert.href} className="text-sm font-semibold text-[#27a9e1] hover:text-[#19bcd6] hover:underline">
                    View
                  </Link>
                </div>
              ))}
            </div>
          </section>
        </div>
      </Container>
    </main>
  )
}

function QuickAction({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="flex items-center justify-center rounded-lg border border-[#19bcd6] bg-[#101a34] px-4 py-3 text-sm font-semibold text-gray-200 transition hover:bg-[#19bcd6]/10"
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
    : "hover:border-[#27a9e1] hover:bg-[#101a34]/60"
  return (
    <Link
      href={disabled ? "#" : href}
      className={`flex h-full flex-col justify-between rounded-xl border border-[#19bcd6]/50 bg-[#101a34]/40 p-4 transition ${className}`}
    >
      <div>
        <h4 className="text-base font-semibold text-gray-100">{title}</h4>
        <p className="mt-1 text-sm text-gray-400">{description}</p>
      </div>
      {!disabled && <span className="mt-3 text-xs font-semibold text-[#27a9e1]">Open</span>}
      {disabled && <span className="mt-3 text-xs font-semibold text-gray-500">Coming soon</span>}
    </Link>
  )
}
