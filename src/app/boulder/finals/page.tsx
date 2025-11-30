'use client'

import { useState, useEffect } from "react"
import Link from "next/link"
import Image from "next/image"
import Container from "@/components/Container"
import AccessDenied from "@/components/AccessDenied"
import { UserButton, useUser } from "@clerk/nextjs"
import { useFirebaseAuth } from "@/hooks/useFirebaseAuth"
import { useUserRole, isStaffRole } from "@/hooks/useUserRole"
import { firestore } from "@/lib/firebase/client"
import {
  collection,
  getDocs,
  query,
  where,
  orderBy as firestoreOrderBy,
  doc,
  setDoc,
  serverTimestamp
} from "firebase/firestore"
import { buildLeaderboardRows, type AttemptDoc, type AthleteInfo, type DetailMeta, type LeaderboardRow } from "@/lib/boulder/scoring"

interface Competition {
  id: string
  name?: string
  status?: string
}

interface Category {
  id: string
  name?: string
  order?: number
}

export default function BoulderFinalsPage() {
  const { isLoaded, isSignedIn } = useUser()
  const { isFirebaseAuthenticated, error: firebaseError } = useFirebaseAuth()
  const { role, loading: roleLoading } = useUserRole()

  const waitingForFirebaseAuth = isSignedIn && !isFirebaseAuthenticated && !firebaseError
  if (!isLoaded || waitingForFirebaseAuth || roleLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-lg text-muted-foreground">Loading…</div>
      </div>
    )
  }

  if (!isSignedIn) {
    return <AccessDenied feature="Generate Finals" message="Sign in with a staff/admin account to continue." />
  }

  if (!isStaffRole(role)) {
    return <AccessDenied feature="Generate Finals (staff/admin only)" />
  }

  if (firebaseError) {
    return <AccessDenied feature="Generate Finals" message="Firebase not available. Please refresh and try again." />
  }

  return <FinalsInterface />
}

