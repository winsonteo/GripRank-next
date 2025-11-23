'use client'

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import Image from "next/image"
import { UserButton, useUser } from "@clerk/nextjs"
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  writeBatch,
  where,
} from "firebase/firestore"
import Container from "@/components/Container"
import AccessDenied from "@/components/AccessDenied"
import { useFirebaseAuth } from "@/hooks/useFirebaseAuth"
import { useUserRole } from "@/hooks/useUserRole"
import { firestore } from "@/lib/firebase/client"

type UserRole = "viewer" | "judge" | "staff" | "admin"

interface Competition {
  id: string
  name?: string
  status?: string
  eventDate?: unknown
  qualifierRouteCount?: number
  finalRouteCount?: number
  boulderCount?: number
  updatedAt?: { seconds?: number }
  judgePasscodeVersion?: string
  judgePasscodeUpdatedAt?: unknown
}

interface Category {
  id: string
  name?: string
  order?: number | null
}

interface RouteDoc {
  id: string
  label?: string
  order?: number | null
}

type RoutePhase = "qualifier" | "final"

const ROUTE_PHASE_CONFIG: Record<
  RoutePhase,
  { collection: string; idPrefix: string; labelPrefix: string }
> = {
  qualifier: { collection: "routes", idPrefix: "B", labelPrefix: "Boulder" },
  final: { collection: "finalRoutes", idPrefix: "F", labelPrefix: "Final Boulder" },
}

const staffOrAdmin = (role: UserRole | null) => role === "staff" || role === "admin"

export default function SetupPage() {
  const { isSignedIn, isLoaded } = useUser()
  const { isFirebaseAuthenticated, error: firebaseError } = useFirebaseAuth()
  const { role, loading: roleLoading } = useUserRole()

  const waitingForFirebaseAuth = isSignedIn && !isFirebaseAuthenticated && !firebaseError

  if (!isLoaded || waitingForFirebaseAuth || roleLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center text-lg">Loading...</div>
      </div>
    )
  }

  if (!isSignedIn) {
    return (
      <AccessDenied
        feature="Boulder Setup"
        message="Please sign in with your staff or admin account to access Boulder Setup."
      />
    )
  }

  if (!staffOrAdmin(role)) {
    return <AccessDenied feature="Boulder Setup (staff/admin only)" />
  }

  if (firebaseError) {
    return (
      <AccessDenied
        feature="Boulder Setup"
        message="We couldn't connect to Firebase. Please refresh or check your configuration."
      />
    )
  }

  return <SetupInterface />
}

