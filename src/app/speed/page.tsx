'use client'

import { useEffect, useState } from "react"
import Image from "next/image"
import Link from "next/link"
import Container from "@/components/Container"
import { firestore } from "@/lib/firebase/client"
import { collection, getDocs, type Firestore } from "firebase/firestore"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"

interface SpeedCompetition {
  id: string
  name?: string
  status?: string
  createdAt?: unknown
  timingPrecision?: string
  falseStartRule?: string
  archived?: boolean
  isArchived?: boolean
  deleted?: boolean
}

export default function SpeedLandingPage() {
  if (!firestore) {
    return (
      <main className="py-12 text-foreground bg-background">
        <Container className="space-y-4">
          <h1 className="text-3xl font-semibold">Speed results unavailable</h1>
          <p className="text-muted-foreground">
            Live data requires Firebase configuration. Please verify NEXT_PUBLIC_FIREBASE_* variables for this environment.
          </p>
        </Container>
      </main>
    )
  }

  return <SpeedContent firestore={firestore} />
}

function SpeedContent({ firestore }: { firestore: Firestore }) {
  const [competitions, setCompetitions] = useState<SpeedCompetition[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function loadCompetitions() {
      setLoading(true)
      try {
        const snap = await getDocs(collection(firestore, "speedCompetitions"))
        if (cancelled) return
        const comps = snap.docs
          .map((docSnap) => {
            const data = (docSnap.data() || {}) as Partial<SpeedCompetition>
            return { id: docSnap.id, ...data }
          })
          .filter((comp) => {
            const status = (comp.status || "").toLowerCase()
            if (status === "archived" || status === "deleted") return false
            if (comp.archived === true || comp.deleted === true || comp.isArchived === true) return false
            return true
          })
        comps.sort((a, b) => timestampValue(b.createdAt) - timestampValue(a.createdAt))
        setCompetitions(comps)
      } catch (error) {
        console.error(error)
        setCompetitions([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    loadCompetitions()
    return () => {
      cancelled = true
    }
  }, [firestore])

  return (
    <main className="py-12 text-foreground bg-background">
      <Container className="space-y-8">
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
            <p className="text-sm uppercase tracking-wide text-primary">Speed Competitions</p>
            <p className="text-base text-muted-foreground">
              Browse live Speed events and open their leaderboards. Styling matches the Boulder experience for a consistent feel.
            </p>
          </div>
        </header>

        <section className="rounded-2xl border border-border bg-panel p-6">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <p className="text-sm text-muted-foreground">
                {loading
                  ? "Loading competitions…"
                  : competitions.length
                  ? `${competitions.length} competition${competitions.length > 1 ? "s" : ""}`
                  : "No competitions available"}
              </p>
            </div>
            <Button asChild variant="secondary" className="bg-card text-foreground hover:bg-card/80">
              <Link href="/speed/leaderboard">Open Leaderboard</Link>
            </Button>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {loading ? (
              Array.from({ length: 3 }).map((_, idx) => (
                <Card key={idx} className="border-border/60 bg-card/70">
                  <CardHeader>
                    <div className="h-5 w-32 animate-pulse rounded bg-panel" />
                    <div className="h-4 w-24 animate-pulse rounded bg-panel" />
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="h-4 w-40 animate-pulse rounded bg-panel" />
                    <div className="h-10 w-full animate-pulse rounded bg-panel" />
                  </CardContent>
                </Card>
              ))
            ) : competitions.length ? (
              competitions.map((comp) => (
                <Card key={comp.id} className="border-border/60 bg-card/70">
                  <CardHeader className="space-y-1">
                    <CardTitle className="text-lg">{comp.name || comp.id}</CardTitle>
                    <CardDescription className="text-xs uppercase tracking-wide text-primary">
                      {normalizeStatus(comp.status)}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <p className="text-sm text-muted-foreground">
                      Timing: {comp.timingPrecision === "ms2" ? "Hundredths (x.xx s)" : "Milliseconds (x.xxx s)"}
                    </p>
                    <div className="flex gap-2">
                      <Button asChild className="flex-1">
                        <Link href={`/speed/leaderboard?comp=${encodeURIComponent(comp.id)}`}>
                          View Leaderboard
                        </Link>
                      </Button>
                      <Button asChild variant="secondary" className="bg-card text-foreground hover:bg-card/80">
                        <Link href={`/speed/startlist?comp=${encodeURIComponent(comp.id)}`}>
                          Start List
                        </Link>
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))
            ) : (
              <div className="col-span-full text-center text-sm text-muted-foreground">
                No Speed competitions found yet.
              </div>
            )}
          </div>
        </section>
      </Container>
    </main>
  )
}

function normalizeStatus(status?: string) {
  const value = (status || "").toLowerCase()
  if (value === "live") return "Live"
  if (value === "completed") return "Completed"
  if (value === "archived" || value === "deleted") return "Hidden"
  return "Open"
}

function timestampValue(input: unknown) {
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
