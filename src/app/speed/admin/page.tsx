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
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
  updateDoc,
  type Firestore,
} from "firebase/firestore"
import { Button } from "@/components/ui/button"

type SpeedTimingPrecision = "ms2" | "ms3"
type SpeedFalseStartRule = "IFSC" | "TOLERANT"

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

  const [newCompName, setNewCompName] = useState("")
  const [newCompId, setNewCompId] = useState("")
  const [falseStartRule, setFalseStartRule] = useState<SpeedFalseStartRule>("IFSC")
  const [timingPrecision, setTimingPrecision] = useState<SpeedTimingPrecision>("ms3")
  const [newCatName, setNewCatName] = useState("")
  const [passcodeInput, setPasscodeInput] = useState("")
  const [message, setMessage] = useState("")

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