function SetupInterface() {
  const { user } = useUser()

  const [toast, setToast] = useState<{ message: string; tone?: "info" | "ok" | "warn" } | null>(
    null
  )
  const [toastTimer, setToastTimer] = useState<NodeJS.Timeout | null>(null)

  const [comps, setComps] = useState<Competition[]>([])
  const [compsLoading, setCompsLoading] = useState(false)
  const [selectedCompId, setSelectedCompId] = useState("")
  const [selectedComp, setSelectedComp] = useState<Competition | null>(null)

  const [qualifierRouteCount, setQualifierRouteCount] = useState(0)
  const [finalRouteCount, setFinalRouteCount] = useState(0)

  const [categories, setCategories] = useState<Category[]>([])
  const [categoriesLoading, setCategoriesLoading] = useState(false)

  const [routePhase, setRoutePhase] = useState<RoutePhase>("qualifier")
  const [routeCategoryId, setRouteCategoryId] = useState("")
  const [routesByCategory, setRoutesByCategory] = useState<{
    qualifier: Record<string, RouteDoc[]>
    final: Record<string, RouteDoc[]>
  }>({ qualifier: {}, final: {} })
  const [routeRenameInputs, setRouteRenameInputs] = useState<Record<string, string>>({})
  const [routeRenameMsg, setRouteRenameMsg] = useState("")
  const [routeRenameSaving, setRouteRenameSaving] = useState(false)

  const [createName, setCreateName] = useState("")
  const [createId, setCreateId] = useState("")
  const [createDate, setCreateDate] = useState("")
  const [createCategories, setCreateCategories] = useState("")
  const [createQualCount, setCreateQualCount] = useState("6")
  const [createFinalCount, setCreateFinalCount] = useState("4")
  const [createMsg, setCreateMsg] = useState("")

  const [editName, setEditName] = useState("")
  const [editStatus, setEditStatus] = useState("draft")
  const [editDate, setEditDate] = useState("")
  const [editQualCount, setEditQualCount] = useState("")
  const [editFinalCount, setEditFinalCount] = useState("")
  const [editMsg, setEditMsg] = useState("")

  const [newCatId, setNewCatId] = useState("")
  const [newCatName, setNewCatName] = useState("")

  const [judgePasscodeInput, setJudgePasscodeInput] = useState("")
  const [judgePasscodeMsg, setJudgePasscodeMsg] = useState("")
  const [judgePasscodeSaving, setJudgePasscodeSaving] = useState(false)

  useEffect(() => {
    if (!firestore) return
    loadCompetitions().catch((err) => {
      console.error(err)
      showToast("Failed to load competitions.", "warn")
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    return () => {
      if (toastTimer) clearTimeout(toastTimer)
    }
  }, [toastTimer])

  const quickLinks = useMemo(() => {
    if (!selectedCompId) return null
    const encoded = encodeURIComponent(selectedCompId)
    return {
      admin: `/boulder/admin?comp=${encoded}`,
      leaderboard: `/boulder/leaderboard?compId=${encoded}`,
      import: `/boulder/import?comp=${encoded}`,
      judge: `/boulder/judge`,
    }
  }, [selectedCompId])

  const showToast = (message: string, tone: "info" | "ok" | "warn" = "info") => {
    if (toastTimer) clearTimeout(toastTimer)
    const timer = setTimeout(() => setToast(null), 2800)
    setToast({ message, tone })
    setToastTimer(timer)
  }

  const slugify = (value: string) =>
    (value || "")
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60)

  const categoryIdFrom = (value: string) =>
    (value || "")
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 64)

  const toTitle = (value: string) =>
    (value || "")
      .replace(/[_-]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/\b\w/g, (ch) => ch.toUpperCase())

  const parseCategoryLines = (raw: string) => {
    const lines = (raw || "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
    const seen = new Set<string>()
    const cats: { id: string; name: string }[] = []
    lines.forEach((line, idx) => {
      const parts = line.split("|")
      let idPart = ""
      let namePart = ""
      if (parts.length > 1) {
        idPart = parts.shift() || ""
        namePart = parts.join("|").trim()
      } else {
        idPart = line
        namePart = toTitle(line)
      }
      let id = categoryIdFrom(idPart) || `cat_${idx + 1}`
      if (seen.has(id)) {
        let counter = 2
        while (seen.has(`${id}_${counter}`)) counter += 1
        id = `${id}_${counter}`
      }
      seen.add(id)
      const name = namePart || toTitle(id)
      cats.push({ id, name })
    })
    return cats
  }

  const toInputDate = (value: unknown) => {
    if (!value) return ""
    const raw =
      typeof (value as { toDate?: () => Date }).toDate === "function"
        ? (value as { toDate: () => Date }).toDate()
        : new Date(value as string | number | Date)
    if (Number.isNaN(raw.getTime())) return ""
    const local = new Date(raw.getTime() - raw.getTimezoneOffset() * 60000)
    return local.toISOString().slice(0, 10)
  }

  const formatDisplayDate = useCallback((value: unknown) => {
    if (!value) return ""
    const raw =
      typeof (value as { toDate?: () => Date }).toDate === "function"
        ? (value as { toDate: () => Date }).toDate()
        : new Date(value as string | number | Date)
    if (Number.isNaN(raw.getTime())) return ""
    return raw.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })
  }, [])

  const formatDateTime = useCallback((value: unknown) => {
    if (!value) return ""
    const raw =
      typeof (value as { toDate?: () => Date }).toDate === "function"
        ? (value as { toDate: () => Date }).toDate()
        : new Date(value as string | number | Date)
    if (Number.isNaN(raw.getTime())) return ""
    return raw.toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })
  }, [])

  const dateFromInput = (value: string) => {
    if (!value) return null
    const [year, month, day] = value.split("-").map(Number)
    if (!year || !month || !day) return null
    return new Date(year, month - 1, day)
  }

  const ensureRoutesForCategory = async (
    compId: string,
    catId: string,
    count: number,
    phase: RoutePhase = "qualifier"
  ) => {
    const total = Number(count)
    if (!compId || !catId || !Number.isFinite(total) || total <= 0 || !firestore) return
    const config = ROUTE_PHASE_CONFIG[phase]
    const routesCol = collection(
      firestore!,
      `boulderComps/${compId}/categories/${catId}/${config.collection}`
    )
    const existingSnap = await getDocs(routesCol)
    const batch = writeBatch(firestore!)
    let hasWrites = false

    existingSnap.docs.forEach((routeSnap, index) => {
      const data = routeSnap.data() || {}
      const order = Number.isFinite(Number(data.order))
        ? Number(data.order)
        : parseInt(routeSnap.id.replace(/[^0-9]+/g, ""), 10) || index + 1
      if (order !== index + 1) {
        batch.set(routeSnap.ref, { order }, { merge: true })
        hasWrites = true
      }
    })

    for (let i = 1; i <= total; i += 1) {
      const routeId = `${config.idPrefix}${i}`
      const existing = existingSnap.docs.find((d) => d.id === routeId)
      if (existing) continue
      batch.set(
        doc(routesCol, routeId),
        {
          label: `${config.labelPrefix} ${i}`,
          order: i,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      )
      hasWrites = true
    }

    for (let i = total; i < existingSnap.size; i += 1) {
      const docRef = existingSnap.docs[i]?.ref
      if (docRef) {
        batch.delete(docRef)
        hasWrites = true
      }
    }

    if (hasWrites) {
      await batch.commit()
    }
  }

  const ensureRoutesForAllCategories = async (
    compId: string,
    catList: Category[],
    counts: { qualifier?: number; final?: number }
  ) => {
    const qualifier = Number(counts.qualifier)
    const final = Number(counts.final)
    for (const cat of catList) {
      if (Number.isFinite(qualifier) && qualifier > 0) {
        await ensureRoutesForCategory(compId, cat.id, qualifier, "qualifier")
      }
      if (Number.isFinite(final) && final > 0) {
        await ensureRoutesForCategory(compId, cat.id, final, "final")
      }
    }
  }

  const ensureDetailsFromAthletes = async (compId: string, catList: Category[]) => {
    if (!compId || !firestore || !catList.length) return
    for (const cat of catList) {
      const catId = cat.id
      try {
        const detailCol = collection(
          firestore!,
          `boulderComps/${compId}/categories/${catId}/details`
        )
        const existingSnap = await getDocs(detailCol)
        const existingDocs = new Map(existingSnap.docs.map((docSnap) => [docSnap.id, docSnap.data() || {}]))

        const athleteSnap = await getDocs(
          query(
            collection(firestore!, `boulderComps/${compId}/athletes`),
            where("categoryId", "==", catId)
          )
        )

        const detailValues = new Set<string>()
        existingDocs.forEach((_, id) => id && detailValues.add(String(id)))
        athleteSnap.forEach((snap) => {
          const data = snap.data() || {}
          const raw = data.detailIndex ?? data.detail ?? data.detailId
          if (raw == null) return
          const value = String(raw).trim()
          if (value) detailValues.add(value)
        })

        if (!detailValues.size) continue

        const batch = writeBatch(firestore!)
        let writes = 0
        detailValues.forEach((value) => {
          const numeric = Number(value)
          const existing = existingDocs.get(value)
          const payload: Record<string, unknown> = {}
          const label = `Detail ${value}`
          if (!existing || existing.label !== label) payload.label = label
          if (!existing) payload.createdAt = serverTimestamp()
          if (Number.isFinite(numeric)) {
            if (!existing || existing.order !== numeric) payload.order = numeric
            if (!existing || existing.detailIndex !== numeric) payload.detailIndex = numeric
          }
          if (Object.keys(payload).length) {
            payload.updatedAt = serverTimestamp()
            batch.set(doc(detailCol, value), payload, { merge: true })
            writes += 1
          }
        })
        if (writes) await batch.commit()
      } catch (err) {
        console.error(`Failed to ensure details for ${catId}`, err)
      }
    }
  }

  const loadCompetitions = async () => {
    if (!firestore) return
    setCompsLoading(true)
    try {
      const snap = await getDocs(collection(firestore, "boulderComps"))
      const list = snap.docs
        .map((d) => ({ ...(d.data() as Competition), id: d.id }))
        .sort((a, b) => (b.updatedAt?.seconds || 0) - (a.updatedAt?.seconds || 0))
      setComps(list)
    } catch (err) {
      console.error(err)
      setComps([])
      throw err
    } finally {
      setCompsLoading(false)
    }
  }

  const handleCreateCompetition = async () => {
    if (!firestore) return
    const name = createName.trim()
    if (!name) {
      showToast("Enter a competition name first.", "warn")
      return
    }
    let compId = createId.trim().toLowerCase()
    if (!compId) compId = slugify(name)
    if (!compId || !/^[a-z0-9-]+$/.test(compId)) {
      showToast("Competition ID should use lowercase letters, numbers, or dashes.", "warn")
      return
    }
    const qualCount = Number(createQualCount)
    const finalCount = Number(createFinalCount)
    if (!Number.isFinite(qualCount) || qualCount <= 0) {
      showToast("Enter the number of qualifier routes.", "warn")
      return
    }
    if (!Number.isFinite(finalCount) || finalCount <= 0) {
      showToast("Enter the number of final routes.", "warn")
      return
    }
    setCreateMsg("Creating…")
    try {
      const compRef = doc(firestore!, "boulderComps", compId)
      const existing = await getDoc(compRef)
      if (existing.exists()) {
        showToast("That competition ID already exists. Pick another.", "warn")
        setCreateMsg("")
        return
      }
      const eventDate = dateFromInput(createDate.trim())
      const now = serverTimestamp()
      await setDoc(compRef, {
        name,
        status: "draft",
        discipline: "boulder",
        eventDate: eventDate || null,
        boulderCount: qualCount,
        qualifierRouteCount: qualCount,
        finalRouteCount: finalCount,
        createdAt: now,
        updatedAt: now,
      })

      const cats = parseCategoryLines(createCategories)
      if (cats.length) {
        const batch = writeBatch(firestore!)
        cats.forEach((cat, index) => {
          const catRef = doc(firestore!, `boulderComps/${compId}/categories/${cat.id}`)
          batch.set(catRef, {
            name: cat.name,
            order: index,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          })
        })
        await batch.commit()
        await ensureRoutesForAllCategories(compId, cats, { qualifier: qualCount, final: finalCount })
      }

      showToast(`Created competition ${compId}`, "ok")
      setCreateMsg("")
      setCreateName("")
      setCreateId("")
      setCreateDate("")
      setCreateCategories("")
      setCreateQualCount(String(qualCount))
      setCreateFinalCount(String(finalCount))
      setSelectedCompId(compId)
      setQualifierRouteCount(qualCount)
      setFinalRouteCount(finalCount)
      await loadCompetitions()
      await loadCompetitionDetail(compId)
    } catch (err) {
      console.error(err)
      setCreateMsg("")
      showToast("Failed to create competition", "warn")
    }
  }

  const loadCompetitionDetail = async (compId: string) => {
    if (!compId || !firestore) return
    try {
      const compSnap = await getDoc(doc(firestore!, "boulderComps", compId))
      if (!compSnap.exists()) {
        showToast("Competition not found. It may have been deleted.", "warn")
        setSelectedComp(null)
        setSelectedCompId("")
        return
      }
      setJudgePasscodeMsg("")
      setJudgePasscodeInput("")
      const data = compSnap.data() as Competition
      setSelectedComp({ ...data, id: compId })
      const qual = Number(data.qualifierRouteCount ?? data.boulderCount) || 0
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const fin = Number(data.finalRouteCount ?? (data as any)?.finalBoulderCount) || 0
      setQualifierRouteCount(qual)
      setFinalRouteCount(fin)
      setEditName(data.name || "")
      setEditStatus(data.status || "draft")
      setEditDate(toInputDate(data.eventDate))
      setEditQualCount(qual ? String(qual) : "")
      setEditFinalCount(fin ? String(fin) : "")
      await loadCategories(compId, { qualifier: qual, final: fin })
    } catch (err) {
      console.error(err)
      showToast("Failed to load competition details.", "warn")
    }
  }

  const handleSaveSettings = async () => {
    if (!selectedCompId || !firestore) return
    setEditMsg("Saving…")
    try {
      const eventDate = dateFromInput(editDate.trim())
      const qual = Number(editQualCount)
      const final = Number(editFinalCount)
      const qualifier = Number.isFinite(qual) && qual > 0 ? Math.floor(qual) : qualifierRouteCount
      const finalRoutes = Number.isFinite(final) && final > 0 ? Math.floor(final) : finalRouteCount
      if (!qualifier) {
        showToast("Enter a positive number of qualifier routes.", "warn")
        setEditMsg("")
        return
      }
      if (!finalRoutes) {
        showToast("Enter a positive number of final routes.", "warn")
        setEditMsg("")
        return
      }
      await setDoc(
        doc(firestore!, "boulderComps", selectedCompId),
        {
          name: editName.trim(),
          status: editStatus,
          eventDate: eventDate || null,
          boulderCount: qualifier,
          qualifierRouteCount: qualifier,
          finalRouteCount: finalRoutes,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      )
      setSelectedComp(
        selectedComp
          ? {
              ...selectedComp,
              name: editName.trim(),
              status: editStatus,
              eventDate: eventDate || null,
              qualifierRouteCount: qualifier,
              finalRouteCount: finalRoutes,
              boulderCount: qualifier,
            }
          : null
      )
      setQualifierRouteCount(qualifier)
      setFinalRouteCount(finalRoutes)
      await ensureRoutesForAllCategories(selectedCompId, categories, {
        qualifier,
        final: finalRoutes,
      })
      setEditMsg("Saved")
      setTimeout(() => setEditMsg(""), 2000)
      showToast("Competition settings saved.", "ok")
    } catch (err) {
      console.error(err)
      setEditMsg("")
      showToast("Failed to save settings.", "warn")
    }
  }

  const handleUpdateJudgePasscode = async () => {
    if (!selectedCompId) {
      showToast("Pick a competition first.", "warn")
      return
    }
    const code = judgePasscodeInput.trim()
    if (!code) {
      setJudgePasscodeMsg("Enter a passcode to update.")
      setTimeout(() => setJudgePasscodeMsg(""), 2000)
      return
    }

    setJudgePasscodeSaving(true)
    setJudgePasscodeMsg("")
    try {
      const response = await fetch("/api/judge-passcode", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ compId: selectedCompId, passcode: code }),
      })
      const data = await response.json().catch(() => null)
      if (!response.ok) {
        throw new Error((data as { error?: string } | null)?.error || "Failed to update passcode.")
      }

      setJudgePasscodeInput("")
      setJudgePasscodeMsg("Passcode updated. New sessions last 6 hours.")
      showToast("Judge passcode updated.", "ok")
      await loadCompetitionDetail(selectedCompId)
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to update passcode."
      setJudgePasscodeMsg(message)
      showToast(message, "warn")
    } finally {
      setJudgePasscodeSaving(false)
    }
  }

  const loadCategories = async (
    compId: string,
    counts: { qualifier?: number; final?: number } = {}
  ) => {
    if (!firestore) return
    setCategoriesLoading(true)
    try {
      const snap = await getDocs(collection(firestore!, `boulderComps/${compId}/categories`))
      const cats = snap.docs.map((d) => {
        const data = d.data() || {}
        return {
          id: d.id,
          name: data.name || "",
          order: typeof data.order === "number" ? data.order : null,
        }
      })
      cats.sort((a, b) => {
        if (a.order != null && b.order != null) return a.order - b.order
        if (a.order != null) return -1
        if (b.order != null) return 1
        return (a.name || a.id).localeCompare(b.name || b.id)
      })
      setCategories(cats)
      setRoutesByCategory({ qualifier: {}, final: {} })
      if (routeCategoryId && !cats.find((c) => c.id === routeCategoryId)) {
        setRouteCategoryId("")
        setRouteRenameInputs({})
      }
      await ensureDetailsFromAthletes(compId, cats)
      if (cats.length && (counts.qualifier || counts.final)) {
        await ensureRoutesForAllCategories(compId, cats, counts)
      }
    } catch (err) {
      console.error(err)
      setCategories([])
      showToast("Unable to load categories.", "warn")
    } finally {
      setCategoriesLoading(false)
    }
  }

  const persistCategoryOrder = async (next: Category[]) => {
    if (!selectedCompId || !firestore) return
    try {
      const batch = writeBatch(firestore!)
      next.forEach((cat, index) => {
        batch.set(
          doc(firestore!, `boulderComps/${selectedCompId}/categories/${cat.id}`),
          { order: index, updatedAt: serverTimestamp() },
          { merge: true }
        )
      })
      await batch.commit()
      showToast("Category order updated.", "ok")
    } catch (err) {
      console.error(err)
      showToast("Failed to update order.", "warn")
    }
  }

  const handleMoveCategory = async (catId: string, direction: "up" | "down") => {
    const idx = categories.findIndex((c) => c.id === catId)
    if (idx === -1) return
    const swapWith = direction === "up" ? idx - 1 : idx + 1
    if (swapWith < 0 || swapWith >= categories.length) return
    const updated = [...categories]
    ;[updated[idx], updated[swapWith]] = [updated[swapWith], updated[idx]]
    setCategories(updated)
    await persistCategoryOrder(updated)
  }

  const handleSaveCategoryName = async (catId: string, name: string) => {
    if (!selectedCompId || !firestore) return
    try {
      await setDoc(
        doc(firestore!, `boulderComps/${selectedCompId}/categories/${catId}`),
        { name, updatedAt: serverTimestamp() },
        { merge: true }
      )
      setCategories((prev) => prev.map((cat) => (cat.id === catId ? { ...cat, name } : cat)))
      showToast("Category name saved.", "ok")
    } catch (err) {
      console.error(err)
      showToast("Failed to save category name.", "warn")
    }
  }

  const deleteDocsChunked = async (
    docs: { id: string }[],
    refFactory: (id: string) => ReturnType<typeof doc>
  ) => {
    if (!firestore || !docs.length) return
    for (let i = 0; i < docs.length; i += 400) {
      const batch = writeBatch(firestore!)
      docs.slice(i, i + 400).forEach((d) => batch.delete(refFactory(d.id)))
      await batch.commit()
    }
  }

  const handleDeleteCategory = async (catId: string) => {
    if (!selectedCompId || !firestore) return
    const cat = categories.find((c) => c.id === catId)
    const label = cat?.name ? `${cat.name} (${cat.id})` : catId
    if (
      typeof window !== "undefined" &&
      !window.confirm(`Delete category ${label}? Its routes and detail groups will be removed.`)
    ) {
      return
    }
    try {
      const routesSnap = await getDocs(
        collection(firestore!, "boulderComps", selectedCompId, "categories", catId, "routes")
      )
      const detailsSnap = await getDocs(
        collection(firestore!, "boulderComps", selectedCompId, "categories", catId, "details")
      )
      await deleteDocsChunked(routesSnap.docs, (id) =>
        doc(firestore!, "boulderComps", selectedCompId, "categories", catId, "routes", id)
      )
      await deleteDocsChunked(detailsSnap.docs, (id) =>
        doc(firestore!, "boulderComps", selectedCompId, "categories", catId, "details", id)
      )
      await deleteDoc(doc(firestore!, "boulderComps", selectedCompId, "categories", catId))
      setCategories((prev) => prev.filter((c) => c.id !== catId))
      setRoutesByCategory((prev) => ({
        qualifier: Object.fromEntries(
          Object.entries(prev.qualifier).filter(([key]) => key !== catId)
        ),
        final: Object.fromEntries(Object.entries(prev.final).filter(([key]) => key !== catId)),
      }))
      if (routeCategoryId === catId) {
        setRouteCategoryId("")
        setRouteRenameInputs({})
      }
      await loadCategories(selectedCompId, {
        qualifier: qualifierRouteCount,
        final: finalRouteCount,
      })
      showToast(`Deleted category ${label}`, "ok")
    } catch (err) {
      console.error(err)
      showToast("Failed to delete category.", "warn")
    }
  }

  const handleAddCategory = async () => {
    if (!selectedCompId || !firestore) {
      showToast("Pick a competition first.", "warn")
      return
    }
    const rawId = newCatId.trim()
    const rawName = newCatName.trim()
    const catId = rawId ? categoryIdFrom(rawId) : categoryIdFrom(rawName)
    if (!catId) {
      showToast("Enter an ID or name for the category.", "warn")
      return
    }
    const name = rawName || toTitle(catId)
    try {
      await setDoc(
        doc(firestore!, `boulderComps/${selectedCompId}/categories/${catId}`),
        {
          name,
          order: categories.length,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      )
      setNewCatId("")
      setNewCatName("")
      if (qualifierRouteCount > 0) {
        await ensureRoutesForCategory(selectedCompId, catId, qualifierRouteCount, "qualifier")
      }
      if (finalRouteCount > 0) {
        await ensureRoutesForCategory(selectedCompId, catId, finalRouteCount, "final")
      }
      await loadCategories(selectedCompId, {
        qualifier: qualifierRouteCount,
        final: finalRouteCount,
      })
      showToast("Category added.", "ok")
    } catch (err) {
      console.error(err)
      showToast("Failed to add category.", "warn")
    }
  }

  const loadRoutesForRename = async (catId: string, phase: RoutePhase = routePhase) => {
    if (!firestore || !selectedCompId) return
    const normalizedPhase: RoutePhase = phase === "final" ? "final" : "qualifier"
    setRouteCategoryId(catId)
    setRoutePhase(normalizedPhase)
    if (!catId) {
      setRouteRenameInputs({})
      return
    }
    const phaseConfig = ROUTE_PHASE_CONFIG[normalizedPhase]
    try {
      const snap = await getDocs(
        collection(
          firestore,
          `boulderComps/${selectedCompId}/categories/${catId}/${phaseConfig.collection}`
        )
      )
      const routes = snap.docs
        .map((docSnap) => {
          const data = docSnap.data() || {}
          return {
            id: docSnap.id,
            label: data.label || "",
            order: typeof data.order === "number" ? data.order : null,
          }
        })
        .sort((a, b) => {
          if (a.order != null && b.order != null && a.order !== b.order) return a.order - b.order
          return a.id.localeCompare(b.id, undefined, { numeric: true, sensitivity: "base" })
        })
      setRoutesByCategory((prev) => ({
        ...prev,
        [normalizedPhase]: { ...prev[normalizedPhase], [catId]: routes },
      }))
      setRouteRenameInputs({})
    } catch (err) {
      console.error(err)
      showToast("Failed to load routes for renaming.", "warn")
    }
  }

  const handleSaveRouteRename = async () => {
    if (!selectedCompId || !routeCategoryId || !firestore) return
    const updates = Object.entries(routeRenameInputs)
      .map(([id, value]) => ({ id, value: value.trim() }))
      .filter((entry) => entry.id && entry.value)
    if (!updates.length) {
      setRouteRenameMsg("Enter a new name before saving.")
      setTimeout(() => setRouteRenameMsg(""), 2000)
      return
    }
    setRouteRenameSaving(true)
    setRouteRenameMsg("Saving…")
    try {
      const batch = writeBatch(firestore!)
      const phaseConfig = ROUTE_PHASE_CONFIG[routePhase]
      updates.forEach(({ id, value }) => {
        const routeRef = doc(
          firestore!,
          `boulderComps/${selectedCompId}/categories/${routeCategoryId}/${phaseConfig.collection}/${id}`
        )
        batch.set(
          routeRef,
          {
            label: value,
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        )
      })
      await batch.commit()
      setRoutesByCategory((prev) => {
        const current = prev[routePhase][routeCategoryId] || []
        const updatedRoutes = current.map((route) => {
          const match = updates.find((u) => u.id === route.id)
          return match ? { ...route, label: match.value } : route
        })
        return {
          ...prev,
          [routePhase]: { ...prev[routePhase], [routeCategoryId]: updatedRoutes },
        }
      })
      setRouteRenameInputs({})
      setRouteRenameMsg("Saved")
      setTimeout(() => setRouteRenameMsg(""), 2000)
      showToast(`Updated ${updates.length} route${updates.length === 1 ? "" : "s"}.`, "ok")
    } catch (err) {
      console.error(err)
      setRouteRenameMsg("")
      showToast("Failed to save route names.", "warn")
    } finally {
      setRouteRenameSaving(false)
    }
  }

  const routeHasChanges = useMemo(
    () => Object.values(routeRenameInputs).some((value) => value.trim().length > 0),
    [routeRenameInputs]
  )

  const compSummary = useMemo(() => {
    if (!selectedComp) return null
    const pieces = []
    pieces.push(
      <span key="name" className="font-semibold text-foreground">
        {selectedComp.name || selectedComp.id}
      </span>
    )
    pieces.push(
      <span key="id" className="rounded-full bg-input px-2 py-1 text-xs text-muted-foreground">
        {selectedComp.id}
      </span>
    )
    if (selectedComp.status) {
      pieces.push(
        <span
          key="status"
          className="rounded-full bg-input px-2 py-1 text-xs text-muted-foreground capitalize"
        >
          {selectedComp.status}
        </span>
      )
    }
    if (selectedComp.eventDate) {
      pieces.push(
        <span key="date" className="text-muted-foreground text-sm">
          Event: {formatDisplayDate(selectedComp.eventDate)}
        </span>
      )
    }
    if (categories.length) {
      pieces.push(
        <span key="catCount" className="text-muted-foreground text-sm">
          Categories: {categories.length}
        </span>
      )
    }
    if (qualifierRouteCount) {
      pieces.push(
        <span key="qualCount" className="text-muted-foreground text-sm">
          Qualifier routes: {qualifierRouteCount}
        </span>
      )
    }
    if (finalRouteCount) {
      pieces.push(
        <span key="finalCount" className="text-muted-foreground text-sm">
          Final routes: {finalRouteCount}
        </span>
      )
    }
    return pieces
  }, [selectedComp, categories.length, qualifierRouteCount, finalRouteCount, formatDisplayDate])

  const routesForSelected = routesByCategory[routePhase][routeCategoryId] || []
  const selectedPhaseConfig = ROUTE_PHASE_CONFIG[routePhase]

  return (
    <main className="py-6 min-h-screen bg-[#0b1220] text-gray-200">
      <Container>
        <div className="max-w-[1100px] mx-auto space-y-6">
          {/* Header - Consistent with Judge/Chief pages */}
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
              <span className="text-gray-400">Boulder Setup</span>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-sm text-gray-400">
              <span className="truncate max-w-[240px]">
                {user?.emailAddresses[0]?.emailAddress || 'Signed in'}
              </span>
              <UserButton afterSignOutUrl="/" />
            </div>
          </header>

          {/* Toast notification */}
          {toast && (
            <div className="fixed bottom-6 right-6 z-20">
              <div
                className={`rounded-xl px-4 py-3 shadow-lg ${
                  toast.tone === "ok"
                    ? "bg-green-100 text-green-900 border border-green-200"
                    : toast.tone === "warn"
                      ? "bg-yellow-100 text-yellow-900 border border-yellow-200"
                      : "bg-[#0e1730] text-gray-100 border border-[#19bcd6]"
                }`}
              >
                {toast.message}
              </div>
            </div>
          )}

          {/* Create competition */}
          <section className="bg-[#0e1730] border border-[#19bcd6] rounded-xl p-5">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-2xl font-bold text-gray-100">Create Boulder Competition</h2>
              <p className="text-gray-400 text-sm">Spin up a new boulder comp in a single step.</p>
            </div>
            {createMsg && <p className="text-sm text-gray-300">{createMsg}</p>}
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-3">
            <label className="flex flex-col gap-2 text-sm text-gray-400">
              Competition Name
              <input
                className="px-3 py-2.5 bg-[#101a34] text-gray-200 border border-[#19bcd6] rounded-lg focus:outline-none focus:border-[#27a9e1]"
                placeholder="My Boulder Open"
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
              />
            </label>
            <label className="flex flex-col gap-2 text-sm text-gray-400">
              Competition ID (optional)
              <input
                className="px-3 py-2.5 bg-[#101a34] text-gray-200 border border-[#19bcd6] rounded-lg focus:outline-none focus:border-[#27a9e1]"
                placeholder="my-boulder-open"
                value={createId}
                onChange={(e) => setCreateId(e.target.value)}
              />
            </label>
            <label className="flex flex-col gap-2 text-sm text-gray-400">
              Event Date
              <input
                type="date"
                className="px-3 py-2.5 bg-[#101a34] text-gray-200 border border-[#19bcd6] rounded-lg focus:outline-none focus:border-[#27a9e1]"
                value={createDate}
                onChange={(e) => setCreateDate(e.target.value)}
              />
            </label>
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <label className="flex flex-col gap-2 text-sm text-gray-400">
              Qualifier Routes
              <input
                type="number"
                min="1"
                className="px-3 py-2.5 bg-[#101a34] text-gray-200 border border-[#19bcd6] rounded-lg focus:outline-none focus:border-[#27a9e1]"
                value={createQualCount}
                onChange={(e) => setCreateQualCount(e.target.value)}
              />
            </label>
            <label className="flex flex-col gap-2 text-sm text-gray-400">
              Final Routes
              <input
                type="number"
                min="1"
                className="px-3 py-2.5 bg-[#101a34] text-gray-200 border border-[#19bcd6] rounded-lg focus:outline-none focus:border-[#27a9e1]"
                value={createFinalCount}
                onChange={(e) => setCreateFinalCount(e.target.value)}
              />
            </label>
          </div>

          <label className="mt-4 flex flex-col gap-2 text-sm text-gray-400">
            Initial Categories (optional)
            <textarea
              className="px-3 py-2.5 bg-[#101a34] text-gray-200 border border-[#19bcd6] rounded-lg focus:outline-none focus:border-[#27a9e1] min-h-[120px]"
              placeholder="youthB_girls | Youth B Girls&#10;youthB_boys | Youth B Boys"
              value={createCategories}
              onChange={(e) => setCreateCategories(e.target.value)}
            />
          </label>
          <p className="text-xs text-gray-500">
            Format: <code>id | display name</code>. If you omit the id we&apos;ll slug the name for you.
          </p>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={handleCreateCompetition}
              className="px-3 py-2.5 text-sm bg-[#27a9e1] border border-[#27a9e1] text-[#031726] rounded-lg hover:opacity-90 transition-opacity font-semibold"
            >
              Create Competition
            </button>
            {createMsg && <span className="text-sm text-gray-300">{createMsg}</span>}
          </div>
        </section>

        {/* Manage existing competition */}
        <section className="space-y-6 bg-[#0e1730] border border-[#19bcd6] rounded-xl p-5">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-2xl font-bold text-gray-100">Manage Existing Competition</h2>
              <p className="text-gray-400 text-sm">
                Adjust competition metadata, categories, and quick links.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() =>
                  loadCompetitions().then(() => {
                    if (selectedCompId) loadCompetitionDetail(selectedCompId)
                  })
                }
                className="rounded-lg border border-[#19bcd6] bg-[#101a34] px-3 py-2 text-sm text-gray-200 hover:bg-[#19bcd6]/10"
              >
                Reload
              </button>
              {quickLinks && (
                <>
                  <Link
                    href={quickLinks.admin}
                    className="rounded-lg border border-border bg-input px-3 py-2 text-sm text-foreground hover:bg-input/80"
                    target="_blank"
                  >
                    Admin
                  </Link>
                  <Link
                    href={quickLinks.leaderboard}
                    className="rounded-lg border border-border bg-input px-3 py-2 text-sm text-foreground hover:bg-input/80"
                    target="_blank"
                  >
                    Leaderboard
                  </Link>
                  <Link
                    href={quickLinks.import}
                    className="rounded-lg border border-border bg-input px-3 py-2 text-sm text-foreground hover:bg-input/80"
                    target="_blank"
                  >
                    Import
                  </Link>
                  <Link
                    href={quickLinks.judge}
                    className="rounded-lg border border-border bg-input px-3 py-2 text-sm text-foreground hover:bg-input/80"
                    target="_blank"
                  >
                    Judge Pad
                  </Link>
                </>
              )}
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-[2fr,1fr] md:items-end">
            <label className="flex flex-col gap-2 text-sm">
              Competition
              <select
                className="px-3 py-2.5 bg-[#101a34] text-gray-200 border border-[#19bcd6] rounded-lg focus:outline-none focus:border-[#27a9e1]"
                value={selectedCompId}
                onChange={(e) => {
                  const compId = e.target.value
                  setSelectedCompId(compId)
                  setSelectedComp(null)
                  setCategories([])
                  setRoutesByCategory({ qualifier: {}, final: {} })
                  setRouteCategoryId("")
                  setRouteRenameInputs({})
                  if (compId) {
                    loadCompetitionDetail(compId)
                  }
                }}
                disabled={compsLoading}
              >
                <option value="">{compsLoading ? "Loading..." : "Select competition"}</option>
                {comps.map((comp) => (
                  <option key={comp.id} value={comp.id}>
                    {comp.name || comp.id}
                  </option>
                ))}
              </select>
            </label>
            {selectedComp ? (
              <div className="flex flex-wrap gap-2 text-sm text-gray-300">{compSummary}</div>
            ) : (
              <div className="text-sm text-gray-500">Select a competition to view details.</div>
            )}
          </div>

          {selectedComp && (
            <div className="space-y-8">
              <div className="grid gap-4 md:grid-cols-3">
                <label className="flex flex-col gap-2 text-sm">
                  Name
                  <input
                    className="px-3 py-2.5 bg-[#101a34] text-gray-200 border border-[#19bcd6] rounded-lg focus:outline-none focus:border-[#27a9e1]"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                  />
                </label>
                <label className="flex flex-col gap-2 text-sm">
                  Status
                  <select
                    className="px-3 py-2.5 bg-[#101a34] text-gray-200 border border-[#19bcd6] rounded-lg focus:outline-none focus:border-[#27a9e1]"
                    value={editStatus}
                    onChange={(e) => setEditStatus(e.target.value)}
                  >
                    <option value="draft">draft</option>
                    <option value="live">live</option>
                    <option value="locked">locked</option>
                    <option value="archived">archived</option>
                  </select>
                </label>
                <label className="flex flex-col gap-2 text-sm">
                  Event Date
                  <input
                    type="date"
                    className="px-3 py-2.5 bg-[#101a34] text-gray-200 border border-[#19bcd6] rounded-lg focus:outline-none focus:border-[#27a9e1]"
                    value={editDate}
                    onChange={(e) => setEditDate(e.target.value)}
                  />
                </label>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <label className="flex flex-col gap-2 text-sm">
                  Qualifier Routes
                  <input
                    type="number"
                    min="1"
                    className="px-3 py-2.5 bg-[#101a34] text-gray-200 border border-[#19bcd6] rounded-lg focus:outline-none focus:border-[#27a9e1]"
                    value={editQualCount}
                    onChange={(e) => setEditQualCount(e.target.value)}
                  />
                </label>
                <label className="flex flex-col gap-2 text-sm">
                  Final Routes
                  <input
                    type="number"
                    min="1"
                    className="px-3 py-2.5 bg-[#101a34] text-gray-200 border border-[#19bcd6] rounded-lg focus:outline-none focus:border-[#27a9e1]"
                    value={editFinalCount}
                    onChange={(e) => setEditFinalCount(e.target.value)}
                  />
                </label>
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={handleSaveSettings}
                  className="px-3 py-2.5 text-sm bg-[#27a9e1] border border-[#27a9e1] text-[#031726] rounded-lg hover:opacity-90 transition-opacity font-semibold"
                >
                  Save Competition Settings
                </button>
                {editMsg && <span className="text-sm text-gray-300">{editMsg}</span>}
              </div>

              <div className="space-y-3 rounded-2xl border border-border bg-panel/60 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="text-xl font-semibold">Judge passcode</h3>
                    <p className="text-sm text-gray-400">
                      Judges sign in with this code. Sessions last 6 hours and old codes expire when you
                      update it.
                    </p>
                  </div>
                  <div className="text-xs text-gray-400">
                    {selectedComp.judgePasscodeUpdatedAt
                      ? `Last set ${formatDateTime(selectedComp.judgePasscodeUpdatedAt)}`
                      : "Not set yet"}
                  </div>
                </div>
                <div className="grid gap-3 md:grid-cols-[minmax(0,1fr),auto] md:items-end">
                  <label className="flex flex-col gap-2 text-sm text-gray-400">
                    New passcode
                    <input
                      type="password"
                      className="w-full rounded-lg border border-border bg-input px-3 py-2 text-sm text-foreground focus:border-ring focus:outline-none"
                      placeholder="Enter a code judges will type"
                      value={judgePasscodeInput}
                      onChange={(e) => setJudgePasscodeInput(e.target.value)}
                    />
                  </label>
                  <button
                    type="button"
                    onClick={handleUpdateJudgePasscode}
                    disabled={judgePasscodeSaving}
                    className="h-[42px] min-w-[160px] rounded-lg border border-[#27a9e1] bg-[#27a9e1] px-4 text-sm font-semibold text-[#031726] transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {judgePasscodeSaving ? "Saving…" : "Save passcode"}
                  </button>
                </div>
                {judgePasscodeMsg && <div className="text-sm text-gray-300">{judgePasscodeMsg}</div>}
                <p className="text-xs text-gray-500">
                  Share this code with judges for the selected competition. They can reuse the same code, and
                  their access ends after 6 hours or when you change it here.
                </p>
              </div>

              <hr className="border-[#19bcd6]/30" />

              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-xl font-semibold">Categories</h3>
                  <p className="text-xs text-gray-500">
                    Use the move buttons to reorder categories. That order flows through start lists and displays.
                  </p>
                </div>
                <div className="flex flex-col gap-3">
                  {categoriesLoading ? (
                    <div className="text-sm text-gray-400">Loading categories…</div>
                  ) : !categories.length ? (
                    <div className="text-sm text-gray-500">No categories yet. Add one below.</div>
                  ) : (
                    categories.map((cat, index) => (
                      <div
                        key={cat.id}
                        className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-input/30 px-4 py-3"
                      >
                        <div className="flex flex-wrap items-center gap-3">
                          <span className="rounded-full bg-input px-2 py-1 text-xs text-muted-foreground">
                            #{index + 1}
                          </span>
                          <span className="rounded-full bg-input px-2 py-1 text-xs text-muted-foreground">
                            {cat.id}
                          </span>
                          <input
                            className="min-w-[180px] max-w-[260px] rounded-lg border border-border bg-input px-3 py-2 text-sm text-foreground focus:border-ring focus:outline-none"
                            value={cat.name || ""}
                            onChange={(e) =>
                              setCategories((prev) =>
                                prev.map((c) => (c.id === cat.id ? { ...c, name: e.target.value } : c))
                              )
                            }
                          />
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            className="rounded-lg border border-border bg-input px-3 py-2 text-xs font-medium hover:bg-input/80 disabled:opacity-50"
                            onClick={() => handleSaveCategoryName(cat.id, cat.name || "")}
                          >
                            Save Name
                          </button>
                          <button
                            type="button"
                            className="rounded-lg border border-border bg-input px-3 py-2 text-xs font-medium hover:bg-input/80 disabled:opacity-50"
                            onClick={() => handleMoveCategory(cat.id, "up")}
                            disabled={index === 0}
                          >
                            Move Up
                          </button>
                          <button
                            type="button"
                            className="rounded-lg border border-border bg-input px-3 py-2 text-xs font-medium hover:bg-input/80 disabled:opacity-50"
                            onClick={() => handleMoveCategory(cat.id, "down")}
                            disabled={index === categories.length - 1}
                          >
                            Move Down
                          </button>
                          <button
                            type="button"
                            className="rounded-lg border border-red-500 bg-red-500/10 px-3 py-2 text-xs font-medium text-red-200 hover:bg-red-500/20"
                            onClick={() => handleDeleteCategory(cat.id)}
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
                <div className="grid gap-4 md:grid-cols-3">
                  <label className="flex flex-col gap-2 text-sm">
                    Category ID
                    <input
                      className="px-3 py-2.5 bg-[#101a34] text-gray-200 border border-[#19bcd6] rounded-lg focus:outline-none focus:border-[#27a9e1]"
                      placeholder="youthB_girls"
                      value={newCatId}
                      onChange={(e) => setNewCatId(e.target.value)}
                    />
                  </label>
                  <label className="flex flex-col gap-2 text-sm">
                    Display Name
                    <input
                      className="px-3 py-2.5 bg-[#101a34] text-gray-200 border border-[#19bcd6] rounded-lg focus:outline-none focus:border-[#27a9e1]"
                      placeholder="Youth B Girls"
                      value={newCatName}
                      onChange={(e) => setNewCatName(e.target.value)}
                    />
                  </label>
                  <div className="flex items-end">
                    <button
                      type="button"
                      onClick={handleAddCategory}
                      className="w-full rounded-xl border border-border bg-input px-4 py-3 text-sm font-semibold text-foreground transition hover:bg-input/80"
                    >
                      Add Category
                    </button>
                  </div>
                </div>
              </div>

              <hr className="border-[#19bcd6]/30" />

              <div className="space-y-4 rounded-2xl border border-border bg-panel/60 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="text-xl font-semibold">Route Display Names</h3>
                    <p className="text-sm text-gray-400">
                      Customize route names for judges and scoreboards.
                    </p>
                  </div>
                  {routeRenameMsg && <span className="text-sm text-gray-300">{routeRenameMsg}</span>}
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <label className="flex flex-col gap-2 text-sm">
                    Category
                    <select
                      className="px-3 py-2.5 bg-[#101a34] text-gray-200 border border-[#19bcd6] rounded-lg focus:outline-none focus:border-[#27a9e1]"
                      value={routeCategoryId}
                      onChange={(e) => loadRoutesForRename(e.target.value, routePhase)}
                    >
                      <option value="">Select category</option>
                      {categories.map((cat) => (
                        <option key={cat.id} value={cat.id}>
                          {cat.name || cat.id}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex flex-col gap-2 text-sm">
                    Phase
                    <select
                      className="px-3 py-2.5 bg-[#101a34] text-gray-200 border border-[#19bcd6] rounded-lg focus:outline-none focus:border-[#27a9e1]"
                      value={routePhase}
                      onChange={(e) => {
                        const value = e.target.value === "final" ? "final" : "qualifier"
                        setRoutePhase(value)
                        if (routeCategoryId) loadRoutesForRename(routeCategoryId, value)
                      }}
                    >
                      <option value="qualifier">Qualifier</option>
                      <option value="final">Final</option>
                    </select>
                  </label>
                </div>

                {!routeCategoryId ? (
                  <div className="text-sm text-muted-foreground">
                    Select a category to rename routes.
                  </div>
                ) : !routesForSelected.length ? (
                  <div className="text-sm text-muted-foreground">
                    No routes found. Adjust route counts to generate routes.
                  </div>
                ) : (
                  <div className="overflow-x-auto rounded-xl border border-border bg-input/30">
                    <table className="min-w-full divide-y divide-border text-sm">
                      <thead className="bg-panel">
                        <tr>
                          <th className="px-3 py-2 text-left font-semibold text-foreground/80 w-24">
                            Route ID
                          </th>
                          <th className="px-3 py-2 text-left font-semibold text-foreground/80 w-64">
                            Current name
                          </th>
                          <th className="px-3 py-2 text-left font-semibold text-foreground/80">
                            New name
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {routesForSelected.map((route) => {
                          const sequence = route.id.replace(/[^0-9]+/g, "") || route.id
                          const defaultLabel = `${selectedPhaseConfig.labelPrefix} ${sequence}`.trim()
                          const display = route.label || defaultLabel
                          return (
                            <tr key={route.id} className="bg-input/20">
                              <td className="px-3 py-2 font-mono text-xs text-muted-foreground">
                                {route.id}
                              </td>
                              <td className="px-3 py-2">{display}</td>
                              <td className="px-3 py-2">
                                <input
                                  data-route-id={route.id}
                                  className="w-full rounded-lg border border-border bg-input px-3 py-2 text-sm text-foreground focus:border-ring focus:outline-none"
                                  placeholder="Leave blank to keep current"
                                  value={routeRenameInputs[route.id] || ""}
                                  onChange={(e) =>
                                    setRouteRenameInputs((prev) => ({
                                      ...prev,
                                      [route.id]: e.target.value,
                                    }))
                                  }
                                />
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={handleSaveRouteRename}
                    disabled={!routeHasChanges || routeRenameSaving}
                    className="px-3 py-2.5 text-sm bg-[#27a9e1] border border-[#27a9e1] text-[#031726] rounded-lg hover:opacity-90 transition-opacity font-semibold disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {routeRenameSaving ? "Saving…" : "Save Route Names"}
                  </button>
                  {routeRenameMsg && <span className="text-sm text-gray-300">{routeRenameMsg}</span>}
                  {routeCategoryId && !!routesForSelected.length && (
                    <span className="text-xs text-gray-500">
                      {routesForSelected.length} {selectedPhaseConfig.labelPrefix.toLowerCase()}
                      {routesForSelected.length === 1 ? "" : "s"} available.
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}
        </section>
        </div>
      </Container>
    </main>
  )
}
