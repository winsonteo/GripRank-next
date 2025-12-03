'use client'

import { Suspense, useEffect, useMemo, useRef, useState } from "react"
import type { ReactNode } from "react"
import { useSearchParams } from "next/navigation"
import Image from "next/image"
import Link from "next/link"
import Container from "@/components/Container"
import { firestore } from "@/lib/firebase/client"
import {
  buildOverallRanking,
  buildQualifierStandings,
  bracketOrder,
  formatMs,
  laneResultLabel,
  type FinalsMatch,
  type FinalsMeta,
  type FinalsRounds,
  type QualifierStandingRow,
  type SpeedAthlete,
  type SpeedQualifierResult,
  type SpeedTimingPrecision,
} from "@/lib/speed/scoring"
import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  type DocumentData,
  type Firestore,
  type QuerySnapshot,
  type Unsubscribe,
} from "firebase/firestore"
import { Button } from "@/components/ui/button"

type LeaderboardTab = "qual" | "finals" | "overall"

interface SpeedCompetition {
  id: string
  name?: string
  status?: string
  updatedAt?: unknown
  timingPrecision?: SpeedTimingPrecision
  falseStartRule?: string
  archived?: boolean
  isArchived?: boolean
  deleted?: boolean
}

interface SpeedCategory {
  id: string
  name?: string
  order?: number
  updatedAt?: unknown
}

export default function SpeedLeaderboardPage() {
  if (!firestore) {
    return <LeaderboardUnavailable />
  }
  return (
    <Suspense fallback={<LeaderboardFallback />}>
      <LeaderboardContent firestore={firestore} />
    </Suspense>
  )
}

