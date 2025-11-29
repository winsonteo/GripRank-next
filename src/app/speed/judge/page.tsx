'use client'

import { useEffect, useMemo, useRef, useState } from "react"
import Image from "next/image"
import Link from "next/link"
import AccessDenied from "@/components/AccessDenied"
import Container from "@/components/Container"
import { firestore } from "@/lib/firebase/client"
import { useJudgePasscodeSession } from "@/hooks/useJudgePasscodeSession"
import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  type Firestore,
  type Unsubscribe,
} from "firebase/firestore"
import { Button } from "@/components/ui/button"

type SpeedTimingPrecision = "ms2" | "ms3"
type SpeedFalseStartRule = "IFSC" | "TOLERANT"

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
}

interface SpeedAthlete {
  id: string
  name?: string
  team?: string
  order?: number
}

interface StartlistRow {
  heatIndex: number
  laneA: string | null
  laneB: string | null
}

type SpeedRunStatus = "TIME" | "FS" | "DNS" | "DNF"

interface SpeedRunResult {
  status?: SpeedRunStatus | null
  ms?: number | null
}

interface SpeedQualifierResult {
  runA?: SpeedRunResult
  runB?: SpeedRunResult
}

type JudgeAuthState = ReturnType<typeof useJudgePasscodeSession>

export default function SpeedJudgePage() {
  const authState = useJudgePasscodeSession()
  if (!firestore) {
    return <AccessDenied feature="Speed Judge" message="Firebase not available. Check NEXT_PUBLIC_FIREBASE_* configuration." />
  }
  return <JudgeInterface authState={authState} firestore={firestore} />
}

