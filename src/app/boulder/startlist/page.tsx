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
import { collection, getDocs, query, where, orderBy as firestoreOrderBy } from "firebase/firestore"

interface Competition {
  id: string
  name?: string
  status?: string
  updatedAt?: { seconds?: number }
}

interface Category {
  id: string
  name?: string
  order?: number
}

interface Athlete {
  id: string
  bib?: string | number
  name?: string
  team?: string
  categoryId?: string
  detailIndex?: number | string | null
}

type ModeType = "all" | "single"

interface StartlistGroup {
  categoryId: string
  categoryName: string
  detailIndex: string | null
  detailLabel: string
  athletes: Athlete[]
}

export default function BoulderStartlistPage() {
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
    return <AccessDenied feature="Startlists" message="Sign in with a staff/admin account to continue." />
  }

  if (!isStaffRole(role)) {
    return <AccessDenied feature="Startlists (staff/admin only)" />
  }

  if (firebaseError) {
    return <AccessDenied feature="Startlists" message="Firebase not available. Please refresh and try again." />
  }

  return <StartlistInterface />
}

function StartlistInterface() {
  const { user } = useUser()

  // State
  const [competitions, setCompetitions] = useState<Competition[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [selectedComp, setSelectedComp] = useState("")
  const [mode, setMode] = useState<ModeType>("all")
  const [selectedCategory, setSelectedCategory] = useState("")
  const [details, setDetails] = useState<string[]>([])
  const [selectedDetail, setSelectedDetail] = useState("all")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [groups, setGroups] = useState<StartlistGroup[]>([])
  const [compName, setCompName] = useState("")

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
            updatedAt: doc.data().updatedAt as { seconds?: number } | undefined,
          }))
          .filter(
            (comp: Competition) =>
              !["archived", "deleted"].includes((comp.status || "").toLowerCase())
          )
          .sort((a, b) => (b.updatedAt?.seconds || 0) - (a.updatedAt?.seconds || 0))

        setCompetitions(comps)
        if (comps.length > 0 && !selectedComp) {
          setSelectedComp(comps[0].id)
          setCompName(comps[0].name || comps[0].id)
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
      setSelectedCategory("")
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

  // Load details when category changes (single category mode only)
  useEffect(() => {
    if (!firestore || !selectedComp || mode !== "single" || !selectedCategory) {
      setDetails([])
      setSelectedDetail("all")
      return
    }

    const loadDetails = async () => {
      if (!firestore) return
      try {
        const athletesQuery = query(
          collection(firestore, `boulderComps/${selectedComp}/athletes`),
          where("categoryId", "==", selectedCategory)
        )
        const snapshot = await getDocs(athletesQuery)

        // Collect distinct detailIndex values
        const detailSet = new Set<string>()
        snapshot.docs.forEach((doc) => {
          const athlete = doc.data() as Athlete
          const detailIndex = athlete.detailIndex
          if (detailIndex != null) {
            detailSet.add(String(detailIndex))
          }
        })

        const sorted = Array.from(detailSet).sort((a, b) => {
          const na = Number(a)
          const nb = Number(b)
          if (Number.isFinite(na) && Number.isFinite(nb) && na !== nb) return na - nb
          return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" })
        })

        setDetails(sorted)
      } catch (err) {
        console.error("Error loading details:", err)
      }
    }

    loadDetails()
  }, [selectedComp, mode, selectedCategory])

  const handleGenerate = async () => {
    if (!selectedComp) {
      setError("Please select a competition")
      return
    }

    if (mode === "single" && !selectedCategory) {
      setError("Please select a category")
      return
    }

    setLoading(true)
    setError("")
    setGroups([])

    try {
      if (!firestore) {
        throw new Error("Firebase not initialized")
      }

      // Load all athletes for the competition
      const athletesSnapshot = await getDocs(
        collection(firestore, `boulderComps/${selectedComp}/athletes`)
      )

      const allAthletes = athletesSnapshot.docs.map((doc) => ({
        id: doc.id,
        bib: doc.data().bib,
        name: doc.data().name,
        team: doc.data().team,
        categoryId: doc.data().categoryId,
        detailIndex: doc.data().detailIndex,
      })) as Athlete[]

      // Load categories for name resolution
      const categoriesSnapshot = await getDocs(
        query(
          collection(firestore, `boulderComps/${selectedComp}/categories`),
          firestoreOrderBy("order", "asc")
        )
      )

      const categoryMap = new Map<string, string>()
      categoriesSnapshot.docs.forEach((doc) => {
        categoryMap.set(doc.id, doc.data().name || doc.id)
      })

      // Filter athletes based on mode
      let filteredAthletes = allAthletes

      if (mode === "single") {
        filteredAthletes = allAthletes.filter((ath) => ath.categoryId === selectedCategory)

        if (selectedDetail !== "all") {
          filteredAthletes = filteredAthletes.filter(
            (ath) => String(ath.detailIndex) === selectedDetail
          )
        }
      }

      // Group by category and detail
      const groupMap = new Map<string, Athlete[]>()

      filteredAthletes.forEach((athlete) => {
        const catId = athlete.categoryId || "unknown"
        const detailIdx = athlete.detailIndex != null ? String(athlete.detailIndex) : null
        const key = `${catId}::${detailIdx}`

        if (!groupMap.has(key)) {
          groupMap.set(key, [])
        }
        groupMap.get(key)!.push(athlete)
      })

      // Build startlist groups
      const startlistGroups: StartlistGroup[] = []

      groupMap.forEach((athletes, key) => {
        const [catId, detailIdx] = key.split("::")
        const categoryName = categoryMap.get(catId) || catId

        // Sort athletes by bib (ascending), fallback to name
        const sortedAthletes = athletes.sort((a, b) => {
          const bibA = a.bib != null ? String(a.bib) : ""
          const bibB = b.bib != null ? String(b.bib) : ""

          if (bibA && bibB) {
            return bibA.localeCompare(bibB, undefined, { numeric: true, sensitivity: "base" })
          }

          if (bibA) return -1
          if (bibB) return 1

          const nameA = a.name || ""
          const nameB = b.name || ""
          return nameA.localeCompare(nameB)
        })

        startlistGroups.push({
          categoryId: catId,
          categoryName,
          detailIndex: detailIdx === "null" ? null : detailIdx,
          detailLabel: detailIdx === "null" ? "No detail" : `Detail ${detailIdx}`,
          athletes: sortedAthletes,
        })
      })

      // Sort groups by category order, then detail
      startlistGroups.sort((a, b) => {
        const catOrderA = categories.find((c) => c.id === a.categoryId)?.order ?? 999
        const catOrderB = categories.find((c) => c.id === b.categoryId)?.order ?? 999

        if (catOrderA !== catOrderB) return catOrderA - catOrderB

        const detailA = a.detailIndex != null ? Number(a.detailIndex) : 9999
        const detailB = b.detailIndex != null ? Number(b.detailIndex) : 9999

        return detailA - detailB
      })

      setGroups(startlistGroups)
    } catch (err) {
      console.error("Error generating startlists:", err)
      setError(err instanceof Error ? err.message : "Failed to generate startlists")
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="py-6 min-h-screen bg-[#0b1220] text-gray-200 print:bg-white print:text-black">
      <Container>
        <div className="max-w-[1100px] mx-auto space-y-6">
          {/* Header */}
          <header className="flex flex-col gap-3 print:hidden">
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
              <span className="text-gray-400">Startlists</span>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-sm text-gray-400">
              <span className="truncate max-w-[240px]">
                {user?.emailAddresses[0]?.emailAddress || "Signed in"}
              </span>
              <UserButton afterSignOutUrl="/" />
            </div>
          </header>

          {/* Controls */}
          <section className="bg-[#0e1730] border border-[#19bcd6] rounded-xl p-5 space-y-4 print:hidden">
            <div className="mb-4">
              <h1 className="text-2xl font-bold text-gray-100">Generate Startlists</h1>
              <p className="text-sm text-gray-400 mt-1">
                Print qualification startlists by category and detail
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              {/* Competition */}
              <label className="block">
                <span className="text-sm font-semibold text-gray-200 mb-2 block">
                  Competition
                </span>
                <select
                  value={selectedComp}
                  onChange={(e) => {
                    setSelectedComp(e.target.value)
                    const comp = competitions.find((c) => c.id === e.target.value)
                    setCompName(comp?.name || e.target.value)
                    setGroups([])
                  }}
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

              {/* Mode */}
              <label className="block">
                <span className="text-sm font-semibold text-gray-200 mb-2 block">
                  Mode
                </span>
                <select
                  value={mode}
                  onChange={(e) => {
                    setMode(e.target.value as ModeType)
                    setGroups([])
                  }}
                  className="w-full px-3 py-2.5 bg-[#101a34] text-gray-200 border border-[#19bcd6] rounded-lg focus:outline-none focus:border-[#27a9e1]"
                >
                  <option value="all">All categories</option>
                  <option value="single">Single category</option>
                </select>
              </label>
            </div>

            {/* Category (single mode only) */}
            {mode === "single" && (
              <div className="grid gap-4 md:grid-cols-2">
                <label className="block">
                  <span className="text-sm font-semibold text-gray-200 mb-2 block">
                    Category
                  </span>
                  <select
                    value={selectedCategory}
                    onChange={(e) => {
                      setSelectedCategory(e.target.value)
                      setGroups([])
                    }}
                    className="w-full px-3 py-2.5 bg-[#101a34] text-gray-200 border border-[#19bcd6] rounded-lg focus:outline-none focus:border-[#27a9e1]"
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

                <label className="block">
                  <span className="text-sm font-semibold text-gray-200 mb-2 block">
                    Detail
                  </span>
                  <select
                    value={selectedDetail}
                    onChange={(e) => {
                      setSelectedDetail(e.target.value)
                      setGroups([])
                    }}
                    className="w-full px-3 py-2.5 bg-[#101a34] text-gray-200 border border-[#19bcd6] rounded-lg focus:outline-none focus:border-[#27a9e1]"
                  >
                    <option value="all">All details</option>
                    {details.map((detail) => (
                      <option key={detail} value={detail}>
                        Detail {detail}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            )}

            {/* Error Message */}
            {error && (
              <div className="rounded-lg bg-red-500/10 border border-red-500/30 px-4 py-3 text-sm text-red-300">
                {error}
              </div>
            )}

            {/* Actions */}
            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={handleGenerate}
                disabled={loading || !selectedComp}
                className="px-6 py-3 bg-[#27a9e1] text-[#031726] rounded-lg font-semibold hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? "Generating..." : "Generate startlists"}
              </button>
              {groups.length > 0 && (
                <button
                  onClick={() => window.print()}
                  className="px-6 py-3 bg-[#101a34] border border-[#19bcd6] text-gray-200 rounded-lg font-semibold hover:bg-[#19bcd6]/10 transition"
                >
                  Print / PDF
                </button>
              )}
            </div>
          </section>

          {/* Print Header (only visible when printing) */}
          {groups.length > 0 && (
            <div className="hidden print:block mb-6">
              <h1 className="text-2xl font-bold text-black mb-2">
                Startlist - {compName}
              </h1>
              <p className="text-sm text-gray-700">
                {mode === "all"
                  ? "All categories"
                  : `${categories.find((c) => c.id === selectedCategory)?.name || selectedCategory}${
                      selectedDetail !== "all" ? ` - Detail ${selectedDetail}` : ""
                    }`}
              </p>
              <p className="text-xs text-gray-600 mt-1">
                Generated: {new Date().toLocaleString()}
              </p>
            </div>
          )}

          {/* Startlist Groups */}
          {groups.length > 0 && (
            <section className="space-y-8 print:space-y-6">
              {groups.map((group, groupIdx) => (
                <div
                  key={`${group.categoryId}-${group.detailIndex}-${groupIdx}`}
                  className="bg-[#0e1730] border border-[#19bcd6] rounded-xl p-5 print:bg-white print:border-black print:rounded-none print:break-inside-avoid"
                >
                  {/* Category heading */}
                  <div className="mb-4">
                    <h2 className="text-xl font-bold text-gray-100 print:text-black">
                      {group.categoryName}
                    </h2>
                    {group.detailIndex && (
                      <p className="text-sm text-gray-400 print:text-gray-700">
                        {group.detailLabel}
                      </p>
                    )}
                  </div>

                  {/* Athletes table */}
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse text-sm">
                      <thead>
                        <tr className="bg-[#101a34] print:bg-gray-100">
                          <th className="border border-[#19bcd6] px-3 py-2 text-left text-gray-200 print:border-black print:text-black w-12">
                            #
                          </th>
                          <th className="border border-[#19bcd6] px-3 py-2 text-left text-gray-200 print:border-black print:text-black w-24">
                            Bib
                          </th>
                          <th className="border border-[#19bcd6] px-3 py-2 text-left text-gray-200 print:border-black print:text-black">
                            Name
                          </th>
                          <th className="border border-[#19bcd6] px-3 py-2 text-left text-gray-200 print:border-black print:text-black">
                            Team
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {group.athletes.map((athlete, idx) => (
                          <tr key={athlete.id}>
                            <td className="border border-[#19bcd6] px-3 py-2 text-gray-300 print:border-black print:text-black">
                              {idx + 1}
                            </td>
                            <td className="border border-[#19bcd6] px-3 py-2 text-gray-200 print:border-black print:text-black font-semibold">
                              {athlete.bib != null ? String(athlete.bib) : "—"}
                            </td>
                            <td className="border border-[#19bcd6] px-3 py-2 text-gray-200 print:border-black print:text-black">
                              {athlete.name || "—"}
                            </td>
                            <td className="border border-[#19bcd6] px-3 py-2 text-gray-300 print:border-black print:text-gray-700">
                              {athlete.team || "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Summary */}
                  <p className="text-xs text-gray-400 print:text-gray-600 mt-3">
                    Total: {group.athletes.length} athlete{group.athletes.length !== 1 ? "s" : ""}
                  </p>
                </div>
              ))}
            </section>
          )}

          {/* Empty state */}
          {groups.length === 0 && !loading && (
            <div className="bg-[#0e1730] border border-[#19bcd6] rounded-xl p-6 text-center print:hidden">
              <p className="text-gray-400">
                Select a competition and mode, then click Generate to create startlists.
              </p>
            </div>
          )}

          {/* Back Link */}
          <div className="text-center print:hidden">
            <Link
              href="/boulder/admin"
              className="text-sm text-[#27a9e1] hover:text-[#19bcd6] hover:underline"
            >
              ← Back to Admin Dashboard
            </Link>
          </div>
        </div>
      </Container>
    </main>
  )
}
