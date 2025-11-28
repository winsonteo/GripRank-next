'use client'

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { useSearchParams } from "next/navigation"
import Image from "next/image"
import Link from "next/link"
import Container from "@/components/Container"
import { firestore } from "@/lib/firebase/client"
import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  type Firestore,
  type Unsubscribe,
} from "firebase/firestore"
import { Button } from "@/components/ui/button"

interface SpeedCompetition {
  id: string
  name?: string
  status?: string
  updatedAt?: unknown
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

interface StartlistRow {
  heatIndex: number
  laneA: string | null
  laneB: string | null
}

interface SpeedAthlete {
  id: string
  name?: string
  team?: string
}

export default function SpeedStartlistPage() {
  if (!firestore) {
    return <StartlistUnavailable />
  }
  return <StartlistContent firestore={firestore} />
}

function StartlistContent({ firestore }: { firestore: Firestore }) {
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

  const [athletes, setAthletes] = useState<SpeedAthlete[]>([])
  const [startlist, setStartlist] = useState<StartlistRow[]>([])
  const [startlistLoading, setStartlistLoading] = useState(false)
  const fallbackTriedRef = useRef(false)

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
    loadCategories()
    return () => {
      cancelled = true
    }
  }, [selectedComp, firestore])

  useEffect(() => {
    if (!selectedComp || !selectedCategory) {
      setAthletes([])
      setStartlist([])
      setStartlistLoading(false)
      return
    }
    const db = firestore
    const tokenRef = { current: true }
    const unsubscribers: Unsubscribe[] = []
    fallbackTriedRef.current = false
    setStartlist([])
    setStartlistLoading(true)

    const athletesRef = collection(
      db,
      `speedCompetitions/${selectedComp}/categories/${selectedCategory}/athletes`
    )
    const unsubAthletes = onSnapshot(
      query(athletesRef, orderBy("name", "asc")),
      (snap) => {
        if (!tokenRef.current) return
        const list: SpeedAthlete[] = snap.docs.map((docSnap) => {
          const data = docSnap.data() || {}
          return { id: docSnap.id, ...data }
        })
        setAthletes(list)
      },
      () => undefined
    )
    unsubscribers.push(unsubAthletes)

    const startlistRef = collection(
      db,
      `speedCompetitions/${selectedComp}/categories/${selectedCategory}/startlist`
    )
    const unsubStartlist = onSnapshot(
      query(startlistRef, orderBy("heatIndex", "asc")),
      async (snap) => {
        if (!tokenRef.current) return
        const rows = snap.docs.map((docSnap) => {
          const data = docSnap.data() || {}
          return {
            heatIndex: typeof data.heatIndex === "number" ? data.heatIndex : Number(docSnap.id) || 0,
            laneA: (data.laneA as string | null | undefined) ?? null,
            laneB: (data.laneB as string | null | undefined) ?? null,
          }
        })
        rows.sort((a, b) => a.heatIndex - b.heatIndex)
        if (!rows.length && !fallbackTriedRef.current) {
          fallbackTriedRef.current = true
          const fallbackRows = await loadFallbackStartlist(db, selectedComp, selectedCategory)
          if (fallbackRows.length) {
            setStartlist(fallbackRows)
            setStartlistLoading(false)
            return
          }
        }
        setStartlist(rows)
        setStartlistLoading(false)
      },
      () => setStartlistLoading(false)
    )
    unsubscribers.push(unsubStartlist)

    return () => {
      tokenRef.current = false
      unsubscribers.forEach((fn) => fn())
    }
  }, [selectedComp, selectedCategory, firestore])

  const athleteName = useMemo(() => {
    const map = new Map<string, SpeedAthlete>()
    athletes.forEach((a) => map.set(a.id, a))
    return (aid?: string | null) => {
      if (!aid) return "—"
      const match = map.get(aid)
      if (!match) return aid
      return match.team ? `${match.name} (${match.team})` : match.name || aid
    }
  }, [athletes])

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
            <p className="text-sm uppercase tracking-wide text-primary">Speed Start List</p>
            <p className="text-base text-muted-foreground">
              View printable start lists for Speed qualifiers.
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
                disabled={!selectedComp || categoriesLoading || !categories.length}
              >
                <option value="">Select category</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name || cat.id}
                  </option>
                ))}
              </select>
            </FilterField>

            <div className="flex items-end">
              <Button
                variant="secondary"
                className="bg-card text-foreground hover:bg-card/80 w-full"
                type="button"
                onClick={() => window.print()}
                disabled={!startlist.length}
              >
                Print
              </Button>
            </div>
          </div>
        </section>
      </Container>

      <section className="w-full">
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse border-y border-border">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground" style={{ background: "rgba(255, 255, 255, 0.04)" }}>
                <th className="w-16 p-2 md:p-3 font-semibold text-center">Heat</th>
                <th className="p-2 md:p-3 font-semibold">Lane A</th>
                <th className="p-2 md:p-3 font-semibold">Lane B</th>
              </tr>
            </thead>
            <tbody>
              {!selectedComp || !selectedCategory ? (
                <TableMessage message="Select a competition and category to view the start list." />
              ) : startlistLoading ? (
                <TableMessage message="Loading start list…" />
              ) : startlist.length === 0 ? (
                <TableMessage message="No start list yet. Generate it from Setup or Judge." />
              ) : (
                startlist.map((row) => (
                  <tr
                    key={row.heatIndex}
                    className="border-b border-border text-sm"
                    style={{ background: row.heatIndex % 2 === 1 ? "rgba(255, 255, 255, 0.02)" : "transparent" }}
                  >
                    <td className="p-2 md:p-3 text-center font-semibold text-foreground">{row.heatIndex}</td>
                    <td className="p-2 md:p-3">
                      <div className="font-semibold text-foreground">{athleteName(row.laneA)}</div>
                    </td>
                    <td className="p-2 md:p-3">
                      <div className="font-semibold text-foreground">{athleteName(row.laneB)}</div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <Container>
          <p className="mt-4 text-xs text-muted-foreground">
            Heats follow the stored start list. Lane A and Lane B align with the judge view ordering.
          </p>
        </Container>
      </section>
    </main>
  )
}

function StartlistUnavailable() {
  return (
    <main className="py-12 text-foreground bg-background">
      <Container className="space-y-4">
        <h1 className="text-3xl font-semibold">Start list unavailable</h1>
        <p className="text-muted-foreground">
          Live data requires Firebase configuration. Please verify NEXT_PUBLIC_FIREBASE_* variables for this deployment.
        </p>
      </Container>
    </main>
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

function TableMessage({ message }: { message: string }) {
  return (
    <tr>
      <td colSpan={3} className="py-10 text-center text-sm text-muted-foreground">
        {message}
      </td>
    </tr>
  )
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

async function loadFallbackStartlist(
  db: Firestore,
  compId: string,
  categoryId: string
): Promise<StartlistRow[]> {
  try {
    const docRef = doc(db, `speedCompetitions/${compId}/categories/${categoryId}/finals/startlist`)
    const snap = await getDoc(docRef)
    if (snap.exists()) {
      const data = snap.data() || {}
      const laneA: (string | null)[] = Array.isArray(data.laneA) ? data.laneA : []
      const laneB: (string | null)[] = Array.isArray(data.laneB) ? data.laneB : []
      const size = Math.max(laneA.length, laneB.length)
      const rows: StartlistRow[] = []
      for (let i = 0; i < size; i += 1) {
        if (!laneA[i] && !laneB[i]) continue
        rows.push({ heatIndex: i + 1, laneA: laneA[i] || null, laneB: laneB[i] || null })
      }
      if (rows.length) return rows
    }

    const legacyCol = collection(db, `speedCompetitions/${compId}/categories/${categoryId}/qualifierStartlist`)
    const snapLegacy = await getDocs(legacyCol)
    if (!snapLegacy.empty) {
      const rows: StartlistRow[] = snapLegacy.docs.map((docSnap) => {
        const data = docSnap.data() || {}
        return {
          heatIndex: typeof data.heat === "number" ? data.heat : Number(docSnap.id) || 0,
          laneA: (data.laneA as string | null | undefined) ?? null,
          laneB: (data.laneB as string | null | undefined) ?? null,
        }
      })
      rows.sort((a, b) => a.heatIndex - b.heatIndex)
      return rows
    }
  } catch (error) {
    console.error("Fallback startlist load failed", error)
  }
  return []
}
