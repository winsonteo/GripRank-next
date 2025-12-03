import { NextRequest, NextResponse } from "next/server"
import { auth } from "@clerk/nextjs/server"
import { getAdminDb } from "@/lib/firebase/admin"
import {
  buildOverallRanking,
  buildQualifierStandings,
  bracketOrder,
  formatMs,
  laneResultLabel,
  type FinalsRounds,
  type SpeedQualifierResult,
  type SpeedTimingPrecision,
} from "@/lib/speed/scoring"

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

function csvValue(val: unknown) {
  return `"${String(val ?? "").replace(/"/g, '""')}"`
}

function requireParam(params: URLSearchParams, key: string) {
  const value = params.get(key)
  if (!value) {
    throw new Error(`Missing required parameter: ${key}`)
  }
  return value
}

export async function GET(req: NextRequest) {
  try {
    if (!(await isStaffOrAdmin())) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const params = req.nextUrl.searchParams
    const compId = requireParam(params, "compId")
    const categoryId = requireParam(params, "categoryId")
    const type = (params.get("type") || "qualifiers") as "startlist" | "qualifiers" | "finals" | "overall"

    const adminDb = getAdminDb()
    const compRef = adminDb.collection("speedCompetitions").doc(compId)
    const compSnap = await compRef.get()
    if (!compSnap.exists) return NextResponse.json({ error: "Competition not found" }, { status: 404 })
    const compData = compSnap.data() || {}

    const catRef = compRef.collection("categories").doc(categoryId)
    const catSnap = await catRef.get()
    if (!catSnap.exists) return NextResponse.json({ error: "Category not found" }, { status: 404 })
    const catData = catSnap.data() || {}

    const precision: SpeedTimingPrecision = compData.timingPrecision === "ms2" ? "ms2" : "ms3"

    // Athletes map
    const athletesSnap = await catRef.collection("athletes").get()
    const athletes = athletesSnap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) }))
    const nameOf = (aid?: string | null) => {
      if (!aid) return "—"
      const a = athletes.find((x) => x.id === aid)
      if (!a) return aid
      return a.team ? `${a.name} (${a.team})` : a.name || aid
    }

    if (type === "startlist") {
      const startSnap = await catRef.collection("startlist").orderBy("heatIndex", "asc").get()
      const rows = startSnap.docs.map((d) => {
        const data = d.data() || {}
        return {
          heatIndex: typeof data.heatIndex === "number" ? data.heatIndex : Number(d.id) || 0,
          laneA: typeof data.laneA === "string" ? data.laneA : "",
          laneB: typeof data.laneB === "string" ? data.laneB : "",
        }
      })
      const csvRows = rows.map((r) => [r.heatIndex, nameOf(r.laneA), nameOf(r.laneB)].map(csvValue).join(","))
      const csv = [ ["Heat", "Lane A", "Lane B"].map(csvValue).join(","), ...csvRows ].join("\n")
      return new NextResponse(csv, {
        status: 200,
        headers: {
          "Content-Type": "text/csv",
          "Content-Disposition": `attachment; filename="${compId}-${categoryId}-startlist.csv"`,
        },
      })
    }

    // Qualifier results map
    const resultsSnap = await catRef.collection("qualifierResults").get()
    const resultsMap = new Map<string, SpeedQualifierResult>()
    resultsSnap.docs.forEach((d) => resultsMap.set(d.id, d.data() as SpeedQualifierResult))

    if (type === "qualifiers") {
      const qualRows = buildQualifierStandings({
        athletes,
        results: resultsMap,
        precision,
      })
      const csvRows = qualRows.map((row) =>
        [
          row.rank,
          catData.name || categoryId,
          row.name,
          row.team || "",
          row.bestLabel,
          row.secondLabel,
        ]
          .map(csvValue)
          .join(",")
      )
      const csv = [
        ["Rank", "Category", "Athlete", "Team", "Best", "Second"].map(csvValue).join(","),
        ...csvRows,
      ].join("\n")
      return new NextResponse(csv, {
        status: 200,
        headers: {
          "Content-Type": "text/csv",
          "Content-Disposition": `attachment; filename="${compId}-${categoryId}-qualifiers.csv"`,
        },
      })
    }

    // Finals data
    const finalsRef = catRef.collection("finals").doc("default")
    const finalsSnap = await finalsRef.get()
    if (!finalsSnap.exists) {
      return NextResponse.json({ error: "Finals not generated" }, { status: 404 })
    }
    const finalsMeta = finalsSnap.data() || {}
    const roundsCol = await finalsRef.collection("rounds").get()
    const finalsRounds: FinalsRounds = {}
    for (const roundDoc of roundsCol.docs) {
      const matchesSnap = await roundDoc.ref.collection("matches").get()
      finalsRounds[roundDoc.id] = matchesSnap.docs
        .map((m) => ({ id: m.id, ...(m.data() || {}) }))
        .sort((a, b) => (a.matchIndex || 0) - (b.matchIndex || 0))
    }

    if (type === "finals") {
      const order = bracketOrder(finalsMeta.size as number | undefined)
      const rows: string[] = []
      order.forEach((rid) => {
        const matches = finalsRounds[rid] || []
        matches.forEach((m) => {
          const showA = laneResultLabel({
            lane: m.laneA,
            opponent: m.laneB,
            isWinner: m.winner === "A",
            isBigFinal: rid === "F" && m.matchIndex === 2,
            allowWinnerRun: m.allowWinnerRun,
            precision,
          })
          const showB = laneResultLabel({
            lane: m.laneB,
            opponent: m.laneA,
            isWinner: m.winner === "B",
            isBigFinal: rid === "F" && m.matchIndex === 2,
            allowWinnerRun: m.allowWinnerRun,
            precision,
          })
          rows.push(
            [
              rid,
              m.matchIndex || "",
              nameOf(m.athleteA),
              showA,
              m.winner === "A" ? "Yes" : "",
              nameOf(m.athleteB),
              showB,
              m.winner === "B" ? "Yes" : "",
            ]
              .map(csvValue)
              .join(",")
          )
        })
      })
      const csv = [
        ["Round", "Match", "Athlete A", "A Time/Status", "A Win", "Athlete B", "B Time/Status", "B Win"]
          .map(csvValue)
          .join(","),
        ...rows,
      ].join("\n")
      return new NextResponse(csv, {
        status: 200,
        headers: {
          "Content-Type": "text/csv",
          "Content-Disposition": `attachment; filename="${compId}-${categoryId}-finals.csv"`,
        },
      })
    }

    // Overall
    const overall = buildOverallRanking({
      athletes,
      rounds: finalsRounds,
      qualifiers: resultsMap,
    })
    const csvRows = overall.map((row) =>
      [
        row.rank,
        row.name,
        row.team || "",
        row.stage,
        row.bestMs != null ? formatMs(row.bestMs, precision) : "—",
      ]
        .map(csvValue)
        .join(",")
    )
    const csv = [
      ["Rank", "Athlete", "Team", "Stage", "Fastest Time"].map(csvValue).join(","),
      ...csvRows,
    ].join("\n")
    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="${compId}-${categoryId}-overall.csv"`,
      },
    })
  } catch (error) {
    console.error("Speed export error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Export failed" },
      { status: 400 }
    )
  }
}
