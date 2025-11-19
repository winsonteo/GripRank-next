'use client';

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import Container from "@/components/Container";
import { firestore } from "@/lib/firebase/client";
import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  query,
  where,
  type DocumentData,
  type QuerySnapshot,
} from "firebase/firestore";
import {
  buildLeaderboardRows,
  type AttemptDoc,
  type DetailMeta,
  type LeaderboardRow,
} from "@/lib/boulder/scoring";

type RoundType = "qualification" | "final";

interface BoulderCompetition {
  id: string;
  name?: string;
  status?: string;
  updatedAt?: unknown;
}

interface BoulderCategory {
  id: string;
  name?: string;
  order?: number;
  updatedAt?: unknown;
}

export default function LeaderboardPage() {
  return (
    <Suspense fallback={<LeaderboardFallback />}>
      <LeaderboardContent />
    </Suspense>
  );
}

function LeaderboardContent() {
  const searchParams = useSearchParams();
  const initialSelectionsRef = useRef({
    compId: searchParams?.get("compId") || null,
    categoryId: searchParams?.get("categoryId") || null,
    usedComp: false,
    usedCategory: false,
  });

  const initialRoundParam = searchParams?.get("round");
  const [round, setRound] = useState<RoundType>(
    initialRoundParam === "final" ? "final" : "qualification"
  );

  const [competitions, setCompetitions] = useState<BoulderCompetition[]>([]);
  const [competitionsLoading, setCompetitionsLoading] = useState(true);
  const [selectedComp, setSelectedComp] = useState("");

  const [categories, setCategories] = useState<BoulderCategory[]>([]);
  const [categoriesLoading, setCategoriesLoading] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState("");

  const [rows, setRows] = useState<LeaderboardRow[]>([]);
  const [rowsLoading, setRowsLoading] = useState(false);
  const [rowsError, setRowsError] = useState<string | null>(null);
  const [leaderboardNote, setLeaderboardNote] = useState("");

  const renderTokenRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    async function loadCompetitions() {
      setCompetitionsLoading(true);
      try {
        const snap = await getDocs(collection(firestore, "boulderComps"));
        if (cancelled) return;
        const comps: BoulderCompetition[] = snap.docs
          .map((docSnap) => {
            const data = (docSnap.data() || {}) as Partial<BoulderCompetition>;
            return { id: docSnap.id, ...data };
          })
          .filter(
            (comp) =>
              !["archived", "deleted"].includes(
                (comp.status || "").toString().toLowerCase()
              )
          );
        comps.sort(
          (a, b) => timestampValue(b.updatedAt) - timestampValue(a.updatedAt)
        );
        setCompetitions(comps);
      } catch (error) {
        console.error(error);
        setCompetitions([]);
      } finally {
        if (!cancelled) {
          setCompetitionsLoading(false);
        }
      }
    }
    loadCompetitions();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!competitions.length) {
      setSelectedComp("");
      return;
    }
    setSelectedComp((current) => {
      if (current && competitions.some((c) => c.id === current)) {
        return current;
      }
      const { compId, usedComp } = initialSelectionsRef.current;
      if (!usedComp && compId && competitions.some((c) => c.id === compId)) {
        initialSelectionsRef.current.usedComp = true;
        return compId;
      }
      return competitions[0]?.id || "";
    });
  }, [competitions]);

  useEffect(() => {
    if (!selectedComp) {
      setCategories([]);
      setSelectedCategory("");
      return;
    }
    let cancelled = false;
    async function loadCategories() {
      setCategoriesLoading(true);
      try {
        const snap = await getDocs(
          collection(firestore, `boulderComps/${selectedComp}/categories`)
        );
        if (cancelled) return;
        const cats: BoulderCategory[] = snap.docs.map((docSnap) => {
          const data = (docSnap.data() || {}) as Partial<BoulderCategory>;
          return { id: docSnap.id, ...data };
        });
        cats.sort((a, b) => {
          const orderA =
            typeof a.order === "number" ? a.order : Number.POSITIVE_INFINITY;
          const orderB =
            typeof b.order === "number" ? b.order : Number.POSITIVE_INFINITY;
          if (orderA !== orderB) return orderA - orderB;
          return (a.name || a.id || "").localeCompare(b.name || b.id || "");
        });
        setCategories(cats);
        setSelectedCategory((current) => {
          if (current && cats.some((c) => c.id === current)) {
            return current;
          }
          const { categoryId, usedCategory } = initialSelectionsRef.current;
          if (
            !usedCategory &&
            categoryId &&
            cats.some((c) => c.id === categoryId)
          ) {
            initialSelectionsRef.current.usedCategory = true;
            return categoryId;
          }
          if (!cats.length) return "";
          const latest = cats.reduce((best, cat) => {
            return timestampValue(cat.updatedAt) >
              timestampValue(best?.updatedAt)
              ? cat
              : best;
          }, cats[0]);
          return latest?.id || cats[0].id;
        });
      } catch (error) {
        console.error(error);
        if (!cancelled) {
          setCategories([]);
          setSelectedCategory("");
        }
      } finally {
        if (!cancelled) {
          setCategoriesLoading(false);
        }
      }
    }
    loadCategories();
    return () => {
      cancelled = true;
    };
  }, [selectedComp]);

  useEffect(() => {
    if (!selectedComp || !selectedCategory) {
      setLeaderboardNote("");
      return;
    }
    const noteRef = doc(
      firestore,
      `boulderComps/${selectedComp}/categories/${selectedCategory}`
    );
    const unsubscribe = onSnapshot(
      noteRef,
      (snap) => {
        const note =
          snap.exists() && typeof snap.data().leaderboardNote === "string"
            ? snap.data().leaderboardNote
            : "";
        setLeaderboardNote(note);
      },
      () => setLeaderboardNote("")
    );
    return () => unsubscribe();
  }, [selectedComp, selectedCategory]);

  useEffect(() => {
    if (!selectedComp || !selectedCategory) {
      setRows([]);
      setRowsError(null);
      setRowsLoading(false);
      return;
    }
    setRowsLoading(true);
    setRowsError(null);
    const attemptsRef = collection(
      firestore,
      `boulderComps/${selectedComp}/attempts`
    );
    const attemptsQuery = query(
      attemptsRef,
      where("categoryId", "==", selectedCategory),
      where("round", "==", round)
    );

    const unsubscribe = onSnapshot(
      attemptsQuery,
      async (snapshot) => {
        const token = ++renderTokenRef.current;
        const attemptDocs = toAttemptDocs(snapshot);
        try {
          const routeCollection = round === "final" ? "finalRoutes" : "routes";
          const [athletesSnap, detailSnap, routesSnap] = await Promise.all([
            getDocs(
              query(
                collection(firestore, `boulderComps/${selectedComp}/athletes`),
                where("categoryId", "==", selectedCategory)
              )
            ),
            getDocs(
              collection(
                firestore,
                `boulderComps/${selectedComp}/categories/${selectedCategory}/details`
              )
            ),
            getDocs(
              collection(
                firestore,
                `boulderComps/${selectedComp}/categories/${selectedCategory}/${routeCollection}`
              )
            ),
          ]);
          if (token !== renderTokenRef.current) return;

          const athletes = new Map<string, { bib?: string; name?: string; team?: string }>();
          athletesSnap.forEach((docSnap) => {
            const data = docSnap.data() || {};
            athletes.set(docSnap.id, {
              bib: data.bib || "",
              name: data.name || docSnap.id,
              team: data.team || "",
            });
          });

          const detailMeta = new Map<string, DetailMeta>();
          if (round !== "final") {
            detailSnap.forEach((docSnap) => {
              const data = docSnap.data() || {};
              const id = String(docSnap.id);
              detailMeta.set(`detail:${id}`, {
                type: "detail",
                detailIndex: id,
                label: data.label || `Detail ${id}`,
                order:
                  typeof data.order === "number"
                    ? data.order
                    : Number(id),
              });
            });
          }

          if (round !== "final" && !detailMeta.size) {
            athletesSnap.forEach((docSnap) => {
              const data = docSnap.data() || {};
              const detailValue =
                data.detailIndex ?? data.detail ?? data.detailId;
              if (detailValue == null) return;
              const value = String(detailValue).trim();
              if (!value) return;
              const key = `detail:${value}`;
              if (!detailMeta.has(key)) {
                detailMeta.set(key, {
                  type: "detail",
                  detailIndex: value,
                  label: `Detail ${value}`,
                  order: Number(value),
                });
              }
            });
          }

          routesSnap.docs.forEach((docSnap, index) => {
            const data = docSnap.data() || {};
            const routeId = docSnap.id;
            const key = `route:${routeId}`;
            const orderGuess = Number.isFinite(Number(data.order))
              ? Number(data.order)
              : parseInt(routeId.replace(/\D+/g, ""), 10);
            detailMeta.set(key, {
              type: "route",
              routeId,
              detailIndex:
                data.detailIndex != null
                  ? String(data.detailIndex)
                  : routeId,
              label: data.label
                ? `${data.label}`
                : `Boulder ${Number.isFinite(orderGuess) ? orderGuess : index + 1}`,
              order: Number.isFinite(orderGuess)
                ? Number(orderGuess)
                : Number.MAX_SAFE_INTEGER,
            });
          });

          const leaderboardRows = buildLeaderboardRows({
            attemptDocs,
            athletesById: athletes,
            detailsMeta: detailMeta,
          });

          if (token !== renderTokenRef.current) return;
          setRows(leaderboardRows);
          setRowsLoading(false);
        } catch (error) {
          console.error(error);
          if (token !== renderTokenRef.current) return;
          setRows([]);
          setRowsError("Failed to load leaderboard data.");
          setRowsLoading(false);
        }
      },
      (error) => {
        console.error(error);
        setRows([]);
        setRowsError("Realtime updates unavailable.");
        setRowsLoading(false);
      }
    );

    return () => {
      renderTokenRef.current += 1;
      unsubscribe();
    };
  }, [selectedComp, selectedCategory, round]);

  const rankedRows = useMemo(() => {
    let prevKey: string | null = null;
    let currentRank = 0;
    return rows.map((row, idx) => {
      const key = `${row.points}-${row.tops}-${row.zones}`;
      if (key !== prevKey) {
        currentRank = idx + 1;
        prevKey = key;
      }
      return { row, rank: currentRank };
    });
  }, [rows]);

  const disableCategorySelect = !selectedComp || categoriesLoading;

  return (
    <main className="py-12 text-white">
      <Container className="space-y-8">
        <header className="space-y-2">
          <p className="text-sm uppercase tracking-wide text-blue-300">
            Live Results
          </p>
          <h1 className="text-4xl font-bold">Boulder Leaderboard</h1>
          <p className="text-base text-neutral-400">
            Choose a competition, category, and round to view live standings.
          </p>
        </header>

        <section className="rounded-2xl border border-neutral-800 bg-neutral-900/70 p-6 backdrop-blur">
          <div className="grid gap-4 md:grid-cols-3">
            <FilterField
              label="Competition"
              helpText={
                competitionsLoading
                  ? "Loading competitions…"
                  : !competitions.length
                  ? "No competitions available"
                  : undefined
              }
            >
              <select
                className="mt-2 w-full rounded-xl border border-neutral-800 bg-neutral-950 px-4 py-3 text-sm text-white focus:border-blue-500 focus:outline-none"
                value={selectedComp}
                onChange={(event) => setSelectedComp(event.target.value)}
                disabled={competitionsLoading || !competitions.length}
              >
                <option value="">Select competition</option>
                {competitions.map((comp) => (
                  <option key={comp.id} value={comp.id}>
                    {comp.name || comp.id}
                  </option>
                ))}
              </select>
            </FilterField>

            <FilterField
              label="Category"
              helpText={
                !selectedComp
                  ? "Select a competition first"
                  : categoriesLoading
                  ? "Loading categories…"
                  : !categories.length
                  ? "No categories found"
                  : undefined
              }
            >
              <select
                className="mt-2 w-full rounded-xl border border-neutral-800 bg-neutral-950 px-4 py-3 text-sm text-white focus:border-blue-500 focus:outline-none disabled:opacity-60"
                value={selectedCategory}
                onChange={(event) => setSelectedCategory(event.target.value)}
                disabled={disableCategorySelect || !categories.length}
              >
                <option value="">Select category</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name || cat.id}
                  </option>
                ))}
              </select>
            </FilterField>

            <FilterField label="Round">
              <select
                className="mt-2 w-full rounded-xl border border-neutral-800 bg-neutral-950 px-4 py-3 text-sm text-white focus:border-blue-500 focus:outline-none"
                value={round}
                onChange={(event) =>
                  setRound(event.target.value as RoundType)
                }
              >
                <option value="qualification">Qualification</option>
                <option value="final">Final</option>
              </select>
            </FilterField>
          </div>
        </section>

        <section className="rounded-2xl border border-neutral-800 bg-neutral-950/60 p-6">
          <div className="overflow-x-auto">
            <table className="min-w-full table-fixed text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wider text-neutral-400">
                  <th className="w-16 pb-3 font-semibold">Rank</th>
                  <th className="w-64 pb-3 font-semibold">Athlete</th>
                  <th className="pb-3 font-semibold">Route Scores</th>
                  <th className="w-20 pb-3 font-semibold text-right">Points</th>
                </tr>
              </thead>
              <tbody>
                {renderTableBody({
                  rowsLoading,
                  rowsError,
                  rankedRows,
                  hasSelection: Boolean(selectedComp && selectedCategory),
                })}
              </tbody>
            </table>
          </div>
          {leaderboardNote ? (
            <p className="mt-4 text-sm text-neutral-400 whitespace-pre-line">
              {leaderboardNote}
            </p>
          ) : null}
        </section>
      </Container>
    </main>
  );
}

