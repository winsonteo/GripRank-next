'use client'

import Link from "next/link"
import Image from "next/image"
import Container from "@/components/Container"
import AccessDenied from "@/components/AccessDenied"
import { UserButton, useUser } from "@clerk/nextjs"
import { useFirebaseAuth } from "@/hooks/useFirebaseAuth"
import { useUserRole, isStaffRole } from "@/hooks/useUserRole"
import { useEffect, useMemo, useState } from "react"
import { collection, doc, getDoc, getDocs, query, orderBy, onSnapshot } from "firebase/firestore"
import type { Timestamp } from "firebase/firestore"
import { firestore } from "@/lib/firebase/client"
import type { JudgeStationView } from "@/lib/boulder/judgeStations"

type SetupItem = {
  id: string
  label: string
  ok: boolean
  actionLabel: string
  href: string
}

type AlertItem = {
  id: string
  text: string
  href: string
  tone?: "info" | "warn"
}

interface Category {
  id: string
  name?: string
  order?: number
}

interface RouteDoc {
  id: string
  label?: string
  order?: number
}

interface DetailDoc {
  id: string
  label?: string
  detailIndex?: string
  order?: number
}

interface JudgeStationDoc {
  compId: string
  round: "qualification" | "final"
  categoryId: string
  detailIndex: number | null
  routeId: string
  ready: boolean
  updatedAt: Timestamp
}

