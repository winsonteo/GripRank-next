'use client'

import { useEffect, useMemo, useState } from "react"
import Image from "next/image"
import Link from "next/link"
import AccessDenied from "@/components/AccessDenied"
import Container from "@/components/Container"
import { firestore } from "@/lib/firebase/client"
import { useUser } from "@clerk/nextjs"
import { useFirebaseAuth } from "@/hooks/useFirebaseAuth"
import { useUserRole, isStaffRole } from "@/hooks/useUserRole"
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
  type Firestore,
  type Unsubscribe,
} from "firebase/firestore"
import { Button } from "@/components/ui/button"

type SpeedTimingPrecision = "ms2" | "ms3"
type SpeedFalseStartRule = "IFSC" | "TOLERANT"
type SpeedRunStatus = "TIME" | "FS" | "DNS" | "DNF"
type SpeedFinalsRoundId = "R16" | "QF" | "SF" | "F" | string
const DEFAULT_FINALS_ID = "default"

interface SpeedCompetition {
  id: string
  name?: string
  status?: string
  createdAt?: unknown
  falseStartRule?: SpeedFalseStartRule
  timingPrecision?: SpeedTimingPrecision
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

interface SpeedRunResult {
  status?: SpeedRunStatus | null
  ms?: number | null
}

interface SpeedQualifierResult {
  runA?: SpeedRunResult
  runB?: SpeedRunResult
}

interface FinalsMatch {
  id?: string
  matchIndex?: number
  athleteA?: string | null
  athleteB?: string | null
  laneA?: SpeedRunResult | null
  laneB?: SpeedRunResult | null
  winner?: "A" | "B" | null
  winnerAthlete?: string | null
  allowWinnerRun?: boolean | null
}

type FinalsRounds = Record<SpeedFinalsRoundId, FinalsMatch[]>

export default function SpeedAdminPage() {
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
    return <AccessDenied feature="Speed Admin" message="Sign in with a staff/admin account to continue." />
  }

  if (!isStaffRole(role)) {
    return <AccessDenied feature="Speed Admin (staff/admin only)" />
  }

  if (!firestore || firebaseError) {
    return <AccessDenied feature="Speed Admin" message="Firebase not available. Please refresh and try again." />
  }

  return <AdminInterface firestore={firestore} />
}