function LeaderboardFallback() {
  return (
    <main className="py-12 text-white">
      <Container className="space-y-6">
        <div className="space-y-2">
          <div className="h-4 w-32 animate-pulse rounded bg-neutral-800" />
          <div className="h-8 w-72 animate-pulse rounded bg-neutral-800" />
        </div>
        <div className="h-40 animate-pulse rounded-2xl border border-neutral-800 bg-neutral-900/60" />
        <div className="h-64 animate-pulse rounded-2xl border border-neutral-800 bg-neutral-900/60" />
      </Container>
    </main>
  );
}

function FilterField({
  label,
  children,
  helpText,
}: {
  label: string;
  children: ReactNode;
  helpText?: string;
}) {
  return (
    <label className="block text-sm font-medium text-neutral-200">
      {label}
      {children}
      {helpText ? (
        <span className="mt-2 block text-xs text-neutral-500">{helpText}</span>
      ) : null}
    </label>
  );
}

function renderTableBody({
  rowsLoading,
  rowsError,
  rankedRows,
  hasSelection,
}: {
  rowsLoading: boolean;
  rowsError: string | null;
  rankedRows: { row: LeaderboardRow; rank: number }[];
  hasSelection: boolean;
}) {
  if (!hasSelection) {
    return (
      <TableMessage message="Select a competition and category to view scores." />
    );
  }
  if (rowsLoading) {
    return <TableMessage message="Loading leaderboard…" />;
  }
  if (rowsError) {
    return <TableMessage message={rowsError} />;
  }
  if (!rankedRows.length) {
    return <TableMessage message="No attempts recorded yet." />;
  }

  return rankedRows.map(({ row, rank }) => (
    <tr
      key={row.athleteId}
      className="border-t border-neutral-900 text-sm last:border-b"
    >
      <td className="py-4 font-semibold text-neutral-300">{rank}</td>
      <td className="py-4">
        <div className="font-semibold">{row.name}</div>
        {row.team ? (
          <div className="text-xs uppercase tracking-wide text-neutral-500">
            {row.team}
          </div>
        ) : null}
      </td>
      <td className="py-4">
        <RouteCells routes={row.routes} />
      </td>
      <td className="py-4 text-right text-base font-semibold">
        {row.points.toFixed(1)}
      </td>
    </tr>
  ));
}

