'use client'

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import Image from "next/image"
import Container from "@/components/Container"
import AccessDenied from "@/components/AccessDenied"
import { UserButton, useUser } from "@clerk/nextjs"
import { useFirebaseAuth } from "@/hooks/useFirebaseAuth"
import { useUserRole, isStaffRole } from "@/hooks/useUserRole"
import {
  collection,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  writeBatch,
} from "firebase/firestore"
import { firestore } from "@/lib/firebase/client"

type Competition = { id: string; name?: string; status?: string; updatedAt?: { seconds?: number } }
type Category = { id: string; name?: string; order?: number }

type Defaults = {
  categoryId: string
  detail: string
  status: string
  cleanup: boolean
  overwrite: boolean
  autoDetail: boolean
}

type RawRow = {
  __index: number
  bibRaw?: string
  name?: string
  team?: string
  category?: string
  detailVal?: string
  status?: string
}

type PreviewRow = {
  index: number
  bib: string
  bibKey: string
  name: string
  team: string
  categoryId: string
  detailIndex: number | null
  status: string
  issues: string[]
  duplicate?: boolean
  exists?: boolean
  overwrite?: boolean
}

const STATUS_OPTIONS = ["ok", "waitlist", "scratched"]

const headerKeys = ["bib", "name", "team", "category", "categoryid", "detail", "detailindex", "status"]

const parseLine = (line: string) => {
  if (line.includes("\t")) return line.split("\t").map((c) => c.trim())
  return line.split(",").map((c) => c.trim())
}

function hasHeader(line: string) {
  const columns = parseLine(line).map((c) => c.toLowerCase())
  return columns.some((c) => headerKeys.includes(c))
}

function normalize(value: unknown) {
  return typeof value === "string" ? value.trim() : value
}

function autoDetailGenerator(start: string | number) {
  let current = Number(start) || 1
  return {
    next() {
      const value = current
      current += 1
      return value
    },
  }
}

function bibKey(bib: string) {
  return (bib || "").trim().toLowerCase()
}

function athleteDocIdFromBib(bib: string) {
  const raw = (bib || "").trim()
  if (!raw) return null
  if (/^[0-9]+$/.test(raw)) return `ath${raw}`
  const slug = raw.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")
  if (slug) return `ath-${slug}`
  const hex = Array.from(raw)
    .map((ch) => ch.charCodeAt(0).toString(16))
    .join("")
  return hex ? `ath-${hex}` : null
}

function parseImportedData(rawText: string, defaults: Defaults): RawRow[] {
  const lines = rawText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  if (!lines.length) return []
  let headers = hasHeader(lines[0]) ? parseLine(lines[0]).map((h) => h.toLowerCase()) : []
  const startIdx = headers.length ? 1 : 0
  if (!headers.length) headers = ["bib", "name", "team", "detail"]

  const rows: RawRow[] = []
  for (let i = startIdx; i < lines.length; i += 1) {
    const cols = parseLine(lines[i])
    if (!cols.length) continue
    const map: Record<string, string> = {}
    headers.forEach((h, idx) => {
      map[h] = cols[idx]
    })
    rows.push({
      __index: i + 1,
      bibRaw: normalize(map.bib) as string | undefined,
      name: normalize(map.name) as string | undefined,
      team: normalize(map.team) as string | undefined,
      category: (normalize(map.category || map.categoryid) as string | undefined) || defaults.categoryId,
      detailVal: normalize(map.detail || map.detailindex) as string | undefined,
      status: normalize(map.status) as string | undefined,
    })
  }
  return rows
}

