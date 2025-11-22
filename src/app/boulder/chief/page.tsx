'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { UserButton, useUser } from '@clerk/nextjs';
import Image from 'next/image';
import Link from 'next/link';
import Container from '@/components/Container';
import { firestore } from '@/lib/firebase/client';
import { useFirebaseAuth } from '@/hooks/useFirebaseAuth';
import { useUserRole, isStaffRole } from '@/hooks/useUserRole';
import { useChiefJudgeAttempts } from '@/hooks/useChiefJudgeAttempts';
import {
  collection,
  getDocs,
  query,
  orderBy,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  addDoc,
  serverTimestamp,
  where,
} from 'firebase/firestore';

/**
 * Type definitions
 */
interface Competition {
  id: string;
  name?: string;
  status?: string;
}

interface Category {
  id: string;
  name?: string;
  order?: number;
  leaderboardNote?: string;
}

interface RouteDetail {
  id: string;
  label?: string;
  order?: number;
  detailIndex?: string;
}

type RoundType = 'qualification' | 'final';

/**
 * Route Summary Data
 */
interface RouteSummary {
  key: string;
  label: string;
  order: number;
  tops: number;
  zones: number;
  attempts: number;
  points: number;
}

/**
 * Attempt Document from Firestore
 */
interface AttemptDocument {
  id: string;
  athleteId: string;
  symbol: string;
  categoryId: string;
  routeId: string;
  round: string;
  detailIndex?: string | number;
  clientAt?: unknown;
  clientAtMs?: number;
  createdAt?: number;
  enteredBy?: string;
  updatedAt?: unknown;
  updatedBy?: string;
}

/**
 * Undo Action
 */
interface UndoAction {
  type: 'update' | 'delete';
  attemptId: string;
  before: Partial<AttemptDocument>;
  description: string;
}

/**
 * ChiefJudgePage - Role-gated entry point for Chief Judge dashboard
 *
 * ACCESS CONTROL:
 * - Allowed roles: staff, admin
 * - Denied roles: viewer, judge (without staff privileges), unauthenticated
 *
 * LEGACY MIGRATION:
 * This page is migrated from /public/boulder/chief.html in the legacy GripRank repo.
 * Structure and styling match the original implementation.
 */
export default function ChiefJudgePage() {
  const { isSignedIn, isLoaded } = useUser();

  // Authenticate with Firebase using Clerk session
  const { isFirebaseAuthenticated, error: firebaseError } = useFirebaseAuth();

  // Check user role for access control
  const { role, loading: roleLoading } = useUserRole();

  // ROLE-BASED ACCESS CONTROL
  const waitingForFirebaseAuth = isSignedIn && !isFirebaseAuthenticated && !firebaseError;

  if (!isLoaded || waitingForFirebaseAuth || roleLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0b1220]">
        <div className="text-center">
          <div className="mb-4 text-lg text-gray-200">Loading...</div>
          <div className="text-sm text-gray-400">
            Clerk: {isLoaded ? '✓' : '...'} |
            Firebase: {isFirebaseAuthenticated ? '✓' : '...'} |
            Role: {roleLoading ? '...' : '✓'}
          </div>
        </div>
      </div>
    );
  }

  if (!isStaffRole(role)) {
    return (
      <main className="py-12 min-h-screen bg-[#0b1220] text-gray-200">
        <Container>
          <div className="mb-8">
            <h1 className="text-2xl font-bold mb-4">Access Denied</h1>
            <p className="text-gray-400">This page requires staff or admin privileges.</p>
            <div className="mt-4">
              <Link href="/" className="text-[#27a9e1] hover:underline">
                ← Back to Home
              </Link>
            </div>
          </div>
        </Container>
      </main>
    );
  }

  return <ChiefJudgeInterface />;
}

/**
 * ChiefJudgeInterface - The actual Chief Judge dashboard UI
 *
 * PHASE 2 FEATURES:
 * - Leaderboard Note management
 * - Edit attempt symbols (click row to edit)
 * - Delete attempts
 * - Undo last change
 * - Round selector (qualification/final)
 */
