import crypto from "crypto"
import { auth as clerkAuth } from "@clerk/nextjs/server"
import { FieldValue } from "firebase-admin/firestore"
import { NextResponse } from "next/server"
import { getAdminAuth, getAdminDb } from "@/lib/firebase/admin"

const SESSION_DURATION_MS = 6 * 60 * 60 * 1000

type JudgePasscodeDoc = {
  judgePasscodeHash?: string
  judgePasscodeVersion?: string
}

const ROLE_STAFF_OR_ADMIN = ["staff", "admin"]

const hashPasscode = (passcode: string) =>
  crypto.createHash("sha256").update(passcode).digest("hex")

const buildJudgeUid = (compId: string) => {
  const sessionId = crypto.randomBytes(8).toString("hex")
  const base = `judge-${compId}-${sessionId}`
  return base.length > 120 ? base.slice(0, 120) : base
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}))
    const { compId, passcode, discipline } = body as { compId?: string; passcode?: string; discipline?: string }

    if (!compId || !passcode) {
      return NextResponse.json(
        { error: "Competition ID and passcode are required" },
        { status: 400 }
      )
    }

    const adminDb = getAdminDb()
    const collectionName = discipline === "speed" ? "speedCompetitions" : "boulderComps"
    const compRef = adminDb.collection(collectionName).doc(compId)

    const [compSnap, passcodeSnap] = await Promise.all([
      compRef.get(),
      compRef.collection("private").doc("judgePasscode").get(),
    ])

    const genericError = () =>
      NextResponse.json({ error: "Invalid competition or passcode." }, { status: 401 })

    if (!compSnap.exists) {
      return genericError()
    }

    const compData = compSnap.data() || {}
    const passcodeData = (passcodeSnap.data() || {}) as JudgePasscodeDoc
    const storedHash = passcodeData.judgePasscodeHash
    const passcodeVersion = compData.judgePasscodeVersion || passcodeData.judgePasscodeVersion

    if (!storedHash || !passcodeVersion) {
      return genericError()
    }

    const incomingHash = hashPasscode(passcode)
    if (incomingHash !== storedHash) {
      return genericError()
    }

    const expiresAt = Date.now() + SESSION_DURATION_MS
    const customToken = await getAdminAuth().createCustomToken(buildJudgeUid(compId), {
      role: "judge",
      authType: "judge-passcode",
      compId,
      passcodeVersion,
      sessionExpiresAt: expiresAt,
    })

    return NextResponse.json({
      token: customToken,
      compId,
      passcodeVersion,
      sessionExpiresAt: expiresAt,
      sessionDurationMs: SESSION_DURATION_MS,
      discipline: collectionName === "speedCompetitions" ? "speed" : "boulder",
    })
  } catch (error) {
    console.error("[Judge Passcode] POST error:", error)
    return NextResponse.json({ error: "Internal error" }, { status: 500 })
  }
}

export async function PUT(req: Request) {
  try {
    const { userId } = await clerkAuth()
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await req.json().catch(() => ({}))
    const { compId, passcode, discipline } = body as { compId?: string; passcode?: string; discipline?: string }

    if (!compId || !passcode) {
      return NextResponse.json(
        { error: "Competition ID and passcode are required" },
        { status: 400 }
      )
    }

    if (passcode.length < 4) {
      return NextResponse.json(
        { error: "Passcode must be at least 4 characters" },
        { status: 400 }
      )
    }

    const adminDb = getAdminDb()

    // Verify user role
    const roleSnap = await adminDb.collection("roles").doc(userId).get()
    const role = roleSnap.exists ? roleSnap.data()?.role : "viewer"
    if (!ROLE_STAFF_OR_ADMIN.includes(role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const collectionName = discipline === "speed" ? "speedCompetitions" : "boulderComps"
    const compRef = adminDb.collection(collectionName).doc(compId)
    const compSnap = await compRef.get()
    if (!compSnap.exists) {
      return NextResponse.json({ error: "Competition not found" }, { status: 404 })
    }

    const passcodeVersion = crypto.randomUUID()
    const passcodeHash = hashPasscode(passcode)

    await Promise.all([
      compRef.set(
        {
          judgePasscodeVersion: passcodeVersion,
          judgePasscodeUpdatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      ),
      compRef.collection("private").doc("judgePasscode").set(
        {
          judgePasscodeHash: passcodeHash,
          judgePasscodeVersion: passcodeVersion,
          updatedAt: FieldValue.serverTimestamp(),
          updatedBy: userId,
        },
        { merge: true }
      ),
    ])

    return NextResponse.json({
      compId,
      passcodeVersion,
      sessionDurationMs: SESSION_DURATION_MS,
      discipline: collectionName === "speedCompetitions" ? "speed" : "boulder",
    })
  } catch (error) {
    console.error("[Judge Passcode] PUT error:", error)
    return NextResponse.json({ error: "Internal error" }, { status: 500 })
  }
}
