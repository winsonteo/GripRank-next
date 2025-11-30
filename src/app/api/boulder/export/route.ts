import { NextRequest, NextResponse } from "next/server"
import { auth } from "@clerk/nextjs/server"
import { getAdminDb } from "@/lib/firebase/admin"
import { buildLeaderboardRows, type AttemptDoc, type AthleteInfo, type DetailMeta } from "@/lib/boulder/scoring"

// Helper to check if user is staff/admin
async function isStaffOrAdmin() {
  const { userId } = await auth()
  if (!userId) return false

  try {
    const adminDb = getAdminDb()
    const roleDoc = await adminDb.collection("roles").doc(userId).get()
    const role = roleDoc.data()?.role
    return role === "staff" || role === "admin"
  } catch (error) {
    console.error("Error checking role:", error)
    return false
  }
}

// Generate CSV from leaderboard rows
function generateQualificationCSV(
  rows: ReturnType<typeof buildLeaderboardRows>,
  categoryName: string,
  routes: { id: string; label: string }[]
) {
  // CSV Header
  const headers = [
    "Rank",
    "Category",
    "Bib",
    "Name",
    "Team",
    "Total Points",
    "Tops",
    "Zones",
    ...routes.map((r) => `${r.label} (Points)`),
    ...routes.map((r) => `${r.label} (Attempts)`),
  ]

  // Build rank lookup with ties
  const rankedRows = rows.map((row, index, arr) => {
    // Find rank considering ties
    let rank = 1
    for (let i = 0; i < index; i++) {
      const prev = arr[i]
      if (
        prev.points !== row.points ||
        prev.tops !== row.tops ||
        prev.zones !== row.zones
      ) {
        rank = i + 2
      }
    }
    return { ...row, rank }
  })

  // CSV Rows
  const csvRows = rankedRows.map((row) => {
    const routePoints = routes.map((r) => {
      const route = row.routes.find((rt) => rt.routeId === r.id)
      return route ? route.pointValue.toFixed(1) : "0.0"
    })

    const routeAttempts = routes.map((r) => {
      const route = row.routes.find((rt) => rt.routeId === r.id)
      if (!route) return "-"
      if (route.topAttempt) return `T${route.topAttempt}`
      if (route.zoneAttempt) return `Z${route.zoneAttempt}`
      return "-"
    })

    return [
      row.rank,
      categoryName,
      row.bib || "",
      row.name,
      row.team || "",
      row.points.toFixed(1),
      row.tops,
      row.zones,
      ...routePoints,
      ...routeAttempts,
    ].map((val) => `"${String(val).replace(/"/g, '""')}"`)
  })

  return [headers.map((h) => `"${h}"`).join(","), ...csvRows.map((row) => row.join(","))].join(
    "\n"
  )
}

// Generate Finals CSV
function generateFinalsCSV(
  rows: ReturnType<typeof buildLeaderboardRows>,
  categoryName: string,
  routes: { id: string; label: string }[],
  finalistData: Map<string, { qualifierRank: number }>
) {
  // CSV Header
  const headers = [
    "Rank",
    "Category",
    "Bib",
    "Name",
    "Team",
    "Qualifier Rank",
    "Total Points",
    "Tops",
    "Zones",
    ...routes.map((r) => `${r.label} (Points)`),
    ...routes.map((r) => `${r.label} (Attempts)`),
  ]

  // Build rank lookup with ties
  const rankedRows = rows.map((row, index, arr) => {
    let rank = 1
    for (let i = 0; i < index; i++) {
      const prev = arr[i]
      if (
        prev.points !== row.points ||
        prev.tops !== row.tops ||
        prev.zones !== row.zones
      ) {
        rank = i + 2
      }
    }
    return { ...row, rank }
  })

  // CSV Rows
  const csvRows = rankedRows.map((row) => {
    const routePoints = routes.map((r) => {
      const route = row.routes.find((rt) => rt.routeId === r.id)
      return route ? route.pointValue.toFixed(1) : "0.0"
    })

    const routeAttempts = routes.map((r) => {
      const route = row.routes.find((rt) => rt.routeId === r.id)
      if (!route) return "-"
      if (route.topAttempt) return `T${route.topAttempt}`
      if (route.zoneAttempt) return `Z${route.zoneAttempt}`
      return "-"
    })

    const finalistInfo = finalistData.get(row.athleteId)
    const qualifierRank = finalistInfo?.qualifierRank || "-"

    return [
      row.rank,
      categoryName,
      row.bib || "",
      row.name,
      row.team || "",
      qualifierRank,
      row.points.toFixed(1),
      row.tops,
      row.zones,
      ...routePoints,
      ...routeAttempts,
    ].map((val) => `"${String(val).replace(/"/g, '""')}"`)
  })

  return [headers.map((h) => `"${h}"`).join(","), ...csvRows.map((row) => row.join(","))].join(
    "\n"
  )
}