function ChiefJudgeInterface() {
  const { user } = useUser();

  const [competitions, setCompetitions] = useState<Competition[]>([]);
  const [competitionsLoading, setCompetitionsLoading] = useState(true);
  const [selectedComp, setSelectedComp] = useState('');

  const [categories, setCategories] = useState<Category[]>([]);
  const [categoriesLoading, setCategoriesLoading] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState('');

  const [round, setRound] = useState<RoundType>('qualification');

  const [routes, setRoutes] = useState<RouteDetail[]>([]);
  const [routesLoading, setRoutesLoading] = useState(false);
  const [selectedRoute, setSelectedRoute] = useState(''); // Empty = All Boulders (default)

  const [details, setDetails] = useState<RouteDetail[]>([]);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [selectedDetail, setSelectedDetail] = useState(''); // Empty = All Details (default)

  // Edit panel needs to track which route is being edited (for All Boulders mode)
  const [editingRouteId, setEditingRouteId] = useState<string>('');

  // Leaderboard Note state
  const [leaderboardNote, setLeaderboardNote] = useState('');
  const [originalNote, setOriginalNote] = useState('');
  const [noteSaving, setNoteSaving] = useState(false);
  const [noteStatus, setNoteStatus] = useState('');

  // Edit panel state
  const [selectedAthleteId, setSelectedAthleteId] = useState<string | null>(null);
  const [attemptHistory, setAttemptHistory] = useState<AttemptDocument[]>([]);
  const [editPanelVisible, setEditPanelVisible] = useState(false);

  // Add attempt state
  const [newAttemptSymbol, setNewAttemptSymbol] = useState<string>('1');
  const [addingAttempt, setAddingAttempt] = useState(false);
  const [editingDetailIndex, setEditingDetailIndex] = useState<number | null>(null);
  const [editingDetailLabel, setEditingDetailLabel] = useState<string | null>(null);

  // Undo state
  const [lastAction, setLastAction] = useState<UndoAction | null>(null);

  // Toast state
  const [toastMessage, setToastMessage] = useState('');
  const [toastVisible, setToastVisible] = useState(false);

  // Get detail index for filtering (normalize to number or null)
  const rawDetailIndex = selectedDetail
    ? details.find((d) => d.id === selectedDetail)?.detailIndex ?? null
    : null;
  const detailIndexNumber =
    rawDetailIndex == null || rawDetailIndex === '' ? null : Number(rawDetailIndex);

  // Reset dependent selections when competition or category changes to avoid stale filters
  useEffect(() => {
    setSelectedCategory('');
    setSelectedRoute('');
    setSelectedDetail('');
  }, [selectedComp]);

  useEffect(() => {
    setSelectedRoute('');
    setSelectedDetail('');
  }, [selectedCategory]);

  // Fetch aggregated attempts using custom hook
  // Pass empty string for routeId when "All Boulders" is selected
  const {
    athletes,
    loading: attemptsLoading,
    error: attemptsError,
  } = useChiefJudgeAttempts(
    selectedComp,
    selectedCategory,
    round,
    selectedRoute, // Empty string = All Boulders
    round === 'qualification' ? detailIndexNumber : null
  );

  // Calculate route summary
  const routeSummaries = useMemo(() => {
    const summaryMap = new Map<string, RouteSummary>();

    athletes.forEach((athlete) => {
      const symbols = athlete.sequence.split('');
      let topAttempt: number | null = null;
      let zoneAttempt: number | null = null;

      symbols.forEach((symbol, idx) => {
        if (symbol === 'T') {
          if (topAttempt === null) topAttempt = idx + 1;
        } else if (symbol === 'Z') {
          if (zoneAttempt === null) zoneAttempt = idx + 1;
        }
      });

      let points = 0;
      if (topAttempt !== null) {
        points += 25 - (topAttempt - 1) * 0.1;
        points += 10 - (topAttempt - 1) * 0.1;
      } else if (zoneAttempt !== null) {
        points += 10 - (zoneAttempt - 1) * 0.1;
      }

      // For "All Boulders", extract routeId from athlete.id (format: athleteId_routeId)
      // For single route, use the selected route
      let routeId: string;
      if (selectedRoute) {
        routeId = selectedRoute;
      } else {
        // athlete.id is "athleteId_routeId" when showing all routes
        const parts = athlete.id.split('_');
        routeId = parts.length > 1 ? parts[1] : athlete.id;
      }

      const key = routeId;
      const route = routes.find((r) => r.id === routeId);
      const routeLabel = route?.label || `Route ${routeId}`;
      const order = route?.order ?? 999;

      const entry = summaryMap.get(key) || {
        key,
        label: routeLabel,
        order,
        tops: 0,
        zones: 0,
        attempts: 0,
        points: 0,
      };

      if (topAttempt !== null) {
        entry.tops += 1;
        entry.zones += 1;
      } else if (zoneAttempt !== null) {
        entry.zones += 1;
      }
      entry.attempts += symbols.length;
      entry.points += points;

      summaryMap.set(key, entry);
    });

    return Array.from(summaryMap.values()).sort((a, b) => a.order - b.order);
  }, [athletes, selectedRoute, routes]);

  // Toast helper
  const showToast = (message: string) => {
    setToastMessage(message);
    setToastVisible(true);
    setTimeout(() => setToastVisible(false), 2400);
  };

  // Load competitions on mount
  useEffect(() => {
    if (!firestore) return;

    async function loadCompetitions() {
      try {
        const compsRef = collection(firestore!, 'boulderComps');
        const compsQuery = query(compsRef, orderBy('updatedAt', 'desc'));
        const snapshot = await getDocs(compsQuery);

        const comps: Competition[] = [];
        snapshot.forEach((doc) => {
          comps.push({
            id: doc.id,
            ...doc.data(),
          } as Competition);
        });

        setCompetitions(comps);
        setCompetitionsLoading(false);

        if (comps.length > 0 && !selectedComp) {
          setSelectedComp(comps[0].id);
        }
      } catch (error) {
        console.error('Error loading competitions:', error);
        setCompetitionsLoading(false);
      }
    }

    loadCompetitions();
  }, [selectedComp]);

  // Load categories when competition changes
  useEffect(() => {
    if (!selectedComp || !firestore) return;

    async function loadCategories() {
      setCategoriesLoading(true);
      try {
        const categoriesRef = collection(firestore!, `boulderComps/${selectedComp}/categories`);
        const categoriesQuery = query(categoriesRef, orderBy('order', 'asc'));
        const snapshot = await getDocs(categoriesQuery);

        const cats: Category[] = [];
        snapshot.forEach((doc) => {
          cats.push({
            id: doc.id,
            ...doc.data(),
          } as Category);
        });

        setCategories(cats);
        setCategoriesLoading(false);

        if (cats.length > 0 && !selectedCategory) {
          setSelectedCategory(cats[0].id);
        }
      } catch (error) {
        console.error('Error loading categories:', error);
        setCategoriesLoading(false);
      }
    }

    loadCategories();
  }, [selectedComp, selectedCategory]);

  // Load routes when category/round changes
  useEffect(() => {
    if (!selectedComp || !selectedCategory || !firestore) return;

    async function loadRoutes() {
      setRoutesLoading(true);
      try {
        const collectionName = round === 'final' ? 'finalRoutes' : 'routes';
        const routesRef = collection(firestore!, `boulderComps/${selectedComp}/categories/${selectedCategory}/${collectionName}`);
        const routesQuery = query(routesRef, orderBy('order', 'asc'));
        const snapshot = await getDocs(routesQuery);

        const rts: RouteDetail[] = [];
        snapshot.forEach((doc) => {
          rts.push({
            id: doc.id,
            ...doc.data(),
          } as RouteDetail);
        });

        setRoutes(rts);
        setRoutesLoading(false);

        // Don't auto-select - default to empty (All Boulders)
        // if (rts.length > 0 && !selectedRoute) {
        //   setSelectedRoute(rts[0].id);
        // }
      } catch (error) {
        console.error('Error loading routes:', error);
        setRoutesLoading(false);
      }
    }

    loadRoutes();
  }, [selectedComp, selectedCategory, round, selectedRoute]);

  // Load details when category changes (for qualification rounds)
  useEffect(() => {
    if (!selectedComp || !selectedCategory || !firestore || round !== 'qualification') {
      setDetails([]);
      setSelectedDetail('');
      return;
    }

    async function loadDetails() {
      setDetailsLoading(true);
      try {
        const detailsRef = collection(firestore!, `boulderComps/${selectedComp}/categories/${selectedCategory}/details`);
        const detailsQuery = query(detailsRef, orderBy('order', 'asc'));
        const snapshot = await getDocs(detailsQuery);

        const dets: RouteDetail[] = [];
        snapshot.forEach((doc) => {
          dets.push({
            id: doc.id,
            ...doc.data(),
          } as RouteDetail);
        });

        setDetails(dets);
        setDetailsLoading(false);

        // Don't auto-select - default to empty (All Details)
        // if (dets.length > 0 && !selectedDetail) {
        //   setSelectedDetail(dets[0].id);
        // }
      } catch (error) {
        console.error('Error loading details:', error);
        setDetailsLoading(false);
      }
    }

    loadDetails();
  }, [selectedComp, selectedCategory, round, selectedDetail]);

  // Load leaderboard note when category changes
  useEffect(() => {
    if (!selectedComp || !selectedCategory || !firestore) {
      setLeaderboardNote('');
      setOriginalNote('');
      setNoteStatus('');
      return;
    }

    async function loadNote() {
      try {
        const categoryRef = doc(firestore!, `boulderComps/${selectedComp}/categories/${selectedCategory}`);
        const snap = await getDoc(categoryRef);
        const note = snap.exists() ? (snap.data().leaderboardNote || '') : '';
        setLeaderboardNote(note);
        setOriginalNote(note);
        setNoteStatus(note ? 'Saved.' : '');
      } catch (error) {
        console.error('Error loading leaderboard note:', error);
        setNoteStatus('Failed to load note.');
      }
    }

    loadNote();
  }, [selectedComp, selectedCategory]);

  // Update note status when note changes
  useEffect(() => {
    if (leaderboardNote !== originalNote) {
      setNoteStatus('Unsaved changes');
    } else {
      setNoteStatus(originalNote ? 'Saved.' : '');
    }
  }, [leaderboardNote, originalNote]);

  // Save leaderboard note
  const saveLeaderboardNote = async () => {
    if (!selectedComp || !selectedCategory || !firestore) return;

    setNoteSaving(true);
    setNoteStatus('Saving…');

    try {
      const categoryRef = doc(firestore, `boulderComps/${selectedComp}/categories/${selectedCategory}`);
      const trimmed = leaderboardNote.trim();

      await setDoc(categoryRef, {
        leaderboardNote: trimmed,
        leaderboardNoteUpdatedAt: serverTimestamp(),
        leaderboardNoteUpdatedBy: user?.id || 'unknown',
      }, { merge: true });

      setOriginalNote(trimmed);
      setLeaderboardNote(trimmed);
      setNoteStatus(trimmed ? 'Saved.' : 'Note cleared.');
      showToast('Leaderboard note saved.');
    } catch (error) {
      console.error('Error saving note:', error);
      setNoteStatus('Failed to save note.');
      showToast('Failed to save leaderboard note.');
    } finally {
      setNoteSaving(false);
    }
  };

  // Open edit panel for an athlete
  const openEditPanel = async (rowId: string) => {
    if (!selectedComp || !firestore) return;

    // Extract actual athleteId and routeId from composite key (for "All Boulders")
    let actualAthleteId = rowId;
    let routeIdToEdit = selectedRoute;

    if (!selectedRoute && rowId.includes('_')) {
      // Format is "athleteId_routeId"
      const [ath, route] = rowId.split('_');
      actualAthleteId = ath;
      routeIdToEdit = route;
    }

    if (!routeIdToEdit) {
      showToast('Unable to determine which boulder to edit.');
      return;
    }

    // Look up detailIndex from athlete doc (row context) to anchor edits even in All Details view
    let detailIndexForEdit: number | null = null;
    if (round === 'qualification') {
      try {
        const athleteRef = doc(firestore, `boulderComps/${selectedComp}/athletes/${actualAthleteId}`);
        const athleteSnap = await getDoc(athleteRef);
        const athleteData = athleteSnap.data();
        const raw = athleteData?.detailIndex ?? athleteData?.detail ?? athleteData?.detailId ?? null;
        const parsed = raw == null || raw === '' ? null : Number(raw);
        detailIndexForEdit = Number.isNaN(parsed) ? null : parsed;
      } catch (err) {
        console.error('Failed to load athlete detailIndex for editing', err);
      }

      if (detailIndexForEdit === null) {
        showToast('Cannot edit this row because it has no detail assigned.');
        return;
      }
    }

    // Derive detail label for edit header
    if (round === 'qualification') {
      const detailMatch = details.find((d) => {
        const candidate = d.detailIndex ?? d.id;
        const numeric = candidate == null || candidate === '' ? null : Number(candidate);
        return numeric === detailIndexForEdit;
      });
      const derivedLabel = detailMatch?.label || (detailIndexForEdit != null ? `Detail ${detailIndexForEdit}` : null);
      setEditingDetailLabel(derivedLabel);
    } else {
      setEditingDetailLabel(null);
    }

    setSelectedAthleteId(rowId); // Keep composite key for highlighting
    setEditingRouteId(routeIdToEdit); // Store for add attempt
    setEditingDetailIndex(detailIndexForEdit);
    setEditPanelVisible(true);

    try {
      const attemptsRef = collection(firestore, `boulderComps/${selectedComp}/attempts`);
      const constraints = [
        where('athleteId', '==', actualAthleteId),
        where('categoryId', '==', selectedCategory),
        where('routeId', '==', routeIdToEdit),
        where('round', '==', round),
      ];

      if (round === 'qualification' && detailIndexForEdit !== null) {
        constraints.push(where('detailIndex', '==', detailIndexForEdit));
      }

      const attemptsQuery = query(attemptsRef, ...constraints, orderBy('clientAtMs', 'asc'));
      const snapshot = await getDocs(attemptsQuery);

      const history: AttemptDocument[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        history.push({
          id: doc.id,
          ...data,
          createdAt: data.clientAt?.toMillis?.() || data.clientAtMs || Date.now(),
        } as AttemptDocument);
      });

      setAttemptHistory(history);
    } catch (error) {
      console.error('Error loading attempt history:', error);
      showToast('Failed to load attempt history.');
    }
  };

  // Close edit panel
  const closeEditPanel = () => {
    setSelectedAthleteId(null);
    setEditPanelVisible(false);
    setAttemptHistory([]);
    setEditingRouteId('');
    setNewAttemptSymbol('1');
    setEditingDetailIndex(null);
    setEditingDetailLabel(null);
  };

  // Add new attempt
  const addNewAttempt = async () => {
    if (!selectedComp || !firestore || !selectedAthleteId || !editingRouteId) return;
    if (round === 'qualification' && editingDetailIndex === null) {
      showToast('Cannot add attempts because this row has no detail assigned.');
      return;
    }

    // Extract actual athleteId from composite key if needed
    const actualAthleteId = selectedAthleteId.includes('_')
      ? selectedAthleteId.split('_')[0]
      : selectedAthleteId;

    setAddingAttempt(true);

    try {
      const attemptsRef = collection(firestore, `boulderComps/${selectedComp}/attempts`);

      // Prepare attempt data
      const attemptData: Record<string, unknown> = {
        compId: selectedComp,
        athleteId: actualAthleteId,
        categoryId: selectedCategory,
        routeId: editingRouteId,
        round: round,
        symbol: newAttemptSymbol,
        clientAt: serverTimestamp(),
        clientAtMs: Date.now(),
        enteredBy: user?.id || 'chief-judge',
        stationId: 'chief-judge',
        offline: false,
      };

      // Add detailIndex for qualification rounds
      if (round === 'qualification' && editingDetailIndex !== null) {
        // NOTE: We currently use numeric detailIndex for qualification logic and indexing.
        // In future we may introduce a separate string detailCode/detailId (e.g. "A1") for
        // flexible group labelling, but the numeric field remains the canonical key for now.
        attemptData.detailIndex = editingDetailIndex;
      }

      const docRef = await addDoc(attemptsRef, attemptData);

      // Add to local state
      const newAttempt = {
        id: docRef.id,
        ...attemptData,
        createdAt: Date.now(),
      } as AttemptDocument;
      setAttemptHistory((prev) => [...prev, newAttempt]);

      // Reset and show success
      setNewAttemptSymbol('1');
      showToast('Attempt added successfully.');
    } catch (error) {
      console.error('Error adding attempt:', error);
      showToast('Failed to add attempt.');
    } finally {
      setAddingAttempt(false);
    }
  };

  // Update attempt symbol
  const updateAttemptSymbol = async (attemptId: string, newSymbol: string) => {
    if (!selectedComp || !firestore) return;

    const attempt = attemptHistory.find((a) => a.id === attemptId);
    if (!attempt || attempt.symbol === newSymbol) return;

    const attemptRef = doc(firestore, `boulderComps/${selectedComp}/attempts/${attemptId}`);
    const before = { ...attempt };

    try {
      await updateDoc(attemptRef, {
        symbol: newSymbol,
        updatedAt: serverTimestamp(),
        updatedBy: user?.id || 'chief',
      });

      // Update local state
      setAttemptHistory((prev) =>
        prev.map((a) => (a.id === attemptId ? { ...a, symbol: newSymbol } : a))
      );

      // Set undo action
      setLastAction({
        type: 'update',
        attemptId,
        before,
        description: `Updated attempt for ${athletes.find((ath) => ath.id === attempt.athleteId)?.name || attempt.athleteId}`,
      });

      showToast('Attempt updated.');
    } catch (error) {
      console.error('Error updating attempt:', error);
      showToast('Failed to update attempt.');
    }
  };

  // Delete attempt
  const deleteAttempt = async (attemptId: string) => {
    if (!selectedComp || !firestore) return;

    const attempt = attemptHistory.find((a) => a.id === attemptId);
    if (!attempt) return;

    if (!confirm('Delete this attempt? This can be undone with the Undo button right after.')) {
      return;
    }

    const attemptRef = doc(firestore, `boulderComps/${selectedComp}/attempts/${attemptId}`);

    try {
      await deleteDoc(attemptRef);

      // Update local state
      setAttemptHistory((prev) => prev.filter((a) => a.id !== attemptId));

      // Set undo action
      setLastAction({
        type: 'delete',
        attemptId,
        before: attempt,
        description: `Deleted attempt for ${athletes.find((ath) => ath.id === attempt.athleteId)?.name || attempt.athleteId}`,
      });

      showToast('Attempt deleted.');
    } catch (error) {
      console.error('Error deleting attempt:', error);
      showToast('Failed to delete attempt.');
    }
  };

  // Undo last action
  const undoLastAction = async () => {
    if (!lastAction || !selectedComp || !firestore) return;

    const attemptRef = doc(firestore, `boulderComps/${selectedComp}/attempts/${lastAction.attemptId}`);

    try {
      if (lastAction.type === 'update') {
        await setDoc(attemptRef, lastAction.before, { merge: true });
        showToast('Reverted changes.');
      } else if (lastAction.type === 'delete') {
        await setDoc(attemptRef, lastAction.before, { merge: true });
        showToast('Restored deleted attempt.');
      }

      setLastAction(null);
    } catch (error) {
      console.error('Error undoing action:', error);
      showToast('Failed to undo change.');
    }
  };

  // Format timestamp
  const formatTimestamp = (tsMillis?: number) => {
    if (!tsMillis) return '—';
    const date = new Date(tsMillis);
    return date.toLocaleString(undefined, {
      hour12: false,
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  if (!firestore) {
    return (
      <main className="py-12 min-h-screen bg-[#0b1220] text-gray-200">
        <Container>
          <div className="text-center">Loading...</div>
        </Container>
      </main>
    );
  }

  // Get selected athlete info for edit panel
  const selectedAthlete = athletes.find((a) => a.id === selectedAthleteId);
  const selectedRouteLabel = routes.find((r) => r.id === editingRouteId)?.label || editingRouteId;
  const editingDetailDisplay =
    round === 'qualification' && editingDetailIndex != null
      ? editingDetailLabel || `Detail ${editingDetailIndex}`
      : null;

  return (
    <main className="py-6 min-h-screen bg-[#0b1220] text-gray-200">
      {/* Toast */}
      <div
        className={`fixed left-1/2 -translate-x-1/2 top-20 bg-[#1f2937] text-gray-200 border border-[#19bcd6] px-4 py-2.5 rounded-xl shadow-lg z-50 transition-opacity duration-200 ${
          toastVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        role="status"
        aria-live="polite"
      >
        {toastMessage}
      </div>

      <Container>
        <div className="max-w-[1100px] mx-auto space-y-6">
          {/* Header - Consistent with Judge page */}
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
              <span className="text-gray-400">Chief Judge</span>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-sm text-gray-400">
              <span className="truncate max-w-[240px]">
                {user?.emailAddresses[0]?.emailAddress || 'Signed in'}
              </span>
              <UserButton afterSignOutUrl="/" />
            </div>
          </header>

          {/* Competition Context Panel */}
          <section className="bg-[#0e1730] border border-[#19bcd6] rounded-xl p-5">
            <div className="flex justify-between items-center mb-4">
              <strong className="text-gray-100 text-lg">Competition Context</strong>
              <span className="text-sm text-gray-400">Select a competition to begin reviewing attempts</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
              {/* Competition */}
              <label className="flex flex-col gap-2">
                <span className="text-sm text-gray-400">Competition</span>
                <select
                  value={selectedComp}
                  onChange={(e) => setSelectedComp(e.target.value)}
                  className="px-3 py-2.5 bg-[#101a34] text-gray-200 border border-[#19bcd6] rounded-lg focus:outline-none focus:border-[#27a9e1]"
                  disabled={competitionsLoading}
                >
                  <option value="">Select</option>
                  {competitions.map((comp) => (
                    <option key={comp.id} value={comp.id}>
                      {comp.name || comp.id}
                    </option>
                  ))}
                </select>
              </label>

              {/* Category */}
              <label className="flex flex-col gap-2">
                <span className="text-sm text-gray-400">Category</span>
                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="px-3 py-2.5 bg-[#101a34] text-gray-200 border border-[#19bcd6] rounded-lg focus:outline-none focus:border-[#27a9e1]"
                  disabled={categoriesLoading || !selectedComp}
                >
                  <option value="">Select</option>
                  {categories.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.name || cat.id}
                    </option>
                  ))}
                </select>
              </label>

              {/* Round */}
              <label className="flex flex-col gap-2">
                <span className="text-sm text-gray-400">Round</span>
                <select
                  value={round}
                  onChange={(e) => setRound(e.target.value as RoundType)}
                  className="px-3 py-2.5 bg-[#101a34] text-gray-200 border border-[#19bcd6] rounded-lg focus:outline-none focus:border-[#27a9e1]"
                  disabled={!selectedCategory}
                >
                  <option value="qualification">Qualification</option>
                  <option value="final">Final</option>
                </select>
              </label>

              {/* Route */}
              <label className="flex flex-col gap-2">
                <span className="text-sm text-gray-400">Boulder</span>
                <select
                  value={selectedRoute}
                  onChange={(e) => setSelectedRoute(e.target.value)}
                  className="px-3 py-2.5 bg-[#101a34] text-gray-200 border border-[#19bcd6] rounded-lg focus:outline-none focus:border-[#27a9e1]"
                  disabled={routesLoading || !selectedCategory}
                >
                  <option value="">All Boulders</option>
                  {routes.map((route) => (
                    <option key={route.id} value={route.id}>
                      {route.label || route.id}
                    </option>
                  ))}
                </select>
              </label>

              {/* Detail (Qualification only) */}
              {round === 'qualification' && (
                <label className="flex flex-col gap-2">
                  <span className="text-sm text-gray-400">Detail</span>
                  <select
                    value={selectedDetail}
                    onChange={(e) => setSelectedDetail(e.target.value)}
                    className="px-3 py-2.5 bg-[#101a34] text-gray-200 border border-[#19bcd6] rounded-lg focus:outline-none focus:border-[#27a9e1]"
                    disabled={detailsLoading || !selectedCategory}
                  >
                    <option value="">All Details</option>
                    {details.map((detail) => (
                      <option key={detail.id} value={detail.id}>
                        {detail.label || detail.detailIndex || detail.id}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>
          </section>

          {/* Route Summary Panel */}
          <section className="bg-[#0e1730] border border-[#19bcd6] rounded-xl p-5">
            <div className="flex justify-between items-center mb-4">
              <strong className="text-gray-100 text-lg">Route Summary</strong>
              <span className="text-sm text-gray-400">Live totals to verify scoring across judge stations</span>
            </div>
            {!selectedComp || !selectedCategory ? (
              <div className="text-gray-400 text-sm">Select a competition and category.</div>
            ) : attemptsLoading ? (
              <div className="text-gray-400 text-sm">Loading summary...</div>
            ) : routeSummaries.length === 0 ? (
              <div className="text-gray-400 text-sm">No attempts recorded yet.</div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {routeSummaries.map((summary) => (
                  <div
                    key={summary.key}
                    className="border border-[#19bcd6] rounded-xl p-4 bg-white/[0.04] flex flex-col gap-1"
                  >
                    <div className="text-sm font-semibold text-gray-400">{summary.label}</div>
                    <div className="text-2xl font-bold text-gray-100">{summary.tops} Tops</div>
                    <div className="text-xs text-gray-400">
                      {summary.zones} Zones • {summary.attempts} Attempts • {summary.points.toFixed(1)} pts
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Leaderboard Note Panel */}
          {selectedComp && selectedCategory && (
            <section className="bg-[#0e1730] border border-[#19bcd6] rounded-xl p-5">
              <div className="flex justify-between items-center mb-4">
                <strong className="text-gray-100 text-lg">Leaderboard Note</strong>
                <span className="text-sm text-gray-400">Appears at the bottom of the public leaderboard for this category</span>
              </div>
              <textarea
                value={leaderboardNote}
                onChange={(e) => setLeaderboardNote(e.target.value)}
                rows={2}
                maxLength={280}
                placeholder="Add leaderboard note (optional)."
                className="w-full px-3 py-2.5 bg-[#101a34] text-gray-200 border border-[#19bcd6] rounded-lg focus:outline-none focus:border-[#27a9e1] resize-y min-h-[60px]"
              />
              <div className="flex items-center gap-3 mt-2">
                <button
                  onClick={saveLeaderboardNote}
                  disabled={noteSaving || leaderboardNote === originalNote}
                  className="px-3 py-1.5 text-sm bg-[#27a9e1] border border-[#27a9e1] text-[#031726] rounded-lg hover:opacity-90 disabled:opacity-60 disabled:cursor-not-allowed transition-opacity"
                >
                  Save note
                </button>
                <span className="text-xs text-gray-400">{noteStatus}</span>
              </div>
            </section>
          )}

          {/* Judge List Panel */}
          <section className="bg-[#0e1730] border border-[#19bcd6] rounded-xl p-5">
            <div className="flex justify-between items-center mb-4">
              <strong className="text-gray-100 text-lg">Judge List</strong>
              <span className="text-sm text-gray-400">
                Tap a row to add, edit, or delete attempts
              </span>
            </div>

            {attemptsError && selectedComp && selectedCategory && (
              <div className="mb-4 p-4 bg-red-900/20 border border-red-500/40 rounded-lg text-red-400">
                {attemptsError}
              </div>
            )}

            <div className="border border-[#19bcd6] rounded-xl overflow-hidden" style={{ maxHeight: '420px', overflowY: 'auto' }}>
              {attemptsLoading ? (
                <div className="text-center py-8 text-gray-400">Loading attempts...</div>
              ) : athletes.length === 0 ? (
                <div className="text-center py-8 text-gray-400">
                  No attempts found for the selected criteria.
                </div>
              ) : (
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="bg-white/[0.04]">
                      {!selectedRoute && (
                        <th className="text-left py-3 px-3 font-semibold text-gray-200 border-b border-[#19bcd6]">Route</th>
                      )}
                      <th className="text-left py-3 px-3 font-semibold text-gray-200 border-b border-[#19bcd6]">Bib</th>
                      <th className="text-left py-3 px-3 font-semibold text-gray-200 border-b border-[#19bcd6]">Athlete</th>
                      <th className="text-left py-3 px-3 font-semibold text-gray-200 border-b border-[#19bcd6]">Team</th>
                      <th className="text-left py-3 px-3 font-semibold text-gray-200 border-b border-[#19bcd6] font-mono">Attempts</th>
                    </tr>
                  </thead>
                  <tbody>
                    {athletes.map((athlete, idx) => {
                      // Extract routeId from composite id for "All Boulders"
                      const routeId = !selectedRoute && athlete.id.includes('_')
                        ? athlete.id.split('_')[1]
                        : null;
                      const routeLabel = routeId
                        ? routes.find((r) => r.id === routeId)?.label || routeId
                        : null;

                      return (
                        <tr
                          key={athlete.id}
                          onClick={() => openEditPanel(athlete.id)}
                          className={`border-b border-[#19bcd6]/50 hover:bg-[#27a9e1]/15 cursor-pointer transition-colors ${
                            idx % 2 === 1 ? 'bg-white/[0.025]' : 'bg-white/[0.015]'
                          } ${
                            selectedAthleteId === athlete.id
                              ? 'bg-[#27a9e1]/25 shadow-[inset_4px_0_0_0_rgba(39,169,225,0.95)] font-semibold'
                              : ''
                          }`}
                        >
                          {!selectedRoute && (
                            <td className="py-2.5 px-3 text-gray-300">{routeLabel}</td>
                          )}
                          <td className="py-2.5 px-3 font-medium text-gray-200">{athlete.bib}</td>
                          <td className="py-2.5 px-3 text-gray-200">{athlete.name}</td>
                          <td className="py-2.5 px-3 text-gray-400">{athlete.team || '-'}</td>
                          <td className="py-2.5 px-3 font-mono text-lg text-gray-100">
                            {athlete.sequence || <span className="text-gray-500">-</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>

          </section>

          {/* Edit Attempt Panel */}
          {editPanelVisible && (
            <section className="bg-[#0e1730] border border-[#19bcd6] rounded-xl p-5">
              <div className="flex justify-between items-center mb-4">
                <strong className="text-gray-100 text-lg">Edit Attempt</strong>
                <span className="text-sm text-gray-400">Adjust the recorded result and save to fix mistakes</span>
              </div>
              <div className="mb-4 rounded-lg border border-[#27a9e1]/30 bg-[#0b1635] px-4 py-3">
                <div className="text-sm text-gray-300 font-semibold">
                  Route: <span className="text-white">{selectedRouteLabel || 'Unknown route'}</span>
                </div>
                <div className="text-sm text-gray-300">
                  Athlete: <span className="text-white font-medium">#{selectedAthlete?.bib} {selectedAthlete?.name}</span>
                </div>
                {editingDetailDisplay && (
                  <div className="text-sm text-gray-300">
                    Detail: <span className="text-white font-medium">{editingDetailDisplay}</span>
                  </div>
                )}
              </div>

              {/* Add New Attempt */}
              <div className="mb-4 p-4 bg-[#162246] border border-[#19bcd6] rounded-xl">
                <div className="text-sm font-semibold text-gray-200 mb-3">Add New Attempt</div>
                <div className="flex flex-wrap items-center gap-3">
                  <label className="flex flex-col gap-2">
                    <span className="text-xs text-gray-400">Result</span>
                    <select
                      value={newAttemptSymbol}
                      onChange={(e) => setNewAttemptSymbol(e.target.value)}
                      className="px-3 py-2 bg-[#101a34] text-gray-200 border border-[#19bcd6] rounded text-sm focus:outline-none focus:border-[#27a9e1]"
                    >
                      <option value="1">1 (Attempt)</option>
                      <option value="Z">Zone</option>
                      <option value="T">Top</option>
                    </select>
                  </label>
                  <button
                    onClick={addNewAttempt}
                    disabled={addingAttempt}
                    className="mt-5 px-4 py-2 text-sm bg-[#27a9e1] border border-[#27a9e1] text-[#031726] rounded-lg hover:opacity-90 disabled:opacity-60 disabled:cursor-not-allowed transition-opacity"
                  >
                    {addingAttempt ? 'Adding...' : 'Add Attempt'}
                  </button>
                  <button
                    type="button"
                    onClick={undoLastAction}
                    disabled={!lastAction || !selectedAthleteId}
                    className="mt-5 px-4 py-2 text-sm border border-[#27a9e1] text-[#27a9e1] rounded-lg hover:bg-[#27a9e1]/10 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    Undo last change
                  </button>
                  <span className="mt-5 text-xs text-gray-300">
                    {selectedAthlete && selectedRouteLabel
                      ? `Undo last change for #${selectedAthlete.bib} ${selectedAthlete.name} on ${selectedRouteLabel}`
                      : 'No climber selected'}
                  </span>
                </div>
              </div>

              {/* Existing Attempts */}
              <div className="text-sm font-semibold text-gray-200 mb-2">Attempt History</div>
              <div className="border border-[#19bcd6] rounded-xl overflow-hidden" style={{ maxHeight: '280px', overflowY: 'auto' }}>
                {attemptHistory.length === 0 ? (
                  <div className="text-center py-8 text-gray-400">No attempts recorded for this selection.</div>
                ) : (
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="bg-white/[0.04]">
                        <th className="text-left py-3 px-3 font-semibold text-gray-200 border-b border-[#19bcd6]">Attempt</th>
                        <th className="text-left py-3 px-3 font-semibold text-gray-200 border-b border-[#19bcd6]">Result</th>
                        <th className="text-left py-3 px-3 font-semibold text-gray-200 border-b border-[#19bcd6]">Timestamp</th>
                        <th className="text-left py-3 px-3 font-semibold text-gray-200 border-b border-[#19bcd6]">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {attemptHistory.map((attempt, idx) => (
                        <tr key={attempt.id} className="border-b border-[#19bcd6]/50">
                          <td className="py-2.5 px-3 text-gray-200">{idx + 1}</td>
                          <td className="py-2.5 px-3">
                            <select
                              value={attempt.symbol}
                              onChange={(e) => updateAttemptSymbol(attempt.id, e.target.value)}
                              className="px-2 py-1 bg-[#101a34] text-gray-200 border border-[#19bcd6] rounded text-sm focus:outline-none focus:border-[#27a9e1]"
                            >
                              <option value="1">1</option>
                              <option value="Z">Zone</option>
                              <option value="T">Top</option>
                            </select>
                          </td>
                          <td className="py-2.5 px-3 text-sm text-gray-400">
                            {formatTimestamp(attempt.createdAt)}
                          </td>
                          <td className="py-2.5 px-3">
                            <button
                              onClick={() => deleteAttempt(attempt.id)}
                              className="px-2 py-1 text-xs border border-[#a85555] bg-[#a85555]/10 text-[#fca5a5] rounded hover:bg-[#a85555]/20 transition-colors"
                            >
                              Delete
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              <div className="flex items-center gap-3 mt-3">
                <button
                  onClick={closeEditPanel}
                  className="px-3 py-1.5 text-sm border border-[#19bcd6] bg-transparent text-gray-300 rounded-lg hover:border-[#27a9e1] hover:text-[#27a9e1] transition-colors"
                >
                  Close
                </button>
              </div>
            </section>
          )}

          {/* Navigation */}
          <div className="mt-8 text-center">
            <Link href="/" className="text-[#27a9e1] hover:underline">
              ← Back to Home
            </Link>
          </div>
        </div>
      </Container>
    </main>
  );
}
