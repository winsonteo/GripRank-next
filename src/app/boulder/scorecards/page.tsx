'use client'

/* eslint-disable @next/next/no-img-element */

import { useEffect, useState } from "react"
import Link from "next/link"
import Image from "next/image"
import Container from "@/components/Container"
import AccessDenied from "@/components/AccessDenied"
import { UserButton, useUser } from "@clerk/nextjs"
import { useFirebaseAuth } from "@/hooks/useFirebaseAuth"
import { useUserRole, isStaffRole } from "@/hooks/useUserRole"
import {
  collection,
  getDocs,
  query,
  where,
  doc,
  getDoc,
} from "firebase/firestore"
import { firestore } from "@/lib/firebase/client"

type Competition = { id: string; name?: string; status?: string; updatedAt?: { seconds?: number } }
type Category = { id: string; name?: string; order?: number }
type RouteMeta = { id: string; label: string }
type Athlete = {
  id: string
  bib?: string | number
  name?: string
  team?: string
  detailIndex?: number | string | null
}

type ScorecardBlock = {
  compId: string
  categoryId: string
  categoryName: string
  routes: RouteMeta[]
  routeLabels: Map<string, string>
  athletes: Athlete[]
  round: RoundType
  qualifierRanks?: Map<string, number>
}

type RoundType = "qualification" | "final"

export default function ScorecardsPage() {
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
    return <AccessDenied feature="Boulder Scorecards" message="Sign in to generate scorecards." />
  }

  if (!isStaffRole(role)) {
    return <AccessDenied feature="Scorecards (staff/admin only)" />
  }

  if (firebaseError) {
    return <AccessDenied feature="Boulder Scorecards" message="Firebase not available. Please refresh and try again." />
  }

  return <ScorecardsInterface />
}

