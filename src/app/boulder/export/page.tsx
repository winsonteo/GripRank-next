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
import { collection, getDocs, query, orderBy as firestoreOrderBy } from "firebase/firestore"

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

export default function BoulderExportPage() {
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

  // State
  const [competitions, setCompetitions] = useState<Competition[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [selectedComp, setSelectedComp] = useState("")
  const [selectedCategory, setSelectedCategory] = useState("all")
  const [round, setRound] = useState<"qualification" | "final">("qualification")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

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
            ...doc.data(),
          }))
          .filter(
            (comp: Competition) =>
              !["archived", "deleted"].includes((comp.status || "").toLowerCase())
          ) as Competition[]

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
          ...doc.data(),
        })) as Category[]

        setCategories(cats)
      } catch (err) {
        console.error("Error loading categories:", err)
      }
    }

    loadCategories()
  }, [selectedComp])

  const handleExport = async () => {
    if (!selectedComp) {
      setError("Please select a competition")
      return
    }

    setLoading(true)
    setError("")

    try {
      const params = new URLSearchParams({
        compId: selectedComp,
        round,
      })

      if (selectedCategory && selectedCategory !== "all") {
        params.append("categoryId", selectedCategory)
      }

      const response = await fetch(`/api/boulder/export?${params.toString()}`)

      if (!response.ok) {
        throw new Error(`Export failed: ${response.statusText}`)
      }

      // Get the blob and download
      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url

      // Generate filename
      const comp = competitions.find((c) => c.id === selectedComp)
      const compName = comp?.name || selectedComp
      const categoryName =
        selectedCategory === "all"
          ? "all-categories"
          : categories.find((c) => c.id === selectedCategory)?.name || selectedCategory
      const roundName = round === "final" ? "finals" : "qualification"
      a.download = `${compName}-${categoryName}-${roundName}.csv`

      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
    } catch (err) {
      console.error("Export error:", err)
      setError(err instanceof Error ? err.message : "Export failed")
    } finally {
      setLoading(false)
    }
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
          <section className="bg-[#0e1730] border border-[#19bcd6] rounded-xl p-6">
            <div className="mb-6">
              <h1 className="text-2xl font-bold text-gray-100">Export Results</h1>
              <p className="text-sm text-gray-400 mt-1">
                Download competition results as CSV
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

              {/* Round */}
              <label className="block">
                <span className="text-sm font-semibold text-gray-200 mb-2 block">
                  Round
                </span>
                <select
                  value={round}
                  onChange={(e) => setRound(e.target.value as "qualification" | "final")}
                  className="w-full px-3 py-2.5 bg-[#101a34] text-gray-200 border border-[#19bcd6] rounded-lg focus:outline-none focus:border-[#27a9e1]"
                >
                  <option value="qualification">Qualification</option>
                  <option value="final">Final</option>
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
                  <option value="all">All categories</option>
                  {categories.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.name || cat.id}
                    </option>
                  ))}
                </select>
              </label>

              {/* Error Message */}
              {error && (
                <div className="rounded-lg bg-red-500/10 border border-red-500/30 px-4 py-3 text-sm text-red-300">
                  {error}
                </div>
              )}

              {/* Export Button */}
              <button
                onClick={handleExport}
                disabled={loading || !selectedComp}
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