function TableMessage({ message }: { message: string }) {
  return (
    <tr>
      <td colSpan={4} className="py-10 text-center text-sm text-neutral-400">
        {message}
      </td>
    </tr>
  );
}

function RouteCells({ routes }: { routes: LeaderboardRow["routes"] }) {
  if (!routes.length) {
    return (
      <div className="text-sm text-neutral-500">No routes configured yet.</div>
    );
  }
  return (
    <div className="flex flex-wrap gap-2">
      {routes.map((route) => {
        const hasTop = route.topAttempt != null;
        const hasZone = route.zoneAttempt != null;
        const stateClass = hasTop
          ? "border-emerald-400/70 bg-emerald-500/10"
          : hasZone
          ? "border-amber-400/70 bg-amber-500/10"
          : "border-neutral-800 bg-neutral-900/80";
        const titleParts = [];
        if (route.detailLabel) titleParts.push(route.detailLabel);
        if (hasTop) titleParts.push(`Top @ ${route.topAttempt}`);
        else if (hasZone) titleParts.push(`Zone @ ${route.zoneAttempt}`);
        const title = titleParts.join(" • ");
        return (
          <div
            key={route.key}
            className={`flex h-16 w-16 flex-col items-center justify-between rounded-lg border px-2 py-2 text-center text-xs font-semibold transition ${stateClass}`}
            title={title}
          >
            <div className="text-lg leading-none">
              {hasTop ? route.topAttempt : ""}
            </div>
            <div className="text-[11px] uppercase tracking-wide text-neutral-400">
              {hasZone ? route.zoneAttempt : ""}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function toAttemptDocs(snapshot: QuerySnapshot<DocumentData>): AttemptDoc[] {
  return snapshot.docs.map((docSnap) => {
    const data = docSnap.data() || {};
    const clientAtMs =
      typeof data.clientAtMs === "number" ? data.clientAtMs : null;
    const clientAtTimestamp =
      data?.clientAt != null ? timestampValue(data.clientAt) : null;
    const createdAtField =
      data?.createdAt != null ? timestampValue(data.createdAt) : null;
    const createdAt =
      clientAtMs ??
      clientAtTimestamp ??
      createdAtField ??
      0;
    return {
      athleteId: data.athleteId,
      detailIndex:
        data.detailIndex != null ? String(data.detailIndex) : undefined,
      routeId: data.routeId,
      symbol: data.symbol,
      round: data.round,
      createdAt,
    };
  });
}

function timestampValue(input: unknown): number {
  if (!input) return 0;
  if (typeof input === "number") return input;
  if (input instanceof Date) return input.getTime();
  // Firestore Timestamp
  if (typeof (input as { toMillis?: () => number }).toMillis === "function") {
    const millis = (input as { toMillis: () => number }).toMillis();
    return Number.isFinite(millis) ? millis : 0;
  }
  if (
    typeof (input as { seconds?: number }).seconds === "number" &&
    typeof (input as { nanoseconds?: number }).nanoseconds === "number"
  ) {
    const ts = input as { seconds: number; nanoseconds: number };
    return ts.seconds * 1000 + ts.nanoseconds / 1e6;
  }
  return 0;
}