function normalizeStatusLabel(raw?: string) {
  const value = (raw || "").toLowerCase()
  if (value === "live") return "Live"
  if (value === "completed") return "Completed"
  if (value === "archived") return "Archived"
  return "Setup"
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

  const [comps, setComps] = useState<{ id: string; name?: string; status?: string; updatedAt?: { seconds?: number } }[]>([])
  const [selectedComp, setSelectedComp] = useState<string>("")
  const [statusLabel, setStatusLabel] = useState("Setup")
  const [categoriesCount, setCategoriesCount] = useState(0)
  const [routesCount, setRoutesCount] = useState(0)
  const [routesMissingCategories, setRoutesMissingCategories] = useState(0)
  const [athletesCount, setAthletesCount] = useState(0)
  const [loadingChecks, setLoadingChecks] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)

  // Category/route lookup maps for judge stations label resolution
  const [categories, setCategories] = useState<Map<string, Category>>(new Map())
  const [routes, setRoutes] = useState<Map<string, RouteDoc>>(new Map())
  const [finalRoutes, setFinalRoutes] = useState<Map<string, RouteDoc>>(new Map())
  const [details, setDetails] = useState<Map<string, DetailDoc>>(new Map())

  // Judge stations state
  const [judgeStations, setJudgeStations] = useState<JudgeStationView[]>([])
  const [stationsLoading, setStationsLoading] = useState(false)

  useEffect(() => {
    if (!firestore) return
    async function loadComps() {
      try {
        const db = firestore
        if (!db) return
        const snap = await getDocs(collection(db, "boulderComps"))
        const list = snap.docs
          .map((d) => ({ id: d.id, ...(d.data() as { name?: string; status?: string; updatedAt?: { seconds?: number } }) }))
          .sort((a, b) => (b.updatedAt?.seconds || 0) - (a.updatedAt?.seconds || 0))
        setComps(list)
        if (!selectedComp && list.length) {
          setSelectedComp(list[0].id)
          setStatusLabel(normalizeStatusLabel(list[0].status))
        }
      } catch (err) {
        console.error(err)
      }
    }
    loadComps()
  }, [selectedComp])

  useEffect(() => {
    if (!selectedComp || !firestore) return
    async function loadMeta() {
      setLoadingChecks(true)
      setLoadError(null)
      try {
        const db = firestore
        if (!db) return
        const compSnap = await getDoc(doc(db, "boulderComps", selectedComp))
        const compData = compSnap.data() || {}
        setStatusLabel(normalizeStatusLabel((compData as { status?: string }).status))

        // Categories
        const catsSnap = await getDocs(collection(db, `boulderComps/${selectedComp}/categories`))
        const categories = catsSnap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) }))
        setCategoriesCount(categories.length)

        // Routes across categories (qualification + final)
        let totalRoutes = 0
        let missingRouteCats = 0
        for (const cat of categories) {
          let catRoutes = 0
          const qualSnap = await getDocs(collection(db, `boulderComps/${selectedComp}/categories/${cat.id}/routes`))
          catRoutes += qualSnap.size
          const finalSnap = await getDocs(
            collection(db, `boulderComps/${selectedComp}/categories/${cat.id}/finalRoutes`)
          )
          catRoutes += finalSnap.size
          if (catRoutes === 0) missingRouteCats += 1
          totalRoutes += catRoutes
        }
        setRoutesCount(totalRoutes)
        setRoutesMissingCategories(missingRouteCats)

        // Athletes
        const athletesSnap = await getDocs(collection(db, `boulderComps/${selectedComp}/athletes`))
        setAthletesCount(athletesSnap.size)
      } catch (err) {
        console.error(err)
        setLoadError("Failed to load setup status.")
        setCategoriesCount(0)
        setRoutesCount(0)
        setRoutesMissingCategories(0)
        setAthletesCount(0)
      } finally {
        setLoadingChecks(false)
      }
    }
    loadMeta()
  }, [selectedComp])

  // Load categories, routes, details for judge stations label resolution
  useEffect(() => {
    if (!firestore || !selectedComp) {
      setCategories(new Map())
      setRoutes(new Map())
      setFinalRoutes(new Map())
      setDetails(new Map())
      return
    }
    const db = firestore

    const loadLookupData = async () => {
      try {
        // Load categories
        const catsQuery = query(
          collection(db, `boulderComps/${selectedComp}/categories`),
          orderBy("order", "asc")
        )
        const catsSnapshot = await getDocs(catsQuery)
        const catsMap = new Map<string, Category>()
        const routesMap = new Map<string, RouteDoc>()
        const finalRoutesMap = new Map<string, RouteDoc>()
        const detailsMap = new Map<string, DetailDoc>()

        for (const catDoc of catsSnapshot.docs) {
          const catData = { id: catDoc.id, ...catDoc.data() } as Category
          catsMap.set(catDoc.id, catData)

          // Load routes for this category
          const routesQuery = query(
            collection(db, `boulderComps/${selectedComp}/categories/${catDoc.id}/routes`),
            orderBy("order", "asc")
          )
          const routesSnapshot = await getDocs(routesQuery)
          routesSnapshot.docs.forEach((routeDoc) => {
            routesMap.set(routeDoc.id, { id: routeDoc.id, ...routeDoc.data() } as RouteDoc)
          })

          // Load final routes for this category
          const finalRoutesQuery = query(
            collection(db, `boulderComps/${selectedComp}/categories/${catDoc.id}/finalRoutes`),
            orderBy("order", "asc")
          )
          const finalRoutesSnapshot = await getDocs(finalRoutesQuery)
          finalRoutesSnapshot.docs.forEach((routeDoc) => {
            finalRoutesMap.set(routeDoc.id, { id: routeDoc.id, ...routeDoc.data() } as RouteDoc)
          })

          // Load details for this category
          const detailsQuery = query(
            collection(db, `boulderComps/${selectedComp}/categories/${catDoc.id}/details`),
            orderBy("order", "asc")
          )
          const detailsSnapshot = await getDocs(detailsQuery)
          detailsSnapshot.docs.forEach((detailDoc) => {
            detailsMap.set(detailDoc.id, { id: detailDoc.id, ...detailDoc.data() } as DetailDoc)
          })
        }

        setCategories(catsMap)
        setRoutes(routesMap)
        setFinalRoutes(finalRoutesMap)
        setDetails(detailsMap)
      } catch (error) {
        console.error("Error loading lookup data:", error)
      }
    }

    loadLookupData()
  }, [selectedComp])

  // Subscribe to judgeStations when competition changes
  useEffect(() => {
    if (!firestore || !selectedComp) {
      setJudgeStations([])
      return
    }
    const db = firestore

    setStationsLoading(true)
    const stationsRef = collection(db, `boulderComps/${selectedComp}/judgeStations`)

    const unsubscribe = onSnapshot(
      stationsRef,
      (snapshot) => {
        const stationDocs = snapshot.docs.map((doc) => ({
          stationKey: doc.id,
          ...doc.data(),
        })) as (JudgeStationDoc & { stationKey: string })[]

        const now = new Date()
        const fifteenMinutesAgo = new Date(now.getTime() - 15 * 60 * 1000)

        // Convert to view models with labels, filtering out expired stations
        const stationViews: JudgeStationView[] = stationDocs
          .filter((s) => {
            if (!s.ready) return false

            // Filter out stations older than 15 minutes
            if (s.updatedAt) {
              const updatedDate = s.updatedAt.toDate()
              if (updatedDate < fifteenMinutesAgo) {
                return false
              }
            }

            return true
          })
          .map((s) => {
            // Resolve category name
            const category = categories.get(s.categoryId)
            const categoryName = category?.name || s.categoryId

            // Resolve route label (check both routes and finalRoutes)
            const route = s.round === "final"
              ? finalRoutes.get(s.routeId) || routes.get(s.routeId)
              : routes.get(s.routeId) || finalRoutes.get(s.routeId)
            const routeLabel = route?.label || s.routeId

            // Resolve detail label
            let detailLabel = "Final"
            if (s.round === "qualification" && s.detailIndex !== null) {
              // Try to find detail by detailIndex
              let foundDetail: DetailDoc | undefined
              details.forEach((d) => {
                if (d.detailIndex === String(s.detailIndex) || d.id === String(s.detailIndex)) {
                  foundDetail = d
                }
              })
              detailLabel = foundDetail?.label || `Group ${s.detailIndex}`
            }

            return {
              ...s,
              stationKey: s.stationKey,
              categoryName,
              routeLabel,
              detailLabel,
            }
          })

        setJudgeStations(stationViews)
        setStationsLoading(false)
      },
      (error) => {
        console.error("Error loading judge stations:", error)
        setStationsLoading(false)
      }
    )

    return () => unsubscribe()
  }, [selectedComp, categories, routes, finalRoutes, details])

  const checklist = useMemo(() => {
    const hasCategories = categoriesCount > 0
    const hasRoutes = routesCount > 0
    const hasAthletes = athletesCount > 0
    const scorecardsReady = hasRoutes && hasAthletes
    const items: SetupItem[] = [
      {
        id: "categories",
        label: hasCategories ? "Categories configured" : "No categories configured",
        ok: hasCategories,
        actionLabel: "View setup",
        href: "/boulder/setup",
      },
      {
        id: "routes",
        label: hasRoutes
          ? "Routes configured"
          : routesMissingCategories > 0
            ? `Routes missing in ${routesMissingCategories} categories`
            : "No routes configured",
        ok: hasRoutes,
        actionLabel: "Go to setup",
        href: "/boulder/setup",
      },
      {
        id: "import",
        label: hasAthletes ? "Athletes imported" : "No athletes imported",
        ok: hasAthletes,
        actionLabel: "Open import",
        href: "/boulder/import",
      },
      {
        id: "scorecards",
        label: scorecardsReady ? "Scorecards ready" : "Scorecards not ready",
        ok: scorecardsReady,
        actionLabel: "Go to scorecards",
        href: "/boulder/scorecards",
      },
    ]
    return items
  }, [categoriesCount, routesCount, routesMissingCategories, athletesCount])

  const alerts = useMemo(() => {
    const list: AlertItem[] = []
    if (loadError) {
      list.push({ id: "load-error", text: loadError, href: "/boulder/setup", tone: "warn" })
      return list
    }
    if (categoriesCount === 0) {
      list.push({ id: "no-categories", text: "No categories configured for this competition.", href: "/boulder/setup", tone: "warn" })
    }
    if (routesCount === 0) {
      list.push({ id: "no-routes", text: "No routes configured yet.", href: "/boulder/setup", tone: "warn" })
    }
    if (athletesCount === 0) {
      list.push({ id: "no-athletes", text: "No athletes imported.", href: "/boulder/import", tone: "warn" })
    }
    if (!(routesCount > 0 && athletesCount > 0)) {
      list.push({
        id: "scorecards-maybe",
        text: "Scorecards may not be ready.",
        href: "/boulder/scorecards",
        tone: "info",
      })
    }
    if (!list.length) {
      list.push({ id: "all-good", text: "No issues detected.", href: "/boulder/setup", tone: "info" })
    }
    return list
  }, [categoriesCount, routesCount, athletesCount, loadError])

  const selectedCompName =
    comps.find((c) => c.id === selectedComp)?.name || selectedComp || "No competition selected"

  const statusTone =
    statusLabel.toLowerCase() === "live"
      ? "bg-emerald-500/20 text-emerald-200 border border-emerald-500/40"
    : statusLabel.toLowerCase() === "setup"
      ? "bg-amber-500/15 text-amber-200 border border-amber-400/40"
      : "bg-neutral-700/40 text-neutral-200 border border-neutral-500/40"

  const setupItems = checklist

  // Helper to format relative time
  const formatRelativeTime = (timestamp: Timestamp | undefined): string => {
    if (!timestamp) return ""
    const date = timestamp.toDate()
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)

    if (diffMins < 1) return "just now"
    if (diffMins < 60) return `${diffMins}m ago`
    const diffHours = Math.floor(diffMins / 60)
    if (diffHours < 24) return `${diffHours}h ago`
    return `${Math.floor(diffHours / 24)}d ago`
  }

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
                  disabled={!comps.length}
                >
                  <option value="">{comps.length ? "Select competition" : "Loading competitions…"}</option>
                  {comps.map((c) => (
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
                    Setup: {selectedCompName}
                  </h2>
                  <p className="text-sm text-gray-400">
                    {loadingChecks ? "Loading setup status…" : "Check setup health before you go live."}
                  </p>
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
                {stationsLoading ? (
                  <div className="rounded-xl border border-[#19bcd6]/50 bg-[#101a34]/40 px-4 py-6 text-center text-gray-400 text-sm">
                    Loading stations...
                  </div>
                ) : judgeStations.length === 0 ? (
                  <div className="rounded-xl border border-[#19bcd6]/50 bg-[#101a34]/40 px-4 py-6 text-center">
                    <p className="text-gray-400 text-sm">No judge stations have been confirmed yet.</p>
                    <p className="text-gray-500 text-xs mt-1">Judges can confirm their station from the Judge page.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {judgeStations.map((station) => (
                      <div
                        key={station.stationKey}
                        className="rounded-xl border border-[#19bcd6]/50 bg-[#101a34]/40 px-4 py-3"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="font-semibold text-gray-100">
                            {station.categoryName} · {station.detailLabel}
                          </div>
                          <span className="rounded-full px-2.5 py-1 text-xs font-semibold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                            Ready {station.updatedAt && `(${formatRelativeTime(station.updatedAt)})`}
                          </span>
                        </div>
                        <div className="mt-1 text-xs text-gray-300">
                          <span>
                            <strong className="text-gray-200">Route:</strong> {station.routeLabel}
                          </span>
                          <span className="mx-2">·</span>
                          <span>
                            <strong className="text-gray-200">Round:</strong> {station.round === "final" ? "Final" : "Qualification"}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                <p className="mt-3 text-xs text-gray-500">
                  Ready = judge has confirmed this station on their device. Judges confirm their station from the Judge page.
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