function AdminInterface({ firestore }: { firestore: Firestore }) {
  const [comps, setComps] = useState<SpeedCompetition[]>([])
  const [compLoading, setCompLoading] = useState(false)
  const [selectedComp, setSelectedComp] = useState("")
  const [categories, setCategories] = useState<SpeedCategory[]>([])
  const [athletes, setAthletes] = useState<SpeedAthlete[]>([])

  const [newCompName, setNewCompName] = useState("")
  const [newCompId, setNewCompId] = useState("")
  const [falseStartRule, setFalseStartRule] = useState<SpeedFalseStartRule>("IFSC")
  const [timingPrecision, setTimingPrecision] = useState<SpeedTimingPrecision>("ms3")
  const [newCatName, setNewCatName] = useState("")
  const [passcodeInput, setPasscodeInput] = useState("")
  const [message, setMessage] = useState("")
  const [finalsMeta, setFinalsMeta] = useState<Record<string, unknown> | null>(null)
  const [finalsRounds, setFinalsRounds] = useState<FinalsRounds>({})
  const [finalsLoading, setFinalsLoading] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function loadComps() {
      setCompLoading(true)
      try {
        const snap = await getDocs(collection(firestore, "speedCompetitions"))
        if (cancelled) return
        const list = snap.docs
          .map((d) => ({ id: d.id, ...(d.data() || {}) } as SpeedCompetition))
          .sort((a, b) => timestampValue(b.createdAt) - timestampValue(a.createdAt))
        setComps(list)
        if (!selectedComp && list.length) setSelectedComp(list[0].id)
      } catch (error) {
        console.error(error)
        setComps([])
      } finally {
        if (!cancelled) setCompLoading(false)
      }
    }
    loadComps()
    return () => {
      cancelled = true
    }
  }, [firestore, selectedComp])

  useEffect(() => {
    if (!selectedComp) {
      setCategories([])
      return
    }
    async function loadCats() {
      try {
        const snap = await getDocs(collection(firestore, `speedCompetitions/${selectedComp}/categories`))
        const list: SpeedCategory[] = snap.docs
          .map((d) => ({ id: d.id, ...(d.data() as Partial<SpeedCategory>) }))
          .sort((a, b) => {
            const orderA = typeof a.order === "number" ? a.order : Number.POSITIVE_INFINITY
            const orderB = typeof b.order === "number" ? b.order : Number.POSITIVE_INFINITY
            if (orderA !== orderB) return orderA - orderB
            return (a.name || a.id || "").localeCompare(b.name || b.id || "")
          })
        setCategories(list)
      } catch (error) {
        console.error(error)
        setCategories([])
      }
    }
    loadCats()
  }, [selectedComp, firestore])

  // Load athletes for selected category (used in finals editing)
  useEffect(() => {
    if (!selectedComp || !selectedCategory) {
      setAthletes([])
      return
    }
    let cancelled = false
    async function loadAthletes() {
      try {
        const snap = await getDocs(collection(firestore, `speedCompetitions/${selectedComp}/categories/${selectedCategory}/athletes`))
        if (cancelled) return
        const list = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Partial<SpeedAthlete>) }))
        setAthletes(list)
      } catch (error) {
        console.error(error)
        if (!cancelled) setAthletes([])
      }
    }
    loadAthletes()
    return () => {
      cancelled = true
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedComp, selectedCategory, firestore])

  const selectedCompName = useMemo(() => {
    const match = comps.find((c) => c.id === selectedComp)
    return match?.name || selectedComp
  }, [comps, selectedComp])

  const createCompetition = async () => {
    if (!newCompName.trim()) {
      setMessage("Competition name is required")
      return
    }
    const compId = newCompId.trim() || slugify(newCompName)
    if (!compId) {
      setMessage("Competition ID could not be generated")
      return
    }
    const ref = doc(firestore, "speedCompetitions", compId)
    await setDoc(
      ref,
      {
        name: newCompName.trim(),
        falseStartRule,
        timingPrecision,
        status: "open",
        createdAt: serverTimestamp(),
      },
      { merge: true }
    )
    setMessage(`Created competition ${compId}`)
    setNewCompId("")
    setNewCompName("")
    const snap = await getDoc(ref)
    setComps((prev) => {
      const existing = prev.filter((c) => c.id !== compId)
      return [{ id: compId, ...(snap.data() || {}) } as SpeedCompetition, ...existing]
    })
    setSelectedComp(compId)
  }

  const addCategory = async () => {
    if (!selectedComp) {
      setMessage("Select a competition first")
      return
    }
    if (!newCatName.trim()) {
      setMessage("Category name is required")
      return
    }
    await addDoc(collection(firestore, `speedCompetitions/${selectedComp}/categories`), {
      name: newCatName.trim(),
      order: categories.length,
      createdAt: serverTimestamp(),
    })
    setNewCatName("")
    setMessage("Category added")
    const snap = await getDocs(collection(firestore, `speedCompetitions/${selectedComp}/categories`))
    const list = snap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) }))
    setCategories(list)
  }

  const savePasscode = async () => {
    if (!selectedComp) {
      setMessage("Select a competition first")
      return
    }
    if (passcodeInput.length < 4) {
      setMessage("Passcode must be at least 4 characters")
      return
    }
    const res = await fetch("/api/judge-passcode", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ compId: selectedComp, passcode: passcodeInput, discipline: "speed" }),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setMessage((data as { error?: string }).error || "Failed to save passcode")
      return
    }
    setMessage("Passcode updated")
    setPasscodeInput("")
  }

  const saveCompSettings = async () => {
    if (!selectedComp) {
      setMessage("Select a competition first")
      return
    }
    const ref = doc(firestore, "speedCompetitions", selectedComp)
    await updateDoc(ref, {
      falseStartRule,
      timingPrecision,
      updatedAt: serverTimestamp(),
    })
    setMessage("Settings saved")
  }

  const generateFinals = async () => {
    if (!selectedComp || !selectedCategory) {
      setMessage("Select a competition and category first")
      return
    }
    try {
      setFinalsLoading(true)
      // Load athletes and qualifier results
      const [athletesSnap, resultsSnap] = await Promise.all([
        getDocs(collection(firestore, `speedCompetitions/${selectedComp}/categories/${selectedCategory}/athletes`)),
        getDocs(collection(firestore, `speedCompetitions/${selectedComp}/categories/${selectedCategory}/qualifierResults`)),
      ])
      const athleteList: SpeedAthlete[] = athletesSnap.docs.map((d) => ({ id: d.id, ...(d.data() as Partial<SpeedAthlete>) }))
      const resultsMap = new Map<string, SpeedQualifierResult>()
      resultsSnap.docs.forEach((d) => resultsMap.set(d.id, d.data() as SpeedQualifierResult))

      const ranked = buildQualifierRanking(athleteList, resultsMap)
      if (ranked.length < 2) {
        setMessage("Not enough valid qualifier times to seed finals.")
        setFinalsLoading(false)
        return
      }

      const size = decideBracketSize(ranked.length)
      const seeds = ranked.slice(0, size).map((r, idx) => ({ seed: idx + 1, aid: r.id }))

      await clearExistingFinals(firestore, selectedComp, selectedCategory)

      const finalsRef = doc(firestore, `speedCompetitions/${selectedComp}/categories/${selectedCategory}/finals/${DEFAULT_FINALS_ID}`)
      const batch = writeBatch(firestore)
      batch.set(
        finalsRef,
        {
          size,
          seeds,
          seedRule: "best-time-of-two",
          seedVersion: 2,
          generator: "admin",
          createdAt: serverTimestamp(),
        },
        { merge: true }
      )

      const firstRoundId = roundIdForSize(size)
      const roundRef = doc(finalsRef, "rounds", firstRoundId)
      batch.set(roundRef, { createdAt: serverTimestamp(), seeded: true }, { merge: true })

      pairingsForSize(size).forEach((pair, idx) => {
        const athleteA = seeds.find((s) => s.seed === pair[0])?.aid || null
        const athleteB = seeds.find((s) => s.seed === pair[1])?.aid || null
        const matchRef = doc(roundRef, "matches", `m${idx + 1}`)
        batch.set(
          matchRef,
          {
            matchIndex: idx + 1,
            athleteA,
            athleteB,
            laneA: null,
            laneB: null,
            winner: null,
            winnerAthlete: null,
            allowWinnerRun: false,
            createdAt: serverTimestamp(),
          },
          { merge: true }
        )
      })

      await batch.commit()
      setMessage(`Finals generated (${size}) ✔`)
    } catch (error) {
      console.error(error)
      setMessage("Failed to generate finals")
    } finally {
      setFinalsLoading(false)
    }
  }

  const handleSaveMatch = async (roundId: SpeedFinalsRoundId, matchId: string, payload: { athleteA: string | null; athleteB: string | null; laneA: SpeedRunResult; laneB: SpeedRunResult; allowWinnerRun?: boolean }) => {
    if (!selectedComp || !selectedCategory) return
    try {
      const finalsRef = doc(firestore, `speedCompetitions/${selectedComp}/categories/${selectedCategory}/finals/${DEFAULT_FINALS_ID}`)
      const matchRef = doc(finalsRef, "rounds", roundId, "matches", matchId)
      const winner = decideWinner(payload.laneA, payload.laneB, falseStartRule)
      const winnerAthlete =
        winner === "A" ? payload.athleteA : winner === "B" ? payload.athleteB : null

      await setDoc(
        matchRef,
        {
          athleteA: payload.athleteA,
          athleteB: payload.athleteB,
          laneA: payload.laneA,
          laneB: payload.laneB,
          winner,
          winnerAthlete,
          allowWinnerRun: payload.allowWinnerRun ?? false,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      )
      await maybeAdvanceBracket({
        firestore,
        compId: selectedComp,
        categoryId: selectedCategory,
        roundId,
      })
      setMessage(`Saved match ${roundId}/${matchId}`)
    } catch (error) {
      console.error(error)
      setMessage("Failed to save match")
    }
  }

  // Finals listeners
  useEffect(() => {
    if (!selectedComp || !selectedCategory) {
      setFinalsMeta(null)
      setFinalsRounds({})
      return
    }
    setFinalsLoading(true)
    const finalsRef = doc(firestore, `speedCompetitions/${selectedComp}/categories/${selectedCategory}/finals/${DEFAULT_FINALS_ID}`)
    const roundsCol = collection(finalsRef, "rounds")
    const unsubscribers: Unsubscribe[] = []
    let matchUnsubs: Unsubscribe[] = []

    const unsubMeta = onSnapshot(finalsRef, (snap) => {
      setFinalsMeta(snap.exists() ? snap.data() : null)
      setFinalsLoading(false)
    }, () => setFinalsLoading(false))
    unsubscribers.push(unsubMeta)

    const unsubRounds = onSnapshot(roundsCol, (roundSnap) => {
      // clear previous match listeners
      matchUnsubs.forEach((fn) => fn())
      matchUnsubs = []
      const roundsData: FinalsRounds = {}
      roundSnap.docs.forEach((roundDoc) => {
        const rid = roundDoc.id
        const matchesRef = collection(roundDoc.ref, "matches")
        const unsubMatch = onSnapshot(matchesRef, (matchSnap) => {
          const matches: FinalsMatch[] = matchSnap.docs
            .map((m) => ({ id: m.id, ...(m.data() as FinalsMatch) }))
            .sort((a, b) => (a.matchIndex || 0) - (b.matchIndex || 0))
          roundsData[rid] = matches
          setFinalsRounds((prev) => ({ ...prev, ...roundsData }))
          setFinalsLoading(false)
        })
        matchUnsubs.push(unsubMatch)
      })
    }, () => setFinalsLoading(false))
    unsubscribers.push(unsubRounds)

    return () => {
      unsubscribers.forEach((fn) => fn())
      matchUnsubs.forEach((fn) => fn())
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedComp, selectedCategory, firestore])

  return (
    <main className="py-10 text-foreground bg-background">
      <Container className="space-y-6">
        <header className="space-y-2">
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
          <h1 className="text-2xl font-semibold">Speed Admin</h1>
          <p className="text-sm text-muted-foreground">
            Create Speed competitions, add categories, and manage judge passcodes.
          </p>
        </header>

        <section className="rounded-2xl border border-border bg-panel p-6 space-y-4">
          <h2 className="text-lg font-semibold">Create competition</h2>
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <label className="text-sm text-muted-foreground">Name</label>
              <input
                className="mt-1 w-full rounded-xl border border-border bg-input px-4 py-3 text-sm text-foreground focus:border-ring focus:outline-none"
                placeholder="Youth Speed Open"
                value={newCompName}
                onChange={(e) => setNewCompName(e.target.value)}
              />
            </div>
            <div>
              <label className="text-sm text-muted-foreground">Competition ID (optional)</label>
              <input
                className="mt-1 w-full rounded-xl border border-border bg-input px-4 py-3 text-sm text-foreground focus:border-ring focus:outline-none"
                placeholder="youth-speed-open"
                value={newCompId}
                onChange={(e) => setNewCompId(e.target.value)}
              />
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <label className="text-sm text-muted-foreground">False start rule</label>
              <select
                className="mt-1 w-full rounded-xl border border-border bg-input px-4 py-3 text-sm text-foreground focus:border-ring focus:outline-none"
                value={falseStartRule}
                onChange={(e) => setFalseStartRule(e.target.value as SpeedFalseStartRule)}
              >
                <option value="IFSC">IFSC (Run A FS → Run B DNS)</option>
                <option value="TOLERANT">Tolerant</option>
              </select>
            </div>
            <div>
              <label className="text-sm text-muted-foreground">Timing precision</label>
              <select
                className="mt-1 w-full rounded-xl border border-border bg-input px-4 py-3 text-sm text-foreground focus:border-ring focus:outline-none"
                value={timingPrecision}
                onChange={(e) => setTimingPrecision(e.target.value as SpeedTimingPrecision)}
              >
                <option value="ms3">Milliseconds (x.xxx)</option>
                <option value="ms2">Hundredths (x.xx)</option>
              </select>
            </div>
          </div>
          <Button onClick={createCompetition} disabled={compLoading}>
            Create competition
          </Button>
        </section>

        <section className="rounded-2xl border border-border bg-panel p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">Manage competition</h2>
            <div className="text-sm text-muted-foreground">
              {comps.length ? `${comps.length} competition${comps.length > 1 ? "s" : ""}` : "No competitions yet"}
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <div>
              <label className="text-sm text-muted-foreground">Competition</label>
              <select
                className="mt-1 w-full rounded-xl border border-border bg-input px-4 py-3 text-sm text-foreground focus:border-ring focus:outline-none"
                value={selectedComp}
                onChange={(e) => setSelectedComp(e.target.value)}
                disabled={!comps.length}
              >
                <option value="">Select</option>
                {comps.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name || c.id}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-sm text-muted-foreground">False start rule</label>
              <select
                className="mt-1 w-full rounded-xl border border-border bg-input px-4 py-3 text-sm text-foreground focus:border-ring focus:outline-none"
                value={falseStartRule}
                onChange={(e) => setFalseStartRule(e.target.value as SpeedFalseStartRule)}
                disabled={!selectedComp}
              >
                <option value="IFSC">IFSC</option>
                <option value="TOLERANT">Tolerant</option>
              </select>
            </div>
            <div>
              <label className="text-sm text-muted-foreground">Timing precision</label>
              <select
                className="mt-1 w-full rounded-xl border border-border bg-input px-4 py-3 text-sm text-foreground focus:border-ring focus:outline-none"
                value={timingPrecision}
                onChange={(e) => setTimingPrecision(e.target.value as SpeedTimingPrecision)}
                disabled={!selectedComp}
              >
                <option value="ms3">Milliseconds (x.xxx)</option>
                <option value="ms2">Hundredths (x.xx)</option>
              </select>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={saveCompSettings} variant="secondary" className="bg-card text-foreground hover:bg-card/80" disabled={!selectedComp}>
              Save settings
            </Button>
            <Button asChild variant="secondary" className="bg-card text-foreground hover:bg-card/80" disabled={!selectedComp}>
              <Link href={`/speed/leaderboard?comp=${encodeURIComponent(selectedComp || "")}`}>
                Open leaderboard
              </Link>
            </Button>
            <Button asChild variant="secondary" className="bg-card text-foreground hover:bg-card/80" disabled={!selectedComp}>
              <Link href={`/speed/judge?comp=${encodeURIComponent(selectedComp || "")}`}>
                Open judge
              </Link>
            </Button>
            <Button asChild variant="secondary" className="bg-card text-foreground hover:bg-card/80" disabled={!selectedComp}>
              <Link href={`/speed/startlist?comp=${encodeURIComponent(selectedComp || "")}`}>
                Start list
              </Link>
            </Button>
          </div>

          <div className="grid gap-3 md:grid-cols-[1.5fr_1fr]">
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-foreground">Categories</h3>
              {categories.length ? (
                <ul className="space-y-2">
                  {categories.map((cat) => (
                    <li key={cat.id} className="flex items-center justify-between rounded-lg border border-border bg-card/40 px-3 py-2">
                      <span>{cat.name || cat.id}</span>
                      <span className="text-xs text-muted-foreground">Order {cat.order ?? "–"}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">No categories yet.</p>
              )}
            </div>
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-foreground">Add category</h3>
              <input
                className="w-full rounded-xl border border-border bg-input px-4 py-3 text-sm text-foreground focus:border-ring focus:outline-none"
                placeholder="U10 Girls"
                value={newCatName}
                onChange={(e) => setNewCatName(e.target.value)}
                disabled={!selectedComp}
              />
              <Button onClick={addCategory} disabled={!selectedComp || !newCatName.trim()}>
                Add category
              </Button>
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-border bg-panel p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">Finals</h2>
              <p className="text-sm text-muted-foreground">
                Generate finals from qualifier standings and edit matches.
              </p>
            </div>
            <div className="flex gap-2 flex-wrap">
              <Button onClick={generateFinals} disabled={!selectedComp || !selectedCategory || finalsLoading}>
                Generate finals from qualifiers
              </Button>
              <Button
                variant="secondary"
                className="bg-card text-foreground hover:bg-card/80"
                onClick={() => setMessage("Finals reloaded")}
                disabled={finalsLoading}
              >
                Reload finals
              </Button>
            </div>
          </div>
          {finalsLoading ? (
            <p className="text-sm text-muted-foreground">Loading finals…</p>
          ) : finalsMeta ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Size: {String((finalsMeta as { size?: number }).size || "?")} • Seed rule:{" "}
                {(finalsMeta as { seedRule?: string }).seedRule || "best-time-of-two"}
              </p>
              {renderFinalsRounds({
                finalsMeta,
                finalsRounds,
                athletes,
                timingPrecision,
                falseStartRule,
                onSaveMatch: handleSaveMatch,
              })}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Finals not generated yet.</p>
          )}
        </section>

        <section className="rounded-2xl border border-border bg-panel p-6 space-y-3">
          <h2 className="text-lg font-semibold">Judge passcode</h2>
          <p className="text-sm text-muted-foreground">
            Set or rotate the judge passcode for this competition. Passcodes are stored as hashes and issued via custom tokens.
          </p>
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <label className="text-sm text-muted-foreground">Competition</label>
              <input
                className="mt-1 w-full rounded-xl border border-border bg-input px-4 py-3 text-sm text-foreground focus:border-ring focus:outline-none"
                value={selectedCompName}
                readOnly
                placeholder="Select a competition above"
              />
            </div>
            <div>
              <label className="text-sm text-muted-foreground">New passcode</label>
              <input
                className="mt-1 w-full rounded-xl border border-border bg-input px-4 py-3 text-sm text-foreground focus:border-ring focus:outline-none"
                placeholder="****"
                value={passcodeInput}
                onChange={(e) => setPasscodeInput(e.target.value)}
                disabled={!selectedComp}
              />
            </div>
          </div>
          <Button onClick={savePasscode} disabled={!selectedComp || passcodeInput.length < 4}>
            Save passcode
          </Button>
        </section>

        {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
      </Container>
    </main>
  )
}

function slugify(input: string) {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64)
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

function buildQualifierRanking(
  athletes: SpeedAthlete[],
  results: Map<string, SpeedQualifierResult>
) {
  const rows = athletes
    .map((athlete) => {
      const res = results.get(athlete.id)
      const times: number[] = []
      if (res?.runA?.status === "TIME" && typeof res.runA.ms === "number") times.push(res.runA.ms)
      if (res?.runB?.status === "TIME" && typeof res.runB.ms === "number") times.push(res.runB.ms)
      times.sort((a, b) => a - b)
      const bestMs = times[0] ?? null
      const secondMs = times[1] ?? null
      return { id: athlete.id, name: athlete.name || athlete.id, bestMs, secondMs }
    })
    .filter((row) => row.bestMs != null)
    .sort((a, b) => (a.bestMs! - b.bestMs!) || ((a.secondMs ?? Infinity) - (b.secondMs ?? Infinity)) || a.name.localeCompare(b.name))
  return rows
}

function decideBracketSize(validCount: number) {
  if (validCount >= 16) return 16
  if (validCount >= 8) return 8
  if (validCount >= 4) return 4
  return 2
}

function roundIdForSize(size: number) {
  if (size === 16) return "R16"
  if (size === 8) return "QF"
  if (size === 4) return "SF"
  return "F"
}

function pairingsForSize(size: number) {
  if (size === 16) return [[1, 16], [8, 9], [4, 13], [5, 12], [2, 15], [7, 10], [3, 14], [6, 11]]
  if (size === 8) return [[1, 8], [4, 5], [2, 7], [3, 6]]
  if (size === 4) return [[1, 4], [2, 3]]
  if (size === 2) return [[1, 2]]
  return []
}

function decideWinner(
  laneA: SpeedRunResult | null | undefined,
  laneB: SpeedRunResult | null | undefined,
  falseStartRule: SpeedFalseStartRule
): "A" | "B" | null {
  const isTimeA = laneA?.status === "TIME" && typeof laneA.ms === "number"
  const isTimeB = laneB?.status === "TIME" && typeof laneB.ms === "number"

  if (falseStartRule === "IFSC") {
    if (laneA?.status === "FS" && laneB?.status !== "FS") return "B"
    if (laneB?.status === "FS" && laneA?.status !== "FS") return "A"
  }

  if (isTimeA && !isTimeB) return "A"
  if (isTimeB && !isTimeA) return "B"
  if (isTimeA && isTimeB) return (laneA!.ms! <= laneB!.ms! ? "A" : "B")

  return null
}

async function clearExistingFinals(firestore: Firestore, compId: string, categoryId: string) {
  const finalsRef = doc(firestore, `speedCompetitions/${compId}/categories/${categoryId}/finals/${DEFAULT_FINALS_ID}`)
  const roundsSnap = await getDocs(collection(finalsRef, "rounds"))
  for (const roundDoc of roundsSnap.docs) {
    const matchesSnap = await getDocs(collection(roundDoc.ref, "matches"))
    for (const match of matchesSnap.docs) {
      await deleteDoc(match.ref)
    }
    await deleteDoc(roundDoc.ref)
  }
  await deleteDoc(finalsRef)
}

async function maybeAdvanceBracket({
  firestore,
  compId,
  categoryId,
  roundId,
}: {
  firestore: Firestore
  compId: string
  categoryId: string
  roundId: SpeedFinalsRoundId
}) {
  const nextMap: Record<string, SpeedFinalsRoundId | undefined> = { R16: "QF", QF: "SF", SF: "F" }
  const next = nextMap[roundId]
  if (!next) return

  const finalsRef = doc(firestore, `speedCompetitions/${compId}/categories/${categoryId}/finals/${DEFAULT_FINALS_ID}`)
  const curMatchesSnap = await getDocs(collection(finalsRef, "rounds", roundId, "matches"))
  const matches = curMatchesSnap.docs
    .map((m) => ({ id: m.id, ...(m.data() as FinalsMatch) }))
    .sort((a, b) => (a.matchIndex || 0) - (b.matchIndex || 0))

  const winAid = (m: FinalsMatch) => (m.winner === "A" ? m.athleteA : m.winner === "B" ? m.athleteB : null)
  const loseAid = (m: FinalsMatch) => (m.winner === "A" ? m.athleteB : m.winner === "B" ? m.athleteA : null)

  if (!matches.length || matches.some((m) => m.winner !== "A" && m.winner !== "B")) return

  const batch = writeBatch(firestore)
  const nextRoundRef = doc(finalsRef, "rounds", next)
  batch.set(nextRoundRef, { createdAt: serverTimestamp() }, { merge: true })

  if (roundId === "SF" && next === "F") {
    const winners = [winAid(matches[0]), winAid(matches[1])]
    const losers = [loseAid(matches[0]), loseAid(matches[1])]

    const smallRef = doc(nextRoundRef, "matches", "m1")
    batch.set(
      smallRef,
      {
        matchIndex: 1,
        athleteA: losers[0] || null,
        athleteB: losers[1] || null,
        laneA: null,
        laneB: null,
        winner: null,
        winnerAthlete: null,
        allowWinnerRun: false,
        createdAt: serverTimestamp(),
      },
      { merge: true }
    )

    const bigRef = doc(nextRoundRef, "matches", "m2")
    batch.set(
      bigRef,
      {
        matchIndex: 2,
        athleteA: winners[0] || null,
        athleteB: winners[1] || null,
        laneA: null,
        laneB: null,
        winner: null,
        winnerAthlete: null,
        allowWinnerRun: false,
        createdAt: serverTimestamp(),
      },
      { merge: true }
    )
  } else {
    for (let i = 0, mi = 1; i < matches.length; i += 2, mi += 1) {
      const a = matches[i]
      const b = matches[i + 1]
      if (!a || !b) continue
      const mRef = doc(nextRoundRef, "matches", `m${mi}`)
      batch.set(
        mRef,
        {
          matchIndex: mi,
          athleteA: winAid(a) || null,
          athleteB: winAid(b) || null,
          laneA: null,
          laneB: null,
          winner: null,
          winnerAthlete: null,
          allowWinnerRun: false,
          createdAt: serverTimestamp(),
        },
        { merge: true }
      )
    }
  }

  await batch.commit()
}

function renderFinalsRounds({
  finalsMeta,
  finalsRounds,
  athletes,
  timingPrecision,
  falseStartRule,
  onSaveMatch,
}: {
  finalsMeta: Record<string, unknown> | null
  finalsRounds: FinalsRounds
  athletes: SpeedAthlete[]
  timingPrecision: SpeedTimingPrecision
  falseStartRule: SpeedFalseStartRule
  onSaveMatch: (roundId: SpeedFinalsRoundId, matchId: string, payload: { athleteA: string | null; athleteB: string | null; laneA: SpeedRunResult; laneB: SpeedRunResult; allowWinnerRun?: boolean }) => void
}) {
  const size = (finalsMeta as { size?: number } | null)?.size || 0
  const order = size ? (size === 16 ? ["R16", "QF", "SF", "F"] : size === 8 ? ["QF", "SF", "F"] : size === 4 ? ["SF", "F"] : ["F"]) : Object.keys(finalsRounds)
  return (
    <div className="space-y-4">
      {order.map((rid) => (
        <div key={rid} className="rounded-xl border border-border bg-card/40 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground">Round {rid}</h3>
            <span className="text-xs text-muted-foreground">
              {finalsRounds[rid]?.length ? `${finalsRounds[rid].length} match${finalsRounds[rid].length > 1 ? "es" : ""}` : "No matches yet"}
            </span>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {(finalsRounds[rid] || []).map((match) => (
              <FinalsMatchCard
                key={match.id || match.matchIndex}
                match={match}
                roundId={rid}
                athletes={athletes}
                timingPrecision={timingPrecision}
                falseStartRule={falseStartRule}
                onSave={onSaveMatch}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function FinalsMatchCard({
  match,
  roundId,
  athletes,
  timingPrecision,
  falseStartRule,
  onSave,
}: {
  match: FinalsMatch
  roundId: SpeedFinalsRoundId
  athletes: SpeedAthlete[]
  timingPrecision: SpeedTimingPrecision
  falseStartRule: SpeedFalseStartRule
  onSave: (roundId: SpeedFinalsRoundId, matchId: string, payload: { athleteA: string | null; athleteB: string | null; laneA: SpeedRunResult; laneB: SpeedRunResult; allowWinnerRun?: boolean }) => void
}) {
  const [athleteA, setAthleteA] = useState(match.athleteA || "")
  const [athleteB, setAthleteB] = useState(match.athleteB || "")
  const [statusA, setStatusA] = useState<SpeedRunStatus>(match.laneA?.status || "TIME")
  const [statusB, setStatusB] = useState<SpeedRunStatus>(match.laneB?.status || "TIME")
  const [timeA, setTimeA] = useState(
    match.laneA?.status === "TIME" && typeof match.laneA.ms === "number"
      ? (match.laneA.ms / 1000).toFixed(timingPrecision === "ms2" ? 2 : 3)
      : ""
  )
  const [timeB, setTimeB] = useState(
    match.laneB?.status === "TIME" && typeof match.laneB.ms === "number"
      ? (match.laneB.ms / 1000).toFixed(timingPrecision === "ms2" ? 2 : 3)
      : ""
  )
  const [allowWinnerRun, setAllowWinnerRun] = useState(Boolean(match.allowWinnerRun))

  useEffect(() => {
    setAthleteA(match.athleteA || "")
    setAthleteB(match.athleteB || "")
    setStatusA(match.laneA?.status || "TIME")
    setStatusB(match.laneB?.status || "TIME")
    setTimeA(
      match.laneA?.status === "TIME" && typeof match.laneA.ms === "number"
        ? (match.laneA.ms / 1000).toFixed(timingPrecision === "ms2" ? 2 : 3)
        : ""
    )
    setTimeB(
      match.laneB?.status === "TIME" && typeof match.laneB.ms === "number"
        ? (match.laneB.ms / 1000).toFixed(timingPrecision === "ms2" ? 2 : 3)
        : ""
    )
    setAllowWinnerRun(Boolean(match.allowWinnerRun))
  }, [match, timingPrecision])

  const parseMs = (value: string) => {
    const trimmed = String(value || "").trim().replace(",", ".")
    if (!trimmed) return null
    const num = Number(trimmed)
    if (Number.isNaN(num)) return null
    return Math.round(num * 1000)
  }

  const handleSave = () => {
    const laneA: SpeedRunResult = { status: statusA, ms: statusA === "TIME" ? parseMs(timeA) : null }
    const laneB: SpeedRunResult = { status: statusB, ms: statusB === "TIME" ? parseMs(timeB) : null }
    // Auto-clear times when status is not TIME
    if (statusA !== "TIME") laneA.ms = null
    if (statusB !== "TIME") laneB.ms = null
    onSave(roundId, match.id || `m${match.matchIndex}`, {
      athleteA: athleteA || null,
      athleteB: athleteB || null,
      laneA,
      laneB,
      allowWinnerRun,
    })
  }

  const currentWinner = decideWinner(
    statusA === "TIME" ? { status: statusA, ms: parseMs(timeA) } : { status: statusA, ms: null },
    statusB === "TIME" ? { status: statusB, ms: parseMs(timeB) } : { status: statusB, ms: null },
    falseStartRule
  )

  return (
    <div className="rounded-lg border border-border bg-panel p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="font-semibold text-foreground">Match {match.matchIndex}</div>
        <div className="text-xs text-muted-foreground">Winner: {currentWinner || match.winner || "—"}</div>
      </div>
      <div className="space-y-2">
        <label className="text-xs text-muted-foreground">Lane A</label>
        <select
          className="w-full rounded-lg border border-border bg-input px-3 py-2 text-sm text-foreground"
          value={athleteA}
          onChange={(e) => setAthleteA(e.target.value)}
        >
          <option value="">—</option>
          {athletes.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name || a.id}
            </option>
          ))}
        </select>
        <div className="grid grid-cols-[1fr_auto] gap-2">
          <select
            className="w-full rounded-lg border border-border bg-input px-3 py-2 text-sm text-foreground"
            value={statusA}
            onChange={(e) => setStatusA(e.target.value as SpeedRunStatus)}
          >
            <option value="TIME">TIME</option>
            <option value="FS">FS</option>
            <option value="DNS">DNS</option>
            <option value="DNF">DNF</option>
          </select>
          <input
            className="w-full rounded-lg border border-border bg-input px-3 py-2 text-sm text-foreground"
            type="text"
            inputMode="decimal"
            placeholder={timingPrecision === "ms2" ? "0.00" : "0.000"}
            value={timeA}
            onChange={(e) => setTimeA(e.target.value)}
            disabled={statusA !== "TIME"}
          />
        </div>
      </div>
      <div className="space-y-2">
        <label className="text-xs text-muted-foreground">Lane B</label>
        <select
          className="w-full rounded-lg border border-border bg-input px-3 py-2 text-sm text-foreground"
          value={athleteB}
          onChange={(e) => setAthleteB(e.target.value)}
        >
          <option value="">—</option>
          {athletes.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name || a.id}
            </option>
          ))}
        </select>
        <div className="grid grid-cols-[1fr_auto] gap-2">
          <select
            className="w-full rounded-lg border border-border bg-input px-3 py-2 text-sm text-foreground"
            value={statusB}
            onChange={(e) => setStatusB(e.target.value as SpeedRunStatus)}
          >
            <option value="TIME">TIME</option>
            <option value="FS">FS</option>
            <option value="DNS">DNS</option>
            <option value="DNF">DNF</option>
          </select>
          <input
            className="w-full rounded-lg border border-border bg-input px-3 py-2 text-sm text-foreground"
            type="text"
            inputMode="decimal"
            placeholder={timingPrecision === "ms2" ? "0.00" : "0.000"}
            value={timeB}
            onChange={(e) => setTimeB(e.target.value)}
            disabled={statusB !== "TIME"}
          />
        </div>
      </div>
      {roundId === "F" && match.matchIndex === 2 ? (
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={allowWinnerRun}
            onChange={(e) => setAllowWinnerRun(e.target.checked)}
          />
          Allow winner to run after opponent FS/DNS (Big Final)
        </label>
      ) : null}
      <Button onClick={handleSave} className="w-full">
        Save match
      </Button>
    </div>
  )
}
