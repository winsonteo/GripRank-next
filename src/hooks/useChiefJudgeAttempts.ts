'use client';

import { useEffect, useState } from 'react';
import { firestore } from '@/lib/firebase/client';
import {
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  getDocs,
} from 'firebase/firestore';

/**
 * Normalize detailIndex to number for consistent Firestore queries and writes.
 *
 * RATIONALE:
 * - Legacy data stores detailIndex as number
 * - UI/URLs may provide strings
 * - Firestore queries must use the same type as stored data
 *
 * @param detailIndex - String or number from UI/state
 * @returns number if parseable, undefined if empty/invalid
 */
export function normalizeDetailIndex(detailIndex: string | number | undefined): number | undefined {
  if (detailIndex === undefined || detailIndex === null || detailIndex === '') {
    return undefined;
  }

  const parsed = typeof detailIndex === 'number' ? detailIndex : Number(detailIndex);
  return Number.isNaN(parsed) ? undefined : parsed;
}

/**
 * Athlete with attempt sequence
 * Used by Chief Judge to display aggregated attempts per athlete
 */
export interface AthleteWithAttempts {
  id: string;
  bib: string;
  name: string;
  team?: string;
  sequence: string; // e.g. "1Z1T" - attempts in chronological order
}

/**
 * Attempt record from Firestore
 * Source: /boulderComps/{compId}/attempts/{attemptId}
 */
interface AttemptRecord {
  id: string;
  athleteId: string;
  routeId: string;
  symbol: string;
  clientAtMs?: number;
  enteredBy?: string;
}

/**
 * Athlete record from Firestore
 * Source: /boulderComps/{compId}/athletes/{athleteId}
 */
interface AthleteRecord {
  id: string;
  bib?: string;
  name?: string;
  team?: string;
  categoryId?: string;
  detailIndex?: string;
}

/**
 * useChiefJudgeAttempts - Fetch and aggregate attempts for Chief Judge view
 *
 * DATA SOURCE:
 * - Athletes: /boulderComps/{compId}/athletes
 * - Attempts: /boulderComps/{compId}/attempts
 *
 * AGGREGATION LOGIC:
 * 1. Fetch all athletes in the selected category/detail
 * 2. Subscribe to attempts matching: category, route, round, detail (if qualification)
 * 3. Aggregate attempts by athleteId in chronological order
 * 4. Join symbols into sequence string (e.g. "1Z1T")
 *
 * LIVE UPDATES:
 * Uses Firestore onSnapshot for real-time attempt updates
 *
 * @param compId - Competition ID
 * @param categoryId - Category ID to filter athletes and attempts
 * @param round - "qualification" or "final"
 * @param routeId - Route ID to filter attempts
 * @param detailIndex - Detail/group index (for qualification rounds only)
 */