function JudgeInterface({ authState, firestore }: { authState: JudgeAuthState; firestore: Firestore }) {
  const {
    session,
    loading: authLoading,
    signingIn,
    error: authError,
    signInWithPasscode,
    signOutJudge,
    invalidateSession,
    clearError,
  } = authState

  const [competitions, setCompetitions] = useState<SpeedCompetition[]>([])
  const [competitionsLoading, setCompetitionsLoading] = useState(true)
  const [selectedComp, setSelectedComp] = useState("")
  const [passcodeInput, setPasscodeInput] = useState("")
  const [authNotice, setAuthNotice] = useState("")

  const [categories, setCategories] = useState<SpeedCategory[]>([])
  const [categoriesLoading, setCategoriesLoading] = useState(false)
  const [selectedCategory, setSelectedCategory] = useState("")

  const [startlist, setStartlist] = useState<StartlistRow[]>([])
  const [startlistLoading, setStartlistLoading] = useState(false)
  const [athletes, setAthletes] = useState<SpeedAthlete[]>([])
  const [results, setResults] = useState<Map<string, SpeedQualifierResult>>(new Map())

  const [falseStartRule, setFalseStartRule] = useState<SpeedFalseStartRule>("IFSC")
  const [timingPrecision, setTimingPrecision] = useState<SpeedTimingPrecision>("ms3")

  const effectTokenRef = useRef(0)

  // Load competitions
  useEffect(() => {
    let cancelled = false
    async function loadCompetitions() {
      setCompetitionsLoading(true)
      try {
        const snap = await getDocs(collection(firestore, "speedCompetitions"))
        if (cancelled) return
        const comps: SpeedCompetition[] = snap.docs
          .map((docSnap) => ({ id: docSnap.id, ...(docSnap.data() || {}) } as SpeedCompetition))
          .filter((comp) => {
            const status = (comp.status || "").toLowerCase()
            if (status === "archived" || status === "deleted") return false
            if (comp.archived === true || comp.deleted === true || comp.isArchived === true) return false
            return true
          })
        comps.sort((a, b) => timestampValue(b.updatedAt) - timestampValue(a.updatedAt))
        setCompetitions(comps)
        if (!selectedComp && comps.length) {
          setSelectedComp(comps[0].id)
        }
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
  }, [firestore, selectedComp])

  // Load categories + comp settings
  useEffect(() => {
    if (!selectedComp) {
      setCategories([])
      setSelectedCategory("")
      return
    }
    let cancelled = false
    async function load() {
      setCategoriesLoading(true)
      try {
        const [catSnap, compSnap] = await Promise.all([
          getDocs(query(collection(firestore, `speedCompetitions/${selectedComp}/categories`))),
          getDoc(doc(firestore, "speedCompetitions", selectedComp)),
        ])
        if (cancelled) return
        const cats: SpeedCategory[] = catSnap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) }))
        cats.sort((a, b) => {
          const orderA = typeof a.order === "number" ? a.order : Number.POSITIVE_INFINITY
          const orderB = typeof b.order === "number" ? b.order : Number.POSITIVE_INFINITY
          if (orderA !== orderB) return orderA - orderB
          return (a.name || a.id || "").localeCompare(b.name || b.id || "")
        })
        setCategories(cats)
        if (!selectedCategory && cats.length) {
          setSelectedCategory(cats[0].id)
        } else if (selectedCategory && !cats.find((c) => c.id === selectedCategory)) {
          setSelectedCategory(cats[0]?.id || "")
        }
        const compData = (compSnap.data() || {}) as { falseStartRule?: string; timingPrecision?: string }
        setFalseStartRule(compData.falseStartRule === "TOLERANT" ? "TOLERANT" : "IFSC")
        setTimingPrecision(compData.timingPrecision === "ms2" ? "ms2" : "ms3")
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
    load()
    return () => {
      cancelled = true
    }
  }, [selectedComp, firestore, selectedCategory])

  // Load startlist, athletes, results
  useEffect(() => {
    const token = ++effectTokenRef.current
    if (!selectedComp || !selectedCategory) {
      setStartlist([])
      setAthletes([])
      setResults(new Map())
      setStartlistLoading(false)
      return
    }
    setStartlistLoading(true)

    const unsubscribers: Unsubscribe[] = []
    let cleanupFallback = false

    const athletesRef = collection(
      firestore,
      `speedCompetitions/${selectedComp}/categories/${selectedCategory}/athletes`
    )
    unsubscribers.push(
      onSnapshot(query(athletesRef, orderBy("name", "asc")), (snap) => {
        if (token !== effectTokenRef.current) return
        const list: SpeedAthlete[] = snap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) }))
        setAthletes(list)
      })
    )

    const resultsRef = collection(
      firestore,
      `speedCompetitions/${selectedComp}/categories/${selectedCategory}/qualifierResults`
    )
    unsubscribers.push(
      onSnapshot(resultsRef, (snap) => {
        if (token !== effectTokenRef.current) return
        const map = new Map<string, SpeedQualifierResult>()
        snap.docs.forEach((d) => map.set(d.id, d.data() as SpeedQualifierResult))
        setResults(map)
      })
    )

    const startlistRef = collection(
      firestore,
      `speedCompetitions/${selectedComp}/categories/${selectedCategory}/startlist`
    )
    unsubscribers.push(
      onSnapshot(
        query(startlistRef, orderBy("heatIndex", "asc")),
        async (snap) => {
          if (token !== effectTokenRef.current) return
          const rows: StartlistRow[] = snap.docs.map((d) => {
            const data = d.data() || {}
            return {
              heatIndex: typeof data.heatIndex === "number" ? data.heatIndex : Number(d.id) || 0,
              laneA: (data.laneA as string | null | undefined) ?? null,
              laneB: (data.laneB as string | null | undefined) ?? null,
            }
          })
          rows.sort((a, b) => a.heatIndex - b.heatIndex)
          if (!rows.length && !cleanupFallback) {
            const fallback = await loadFallbackStartlist(firestore, selectedComp, selectedCategory)
            if (token === effectTokenRef.current && fallback.length) {
              setStartlist(fallback)
              setStartlistLoading(false)
              return
            }
          }
          setStartlist(rows)
          setStartlistLoading(false)
        },
        () => setStartlistLoading(false)
      )
    )

    return () => {
      cleanupFallback = true
      effectTokenRef.current += 1
      unsubscribers.forEach((fn) => fn())
    }
  }, [selectedComp, selectedCategory, firestore])

  const compLocked = session?.authType === "judge-passcode" && session.compId

  const laneLabel = useMemo(() => {
    const map = new Map<string, SpeedAthlete>()
    athletes.forEach((a) => map.set(a.id, a))
    return (aid?: string | null) => {
      if (!aid) return "—"
      const ath = map.get(aid)
      if (!ath) return aid
      return ath.team ? `${ath.name} (${ath.team})` : ath.name || aid
    }
  }, [athletes])

  const runKeyFor = (seen: Map<string, number>, athleteId: string | null | undefined) => {
    if (!athleteId) return "runA"
    const count = seen.get(athleteId) || 0
    seen.set(athleteId, count + 1)
    if (count === 0) return "runA"
    if (count === 1) return "runB"
    return "runB"
  }

  const parseMs = (value: string) => {
    const trimmed = String(value || "").trim().replace(",", ".")
    if (!trimmed) return null
    const num = Number(trimmed)
    if (Number.isNaN(num)) return null
    return Math.round(num * 1000)
  }

  const onSaveRun = async ({
    athleteId,
    runKey,
    status,
    msInput,
  }: {
    athleteId: string
    runKey: "runA" | "runB"
    status: SpeedRunStatus
    msInput: string
  }) => {
    try {
      const ms = status === "TIME" ? parseMs(msInput) : null
      const base = {
        status,
        ms: status === "TIME" && ms != null ? ms : null,
      }
      const payload: Record<string, unknown> = {
        updatedAt: serverTimestamp(),
        [runKey]: base,
      }
      if (falseStartRule === "IFSC" && runKey === "runA" && status === "FS") {
        const existing = results.get(athleteId)
        const runB = existing?.runB || {}
        payload.runB = runB.status ? runB : { status: "DNS", ms: null }
      }
      const ref = doc(
        firestore,
        `speedCompetitions/${selectedComp}/categories/${selectedCategory}/qualifierResults/${athleteId}`
      )
      await setDoc(ref, payload, { merge: true })
      setAuthNotice(`Saved ${athleteId}`)
    } catch (error) {
      console.error(error)
      setAuthNotice("Save failed")
    }
  }

  if (authLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center text-muted-foreground">
        Loading…
      </main>
    )
  }

  if (authError && !session) {
    return (
      <main className="py-12 text-foreground bg-background">
        <Container className="space-y-6">
          <header className="space-y-2">
            <Image
              src="/logo_header.png"
              alt="GripRank"
              width={4001}
              height={1228}
              priority
              className="h-11 w-auto"
            />
            <p className="text-muted-foreground">{authError}</p>
          </header>
          <PasscodeCard
            competitions={competitions}
            loading={competitionsLoading}
            selectedComp={selectedComp}
            setSelectedComp={setSelectedComp}
            passcodeInput={passcodeInput}
            setPasscodeInput={setPasscodeInput}
            signingIn={signingIn}
            onSignIn={async () => {
              if (!selectedComp) {
                setAuthNotice("Select a competition first")
                return
              }
              await signInWithPasscode(selectedComp, passcodeInput, "speed").catch(() => {
                setAuthNotice("Invalid code")
              })
            }}
            notice={authNotice}
            clearNotice={() => setAuthNotice("")}
          />
        </Container>
      </main>
    )
  }

  return (
    <main className="py-10 text-foreground bg-background">
      <Container className="space-y-6">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1">
            <Image
              src="/logo_header.png"
              alt="GripRank"
              width={4001}
              height={1228}
              priority
              className="h-11 w-auto"
            />
            <p className="text-sm text-muted-foreground">
              Speed Judge Pad — enter qualifier times and statuses.
            </p>
          </div>
          <div className="flex items-center gap-3">
            {session ? (
              <span className="text-xs text-muted-foreground">
                Signed in as judge {session.compId ? `for ${session.compId}` : ""}
              </span>
            ) : null}
            <Button variant="secondary" onClick={() => signOutJudge().catch(() => null)}>
              Sign out
            </Button>
          </div>
        </header>

        <section className="rounded-2xl border border-border bg-panel p-6 space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <FilterField label="Competition" helpText={compLocked ? "Locked to passcode competition" : undefined}>
              <select
                className="mt-2 w-full rounded-xl border border-border bg-input px-4 py-3 text-sm text-foreground focus:border-ring focus:outline-none"
                value={selectedComp}
                onChange={(event) => {
                  setSelectedComp(event.target.value)
                  clearError()
                  setAuthNotice("")
                }}
                disabled={competitionsLoading || compLocked}
              >
                <option value="">Select competition</option>
                {competitions.map((comp) => (
                  <option key={comp.id} value={comp.id}>
                    {comp.name || comp.id}
                  </option>
                ))}
              </select>
            </FilterField>

            <FilterField label="Category">
              <select
                className="mt-2 w-full rounded-xl border border-border bg-input px-4 py-3 text-sm text-foreground focus:border-ring focus:outline-none"
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

            <FilterField label="Actions">
              <div className="mt-2 flex flex-wrap gap-2">
                <Button
                  asChild
                  variant="secondary"
                  className="bg-card text-foreground hover:bg-card/80"
                  disabled={!selectedComp || !selectedCategory}
                >
                  <Link
                    href={`/speed/leaderboard?comp=${encodeURIComponent(selectedComp || "")}${
                      selectedCategory ? `&cat=${encodeURIComponent(selectedCategory)}` : ""
                    }`}
                  >
                    View Leaderboard
                  </Link>
                </Button>
                <Button
                  variant="secondary"
                  className="bg-card text-foreground hover:bg-card/80"
                  disabled={!selectedComp}
                  onClick={() => {
                    setPasscodeInput("")
                    invalidateSession("Session reset. Re-enter passcode to switch comp.")
                  }}
                >
                  Switch Code
                </Button>
              </div>
            </FilterField>
          </div>

          {!session ? (
            <PasscodeCard
              competitions={competitions}
              loading={competitionsLoading}
              selectedComp={selectedComp}
              setSelectedComp={setSelectedComp}
              passcodeInput={passcodeInput}
              setPasscodeInput={setPasscodeInput}
              signingIn={signingIn}
              onSignIn={async () => {
                if (!selectedComp) {
                  setAuthNotice("Select a competition first")
                  return
                }
                await signInWithPasscode(selectedComp, passcodeInput, "speed").catch(() => {
                  setAuthNotice("Invalid code")
                })
              }}
              notice={authNotice}
              clearNotice={() => setAuthNotice("")}
            />
          ) : null}
        </section>

        <section className="rounded-2xl border border-border bg-panel p-6 space-y-3">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="space-y-1">
              <p className="text-sm font-semibold text-foreground">Qualifier Heats</p>
              <p className="text-xs text-muted-foreground">
                First appearance = Run A, second appearance = Run B. {falseStartRule === "IFSC" ? "FS on Run A auto-sets Run B to DNS." : null}
              </p>
            </div>
            <span className="text-xs text-muted-foreground">
              Precision: {timingPrecision === "ms2" ? "x.xx s" : "x.xxx s"}
            </span>
          </div>

          {!selectedComp || !selectedCategory ? (
            <div className="text-sm text-muted-foreground">Select competition and category to begin.</div>
          ) : startlistLoading ? (
            <div className="text-sm text-muted-foreground">Loading startlist…</div>
          ) : !startlist.length ? (
            <div className="text-sm text-muted-foreground">
              No start list found. Create one in Speed Admin before judging.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground" style={{ background: "rgba(255, 255, 255, 0.04)" }}>
                    <th className="p-2 md:p-3">Heat</th>
                    <th className="p-2 md:p-3">Lane A</th>
                    <th className="p-2 md:p-3">Status</th>
                    <th className="p-2 md:p-3">Time (s)</th>
                    <th className="p-2 md:p-3">Lane B</th>
                    <th className="p-2 md:p-3">Status</th>
                    <th className="p-2 md:p-3">Time (s)</th>
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    const seen = new Map<string, number>()
                    return startlist.map((row, idx) => {
                      // Ensure consistent run mapping across both lanes per render
                      const aRunKey = runKeyFor(seen, row.laneA) as "runA" | "runB"
                      const bRunKey = runKeyFor(seen, row.laneB) as "runA" | "runB"
                    const resA = row.laneA ? results.get(row.laneA) : null
                    const resB = row.laneB ? results.get(row.laneB) : null
                    const laneAStatus = aRunKey === "runA" ? resA?.runA?.status : resA?.runB?.status
                    const laneBStatus = bRunKey === "runA" ? resB?.runA?.status : resB?.runB?.status
                    const laneAMs = aRunKey === "runA" ? resA?.runA?.ms : resA?.runB?.ms
                    const laneBMs = bRunKey === "runA" ? resB?.runA?.ms : resB?.runB?.ms
                    return (
                      <tr
                        key={row.heatIndex}
                        className="border-b border-border"
                        style={{ background: idx % 2 === 1 ? "rgba(255, 255, 255, 0.02)" : "transparent" }}
                      >
                        <td className="p-2 md:p-3 font-semibold text-center">{row.heatIndex}</td>
                        <td className="p-2 md:p-3">
                          <div className="font-semibold text-foreground">{laneLabel(row.laneA)}</div>
                          <div className="text-xs text-muted-foreground">{aRunKey.toUpperCase()}</div>
                        </td>
                        <td className="p-2 md:p-3">
                          <select
                            className="w-full rounded-lg border border-border bg-input px-2 py-2 text-sm text-foreground"
                            value={laneAStatus || "TIME"}
                            onChange={(e) =>
                              row.laneA &&
                              onSaveRun({
                                athleteId: row.laneA,
                                runKey: aRunKey,
                                status: e.target.value as SpeedRunStatus,
                                msInput: "",
                              })
                            }
                            disabled={!row.laneA}
                          >
                            {STATUS_OPTIONS.map((s) => (
                              <option key={s} value={s}>
                                {s}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="p-2 md:p-3">
                          <input
                            className="w-full rounded-lg border border-border bg-input px-2 py-2 text-sm text-foreground"
                            type="text"
                            inputMode="decimal"
                            placeholder={timingPrecision === "ms2" ? "0.00" : "0.000"}
                            value={
                              laneAStatus === "TIME" && typeof laneAMs === "number"
                                ? (laneAMs / 1000).toFixed(timingPrecision === "ms2" ? 2 : 3)
                                : ""
                            }
                            onChange={(e) =>
                              row.laneA &&
                              onSaveRun({
                                athleteId: row.laneA,
                                runKey: aRunKey,
                                status: "TIME",
                                msInput: e.target.value,
                              })
                            }
                            disabled={!row.laneA || laneAStatus !== "TIME"}
                          />
                        </td>
                        <td className="p-2 md:p-3">
                          <div className="font-semibold text-foreground">{laneLabel(row.laneB)}</div>
                          <div className="text-xs text-muted-foreground">{bRunKey.toUpperCase()}</div>
                        </td>
                        <td className="p-2 md:p-3">
                          <select
                            className="w-full rounded-lg border border-border bg-input px-2 py-2 text-sm text-foreground"
                            value={laneBStatus || "TIME"}
                            onChange={(e) =>
                              row.laneB &&
                              onSaveRun({
                                athleteId: row.laneB,
                                runKey: bRunKey,
                                status: e.target.value as SpeedRunStatus,
                                msInput: "",
                              })
                            }
                            disabled={!row.laneB}
                          >
                            {STATUS_OPTIONS.map((s) => (
                              <option key={s} value={s}>
                                {s}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="p-2 md:p-3">
                          <input
                            className="w-full rounded-lg border border-border bg-input px-2 py-2 text-sm text-foreground"
                            type="text"
                            inputMode="decimal"
                            placeholder={timingPrecision === "ms2" ? "0.00" : "0.000"}
                            value={
                              laneBStatus === "TIME" && typeof laneBMs === "number"
                                ? (laneBMs / 1000).toFixed(timingPrecision === "ms2" ? 2 : 3)
                                : ""
                            }
                            onChange={(e) =>
                              row.laneB &&
                              onSaveRun({
                                athleteId: row.laneB,
                                runKey: bRunKey,
                                status: "TIME",
                                msInput: e.target.value,
                              })
                            }
                            disabled={!row.laneB || laneBStatus !== "TIME"}
                          />
                        </td>
                      </tr>
                    )
                    })
                  })()}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </Container>
    </main>
  )
}

function PasscodeCard({
  competitions,
  loading,
  selectedComp,
  setSelectedComp,
  passcodeInput,
  setPasscodeInput,
  signingIn,
  onSignIn,
  notice,
  clearNotice,
}: {
  competitions: SpeedCompetition[]
  loading: boolean
  selectedComp: string
  setSelectedComp: (value: string) => void
  passcodeInput: string
  setPasscodeInput: (value: string) => void
  signingIn: boolean
  onSignIn: () => Promise<void>
  notice: string
  clearNotice: () => void
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-3">
      <p className="text-sm font-semibold text-foreground">Judge Passcode</p>
      <p className="text-xs text-muted-foreground">Enter the judge code for this Speed competition.</p>
      <div className="grid gap-3 md:grid-cols-3">
        <select
          className="w-full rounded-xl border border-border bg-input px-4 py-3 text-sm text-foreground focus:border-ring focus:outline-none"
          value={selectedComp}
          onChange={(e) => setSelectedComp(e.target.value)}
          disabled={loading}
        >
          <option value="">Select competition</option>
          {competitions.map((comp) => (
            <option key={comp.id} value={comp.id}>
              {comp.name || comp.id}
            </option>
          ))}
        </select>
        <input
          type="password"
          className="w-full rounded-xl border border-border bg-input px-4 py-3 text-sm text-foreground focus:border-ring focus:outline-none"
          placeholder="Judge code"
          value={passcodeInput}
          onChange={(e) => setPasscodeInput(e.target.value)}
        />
        <Button onClick={onSignIn} disabled={signingIn || !selectedComp}>
          {signingIn ? "Signing in…" : "Sign in"}
        </Button>
      </div>
      {notice ? <p className="text-xs text-muted-foreground">{notice}</p> : null}
      <button type="button" className="text-xs text-muted-foreground underline" onClick={clearNotice}>
        Clear
      </button>
    </div>
  )
}

function FilterField({
  label,
  children,
  helpText,
}: {
  label: string
  children: React.ReactNode
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

const STATUS_OPTIONS: SpeedRunStatus[] = ["TIME", "FS", "DNS", "DNF"]