function LeaderboardContent({ firestore }: { firestore: Firestore }) {
  const searchParams = useSearchParams()
  const initialSelectionsRef = useRef({
    compId: searchParams?.get("comp") || null,
    categoryId: searchParams?.get("cat") || null,
    usedComp: false,
    usedCategory: false,
  })

  const [competitions, setCompetitions] = useState<SpeedCompetition[]>([])
  const [competitionsLoading, setCompetitionsLoading] = useState(true)
  const [selectedComp, setSelectedComp] = useState("")

  const [categories, setCategories] = useState<SpeedCategory[]>([])
  const [categoriesLoading, setCategoriesLoading] = useState(false)
  const [selectedCategory, setSelectedCategory] = useState("")

  const [compSettings, setCompSettings] = useState<{
    timingPrecision: SpeedTimingPrecision
    falseStartRule: string
    compName?: string
  }>({ timingPrecision: "ms3", falseStartRule: "IFSC" })

  const [athletes, setAthletes] = useState<SpeedAthlete[]>([])
  const [results, setResults] = useState<Map<string, SpeedQualifierResult>>(new Map())
  const [qualLoading, setQualLoading] = useState(false)
  const [finalsMeta, setFinalsMeta] = useState<FinalsMeta | null>(null)
  const [finalsRounds, setFinalsRounds] = useState<FinalsRounds>({})
  const [finalsLoading, setFinalsLoading] = useState(false)

  const [activeTab, setActiveTab] = useState<LeaderboardTab>("qual")
  const renderTokenRef = useRef(0)

  useEffect(() => {
    const db = firestore
    let cancelled = false
    async function loadCompetitions() {
      setCompetitionsLoading(true)
      try {
        const snap = await getDocs(collection(db, "speedCompetitions"))
        if (cancelled) return
        const comps: SpeedCompetition[] = snap.docs
          .map((docSnap) => {
            const data = (docSnap.data() || {}) as Partial<SpeedCompetition>
            return { id: docSnap.id, ...data }
          })
          .filter((comp) => {
            const status = (comp.status || "").toLowerCase()
            if (status === "archived" || status === "deleted") return false
            if ((comp as Record<string, unknown>).archived === true) return false
            if ((comp as Record<string, unknown>).deleted === true) return false
            if ((comp as Record<string, unknown>).isArchived === true) return false
            return true
          })
        comps.sort((a, b) => timestampValue(b.updatedAt) - timestampValue(a.updatedAt))
        setCompetitions(comps)
      } catch (error) {
        console.error(error)
        setCompetitions([])
      } finally {
        if (!cancelled) setCompetitionsLoading(false)
      }
    }
    loadCompetitions()
    return () => {
      cancelled = true
    }
  }, [firestore])

  useEffect(() => {
    if (!competitions.length) {
      setSelectedComp("")
      return
    }
    setSelectedComp((current) => {
      if (current && competitions.some((c) => c.id === current)) {
        return current
      }
      const { compId, usedComp } = initialSelectionsRef.current
      if (!usedComp && compId && competitions.some((c) => c.id === compId)) {
        initialSelectionsRef.current.usedComp = true
        return compId
      }
      return competitions[0]?.id || ""
    })
  }, [competitions])

  useEffect(() => {
    if (!selectedComp) {
      setCategories([])
      setSelectedCategory("")
      setCompSettings({ timingPrecision: "ms3", falseStartRule: "IFSC" })
      return
    }
    const db = firestore
    let cancelled = false
    async function loadCategories() {
      setCategoriesLoading(true)
      try {
        const snap = await getDocs(
          query(collection(db, `speedCompetitions/${selectedComp}/categories`))
        )
        if (cancelled) return
        const cats: SpeedCategory[] = snap.docs.map((docSnap) => {
          const data = (docSnap.data() || {}) as Partial<SpeedCategory>
          return { id: docSnap.id, ...data }
        })
        cats.sort((a, b) => {
          const orderA = typeof a.order === "number" ? a.order : Number.POSITIVE_INFINITY
          const orderB = typeof b.order === "number" ? b.order : Number.POSITIVE_INFINITY
          if (orderA !== orderB) return orderA - orderB
          return (a.name || a.id || "").localeCompare(b.name || b.id || "")
        })
        setCategories(cats)
        setSelectedCategory((current) => {
          if (current && cats.some((c) => c.id === current)) {
            return current
          }
          const { categoryId, usedCategory } = initialSelectionsRef.current
          if (!usedCategory && categoryId && cats.some((c) => c.id === categoryId)) {
            initialSelectionsRef.current.usedCategory = true
            return categoryId
          }
          if (!cats.length) return ""
          const latest = cats.reduce((best, cat) => {
            return timestampValue(cat.updatedAt) > timestampValue(best?.updatedAt || 0)
              ? cat
              : best
          }, cats[0])
          return latest?.id || cats[0].id
        })
      } catch (error) {
        console.error(error)
        if (!cancelled) {
          setCategories([])
          setSelectedCategory("")
        }
      } finally {
        if (!cancelled) setCategoriesLoading(false)
      }
    }
    async function loadCompSettings() {
      try {
        const compSnap = await getDoc(doc(db, "speedCompetitions", selectedComp))
        const data = (compSnap.data() || {}) as Partial<SpeedCompetition>
        setCompSettings((prev) => ({
          timingPrecision: (data.timingPrecision as SpeedTimingPrecision) || prev.timingPrecision,
          falseStartRule: data.falseStartRule || prev.falseStartRule,
          compName: data.name || selectedComp,
        }))
      } catch (error) {
        console.error(error)
      }
    }
    loadCategories()
    loadCompSettings()
    return () => {
      cancelled = true
    }
  }, [selectedComp, firestore])

  useEffect(() => {
    const db = firestore
    const token = ++renderTokenRef.current

    if (!selectedComp || !selectedCategory) {
      setAthletes([])
      setResults(new Map())
      setFinalsMeta(null)
      setFinalsRounds({})
      setQualLoading(false)
      setFinalsLoading(false)
      return
    }

    setQualLoading(true)
    setFinalsLoading(true)
    setFinalsRounds({})
    setFinalsMeta(null)

    const athletesRef = collection(
      db,
      `speedCompetitions/${selectedComp}/categories/${selectedCategory}/athletes`
    )
    const resultsRef = collection(
      db,
      `speedCompetitions/${selectedComp}/categories/${selectedCategory}/qualifierResults`
    )
    const finalsDocRef = doc(
      db,
      `speedCompetitions/${selectedComp}/categories/${selectedCategory}/finals/default`
    )
    const roundsCol = collection(finalsDocRef, "rounds")

    const unsubscribers: Unsubscribe[] = []
    let cleanupRoundMatches: () => void = () => {}

    const unsubAthletes = onSnapshot(
      query(athletesRef, orderBy("name", "asc")),
      (snap) => {
        if (token !== renderTokenRef.current) return
        const list: SpeedAthlete[] = snap.docs.map((docSnap) => {
          const data = docSnap.data() || {}
          return { id: docSnap.id, ...data }
        })
        setAthletes(list)
        setQualLoading(false)
      },
      () => setQualLoading(false)
    )
    unsubscribers.push(unsubAthletes)

    const unsubResults = onSnapshot(
      resultsRef,
      (snap) => {
        if (token !== renderTokenRef.current) return
        const map = toQualifierMap(snap)
        setResults(map)
        setQualLoading(false)
      },
      () => setQualLoading(false)
    )
    unsubscribers.push(unsubResults)

    const unsubMeta = onSnapshot(
      finalsDocRef,
      (snap) => {
        if (token !== renderTokenRef.current) return
        setFinalsMeta(snap.exists() ? (snap.data() as FinalsMeta) : null)
        setFinalsLoading(false)
      },
      () => setFinalsLoading(false)
    )
    unsubscribers.push(unsubMeta)

    const unsubRounds = onSnapshot(
      roundsCol,
      (roundSnap) => {
        if (token !== renderTokenRef.current) return
        cleanupRoundMatches()
        setFinalsRounds({})
        const matchUnsubs: Unsubscribe[] = []
        roundSnap.docs.forEach((roundDoc) => {
          const rid = roundDoc.id
          const matchesRef = collection(roundDoc.ref, "matches")
          const unsubMatch = onSnapshot(
            matchesRef,
            (matchSnap) => {
              if (token !== renderTokenRef.current) return
              const matches: FinalsMatch[] = matchSnap.docs
                .map((m) => ({ id: m.id, ...(m.data() as FinalsMatch) }))
                .sort((a, b) => (a.matchIndex || 0) - (b.matchIndex || 0))
              setFinalsRounds((prev) => ({ ...prev, [rid]: matches }))
              setFinalsLoading(false)
            },
            () => setFinalsLoading(false)
          )
          matchUnsubs.push(unsubMatch)
        })
        cleanupRoundMatches = () => {
          matchUnsubs.forEach((fn) => fn())
        }
      },
      () => setFinalsLoading(false)
    )
    unsubscribers.push(unsubRounds)

    return () => {
      renderTokenRef.current += 1
      cleanupRoundMatches()
      unsubscribers.forEach((fn) => fn())
    }
  }, [selectedComp, selectedCategory, firestore])

  const qualifierRows = useMemo(() => {
    return buildQualifierStandings({
      athletes,
      results,
      precision: compSettings.timingPrecision,
    })
  }, [athletes, results, compSettings.timingPrecision])

  const overallRows = useMemo(() => {
    return buildOverallRanking({
      athletes,
      rounds: finalsRounds,
      qualifiers: results,
    })
  }, [athletes, finalsRounds, results])

  const activePrecision = compSettings.timingPrecision
  const disableCategorySelect = !selectedComp || categoriesLoading

  return (
    <main className="py-12 text-foreground bg-background">
      <Container className="space-y-8 mb-8">
        <header className="space-y-4">
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
          <div className="space-y-2">
            <p className="text-sm uppercase tracking-wide text-primary">Speed Results</p>
            <p className="text-base text-muted-foreground">
              Choose a competition and category to view live Speed standings across Qualifiers, Finals, and Overall.
            </p>
          </div>
        </header>

        <section className="rounded-2xl border border-border bg-panel p-6">
          <div className="grid gap-4 md:grid-cols-3">
            <FilterField
              label="Competition"
              helpText={
                competitionsLoading
                  ? "Loading competitions…"
                  : !competitions.length
                  ? "No competitions available"
                  : undefined
              }
            >
              <select
                className="mt-2 w-full rounded-xl border border-border bg-input px-4 py-3 text-sm text-foreground focus:border-ring focus:outline-none"
                value={selectedComp}
                onChange={(event) => setSelectedComp(event.target.value)}
                disabled={competitionsLoading || !competitions.length}
              >
                <option value="">Select competition</option>
                {competitions.map((comp) => (
                  <option key={comp.id} value={comp.id}>
                    {comp.name || comp.id}
                  </option>
                ))}
              </select>
            </FilterField>

            <FilterField
              label="Category"
              helpText={
                !selectedComp
                  ? "Select a competition first"
                  : categoriesLoading
                  ? "Loading categories…"
                  : !categories.length
                  ? "No categories found"
                  : undefined
              }
            >
              <select
                className="mt-2 w-full rounded-xl border border-border bg-input px-4 py-3 text-sm text-foreground focus:border-ring focus:outline-none disabled:opacity-60"
                value={selectedCategory}
                onChange={(event) => setSelectedCategory(event.target.value)}
                disabled={disableCategorySelect || !categories.length}
              >
                <option value="">Select category</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name || cat.id}
                  </option>
                ))}
              </select>
            </FilterField>

            <FilterField label="Timing precision">
              <div className="mt-2 text-sm text-muted-foreground">
                {activePrecision === "ms2" ? "Hundredths (x.xx s)" : "Milliseconds (x.xxx s)"}
              </div>
            </FilterField>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <TabButton active={activeTab === "qual"} onClick={() => setActiveTab("qual")}>
              Qualifiers
            </TabButton>
            <TabButton active={activeTab === "finals"} onClick={() => setActiveTab("finals")}>
              Finals Bracket
            </TabButton>
            <TabButton active={activeTab === "overall"} onClick={() => setActiveTab("overall")}>
              Overall Ranking
            </TabButton>
            {selectedComp ? (
              <Button asChild variant="secondary" className="ml-auto bg-card text-foreground hover:bg-card/80">
                <Link
                  href={`/speed/startlist?comp=${encodeURIComponent(selectedComp)}${
                    selectedCategory ? `&cat=${encodeURIComponent(selectedCategory)}` : ""
                  }`}
                >
                  View Start List
                </Link>
              </Button>
            ) : null}
          </div>
        </section>
      </Container>

      <section className="w-full">
        {activeTab === "qual" ? (
          <QualifierTable
            rows={qualifierRows}
            loading={qualLoading}
            hasSelection={Boolean(selectedComp && selectedCategory)}
            precision={activePrecision}
          />
        ) : null}
        {activeTab === "finals" ? (
          <FinalsBracket
            rounds={finalsRounds}
            meta={finalsMeta}
            loading={finalsLoading}
            hasSelection={Boolean(selectedComp && selectedCategory)}
            athletes={athletes}
            precision={activePrecision}
          />
        ) : null}
        {activeTab === "overall" ? (
          <OverallTable
            rows={overallRows}
            loading={finalsLoading && !overallRows.length}
            hasSelection={Boolean(selectedComp && selectedCategory)}
            precision={activePrecision}
          />
        ) : null}
      </section>
    </main>
  )
}