function hydrateRow(raw: RawRow, defaults: Defaults, autoDetail: ReturnType<typeof autoDetailGenerator>): PreviewRow {
  const issues: string[] = []
  const bib = (raw.bibRaw || "").trim()
  if (!bib) issues.push("Missing bib")
  const name = (raw.name || "").trim()
  if (!name) issues.push("Missing name")
  const team = raw.team?.trim() || ""
  const categoryId = raw.category?.trim() || defaults.categoryId
  if (!categoryId) issues.push("Missing category")

  let detailIndex: number | null = null
  if (raw.detailVal) {
    const parsed = Number(raw.detailVal)
    if (!Number.isNaN(parsed)) detailIndex = parsed
  } else if (defaults.autoDetail) {
    detailIndex = autoDetail.next()
  } else if (defaults.detail) {
    const parsed = Number(defaults.detail)
    if (!Number.isNaN(parsed)) detailIndex = parsed
  } else {
    issues.push("Missing detail")
  }

  const status = (raw.status || defaults.status || "ok").trim() || "ok"

  return {
    index: raw.__index,
    bib,
    bibKey: bibKey(bib),
    name,
    team,
    categoryId,
    detailIndex,
    status,
    issues,
  }
}

function summarize(rows: PreviewRow[]) {
  return rows.reduce(
    (acc, row) => {
      if (row.issues.length || row.duplicate || (row.exists && !row.overwrite)) {
        acc.skipped += 1
      } else if (row.exists && row.overwrite) {
        acc.updates += 1
      } else {
        acc.new += 1
      }
      return acc
    },
    { new: 0, updates: 0, skipped: 0 }
  )
}

export default function ImportPage() {
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
    return <AccessDenied feature="Boulder Import" message="Sign in to import athletes." />
  }

  if (!isStaffRole(role)) {
    return <AccessDenied feature="Boulder Import (staff/admin only)" />
  }

  if (firebaseError) {
    return <AccessDenied feature="Boulder Import" message="Firebase not available. Please refresh and try again." />
  }

  return <ImportInterface />
}

