'use client'

import { useCallback, useEffect, useState } from "react"
import { onIdTokenChanged, signInWithCustomToken, signOut, type User } from "firebase/auth"
import { auth as firebaseAuth } from "@/lib/firebase/client"

type JudgeSession = {
  uid: string
  compId?: string
  role?: string
  authType?: string
  passcodeVersion?: string
  sessionExpiresAt?: number
}

const ALLOWED_ROLES = ["judge", "staff", "admin"]

const parseSessionFromUser = async (user: User): Promise<JudgeSession | null> => {
  const tokenResult = await user.getIdTokenResult()
  const claims = tokenResult.claims || {}

  const role = typeof claims.role === "string" ? claims.role : "viewer"
  const authType = typeof claims.authType === "string" ? claims.authType : undefined
  const compId = typeof claims.compId === "string" ? claims.compId : undefined
  const passcodeVersion = typeof claims.passcodeVersion === "string" ? claims.passcodeVersion : undefined
  const sessionExpiresAt =
    typeof claims.sessionExpiresAt === "number" ? claims.sessionExpiresAt : undefined

  if (authType === "judge-passcode" && sessionExpiresAt && Date.now() > sessionExpiresAt) {
    throw new Error("SESSION_EXPIRED")
  }

  if (!ALLOWED_ROLES.includes(role)) return null

  return {
    uid: user.uid,
    compId,
    role,
    authType,
    passcodeVersion,
    sessionExpiresAt,
  }
}

export function useJudgePasscodeSession() {
  const [session, setSession] = useState<JudgeSession | null>(null)
  const [loading, setLoading] = useState(true)
  const [signingIn, setSigningIn] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!firebaseAuth) {
      setError("Firebase is not configured")
      setLoading(false)
      return
    }

    const unsubscribe = onIdTokenChanged(firebaseAuth, async (user) => {
      if (!user) {
        setSession(null)
        setLoading(false)
        return
      }
      try {
        const parsed = await parseSessionFromUser(user)
        if (!parsed) {
          await signOut(firebaseAuth)
          setSession(null)
          setError("You do not have judge access. Use a judge code to continue.")
          setLoading(false)
          return
        }
        setSession(parsed)
        setError(null)
      } catch (err) {
        if (err instanceof Error && err.message === "SESSION_EXPIRED") {
          await signOut(firebaseAuth)
          setSession(null)
          setError("Session expired. Enter the latest judge code to continue.")
        } else {
          console.error("[JudgeSession] Failed to read token claims", err)
          setSession(null)
          setError("Unable to verify session. Please sign in again.")
        }
      } finally {
        setLoading(false)
      }
    })

    return () => unsubscribe()
  }, [])

  const signInWithPasscode = useCallback(async (compId: string, passcode: string) => {
    if (!firebaseAuth) throw new Error("Firebase is not configured")
    setSigningIn(true)
    setError(null)
    try {
      // Clear any existing Firebase user before switching sessions
      await signOut(firebaseAuth).catch(() => null)

      const response = await fetch("/api/judge-passcode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ compId, passcode }),
      })

      const data = await response.json().catch(() => null)
      if (!response.ok || !data?.token) {
        throw new Error((data as { error?: string } | null)?.error || "Invalid code")
      }

      const credential = await signInWithCustomToken(firebaseAuth, data.token as string)
      await credential.user.getIdToken(true)
      setError(null)
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to sign in with code"
      setError(message)
      throw err
    } finally {
      setSigningIn(false)
    }
  }, [])

  const signOutJudge = useCallback(async () => {
    if (!firebaseAuth) return
    await signOut(firebaseAuth).catch(() => null)
    setSession(null)
  }, [])

  return {
    session,
    loading,
    signingIn,
    error,
    signInWithPasscode,
    signOutJudge,
    clearError: () => setError(null),
  }
}