export function useChiefJudgeAttempts(
  compId: string,
  categoryId: string,
  round: 'qualification' | 'final',
  routeId: string,
  detailIndex?: string
) {
  const [athletes, setAthletes] = useState<AthleteWithAttempts[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Reset state when parameters change
    setAthletes([]);
    setLoading(true);
    setError(null);

    // Validate required parameters (routeId is optional for "All Boulders")
    if (!compId || !categoryId || !firestore) {
      setLoading(false);
      return;
    }

    // CRITICAL: Track if this effect is still active
    // Prevents stale updates from old subscriptions
    let isActive = true;
    let unsubscribe: (() => void) | undefined;

    // Normalize detailIndex once for this effect
    const normalizedDetailIndex = normalizeDetailIndex(detailIndex);

    // Step 1: Build athletes query and fetch once
    const athletesRef = collection(firestore!, `boulderComps/${compId}/athletes`);
    const athleteFilters = [where('categoryId', '==', categoryId)];

    // For qualification rounds, filter by detailIndex (normalized to number)
    if (round === 'qualification' && normalizedDetailIndex !== undefined) {
      athleteFilters.push(where('detailIndex', '==', normalizedDetailIndex));
    }

    const athletesQuery = query(athletesRef, ...athleteFilters);

    // Step 2: Build attempts query for real-time updates
    const attemptsRef = collection(firestore!, `boulderComps/${compId}/attempts`);
    const attemptFilters = [
      where('categoryId', '==', categoryId),
      where('round', '==', round),
    ];

    // Add routeId filter only if a specific route is selected
    if (routeId) {
      attemptFilters.push(where('routeId', '==', routeId));
    }

    // For qualification rounds, filter by detailIndex (normalized to number)
    if (round === 'qualification' && normalizedDetailIndex !== undefined) {
      attemptFilters.push(where('detailIndex', '==', normalizedDetailIndex));
    }

    const attemptsQuery = query(
      attemptsRef,
      ...attemptFilters,
      orderBy('clientAtMs', 'desc')  // Changed to DESC to match existing index
    );

    // Fetch athletes once, then set up listener
    getDocs(athletesQuery)
      .then((athletesSnapshot) => {
        if (!isActive) return; // Effect already cleaned up

        const athletesMap = new Map<string, AthleteRecord>();
        athletesSnapshot.forEach((doc) => {
          athletesMap.set(doc.id, {
            id: doc.id,
            ...doc.data()
          } as AthleteRecord);
        });

        // Subscribe to real-time attempt updates
        // This must happen AFTER athletes are loaded but INSIDE the promise
        unsubscribe = onSnapshot(
          attemptsQuery,
          (snapshot) => {
            if (!isActive) return; // Ignore if effect cleaned up
            // Aggregate attempts by athlete (and route if showing all routes)
            const attemptsByAthlete = new Map<string, string[]>();

            // Sort by clientAtMs ascending since query is DESC
            const sortedDocs = snapshot.docs.sort((a, b) => {
              const aMs = a.data().clientAtMs || 0;
              const bMs = b.data().clientAtMs || 0;
              return aMs - bMs;
            });

            sortedDocs.forEach((doc) => {
              const attempt = doc.data() as AttemptRecord;
              // For "All Boulders", group by athlete+route; otherwise just athlete
              const key = routeId ? attempt.athleteId : `${attempt.athleteId}_${attempt.routeId}`;

              if (!attemptsByAthlete.has(key)) {
                attemptsByAthlete.set(key, []);
              }
              if (attempt.symbol) {
                attemptsByAthlete.get(key)!.push(attempt.symbol);
              }
            });

            // Build athlete list with sequences
            const athletesWithAttempts: AthleteWithAttempts[] = [];

            if (routeId) {
              // Single route: one row per athlete
              athletesMap.forEach((athlete, athleteId) => {
                const sequence = attemptsByAthlete.get(athleteId) || [];
                athletesWithAttempts.push({
                  id: athleteId,
                  bib: athlete.bib || '',
                  name: athlete.name || 'Unknown',
                  team: athlete.team,
                  sequence: sequence.join(''), // e.g. "1Z1T"
                });
              });
            } else {
              // All routes: multiple rows per athlete (one per route)
              attemptsByAthlete.forEach((sequence, key) => {
                const [athleteId] = key.split('_');
                const athlete = athletesMap.get(athleteId);
                if (athlete) {
                  athletesWithAttempts.push({
                    id: key, // Use composite key for unique rows
                    bib: athlete.bib || '',
                    name: athlete.name || 'Unknown',
                    team: athlete.team,
                    sequence: sequence.join(''),
                  });
                }
              });
            }

            // Sort by bib number
            athletesWithAttempts.sort((a, b) => {
              const bibA = parseInt(a.bib) || 0;
              const bibB = parseInt(b.bib) || 0;
              return bibA - bibB;
            });

            setAthletes(athletesWithAttempts);
            setLoading(false);
          },
          (err) => {
            if (!isActive) return; // Ignore if effect cleaned up
            console.error('Error fetching attempts:', err);
            setError('Failed to load attempts. Please try again.');
            setLoading(false);
          }
        );
      })
      .catch((err) => {
        if (!isActive) return; // Ignore if effect cleaned up
        console.error('Error fetching chief judge data:', err);
        setError('Failed to load data. Please try again.');
        setLoading(false);
      });

    // Cleanup: mark effect as inactive and unsubscribe from listener
    return () => {
      isActive = false;
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, [compId, categoryId, round, routeId, detailIndex]);

  return { athletes, loading, error };
}