export async function GET(request: NextRequest) {
  try {
    // Check auth
    const authorized = await isStaffOrAdmin()
    if (!authorized) {
      return new NextResponse("Unauthorized", { status: 401 })
    }

    // Get query params
    const searchParams = request.nextUrl.searchParams
    const compId = searchParams.get("compId")
    const categoryId = searchParams.get("categoryId")
    const round = searchParams.get("round") || "qualification"

    if (!compId) {
      return new NextResponse("Missing compId parameter", { status: 400 })
    }

    if (round !== "qualification" && round !== "final") {
      return new NextResponse("Invalid round parameter", { status: 400 })
    }

    const db = getAdminDb()

    // Load categories
    const categoriesSnapshot = await db
      .collection(`boulderComps/${compId}/categories`)
      .orderBy("order", "asc")
      .get()

    const categories = categoriesSnapshot.docs.map((doc) => ({
      id: doc.id,
      name: doc.data().name as string | undefined,
      order: doc.data().order as number | undefined,
    }))

    // Filter categories if specific category requested
    const targetCategories = categoryId
      ? categories.filter((c) => c.id === categoryId)
      : categories

    if (targetCategories.length === 0) {
      return new NextResponse("No categories found", { status: 404 })
    }

    let allCSVRows: string[] = []

    // Process each category
    for (const category of targetCategories) {
      const catId = category.id
      const catName = category.name || catId

      // Load routes
      const routeCollection = round === "final" ? "finalRoutes" : "routes"
      const routesSnapshot = await db
        .collection(`boulderComps/${compId}/categories/${catId}/${routeCollection}`)
        .orderBy("order", "asc")
        .get()

      const routes = routesSnapshot.docs.map((doc) => ({
        id: doc.id,
        label: doc.data().label || doc.id,
      }))

      if (routes.length === 0) {
        continue // Skip categories with no routes
      }

      // Load attempts
      const attemptsSnapshot = await db
        .collection(`boulderComps/${compId}/attempts`)
        .where("categoryId", "==", catId)
        .where("round", "==", round)
        .get()

      const attempts: AttemptDoc[] = attemptsSnapshot.docs.map((doc) => ({
        ...doc.data(),
        createdAt: doc.data().clientAtMs || 0,
      })) as AttemptDoc[]

      // Load athletes
      const athletesSnapshot = await db
        .collection(`boulderComps/${compId}/athletes`)
        .where("categoryId", "==", catId)
        .get()

      const athletesById = new Map<string, AthleteInfo>()
      athletesSnapshot.docs.forEach((doc) => {
        athletesById.set(doc.id, {
          bib: doc.data().bib,
          name: doc.data().name,
          team: doc.data().team,
        })
      })

      // Build details meta for scoring
      const detailsMeta = new Map<string, DetailMeta>()
      routes.forEach((route) => {
        detailsMeta.set(`route:${route.id}`, {
          type: "route",
          routeId: route.id,
          label: route.label,
        })
      })

      // Build leaderboard rows using existing scoring logic
      const rows = buildLeaderboardRows({
        attemptDocs: attempts,
        athletesById,
        detailsMeta,
      })

      // Generate CSV for this category
      let csv: string
      if (round === "final") {
        // Load finalist data
        const startlistDoc = await db
          .doc(`boulderComps/${compId}/categories/${catId}/finals/startlist`)
          .get()

        const finalistData = new Map<string, { qualifierRank: number }>()
        if (startlistDoc.exists) {
          const entries = startlistDoc.data()?.entries || []
          entries.forEach(
            (entry: { athleteId: string; qualifierRank: number }) => {
              finalistData.set(entry.athleteId, {
                qualifierRank: entry.qualifierRank,
              })
            }
          )
        }

        csv = generateFinalsCSV(rows, catName, routes, finalistData)
      } else {
        csv = generateQualificationCSV(rows, catName, routes)
      }

      // Add category rows to all rows
      const csvLines = csv.split("\n")
      if (allCSVRows.length === 0) {
        // First category - include header
        allCSVRows = csvLines
      } else {
        // Subsequent categories - skip header
        allCSVRows.push(...csvLines.slice(1))
      }
    }

    if (allCSVRows.length === 0) {
      return new NextResponse("No data to export", { status: 404 })
    }

    // Return CSV
    const csvContent = allCSVRows.join("\n")
    return new NextResponse(csvContent, {
      status: 200,
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="export-${compId}-${round}.csv"`,
      },
    })
  } catch (error) {
    console.error("Export error:", error)
    return new NextResponse("Internal server error", { status: 500 })
  }
}