function QualifierTable({
  rows,
  loading,
  hasSelection,
  precision,
}: {
  rows: QualifierStandingRow[]
  loading: boolean
  hasSelection: boolean
  precision: SpeedTimingPrecision
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse border-y border-border">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground" style={{ background: "rgba(255, 255, 255, 0.04)" }}>
            <th className="w-12 md:w-16 p-2 md:p-3 font-semibold">Rank</th>
            <th className="w-48 md:w-64 p-2 md:p-3 font-semibold">Athlete</th>
            <th className="w-32 md:w-48 p-2 md:p-3 font-semibold">Team</th>
            <th className="w-24 md:w-32 p-2 md:p-3 font-semibold text-right">Best</th>
            <th className="w-24 md:w-32 p-2 md:p-3 font-semibold text-right">2nd Best</th>
          </tr>
        </thead>
        <tbody>
          {renderTableMessage({ loading, hasSelection, hasRows: rows.length > 0 })}
          {!loading &&
            hasSelection &&
            rows.map((row, idx) => (
              <tr
                key={row.athleteId}
                className="text-sm border-b border-border"
                style={{
                  background: idx % 2 === 1 ? "rgba(255, 255, 255, 0.02)" : "transparent",
                }}
              >
                <td className="p-2 md:p-3 font-semibold text-foreground">{row.rank}</td>
                <td className="p-2 md:p-3">
                  <div className="font-semibold text-foreground">{row.name}</div>
                </td>
                <td className="p-2 md:p-3 text-muted-foreground">{row.team || "—"}</td>
                <td className="p-2 md:p-3 text-right text-base font-semibold text-foreground">
                  {row.bestLabel}
                </td>
                <td className="p-2 md:p-3 text-right text-base text-foreground">
                  {row.secondLabel}
                </td>
              </tr>
            ))}
        </tbody>
      </table>
      <Container>
        <p className="mt-4 text-xs text-muted-foreground">
          Ranking uses fastest time, then second best time, then name. All DNS/DNF/FS entries share the last rank. Display precision: {precision === "ms2" ? "x.xx" : "x.xxx"} seconds.
        </p>
      </Container>
    </div>
  )
}