function ImportInterface() {
  const { user } = useUser()

  const [comps, setComps] = useState<Competition[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [selectedCompId, setSelectedCompId] = useState("")
  const [selectedCategoryId, setSelectedCategoryId] = useState("")
  const [compStatus, setCompStatus] = useState<string>("")
  const [locked, setLocked] = useState(false)

  const [rawText, setRawText] = useState("")
  const [fileStatus, setFileStatus] = useState("")
  const [message, setMessage] = useState<{ text: string; tone: "info" | "ok" | "warn" }>({
    text: "",
    tone: "info",
  })

  const [cleanup, setCleanup] = useState(true)
  const [overwrite, setOverwrite] = useState(false)
  const [autoDetail, setAutoDetail] = useState(false)
  const [defaultDetail, setDefaultDetail] = useState("1")
  const [defaultStatus, setDefaultStatus] = useState("ok")

  const [previewRows, setPreviewRows] = useState<PreviewRow[]>([])
  const [previewSummary, setPreviewSummary] = useState({ new: 0, updates: 0, skipped: 0 })
  const [importing, setImporting] = useState(false)
  const [loading, setLoading] = useState(false)

  const defaults = useMemo<Defaults>(
    () => ({
      categoryId: selectedCategoryId,
      detail: defaultDetail,
      status: defaultStatus,
      cleanup,
      overwrite,
      autoDetail,
    }),
    [selectedCategoryId, defaultDetail, defaultStatus, cleanup, overwrite, autoDetail]
  )

  useEffect(() => {
    if (!firestore) return
    async function loadComps() {
      const db = firestore
      if (!db) return
      setLoading(true)
      try {
        const snap = await getDocs(collection(db, "boulderComps"))
        const list = snap.docs
          .map((d) => {
            const { id: _id, ...rest } = d.data() as Competition
            void _id
            return { id: d.id, ...rest }
          })
          .sort((a, b) => (b.updatedAt?.seconds || 0) - (a.updatedAt?.seconds || 0))
        setComps(list)
      } finally {
        setLoading(false)
      }
    }
    loadComps().catch((err) => {
      console.error(err)
      setMessage({ text: "Failed to load competitions.", tone: "warn" })
    })
  }, [])

  useEffect(() => {
    if (!selectedCompId || !firestore) {
      setCategories([])
      setSelectedCategoryId("")
      setCompStatus("")
      setLocked(false)
      return
    }
    async function loadMeta() {
      try {
        const db = firestore
        if (!db) return
        const compSnap = await getDoc(doc(db, "boulderComps", selectedCompId))
        if (compSnap.exists()) {
          const data = compSnap.data() as Competition
          const status = (data.status || "").toLowerCase()
          setCompStatus(status || "unknown")
          setLocked(status === "locked")
        } else {
          setCompStatus("missing")
          setLocked(false)
        }
      } catch (err) {
        console.error(err)
        setCompStatus("error")
      }
    }
    async function loadCats() {
      try {
        const db = firestore
        if (!db) return
        const snap = await getDocs(collection(db, `boulderComps/${selectedCompId}/categories`))
        const cats = snap.docs
          .map((d) => {
            const { id: _id, ...rest } = d.data() as Category
            void _id
            return { id: d.id, ...rest }
          })
          .sort((a, b) => {
            if (typeof a.order === "number" && typeof b.order === "number") return a.order - b.order
            return (a.name || a.id).localeCompare(b.name || b.id)
          })
        setCategories(cats)
        if (cats.length) {
          setSelectedCategoryId(cats[0].id)
        } else {
          setSelectedCategoryId("")
        }
      } catch (err) {
        console.error(err)
        setCategories([])
      }
    }
    loadMeta()
    loadCats()
    setPreviewRows([])
    setPreviewSummary({ new: 0, updates: 0, skipped: 0 })
  }, [selectedCompId])

  useEffect(() => {
    setDefaultDetail("1")
    setDefaultStatus("ok")
    setPreviewRows([])
    setPreviewSummary({ new: 0, updates: 0, skipped: 0 })
  }, [selectedCategoryId])

  const handleFile = async (file: File | null) => {
    if (!file) return
    const lower = file.name.toLowerCase()
    if (lower.endsWith(".xlsx") || lower.endsWith(".xls")) {
      setMessage({
        text: "Excel files are not supported yet. Please export your sheet as CSV and upload that file instead.",
        tone: "warn",
      })
      setFileStatus("")
      return
    }
    if (!lower.endsWith(".csv") && !lower.endsWith(".tsv") && !lower.endsWith(".txt")) {
      setMessage({ text: "Unsupported file type. Use CSV/TSV.", tone: "warn" })
      setFileStatus("")
      return
    }
    const text = await file.text()
    setRawText(text)
    setFileStatus(`${file.name} • ${text.split(/\r?\n/).filter(Boolean).length} lines`)
    setMessage({ text: "File loaded. Preview before importing.", tone: "info" })
  }

  const loadExisting = async () => {
    if (!firestore || !selectedCompId) return new Map<string, unknown>()
    const db = firestore
    if (!db) return new Map<string, unknown>()
    const snap = await getDocs(collection(db, `boulderComps/${selectedCompId}/athletes`))
    const map = new Map<string, unknown>()
    snap.forEach((docSnap) => {
      const data = docSnap.data() || {}
      const key = bibKey((data as { bib?: string }).bib || "")
      if (key) map.set(key, data)
    })
    return map
  }

  const renderStatus = () => {
    if (!selectedCompId) return "Select a competition to begin."
    if (locked) return `Competition locked (${compStatus || "locked"}). Import disabled.`
    return `Importing into: ${selectedCompId}${selectedCategoryId ? ` • Category ${selectedCategoryId}` : ""}`
  }

  const preview = async () => {
    if (!firestore) return
    if (locked) {
      setMessage({ text: "Competition is locked.", tone: "warn" })
      return
    }
    if (!selectedCompId) {
      setMessage({ text: "Select a competition first.", tone: "warn" })
      return
    }
    if (!selectedCategoryId) {
      setMessage({ text: "Select a category first.", tone: "warn" })
      return
    }
    const trimmed = rawText.trim()
    if (!trimmed) {
      setMessage({ text: "Paste CSV/TSV data or upload a file before previewing.", tone: "warn" })
      return
    }
    setLoading(true)
    try {
      const existing = await loadExisting()
      const rows = parseImportedData(trimmed, defaults)
      if (!rows.length) {
        setMessage({ text: "Nothing to preview.", tone: "warn" })
        setPreviewRows([])
        setPreviewSummary({ new: 0, updates: 0, skipped: 0 })
        return
      }
      const auto = autoDetailGenerator(defaults.detail || 1)
      let hydrated = rows.map((r) => hydrateRow(r, defaults, auto))

      if (defaults.cleanup) {
        hydrated = hydrated.filter((r) => !(r.issues.includes("Missing bib") && r.issues.includes("Missing name")))
      }

      const seen = new Map<string, PreviewRow>()
      hydrated.forEach((row) => {
        if (!row.bibKey || row.issues.length) return
        if (seen.has(row.bibKey)) {
          row.duplicate = true
          const first = seen.get(row.bibKey)
          if (first) first.duplicate = true
        } else {
          seen.set(row.bibKey, row)
        }
        row.exists = existing.has(row.bibKey)
        row.overwrite = row.exists && defaults.overwrite
      })

      setPreviewRows(hydrated)
      setPreviewSummary(summarize(hydrated))
      setMessage({ text: "Preview ready.", tone: "ok" })
    } catch (err) {
      console.error(err)
      setMessage({ text: "Failed to preview data.", tone: "warn" })
    } finally {
      setLoading(false)
    }
  }

  const ensureDetailDocuments = async (detailIds: (number | null)[]) => {
    if (!firestore || !selectedCompId || !selectedCategoryId) return
    const db = firestore
    if (!db) return
    const uniqueIds = Array.from(
      new Set(
        detailIds
          .map((id) => (id == null ? null : String(id).trim()))
          .filter((id): id is string => !!id)
      )
    )
    if (!uniqueIds.length) return
    const detailCol = collection(
      db,
      `boulderComps/${selectedCompId}/categories/${selectedCategoryId}/details`
    )
    const existingSnap = await getDocs(detailCol)
    const existingDocs = new Map(existingSnap.docs.map((docSnap) => [docSnap.id, docSnap.data() || {}]))
    const batch = writeBatch(firestore)
    let writes = 0
    uniqueIds.forEach((id) => {
      const numeric = Number(id)
      const detailRef = doc(detailCol, id)
      const existing = existingDocs.get(id) as { label?: string; order?: number; detailIndex?: number } | undefined
      const label = `Detail ${id}`
      const payload: Record<string, unknown> = {}
      if (!existing || existing.label !== label) payload.label = label
      if (!existing) payload.createdAt = serverTimestamp()
      if (Number.isFinite(numeric)) {
        if (!existing || existing.order !== numeric) payload.order = numeric
        if (!existing || existing.detailIndex !== numeric) payload.detailIndex = numeric
      }
      if (Object.keys(payload).length) {
        payload.updatedAt = serverTimestamp()
        batch.set(detailRef, payload, { merge: true })
        writes += 1
      }
    })
    if (writes) await batch.commit()
  }

  const runImport = async () => {
    if (!firestore) return
    if (locked) {
      setMessage({ text: "Competition is locked.", tone: "warn" })
      return
    }
    if (!selectedCompId || !selectedCategoryId) {
      setMessage({ text: "Select a competition and category first.", tone: "warn" })
      return
    }
    if (!previewRows.length) {
      setMessage({ text: "Preview first.", tone: "warn" })
      return
    }
    const toWrite = previewRows.filter((row) => {
      if (row.issues.length) return false
      if (row.duplicate) return false
      if (!row.bibKey) return false
      if (row.exists && !defaults.overwrite) return false
      return true
    })
    if (!toWrite.length) {
      setMessage({ text: "Nothing to import.", tone: "warn" })
      return
    }
    setImporting(true)
    try {
      const db = firestore
      if (!db) return
      const chunks: PreviewRow[][] = []
      for (let i = 0; i < toWrite.length; i += 400) chunks.push(toWrite.slice(i, i + 400))
      let processed = 0
      for (const chunk of chunks) {
        const batch = writeBatch(db)
        chunk.forEach((row) => {
          const docId = athleteDocIdFromBib(row.bib)
          if (!docId) return
          const ref = doc(db, "boulderComps", selectedCompId, "athletes", docId)
          batch.set(
            ref,
            {
              bib: row.bib,
              name: row.name,
              team: row.team || "",
              categoryId: row.categoryId || selectedCategoryId,
              detailIndex: row.detailIndex != null ? Number(row.detailIndex) : null,
              status: row.status || defaults.status || "ok",
              updatedAt: serverTimestamp(),
            },
            { merge: true }
          )
        })
        await batch.commit()
        processed += chunk.length
      }
      await ensureDetailDocuments(toWrite.map((r) => r.detailIndex))
      setMessage({ text: `Imported ${processed} athletes.`, tone: "ok" })
      setPreviewRows([])
      setPreviewSummary({ new: 0, updates: 0, skipped: 0 })
    } catch (err) {
      console.error(err)
      setMessage({ text: "Failed to import athletes.", tone: "warn" })
    } finally {
      setImporting(false)
    }
  }

  const selectedCompLabel = useMemo(() => {
    if (!selectedCompId) return ""
    const match = comps.find((c) => c.id === selectedCompId)
    return match?.name || selectedCompId
  }, [selectedCompId, comps])

  const previewCountsLabel = useMemo(() => {
    const { new: n, updates, skipped } = previewSummary
    if (!n && !updates && !skipped) return "—"
    return `${n} new • ${updates} updates • ${skipped} skipped`
  }, [previewSummary])

  return (
    <main className="py-6 min-h-screen bg-[#0b1220] text-gray-200">
      <Container>
        <div className="max-w-[1100px] mx-auto space-y-6">
          {/* Header - Consistent with Judge/Chief/Setup pages */}
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
              <span className="text-gray-400">Import Athletes</span>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-sm text-gray-400">
              <span className="truncate max-w-[240px]">
                {user?.emailAddresses[0]?.emailAddress || 'Signed in'}
              </span>
              <UserButton afterSignOutUrl="/" />
            </div>
          </header>
        <section className="bg-[#0e1730] border border-[#19bcd6] rounded-xl p-5">
          <div className="grid gap-4 md:grid-cols-[2fr,1fr] md:items-end">
            <label className="flex flex-col gap-2 text-sm">
              Competition
              <select
                className="px-3 py-2.5 bg-[#101a34] text-gray-200 border border-[#19bcd6] rounded-lg focus:outline-none focus:border-[#27a9e1]"
                value={selectedCompId}
                onChange={(e) => setSelectedCompId(e.target.value)}
                disabled={loading}
              >
                <option value="">{loading ? "Loading..." : "Select competition"}</option>
                {comps.map((comp) => (
                  <option key={comp.id} value={comp.id}>
                    {comp.name || comp.id}
                  </option>
                ))}
              </select>
            </label>
            <div className="text-sm text-gray-400">{renderStatus()}</div>
          </div>

          <div className="grid gap-4 md:grid-cols-[2fr,1fr] md:items-end mt-4">
            <label className="flex flex-col gap-2 text-sm">
              Category
              <select
                className="px-3 py-2.5 bg-[#101a34] text-gray-200 border border-[#19bcd6] rounded-lg focus:outline-none focus:border-[#27a9e1]"
                value={selectedCategoryId}
                onChange={(e) => setSelectedCategoryId(e.target.value)}
                disabled={!selectedCompId || locked || !categories.length}
              >
                <option value="">{selectedCompId ? "Select category" : "Select competition first"}</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name || cat.id}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex flex-wrap gap-3 text-xs text-gray-1000">
              <span>Default detail and status are applied when rows omit them.</span>
            </div>
          </div>
        </section>

        <section className="bg-[#0e1730] border border-[#19bcd6] rounded-xl p-5 space-y-4">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-2xl font-bold">Import data</h2>
              <p className="text-gray-400 text-sm">Upload CSV/TSV or paste rows below.</p>
            </div>
            <div className="text-sm text-gray-300">{fileStatus}</div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="flex flex-col gap-2 text-sm">
              Upload file (.csv, .tsv)
              <input
                type="file"
                accept=".csv,.tsv,.txt"
                onChange={(e) => handleFile(e.target.files?.[0] || null)}
                disabled={!selectedCategoryId || locked}
                className="px-3 py-2.5 bg-[#101a34] text-gray-200 border border-[#19bcd6] rounded-lg focus:outline-none focus:border-[#27a9e1]"
              />
              <span className="text-xs text-gray-1000">
                Excel files are not supported yet. Export as CSV before uploading.
              </span>
            </label>

            <label className="flex flex-col gap-2 text-sm">
              Paste CSV/TSV
              <textarea
                className="px-3 py-2.5 bg-[#101a34] text-gray-200 border border-[#19bcd6] rounded-lg focus:outline-none focus:border-[#27a9e1] min-h-[200px]"
                placeholder="Bib,Name,Team,Detail&#10;123,Climber A,Gym,1"
                value={rawText}
                onChange={(e) => setRawText(e.target.value)}
                disabled={!selectedCategoryId || locked}
              />
              <span className="text-xs text-gray-1000">
                Columns: Bib, Name, Team, Category, Detail, Status. Headers optional; defaults to Bib/Name/Team/Detail.
              </span>
            </label>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <label className="flex flex-col gap-2 text-sm">
              Default Detail #
              <input
                className="px-3 py-2.5 bg-[#101a34] text-gray-200 border border-[#19bcd6] rounded-lg focus:outline-none focus:border-[#27a9e1]"
                value={defaultDetail}
                onChange={(e) => setDefaultDetail(e.target.value)}
                disabled={!selectedCategoryId || locked}
              />
            </label>
            <label className="flex flex-col gap-2 text-sm">
              Default Status
              <select
                className="px-3 py-2.5 bg-[#101a34] text-gray-200 border border-[#19bcd6] rounded-lg focus:outline-none focus:border-[#27a9e1]"
                value={defaultStatus}
                onChange={(e) => setDefaultStatus(e.target.value)}
                disabled={!selectedCategoryId || locked}
              >
                {STATUS_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex flex-col gap-3 text-sm">
              <label className="inline-flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={cleanup}
                  onChange={(e) => setCleanup(e.target.checked)}
                  disabled={!selectedCategoryId || locked}
                />
                Trim blanks
              </label>
              <label className="inline-flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={overwrite}
                  onChange={(e) => setOverwrite(e.target.checked)}
                  disabled={!selectedCategoryId || locked}
                />
                Overwrite existing bibs
              </label>
              <label className="inline-flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={autoDetail}
                  onChange={(e) => setAutoDetail(e.target.checked)}
                  disabled={!selectedCategoryId || locked}
                />
                Auto increment detail if missing
              </label>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={preview}
              disabled={!selectedCategoryId || locked || loading}
              className="px-3 py-2.5 text-sm bg-[#27a9e1] border border-[#27a9e1] text-[#031726] rounded-lg hover:opacity-90 transition-opacity font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? "Loading…" : "Preview"}
            </button>
            <button
              type="button"
              onClick={runImport}
              disabled={!previewRows.length || locked || importing}
              className="px-3 py-2.5 text-sm border border-[#19bcd6] bg-[#101a34] text-gray-200 rounded-lg hover:bg-[#19bcd6]/10 transition font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {importing ? "Importing…" : "Import"}
            </button>
            <span
              className={`text-sm ${
                message.tone === "ok"
                  ? "text-emerald-400"
                  : message.tone === "warn"
                    ? "text-amber-300"
                    : "text-gray-300"
              }`}
            >
              {message.text}
            </span>
          </div>
        </section>

        <section className="bg-[#0e1730] border border-[#19bcd6] rounded-xl p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-xl font-semibold">Preview</h3>
              <p className="text-sm text-gray-400">{selectedCompLabel}</p>
            </div>
            <span className="text-sm text-gray-300">{previewCountsLabel}</span>
          </div>

          {!previewRows.length ? (
            <div className="mt-4 text-sm text-gray-1000">Nothing to preview yet.</div>
          ) : (
            <div className="mt-4 max-h-[420px] overflow-auto rounded-xl border border-neutral-800">
              <table className="min-w-full border-collapse text-sm">
                <thead className="bg-white/[0.04]">
                  <tr>
                    <th className="px-3 py-2 text-left font-semibold">#</th>
                    <th className="px-3 py-2 text-left font-semibold">Bib</th>
                    <th className="px-3 py-2 text-left font-semibold">Name</th>
                    <th className="px-3 py-2 text-left font-semibold">Team</th>
                    <th className="px-3 py-2 text-left font-semibold">Category</th>
                    <th className="px-3 py-2 text-left font-semibold">Detail</th>
                    <th className="px-3 py-2 text-left font-semibold">Status</th>
                    <th className="px-3 py-2 text-left font-semibold">Action</th>
                    <th className="px-3 py-2 text-left font-semibold">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {previewRows.map((row, idx) => {
                    const exists = !!row.exists
                    const hasIssues = row.issues.length > 0
                    const willUpdate = exists && row.overwrite
                    const willSkip = exists && !row.overwrite
                    const actionLabel = hasIssues
                      ? "Error"
                      : row.duplicate
                        ? "Duplicate"
                        : willUpdate
                          ? "Update"
                          : willSkip
                            ? "Skip"
                            : "Insert"
                    const statusClass = hasIssues
                      ? "text-rose-300"
                      : row.duplicate
                        ? "text-amber-300"
                        : willUpdate
                          ? "text-yellow-300"
                          : willSkip
                            ? "text-gray-300"
                            : "text-emerald-300"
                    const notes: string[] = [...row.issues]
                    if (row.duplicate) notes.push("Duplicate bib in import")
                    if (exists && !row.overwrite) notes.push("Exists (will skip)")
                    if (exists && row.overwrite) notes.push("Exists (will update)")
                    return (
                      <tr key={`${row.bib}-${row.index}`} className={idx % 2 === 1 ? "bg-white/[0.02]" : ""}>
                        <td className="px-3 py-2">{row.index}</td>
                        <td className="px-3 py-2 font-mono text-xs text-neutral-200">{row.bib || "—"}</td>
                        <td className="px-3 py-2 text-neutral-100">{row.name || "—"}</td>
                        <td className="px-3 py-2 text-gray-300">{row.team || "—"}</td>
                        <td className="px-3 py-2 text-gray-300">{row.categoryId || selectedCategoryId}</td>
                        <td className="px-3 py-2 text-gray-300">{row.detailIndex ?? "—"}</td>
                        <td className="px-3 py-2 text-gray-300">{row.status}</td>
                        <td className={`px-3 py-2 font-semibold ${statusClass}`}>{actionLabel}</td>
                        <td className="px-3 py-2 text-gray-400">{notes.join("; ") || "—"}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
        </div>
      </Container>
    </main>
  )
}