function ScorecardsInterface() {
  const { user } = useUser()

  const [comps, setComps] = useState<Competition[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [details, setDetails] = useState<string[]>([])

  const [selectedCompId, setSelectedCompId] = useState("")
  const [selectedCategoryId, setSelectedCategoryId] = useState("")
  const [detailFilter, setDetailFilter] = useState("")
  const [round, setRound] = useState<RoundType>("qualification")

  const [cards, setCards] = useState<ScorecardBlock[]>([])
  const [status, setStatus] = useState("Select a competition to begin.")
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!firestore) return
    async function loadComps() {
      try {
        setLoading(true)
        const db = firestore
        if (!db) return
        const snap = await getDocs(collection(db, "boulderComps"))
        const list = snap.docs
          .map((d) => {
            const { id: _id, ...rest } = d.data() as Competition
            void _id
            return { id: d.id, ...rest }
          })
          .filter((c) => !["archived", "deleted"].includes((c.status || "").toLowerCase()))
          .sort((a, b) => (b.updatedAt?.seconds || 0) - (a.updatedAt?.seconds || 0))
        setComps(list)
        setStatus(list.length ? "Pick a competition to generate scorecards." : "No competitions found.")
      } catch (err) {
        console.error(err)
        setStatus("Failed to load competitions.")
      } finally {
        setLoading(false)
      }
    }
    loadComps()
  }, [])

  useEffect(() => {
    if (!selectedCompId || !firestore) {
      setCategories([])
      setDetails([])
      setSelectedCategoryId("")
      setDetailFilter("")
      setCards([])
      return
    }
    async function loadCats() {
      try {
        setStatus("Loading categories…")
        const db = firestore
        if (!db) return
        const snap = await getDocs(collection(db, `boulderComps/${selectedCompId}/categories`))
        const cats = snap.docs
          .map((d) => {
            const { id: _id, ...rest } = d.data() as Category
            void _id
            return { id: d.id, ...rest }
          })
          .sort((a, b) => {
            if (typeof a.order === "number" && typeof b.order === "number") return a.order - b.order
            return (a.name || a.id).localeCompare(b.name || b.id)
          })
        setCategories(cats)
        setSelectedCategoryId(cats[0]?.id || "")
        setStatus("Select category and load cards.")
      } catch (err) {
        console.error(err)
        setCategories([])
        setStatus("Failed to load categories.")
      }
    }
    loadCats()
  }, [selectedCompId])

  useEffect(() => {
    if (!selectedCompId || !selectedCategoryId || !firestore) {
      setDetails([])
      setDetailFilter("")
      return
    }
    async function loadDetails() {
      try {
        const db = firestore
        if (!db) return
        const detailSnap = await getDocs(
          collection(db, `boulderComps/${selectedCompId}/categories/${selectedCategoryId}/details`)
        )
        const ids = new Set<string>()
        detailSnap.docs.forEach((d) => ids.add(d.id))
        if (!ids.size) {
          const athletesSnap = await getDocs(
            query(
              collection(db, `boulderComps/${selectedCompId}/athletes`),
              where("categoryId", "==", selectedCategoryId)
            )
          )
          athletesSnap.forEach((snap) => {
            const data = snap.data() as Athlete
            const raw = data.detailIndex ?? null
            if (raw != null) ids.add(String(raw))
          })
        }
        const sorted = Array.from(ids).sort((a, b) => {
          const na = Number(a)
          const nb = Number(b)
          if (Number.isFinite(na) && Number.isFinite(nb) && na !== nb) return na - nb
          return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" })
        })
        setDetails(sorted)
      } catch (err) {
        console.error(err)
        setDetails([])
      }
    }
    loadDetails()
  }, [selectedCompId, selectedCategoryId])

  const fetchRoutes = async (compId: string, categoryId: string, currentRound: RoundType) => {
    if (!firestore) return [] as RouteMeta[]
    const db = firestore
    if (!db) return [] as RouteMeta[]
    const base = `boulderComps/${compId}/categories/${categoryId}`
    const collectionName = currentRound === "final" ? "finalRoutes" : "routes"
    const snap = await getDocs(collection(db, `${base}/${collectionName}`))
    let routes = snap.docs.map((d) => {
      const data = d.data() || {}
      return { id: d.id, label: (data as { label?: string }).label || d.id }
    })
    if (!routes.length && currentRound === "final") {
      const fallback = await getDocs(collection(db, `${base}/routes`))
      routes = fallback.docs.map((d) => {
        const data = d.data() || {}
        return { id: d.id, label: (data as { label?: string }).label || d.id }
      })
    }
    if (!routes.length) {
      routes = Array.from({ length: 5 }).map((_, idx) => ({
        id: `${currentRound === "final" ? "F" : "B"}${idx + 1}`,
        label: `${currentRound === "final" ? "Final" : "Boulder"} ${idx + 1}`,
      }))
    }
    return routes
  }

  const loadScorecards = async () => {
    if (!firestore) return
    if (!selectedCompId) {
      setStatus("Select a competition first.")
      return
    }
    const db = firestore
    if (!db) return
    setStatus("Loading scorecards…")
    setLoading(true)
    setCards([])
    try {
      const targetCategories =
        selectedCategoryId && categories.length
          ? categories.filter((c) => c.id === selectedCategoryId)
          : categories

      const blocks: ScorecardBlock[] = []
      for (const cat of targetCategories) {
        const routes = await fetchRoutes(selectedCompId, cat.id, round)
        const routeLabels = new Map(routes.map((r) => [r.id, r.label]))

        let athletes: Athlete[] = []
        let qualifierRanks: Map<string, number> | undefined = undefined

        if (round === "final") {
          // Load finalists from startlist
          const startlistRef = doc(db, `boulderComps/${selectedCompId}/categories/${cat.id}/finals`, "startlist")
          const startlistSnap = await getDoc(startlistRef)

          if (startlistSnap.exists()) {
            const entries = (startlistSnap.data()?.entries || []) as Array<{ athleteId: string; qualifierRank: number }>
            const athleteIds = entries.map(e => e.athleteId)

            // Create rank map for sorting and display
            const rankMap = new Map(entries.map(e => [e.athleteId, e.qualifierRank]))
            qualifierRanks = rankMap

            // Load all athletes in category
            const athletesQuery = query(
              collection(db, `boulderComps/${selectedCompId}/athletes`),
              where("categoryId", "==", cat.id)
            )
            const athSnap = await getDocs(athletesQuery)

            // Filter to only finalists and sort by qualifier rank
            athletes = athSnap.docs
              .map((d) => {
                const { id: _id, ...rest } = d.data() as Athlete
                void _id
                return { id: d.id, ...rest }
              })
              .filter((ath) => athleteIds.includes(ath.id))
              .sort((a, b) => {
                const rankA = rankMap.get(a.id) || 999
                const rankB = rankMap.get(b.id) || 999
                return rankA - rankB
              })
          }
        } else {
          // Load qualification athletes
          const athletesQuery = query(
            collection(db, `boulderComps/${selectedCompId}/athletes`),
            where("categoryId", "==", cat.id)
          )
          const athSnap = await getDocs(athletesQuery)
          athletes = athSnap.docs
            .map((d) => {
              const { id: _id, ...rest } = d.data() as Athlete
              void _id
              return { id: d.id, ...rest }
            })
            .filter((ath) => {
              if (!detailFilter) return true
              const raw = ath.detailIndex
              if (raw == null) return false
              return String(raw) === detailFilter
            })
            .sort((a, b) =>
              String(a.bib || "").localeCompare(String(b.bib || ""), undefined, { numeric: true, sensitivity: "base" })
            )
        }

        blocks.push({
          compId: selectedCompId,
          categoryId: cat.id,
          categoryName: cat.name || cat.id,
          routes,
          routeLabels,
          athletes,
          round,
          qualifierRanks,
        })
      }

      setCards(blocks)
      const totalCards = blocks.reduce((sum, block) => sum + block.athletes.length, 0)
      setStatus(totalCards ? `Generated ${totalCards} scorecards. Use Print to export.` : "No athletes match the filters.")
    } catch (err) {
      console.error(err)
      setStatus("Failed to load scorecards.")
    } finally {
      setLoading(false)
    }
  }

  const renderAttemptBoxes = () =>
    Array.from({ length: 15 }).map((_, idx) => (
      <div key={idx} className="h-5 border-l border-neutral-800 first:border-l-0 print:border-black" />
    ))

  return (
    <main className="py-6 min-h-screen bg-[#0b1220] text-gray-200">
      <Container>
        <div className="max-w-[1100px] mx-auto space-y-6">
          {/* Header - Consistent with Judge/Chief/Setup pages */}
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
              <span className="text-gray-400">Scorecards</span>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-sm text-gray-400">
              <span className="truncate max-w-[240px]">
                {user?.emailAddresses[0]?.emailAddress || 'Signed in'}
              </span>
              <UserButton afterSignOutUrl="/" />
            </div>
          </header>
        <section className="bg-[#0e1730] border border-[#19bcd6] rounded-xl p-5 space-y-4">
          <div className="grid gap-4 md:grid-cols-4">
            <label className="flex flex-col gap-2 text-sm">
              Competition
              <select
                className="px-3 py-2.5 bg-[#101a34] text-gray-200 border border-[#19bcd6] rounded-lg focus:outline-none focus:border-[#27a9e1]"
                value={selectedCompId}
                onChange={(e) => setSelectedCompId(e.target.value)}
                disabled={loading}
              >
                <option value="">{loading ? "Loading..." : "Select competition"}</option>
                {comps.map((comp) => (
                  <option key={comp.id} value={comp.id}>
                    {comp.name || comp.id}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-2 text-sm">
              Category
              <select
                className="px-3 py-2.5 bg-[#101a34] text-gray-200 border border-[#19bcd6] rounded-lg focus:outline-none focus:border-[#27a9e1]"
                value={selectedCategoryId}
                onChange={(e) => setSelectedCategoryId(e.target.value)}
                disabled={!selectedCompId || loading || !categories.length}
              >
                <option value="">{selectedCompId ? "All categories" : "Select competition first"}</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name || cat.id}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-2 text-sm">
              Round
              <select
                className="px-3 py-2.5 bg-[#101a34] text-gray-200 border border-[#19bcd6] rounded-lg focus:outline-none focus:border-[#27a9e1]"
                value={round}
                onChange={(e) => setRound(e.target.value as RoundType)}
                disabled={!selectedCompId}
              >
                <option value="qualification">Qualification</option>
                <option value="final">Final</option>
              </select>
            </label>
            <label className="flex flex-col gap-2 text-sm">
              Detail (qualification)
              <select
                className="px-3 py-2.5 bg-[#101a34] text-gray-200 border border-[#19bcd6] rounded-lg focus:outline-none focus:border-[#27a9e1]"
                value={detailFilter}
                onChange={(e) => setDetailFilter(e.target.value)}
                disabled={!selectedCategoryId || round === "final"}
              >
                <option value="">{round === "final" ? "Not used in finals" : "All details"}</option>
                {details.map((id) => (
                  <option key={id} value={id}>
                    Detail {id}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={loadScorecards}
              disabled={!selectedCompId || loading}
              className="px-3 py-2.5 text-sm bg-[#27a9e1] border border-[#27a9e1] text-[#031726] rounded-lg hover:opacity-90 transition-opacity font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? "Loading…" : "Load scorecards"}
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="px-3 py-2.5 text-sm border border-[#19bcd6] bg-[#101a34] text-gray-200 rounded-lg hover:bg-[#19bcd6]/10 transition font-semibold"
            >
              Print / PDF
            </button>
            <span className="text-sm text-neutral-300">{status}</span>
          </div>
        </section>

        <section className="space-y-6">
          {cards.map((block) => (
            <div key={`${block.compId}-${block.categoryId}`} className="space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-xl font-semibold">
                    {block.categoryName} ({block.categoryId})
                  </h3>
                  <p className="text-sm text-gray-400">
                    {block.routes.length} routes • {block.athletes.length} athletes
                  </p>
                </div>
              </div>
              <div className="grid gap-4 md:grid-cols-2 print:grid-cols-2">
                {block.athletes.map((ath) => {
                  const detailDisplay = ath.detailIndex != null ? `Detail ${ath.detailIndex}` : "—"
                  const qualifierRankDisplay = block.qualifierRanks?.get(ath.id) || "—"
                  const bibDisplay = ath.bib != null ? String(ath.bib) : "—"
                  return (
                    <article
                      key={ath.id}
                      className="flex flex-col gap-3 rounded-xl border border-dashed border-neutral-800 bg-neutral-900/80 p-4 shadow-sm shadow-black/20 print:border-neutral-400 print:bg-white print:text-black"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <h4 className="text-lg font-semibold text-gray-100 print:text-black">
                            {ath.name || bibDisplay || ath.id}
                          </h4>
                          <div className="text-sm text-neutral-300 print:text-black">
                            <span className="mr-3">
                              <strong>Bib:</strong> {bibDisplay}
                            </span>
                            <span className="mr-3">
                              <strong>Category:</strong> {block.categoryName}
                            </span>
                            {block.round === "final" ? (
                              <span>
                                <strong>Qualifier Rank:</strong> {qualifierRankDisplay}
                              </span>
                            ) : (
                              <span>
                                <strong>Detail:</strong> {detailDisplay}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex flex-col items-center text-xs text-gray-400 print:text-black">
                          <span>QR</span>
                          <img
                            className="h-20 w-20 rounded border border-neutral-800 bg-white object-contain print:border-neutral-500"
                            src={`https://api.qrserver.com/v1/create-qr-code/?size=120x120&margin=0&data=${encodeURIComponent(
                              bibDisplay || ath.id
                            )}`}
                            alt={`QR for ${bibDisplay || ath.id}`}
                            onError={(e) => {
                              const target = e.currentTarget
                              target.replaceWith(
                                (() => {
                                  const div = document.createElement("div")
                                  div.className =
                                    "h-20 w-20 rounded border border-neutral-800 bg-neutral-800 text-[10px] text-neutral-200 flex items-center justify-center text-center print:border-neutral-500 print:bg-white print:text-black"
                                  div.textContent = "QR unavailable"
                                  return div
                                })()
                              )
                            }}
                          />
                        </div>
                      </div>

                      <table className="w-full border-collapse text-sm print:border-black">
                        <thead>
                          <tr>
                            <th className="border border-neutral-800 px-2 py-1 text-left text-neutral-200 print:border-black print:text-black">
                              Route
                            </th>
                            <th className="border border-neutral-800 px-2 py-1 text-left text-neutral-200 print:border-black print:text-black">
                              Attempts
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {block.routes.map((route) => (
                            <tr key={route.id}>
                              <td className="border border-neutral-800 px-2 py-1 text-neutral-100 print:border-black print:text-black">
                                {block.routeLabels.get(route.id) || route.id}
                              </td>
                              <td className="border border-neutral-800 px-2 py-1 print:border-black">
                                <div
                                  className="grid gap-0 border border-neutral-800 print:border-black"
                                  style={{ gridTemplateColumns: "repeat(15, minmax(0, 1fr))" }}
                                >
                                  {renderAttemptBoxes()}
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </article>
                  )
                })}
              </div>
            </div>
          ))}

          {!cards.length && (
            <div className="rounded-xl border border-neutral-800 bg-neutral-900/60 p-4 text-sm text-gray-400">
              {status || "No scorecards to display yet."}
            </div>
          )}
        </section>
        </div>
      </Container>
    </main>
  )
}