function FinalsBracket({
  rounds,
  meta,
  loading,
  hasSelection,
  athletes,
  precision,
}: {
  rounds: FinalsRounds
  meta: FinalsMeta | null
  loading: boolean
  hasSelection: boolean
  athletes: SpeedAthlete[]
  precision: SpeedTimingPrecision
}) {
  const order = bracketOrder(meta?.size)
  const nameOf = (aid?: string | null) => {
    if (!aid) return "—"
    const match = athletes.find((a) => a.id === aid)
    if (!match) return aid
    return match.team ? `${match.name} (${match.team})` : match.name || aid
  }

  const hasMatches = Object.values(rounds).some((list) => list?.length)
  const message = !hasSelection
    ? "Select a competition and category to view scores."
    : loading
    ? "Loading finals…"
    : !hasMatches
    ? "Finals not generated yet."
    : null

  if (message) {
    return (
      <table className="w-full text-sm border-collapse border-y border-border">
        <tbody>
          <TableMessage message={message} colSpan={1} />
        </tbody>
      </table>
    )
  }

  return (
    <div className="px-4 md:px-8">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {order.map((rid) => {
          const matches = rounds[rid] || []
          return (
            <div key={rid} className="rounded-2xl border border-border bg-panel p-4">
              <h3 className="text-sm font-semibold text-muted-foreground mb-3">
                {roundLabel(rid)}
              </h3>
              {matches.length ? (
                matches.map((m) => {
                  const isBigFinal = rid === "F" && m.matchIndex === 2
                  const showA = laneResultLabel({
                    lane: m.laneA,
                    opponent: m.laneB,
                    isWinner: m.winner === "A",
                    isBigFinal,
                    allowWinnerRun: m.allowWinnerRun ?? meta?.allowWinnerRun,
                    precision,
                  })
                  const showB = laneResultLabel({
                    lane: m.laneB,
                    opponent: m.laneA,
                    isWinner: m.winner === "B",
                    isBigFinal,
                    allowWinnerRun: m.allowWinnerRun ?? meta?.allowWinnerRun,
                    precision,
                  })
                  return (
                    <div
                      key={m.id || `${rid}-${m.matchIndex}-${m.athleteA}-${m.athleteB}`}
                      className="mb-3 rounded-xl border border-border/60 bg-card/50 p-3"
                    >
                      <div className="text-xs text-muted-foreground mb-2">
                        {rid === "F"
                          ? m.matchIndex === 2
                            ? "Big Final"
                            : m.matchIndex === 1
                            ? "Small Final"
                            : `Match ${m.matchIndex || ""}`
                          : `Match ${m.matchIndex || ""}`}
                      </div>
                      <div
                        className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-2 ${m.winner === "A" ? "border-success/70 bg-success/10" : "border-border/60 bg-panel"}`}
                      >
                        <div className="font-semibold text-foreground">{nameOf(m.athleteA)}</div>
                        <div className="text-sm text-muted-foreground">{showA}</div>
                      </div>
                      <div
                        className={`mt-2 flex items-center justify-between gap-2 rounded-lg border px-3 py-2 ${m.winner === "B" ? "border-success/70 bg-success/10" : "border-border/60 bg-panel"}`}
                      >
                        <div className="font-semibold text-foreground">{nameOf(m.athleteB)}</div>
                        <div className="text-sm text-muted-foreground">{showB}</div>
                      </div>
                    </div>
                  )
                })
              ) : (
                <p className="text-sm text-muted-foreground">No matches yet.</p>
              )}
            </div>
          )
        })}
      </div>
      <Container>
        <p className="mt-4 text-xs text-muted-foreground">
          Finals show live matches from Firestore. If a finalist false starts or does not start, winners in the big final show a dash unless allow-winner-time is enabled.
        </p>
      </Container>
    </div>
  )
}

function OverallTable({
  rows,
  loading,
  hasSelection,
  precision,
}: {
  rows: ReturnType<typeof buildOverallRanking>
  loading: boolean
  hasSelection: boolean
  precision: SpeedTimingPrecision
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse border-y border-border">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground" style={{ background: "rgba(255, 255, 255, 0.04)" }}>
            <th className="w-12 md:w-16 p-2 md:p-3 font-semibold">Rank</th>
            <th className="w-48 md:w-64 p-2 md:p-3 font-semibold">Name</th>
            <th className="w-32 md:w-48 p-2 md:p-3 font-semibold">Team</th>
            <th className="w-32 md:w-40 p-2 md:p-3 font-semibold">Stage</th>
            <th className="w-24 md:w-32 p-2 md:p-3 font-semibold text-right">Fastest Time</th>
          </tr>
        </thead>
        <tbody>
          {renderTableMessage({ loading, hasSelection, hasRows: rows.length > 0 })}
          {!loading &&
            hasSelection &&
            rows.map((row, idx) => (
              <tr
                key={row.athleteId}
                className="text-sm border-b border-border"
                style={{
                  background: idx % 2 === 1 ? "rgba(255, 255, 255, 0.02)" : "transparent",
                }}
              >
                <td className="p-2 md:p-3 font-semibold text-foreground">{row.rank}</td>
                <td className="p-2 md:p-3">
                  <div className="font-semibold text-foreground">{row.name}</div>
                </td>
                <td className="p-2 md:p-3 text-muted-foreground">{row.team || "—"}</td>
                <td className="p-2 md:p-3 text-muted-foreground">{stageLabel(row.stage)}</td>
                <td className="p-2 md:p-3 text-right text-base text-foreground">
                  {row.bestMs != null ? `${formatMs(row.bestMs, precision)} s` : "—"}
                </td>
              </tr>
            ))}
        </tbody>
      </table>
      <Container>
        <p className="mt-4 text-xs text-muted-foreground">
          Overall ranking groups athletes by exit stage (winner → big final loser → small final placements or semifinal exits → quarterfinal exits → R16 exits → qualifiers only) with time-based tiebreaks inside each group.
        </p>
      </Container>
    </div>
  )
}

function TabButton({
  active,
  children,
  onClick,
}: {
  active: boolean
  children: ReactNode
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
        active
          ? "bg-primary text-primary-foreground shadow"
          : "bg-input text-foreground hover:bg-input/80"
      }`}
      type="button"
    >
      {children}
    </button>
  )
}

function FilterField({
  label,
  children,
  helpText,
}: {
  label: string
  children: ReactNode
  helpText?: string
}) {
  return (
    <label className="block text-sm font-medium text-muted-foreground">
      {label}
      {children}
      {helpText ? (
        <span className="mt-2 block text-xs text-muted-foreground">{helpText}</span>
      ) : null}
    </label>
  )
}

function renderTableMessage({
  loading,
  hasSelection,
  hasRows,
}: {
  loading: boolean
  hasSelection: boolean
  hasRows: boolean
}) {
  if (!hasSelection) {
    return (
      <TableMessage message="Select a competition and category to view scores." />
    )
  }
  if (loading) {
    return <TableMessage message="Loading leaderboard…" />
  }
  if (!hasRows) {
    return <TableMessage message="No results recorded yet." />
  }
  return null
}

function TableMessage({ message, colSpan = 5 }: { message: string; colSpan?: number }) {
  return (
    <tr>
      <td colSpan={colSpan} className="py-10 text-center text-sm text-muted-foreground">
        {message}
      </td>
    </tr>
  )
}

function LeaderboardFallback() {
  return (
    <main className="py-12 text-foreground bg-background">
      <Container className="space-y-6">
        <div className="space-y-2">
          <div className="h-4 w-32 animate-pulse rounded bg-card" />
          <div className="h-8 w-72 animate-pulse rounded bg-card" />
        </div>
        <div className="h-40 animate-pulse rounded-2xl border border-border bg-panel" />
        <div className="h-64 animate-pulse rounded-2xl border border-border bg-panel" />
      </Container>
    </main>
  )
}

function LeaderboardUnavailable() {
  return (
    <main className="py-12 text-foreground bg-background">
      <Container className="space-y-4">
        <h1 className="text-3xl font-semibold">Leaderboard unavailable</h1>
        <p className="text-muted-foreground">
          Live results require Firebase configuration. Please verify NEXT_PUBLIC_FIREBASE_* variables are set for this deployment.
        </p>
      </Container>
    </main>
  )
}

function toQualifierMap(snapshot: QuerySnapshot<DocumentData>) {
  const map = new Map<string, SpeedQualifierResult>()
  snapshot.docs.forEach((docSnap) => {
    map.set(docSnap.id, docSnap.data() as SpeedQualifierResult)
  })
  return map
}

function timestampValue(input: unknown): number {
  if (!input) return 0
  if (typeof input === "number") return input
  if (input instanceof Date) return input.getTime()
  if (typeof (input as { toMillis?: () => number }).toMillis === "function") {
    const millis = (input as { toMillis: () => number }).toMillis()
    return Number.isFinite(millis) ? millis : 0
  }
  if (
    typeof (input as { seconds?: number }).seconds === "number" &&
    typeof (input as { nanoseconds?: number }).nanoseconds === "number"
  ) {
    const ts = input as { seconds: number; nanoseconds: number }
    return ts.seconds * 1000 + ts.nanoseconds / 1e6
  }
  return 0
}

function roundLabel(id: string) {
  if (id === "R16") return "Top 16"
  if (id === "QF") return "Quarterfinals"
  if (id === "SF") return "Semifinals"
  if (id === "F") return "Final"
  return id
}

function stageLabel(stage: string) {
  if (stage === "WIN") return "Winner"
  if (stage === "F") return "Big Final"
  if (stage === "SF") return "Semifinals"
  if (stage === "QF") return "Quarterfinals"
  if (stage === "R16") return "Round of 16"
  return "Qualifiers"
}