function FinalsInterface() {
  const { user } = useUser()

  // State
  const [competitions, setCompetitions] = useState<Competition[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [selectedComp, setSelectedComp] = useState("")
  const [selectedCategory, setSelectedCategory] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  // Dialog states
  const [showCountDialog, setShowCountDialog] = useState(false)
  const [finalistCount, setFinalistCount] = useState(8)
  const [showConfirmDialog, setShowConfirmDialog] = useState(false)
  const [actualFinalists, setActualFinalists] = useState<LeaderboardRow[]>([])
  const [actualCount, setActualCount] = useState(0)

  // Load competitions
  useEffect(() => {
    if (!firestore) return

    const loadCompetitions = async () => {
      if (!firestore) return
      try {
        const snapshot = await getDocs(collection(firestore, "boulderComps"))
        const comps = snapshot.docs
          .map((doc) => ({
            id: doc.id,
            name: doc.data().name as string | undefined,
            status: doc.data().status as string | undefined,
          }))
          .filter(
            (comp: Competition) =>
              !["archived", "deleted"].includes((comp.status || "").toLowerCase())
          )

        setCompetitions(comps)
        if (comps.length > 0 && !selectedComp) {
          setSelectedComp(comps[0].id)
        }
      } catch (err) {
        console.error("Error loading competitions:", err)
        setError("Failed to load competitions")
      }
    }

    loadCompetitions()
  }, [selectedComp])

  // Load categories when competition changes
  useEffect(() => {
    if (!firestore || !selectedComp) {
      setCategories([])
      return
    }

    const loadCategories = async () => {
      if (!firestore) return
      try {
        const catsQuery = query(
          collection(firestore, `boulderComps/${selectedComp}/categories`),
          firestoreOrderBy("order", "asc")
        )
        const snapshot = await getDocs(catsQuery)
        const cats = snapshot.docs.map((doc) => ({
          id: doc.id,
          name: doc.data().name as string | undefined,
          order: doc.data().order as number | undefined,
        }))

        setCategories(cats)
        if (cats.length > 0 && !selectedCategory) {
          setSelectedCategory(cats[0].id)
        }
      } catch (err) {
        console.error("Error loading categories:", err)
      }
    }

    loadCategories()
  }, [selectedComp, selectedCategory])

  const handleGenerateClick = () => {
    if (!selectedComp || !selectedCategory) {
      setError("Please select a competition and category")
      return
    }
    setError("")
    setShowCountDialog(true)
  }

  const handleCountSubmit = async () => {
    setShowCountDialog(false)
    setLoading(true)
    setError("")

    try {
      if (!firestore) {
        throw new Error("Firebase not initialized")
      }

      // Load qualification data
      const routesSnapshot = await getDocs(
        query(
          collection(firestore, `boulderComps/${selectedComp}/categories/${selectedCategory}/routes`),
          firestoreOrderBy("order", "asc")
        )
      )

      const routes = routesSnapshot.docs.map((doc) => ({
        id: doc.id,
        label: doc.data().label as string | undefined,
      }))

      if (routes.length === 0) {
        throw new Error("No qualification routes found for this category")
      }

      // Load attempts
      const attemptsSnapshot = await getDocs(
        query(
          collection(firestore, `boulderComps/${selectedComp}/attempts`),
          where("categoryId", "==", selectedCategory),
          where("round", "==", "qualification")
        )
      )

      const attempts: AttemptDoc[] = attemptsSnapshot.docs.map((doc) => ({
        ...doc.data(),
        createdAt: doc.data().clientAtMs || 0,
      })) as AttemptDoc[]

      // Load athletes
      const athletesSnapshot = await getDocs(
        query(
          collection(firestore, `boulderComps/${selectedComp}/athletes`),
          where("categoryId", "==", selectedCategory)
        )
      )

      const athletesById = new Map<string, AthleteInfo>()
      athletesSnapshot.docs.forEach((doc) => {
        athletesById.set(doc.id, {
          bib: doc.data().bib,
          name: doc.data().name,
          team: doc.data().team,
        })
      })

      // Build details meta
      const detailsMeta = new Map<string, DetailMeta>()
      routes.forEach((route) => {
        detailsMeta.set(`route:${route.id}`, {
          type: "route",
          routeId: route.id,
          label: route.label || route.id,
        })
      })

      // Build leaderboard
      const rows = buildLeaderboardRows({
        attemptDocs: attempts,
        athletesById,
        detailsMeta,
      })

      // Pick finalists with tie handling
      const finalists = pickFinalists(rows, finalistCount)

      setActualFinalists(finalists)
      setActualCount(finalists.length)
      setShowConfirmDialog(true)
    } catch (err) {
      console.error("Error generating finals:", err)
      setError(err instanceof Error ? err.message : "Failed to generate finals")
    } finally {
      setLoading(false)
    }
  }

  const handleConfirmGenerate = async () => {
    setShowConfirmDialog(false)
    setLoading(true)
    setError("")

    try {
      if (!firestore) {
        throw new Error("Firebase not initialized")
      }

      // Build startlist entries with qualifier ranks
      const entries = actualFinalists.map((finalist, index) => {
        // Calculate rank with tie handling
        let rank = 1
        for (let i = 0; i < index; i++) {
          const prev = actualFinalists[i]
          if (
            prev.points !== finalist.points ||
            prev.tops !== finalist.tops ||
            prev.zones !== finalist.zones
          ) {
            rank = i + 2
          }
        }

        return {
          athleteId: finalist.athleteId,
          qualifierRank: rank,
        }
      })

      // Write to Firestore
      const startlistRef = doc(
        firestore,
        `boulderComps/${selectedComp}/categories/${selectedCategory}/finals`,
        "startlist"
      )

      await setDoc(startlistRef, {
        entries,
        generatedAt: serverTimestamp(),
        requestedCount: finalistCount,
        actualCount: actualFinalists.length,
      })

      // Reset dialog states
      setShowCountDialog(false)
      setShowConfirmDialog(false)
      setActualFinalists([])
      setActualCount(0)
      setFinalistCount(8)

      alert(`Successfully generated finals with ${actualFinalists.length} finalists!`)
    } catch (err) {
      console.error("Error saving finals:", err)
      setError(err instanceof Error ? err.message : "Failed to save finals")
    } finally {
      setLoading(false)
    }
  }

  const handleCancelCount = () => {
    setShowCountDialog(false)
    setFinalistCount(8)
  }

  const handleCancelConfirm = () => {
    setShowConfirmDialog(false)
    setActualFinalists([])
    setActualCount(0)
  }

  return (
    <main className="py-6 min-h-screen bg-[#0b1220] text-gray-200">
      <Container>
        <div className="max-w-[800px] mx-auto space-y-6">
          {/* Header */}
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
              <span className="text-gray-400">Generate Finals</span>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-sm text-gray-400">
              <span className="truncate max-w-[240px]">
                {user?.emailAddresses[0]?.emailAddress || "Signed in"}
              </span>
              <UserButton afterSignOutUrl="/" />
            </div>
          </header>

          {/* Generate Finals Form */}
          <section className="bg-[#0e1730] border border-[#19bcd6] rounded-xl p-6">
            <div className="mb-6">
              <h1 className="text-2xl font-bold text-gray-100">Generate Finals</h1>
              <p className="text-sm text-gray-400 mt-1">
                Select qualifiers for finals with automatic tie handling
              </p>
            </div>

            <div className="space-y-4">
              {/* Competition */}
              <label className="block">
                <span className="text-sm font-semibold text-gray-200 mb-2 block">
                  Competition
                </span>
                <select
                  value={selectedComp}
                  onChange={(e) => setSelectedComp(e.target.value)}
                  className="w-full px-3 py-2.5 bg-[#101a34] text-gray-200 border border-[#19bcd6] rounded-lg focus:outline-none focus:border-[#27a9e1]"
                >
                  {competitions.length === 0 ? (
                    <option value="">No competitions found</option>
                  ) : (
                    competitions.map((comp) => (
                      <option key={comp.id} value={comp.id}>
                        {comp.name || comp.id}
                      </option>
                    ))
                  )}
                </select>
              </label>

              {/* Category */}
              <label className="block">
                <span className="text-sm font-semibold text-gray-200 mb-2 block">
                  Category
                </span>
                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="w-full px-3 py-2.5 bg-[#101a34] text-gray-200 border border-[#19bcd6] rounded-lg focus:outline-none focus:border-[#27a9e1]"
                  disabled={!selectedComp}
                >
                  {categories.length === 0 ? (
                    <option value="">No categories found</option>
                  ) : (
                    categories.map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.name || cat.id}
                      </option>
                    ))
                  )}
                </select>
              </label>

              {/* Error Message */}
              {error && (
                <div className="rounded-lg bg-red-500/10 border border-red-500/30 px-4 py-3 text-sm text-red-300">
                  {error}
                </div>
              )}

              {/* Generate Button */}
              <button
                onClick={handleGenerateClick}
                disabled={loading || !selectedComp || !selectedCategory}
                className="w-full px-6 py-3 bg-[#27a9e1] text-[#031726] rounded-lg font-semibold hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? "Generating..." : "Generate Finals"}
              </button>
            </div>
          </section>

          {/* Back Link */}
          <div className="text-center">
            <Link
              href="/boulder/admin"
              className="text-sm text-[#27a9e1] hover:text-[#19bcd6] hover:underline"
            >
              ← Back to Admin Dashboard
            </Link>
          </div>
        </div>
      </Container>

      {/* Finalist Count Dialog */}
      {showCountDialog && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-[#0e1730] border border-[#19bcd6] rounded-xl p-6 max-w-md w-full">
            <h2 className="text-xl font-bold text-gray-100 mb-4">
              Number of Finalists
            </h2>
            <p className="text-sm text-gray-400 mb-4">
              Enter the desired number of finalists. If there are ties at the cut position, all tied athletes will be included.
            </p>
            <input
              type="number"
              min="1"
              max="50"
              value={finalistCount}
              onChange={(e) => setFinalistCount(Math.max(1, parseInt(e.target.value) || 8))}
              className="w-full px-3 py-2.5 bg-[#101a34] text-gray-200 border border-[#19bcd6] rounded-lg focus:outline-none focus:border-[#27a9e1] mb-6"
            />
            <div className="flex gap-3">
              <button
                onClick={handleCancelCount}
                className="flex-1 px-4 py-2.5 bg-[#101a34] text-gray-200 rounded-lg font-semibold hover:opacity-90 transition-opacity"
              >
                Cancel
              </button>
              <button
                onClick={handleCountSubmit}
                disabled={loading}
                className="flex-1 px-4 py-2.5 bg-[#27a9e1] text-[#031726] rounded-lg font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                Continue
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Dialog */}
      {showConfirmDialog && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-[#0e1730] border border-[#19bcd6] rounded-xl p-6 max-w-md w-full">
            <h2 className="text-xl font-bold text-gray-100 mb-4">
              Confirm Finals Generation
            </h2>
            <p className="text-sm text-gray-400 mb-4">
              You requested <strong className="text-gray-200">{finalistCount}</strong> finalists.
              {actualCount > finalistCount && (
                <>
                  {" "}Due to ties at the cut position, <strong className="text-gray-200">{actualCount}</strong> athletes will advance to finals.
                </>
              )}
              {actualCount === finalistCount && (
                <>
                  {" "}<strong className="text-gray-200">{actualCount}</strong> athletes will advance to finals.
                </>
              )}
            </p>
            <div className="flex gap-3">
              <button
                onClick={handleCancelConfirm}
                className="flex-1 px-4 py-2.5 bg-[#101a34] text-gray-200 rounded-lg font-semibold hover:opacity-90 transition-opacity"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmGenerate}
                disabled={loading}
                className="flex-1 px-4 py-2.5 bg-[#27a9e1] text-[#031726] rounded-lg font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}

// Helper function to pick finalists with tie handling
function pickFinalists(rows: LeaderboardRow[], targetCount: number): LeaderboardRow[] {
  if (rows.length === 0) return []
  if (rows.length <= targetCount) return rows

  // Find the cut athlete (at position targetCount - 1, zero-indexed)
  const cutAthlete = rows[targetCount - 1]

  // Include all athletes better than cut athlete (first targetCount - 1)
  const finalists = rows.slice(0, targetCount)

  // Include all athletes tied with cut athlete
  for (let i = targetCount; i < rows.length; i++) {
    const athlete = rows[i]
    if (
      athlete.points === cutAthlete.points &&
      athlete.tops === cutAthlete.tops &&
      athlete.zones === cutAthlete.zones
    ) {
      finalists.push(athlete)
    } else {
      break
    }
  }

  return finalists
}
