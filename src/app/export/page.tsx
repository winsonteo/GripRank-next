'use client'

import { useEffect, useState } from "react"
import Link from "next/link"
import Image from "next/image"
import Container from "@/components/Container"
import AccessDenied from "@/components/AccessDenied"
import { UserButton, useUser } from "@clerk/nextjs"
import { useFirebaseAuth } from "@/hooks/useFirebaseAuth"
import { useUserRole, isStaffRole } from "@/hooks/useUserRole"
import { firestore } from "@/lib/firebase/client"
import { collection, getDocs, query, orderBy as firestoreOrderBy } from "firebase/firestore"

type Discipline = "boulder" | "speed"

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

type SpeedExportType = "startlist" | "qualifiers" | "finals" | "overall"

export default function ExportPage() {
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
    return <AccessDenied feature="Export Results" message="Sign in with a staff/admin account to continue." />
  }

  if (!isStaffRole(role)) {
    return <AccessDenied feature="Export Results (staff/admin only)" />
  }

  if (firebaseError) {
    return <AccessDenied feature="Export Results" message="Firebase not available. Please refresh and try again." />
  }

  return <ExportInterface />
}

function ExportInterface() {
  const { user } = useUser()
  const [discipline, setDiscipline] = useState<Discipline>("boulder")

  const [boulderComps, setBoulderComps] = useState<Competition[]>([])
  const [speedComps, setSpeedComps] = useState<Competition[]>([])
  const [categories, setCategories] = useState<Category[]>([])

  const [selectedComp, setSelectedComp] = useState("")
  const [selectedCategory, setSelectedCategory] = useState("all")
  const [boulderRound, setBoulderRound] = useState<"qualification" | "final">("qualification")
  const [speedType, setSpeedType] = useState<SpeedExportType>("qualifiers")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  // Load competitions per discipline
  useEffect(() => {
    if (!firestore) return

    const loadComps = async () => {
      if (!firestore) return
      try {
        if (discipline === "boulder") {
          const snapshot = await getDocs(collection(firestore, "boulderComps"))
          const comps = snapshot.docs
            .map((doc) => ({
              id: doc.id,
              ...doc.data(),
            }))
            .filter((comp: Competition) => !["archived", "deleted"].includes((comp.status || "").toLowerCase())) as Competition[]
          setBoulderComps(comps)
          if (comps.length > 0) {
            setSelectedComp(comps[0].id)
          }
        } else {
          const snapshot = await getDocs(collection(firestore, "speedCompetitions"))
          const comps = snapshot.docs
            .map((doc) => ({
              id: doc.id,
              ...doc.data(),
            }))
            .filter((comp: Competition) => !["archived", "deleted"].includes((comp.status || "").toLowerCase())) as Competition[]
          setSpeedComps(comps)
          if (comps.length > 0) {
            setSelectedComp(comps[0].id)
          }
        }
      } catch (err) {
        console.error("Error loading competitions:", err)
        setError("Failed to load competitions")
      }
    }

    loadComps()
  }, [discipline])

  // Load categories when competition changes
  useEffect(() => {
    if (!firestore || !selectedComp) {
      setCategories([])
      return
    }

    const loadCategories = async () => {
      if (!firestore) return
      try {
        const collectionName = discipline === "boulder" ? "boulderComps" : "speedCompetitions"
        const catsQuery = query(
          collection(firestore, `${collectionName}/${selectedComp}/categories`),
          firestoreOrderBy("order", "asc")
        )
        const snapshot = await getDocs(catsQuery)
        const cats = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as Category[]

        setCategories(cats)
        if (discipline === "speed") {
          setSelectedCategory(cats[0]?.id || "")
        }
      } catch (err) {
        console.error("Error loading categories:", err)
      }
    }

    loadCategories()
  }, [selectedComp, discipline])

  const handleExport = async () => {
    if (!selectedComp) {
      setError("Please select a competition")
      return
    }

    setLoading(true)
    setError("")

    try {
      if (discipline === "boulder") {
        const params = new URLSearchParams({
          compId: selectedComp,
          round: boulderRound,
        })
        if (selectedCategory && selectedCategory !== "all") params.append("categoryId", selectedCategory)
        const response = await fetch(`/api/boulder/export?${params.toString()}`)
        if (!response.ok) throw new Error(`Export failed: ${response.statusText}`)
        const blob = await response.blob()
        const url = window.URL.createObjectURL(blob)
        const a = document.createElement("a")
        a.href = url
        a.download = `${selectedComp}-${selectedCategory || "all"}-${boulderRound}.csv`
        document.body.appendChild(a)
        a.click()
        window.URL.revokeObjectURL(url)
        document.body.removeChild(a)
      } else {
        const params = new URLSearchParams({
          compId: selectedComp,
          categoryId: selectedCategory,
          type: speedType,
        })
        const response = await fetch(`/api/speed/export?${params.toString()}`)
        if (!response.ok) {
          const errText = await response.text()
          throw new Error(errText || "Export failed")
        }
        const blob = await response.blob()
        const url = window.URL.createObjectURL(blob)
        const a = document.createElement("a")
        a.href = url
        a.download = `${selectedComp}-${selectedCategory}-${speedType}.csv`
        document.body.appendChild(a)
        a.click()
        window.URL.revokeObjectURL(url)
        document.body.removeChild(a)
      }
    } catch (err) {
      console.error("Export error:", err)
      setError(err instanceof Error ? err.message : "Export failed")
    } finally {
      setLoading(false)
    }
  }

  const comps = discipline === "boulder" ? boulderComps : speedComps

  return (
    <main className="py-6 min-h-screen bg-[#0b1220] text-gray-200">
      <Container>
        <div className="max-w-[900px] mx-auto space-y-6">
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
              <span className="text-gray-400">Export Results</span>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-sm text-gray-400">
              <span className="truncate max-w-[240px]">
                {user?.emailAddresses[0]?.emailAddress || "Signed in"}
              </span>
              <UserButton afterSignOutUrl="/" />
            </div>
          </header>

          {/* Export Form */}
          <section className="bg-[#0e1730] border border-[#19bcd6] rounded-xl p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h1 className="text-2xl font-bold text-gray-100">Export Results</h1>
                <p className="text-sm text-gray-400 mt-1">
                  Download competition results as CSV
                </p>
              </div>
              <div className="flex gap-2">
                <label className="text-sm text-gray-200 flex items-center gap-2">
                  Discipline:
                  <select
                    value={discipline}
                    onChange={(e) => {
                      setDiscipline(e.target.value as Discipline)
                      setSelectedCategory("all")
                    }}
                    className="px-3 py-2 bg-[#101a34] text-gray-200 border border-[#19bcd6] rounded-lg focus:outline-none focus:border-[#27a9e1]"
                  >
                    <option value="boulder">Boulder</option>
                    <option value="speed">Speed</option>
                  </select>
                </label>
              </div>
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
                  {comps.length === 0 ? (
                    <option value="">No competitions found</option>
                  ) : (
                    comps.map((comp) => (
                      <option key={comp.id} value={comp.id}>
                        {comp.name || comp.id}
                      </option>
                    ))
                  )}
                </select>
              </label>

              {discipline === "boulder" ? (
                <>
                  <label className="block">
                    <span className="text-sm font-semibold text-gray-200 mb-2 block">
                      Round
                    </span>
                    <select
                      value={boulderRound}
                      onChange={(e) => setBoulderRound(e.target.value as "qualification" | "final")}
                      className="w-full px-3 py-2.5 bg-[#101a34] text-gray-200 border border-[#19bcd6] rounded-lg focus:outline-none focus:border-[#27a9e1]"
                    >
                      <option value="qualification">Qualification</option>
                      <option value="final">Final</option>
                    </select>
                  </label>

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
                      <option value="all">All categories</option>
                      {categories.map((cat) => (
                        <option key={cat.id} value={cat.id}>
                          {cat.name || cat.id}
                        </option>
                      ))}
                    </select>
                  </label>
                </>
              ) : (
                <>
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
                      {categories.map((cat) => (
                        <option key={cat.id} value={cat.id}>
                          {cat.name || cat.id}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="block">
                    <span className="text-sm font-semibold text-gray-200 mb-2 block">
                      Export type
                    </span>
                    <select
                      value={speedType}
                      onChange={(e) => setSpeedType(e.target.value as SpeedExportType)}
                      className="w-full px-3 py-2.5 bg-[#101a34] text-gray-200 border border-[#19bcd6] rounded-lg focus:outline-none focus:border-[#27a9e1]"
                    >
                      <option value="startlist">Startlist</option>
                      <option value="qualifiers">Qualifiers</option>
                      <option value="finals">Finals</option>
                      <option value="overall">Overall</option>
                    </select>
                  </label>
                </>
              )}

              {/* Error Message */}
              {error && (
                <div className="rounded-lg bg-red-500/10 border border-red-500/30 px-4 py-3 text-sm text-red-300">
                  {error}
                </div>
              )}

              {/* Export Button */}
              <button
                onClick={handleExport}
                disabled={loading || !selectedComp || (discipline === "speed" && !selectedCategory)}
                className="w-full px-6 py-3 bg-[#27a9e1] text-[#031726] rounded-lg font-semibold hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? "Exporting..." : "Download CSV"}
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
    </main>
  )
}
