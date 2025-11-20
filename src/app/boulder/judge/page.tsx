'use client';

import { useEffect, useState, useRef, useMemo } from "react";
import { UserButton, useUser } from "@clerk/nextjs";
import Image from "next/image";
import Link from "next/link";
import Container from "@/components/Container";
import { firestore } from "@/lib/firebase/client";
import {
  collection,
  getDocs,
  query,
  orderBy,
  where,
  addDoc,
  serverTimestamp,
} from "firebase/firestore";

interface Competition {
  id: string;
  name?: string;
  status?: string;
  updatedAt?: unknown;
}

interface Category {
  id: string;
  name?: string;
  order?: number;
  updatedAt?: unknown;
}

interface RouteDetail {
  id: string;
  label?: string;
  order?: number;
  detailIndex?: string;
}

interface Athlete {
  id: string;
  bib?: string;
  name?: string;
  team?: string;
  categoryId?: string;
  detailIndex?: string;
  detail?: string;
  detailId?: string;
}

type RoundType = "qualification" | "final";

export default function JudgePage() {
  const { user, isLoaded } = useUser();

  const [competitions, setCompetitions] = useState<Competition[]>([]);
  const [competitionsLoading, setCompetitionsLoading] = useState(true);
  const [selectedComp, setSelectedComp] = useState("");

  const [categories, setCategories] = useState<Category[]>([]);
  const [categoriesLoading, setCategoriesLoading] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState("");

  const [round, setRound] = useState<RoundType>("qualification");

  const [routes, setRoutes] = useState<RouteDetail[]>([]);
  const [routesLoading, setRoutesLoading] = useState(false);
  const [selectedRoute, setSelectedRoute] = useState("");

  const [details, setDetails] = useState<RouteDetail[]>([]);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [selectedDetail, setSelectedDetail] = useState("");

  const [athletes, setAthletes] = useState<Athlete[]>([]);
  const [athletesLoading, setAthletesLoading] = useState(false);
  const [selectedAthlete, setSelectedAthlete] = useState<Athlete | null>(null);
  const [lastAthlete, setLastAthlete] = useState<Athlete | null>(null);

  const [selectedSymbol, setSelectedSymbol] = useState<"1" | "Z" | "T" | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");

  const [timerSeconds, setTimerSeconds] = useState(60);
  const [timerRunning, setTimerRunning] = useState(false);
  const [timerDisplay, setTimerDisplay] = useState("01:00");

  const [contextExpanded, setContextExpanded] = useState(true);
  const [rosterExpanded, setRosterExpanded] = useState(true);

  const initialSelectionsRef = useRef({
    usedComp: false,
    usedCategory: false,
    usedRoute: false,
    usedDetail: false,
  });

  // Load competitions on mount
  useEffect(() => {
    if (!firestore) return;
    const db = firestore; // Capture non-null value for TypeScript

    const loadCompetitions = async () => {
      setCompetitionsLoading(true);
      try {
        const snapshot = await getDocs(collection(db, "boulderComps"));
        const comps = snapshot.docs
          .map((doc) => ({
            id: doc.id,
            ...doc.data(),
          }))
          .filter((comp: Competition) =>
            !["archived", "deleted"].includes(
              (comp.status || "").toString().toLowerCase()
            )
          ) as Competition[];
        comps.sort(
          (a, b) => {
            const getTime = (timestamp: unknown): number => {
              if (!timestamp) return 0;
              if (typeof timestamp === 'number') return timestamp;
              if (typeof (timestamp as { toMillis?: () => number }).toMillis === 'function') {
                return (timestamp as { toMillis: () => number }).toMillis();
              }
              return 0;
            };
            return getTime(b.updatedAt) - getTime(a.updatedAt);
          }
        );
        setCompetitions(comps);

        // Auto-select first competition if available
        if (comps.length > 0 && !initialSelectionsRef.current.usedComp) {
          setSelectedComp(comps[0].id);
          initialSelectionsRef.current.usedComp = true;
        }
      } catch (error) {
        console.error("Error loading competitions:", error);
      } finally {
        setCompetitionsLoading(false);
      }
    };

    loadCompetitions();
  }, []);

  // Load categories when competition changes
  useEffect(() => {
    if (!firestore || !selectedComp) {
      setCategories([]);
      setSelectedCategory("");
      return;
    }
    const db = firestore; // Capture non-null value for TypeScript

    const loadCategories = async () => {
      setCategoriesLoading(true);
      try {
        const q = query(
          collection(db, `boulderComps/${selectedComp}/categories`),
          orderBy("order", "asc")
        );
        const snapshot = await getDocs(q);
        const cats = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as Category[];
        setCategories(cats);

        // Auto-select first category if available
        if (cats.length > 0 && !initialSelectionsRef.current.usedCategory) {
          setSelectedCategory(cats[0].id);
          initialSelectionsRef.current.usedCategory = true;
        }
      } catch (error) {
        console.error("Error loading categories:", error);
      } finally {
        setCategoriesLoading(false);
      }
    };

    loadCategories();
  }, [selectedComp]);

  // Load routes when category or round changes
  useEffect(() => {
    if (!firestore || !selectedComp || !selectedCategory) {
      setRoutes([]);
      setSelectedRoute("");
      return;
    }
    const db = firestore; // Capture non-null value for TypeScript

    const loadRoutes = async () => {
      setRoutesLoading(true);
      try {
        const routeCollection = round === "final" ? "finalRoutes" : "routes";
        const routesPath = `boulderComps/${selectedComp}/categories/${selectedCategory}/${routeCollection}`;
        const q = query(
          collection(db, routesPath),
          orderBy("order", "asc")
        );
        const snapshot = await getDocs(q);
        const rts = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as RouteDetail[];
        setRoutes(rts);

        // Auto-select first route if available
        if (rts.length > 0 && !initialSelectionsRef.current.usedRoute) {
          setSelectedRoute(rts[0].id);
          initialSelectionsRef.current.usedRoute = true;
        }
      } catch (error) {
        console.error("Error loading routes:", error);
      } finally {
        setRoutesLoading(false);
      }
    };

    loadRoutes();
  }, [selectedComp, selectedCategory, round]);

  // Load details when route changes
  useEffect(() => {
    if (!firestore || !selectedComp || !selectedCategory || !selectedRoute) {
      setDetails([]);
      setSelectedDetail("");
      return;
    }
    const db = firestore; // Capture non-null value for TypeScript

    const loadDetails = async () => {
      setDetailsLoading(true);
      try {
        const detailsPath = `boulderComps/${selectedComp}/categories/${selectedCategory}/details`;
        const q = query(
          collection(db, detailsPath),
          orderBy("order", "asc")
        );
        const snapshot = await getDocs(q);
        const dets = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as RouteDetail[];
        setDetails(dets);

        // Auto-select first detail if available
        if (dets.length > 0 && !initialSelectionsRef.current.usedDetail) {
          setSelectedDetail(dets[0].id);
          initialSelectionsRef.current.usedDetail = true;
        }
      } catch (error) {
        console.error("Error loading details:", error);
      } finally {
        setDetailsLoading(false);
      }
    };

    loadDetails();
  }, [selectedComp, selectedCategory, selectedRoute, round]);

  // Load athletes when category and detail change
  useEffect(() => {
    if (!firestore || !selectedComp || !selectedCategory) {
      setAthletes([]);
      setSelectedAthlete(null);
      return;
    }
    const db = firestore; // Capture non-null value for TypeScript

    const loadAthletes = async () => {
      setAthletesLoading(true);
      try {
        const athletesPath = `boulderComps/${selectedComp}/athletes`;
        const q = query(
          collection(db, athletesPath),
          where("categoryId", "==", selectedCategory)
        );
        const snapshot = await getDocs(q);
        let allAthletes = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as Athlete[];

        // For qualification rounds, filter by detail
        if (round === "qualification" && selectedDetail) {
          const selectedDetailObj = details.find(d => d.id === selectedDetail);
          const detailIndexToMatch = selectedDetailObj?.detailIndex || selectedDetailObj?.id || selectedDetail;

          allAthletes = allAthletes.filter((athlete) => {
            const athleteDetail = athlete.detailIndex || athlete.detail || athlete.detailId;
            return athleteDetail && String(athleteDetail) === String(detailIndexToMatch);
          });
        }

        // Sort by bib number
        allAthletes.sort((a, b) => {
          const bibA = a.bib ? parseInt(a.bib, 10) : Number.MAX_SAFE_INTEGER;
          const bibB = b.bib ? parseInt(b.bib, 10) : Number.MAX_SAFE_INTEGER;
          return bibA - bibB;
        });

        setAthletes(allAthletes);
      } catch (error) {
        console.error("Error loading athletes:", error);
      } finally {
        setAthletesLoading(false);
      }
    };

    loadAthletes();
  }, [selectedComp, selectedCategory, selectedDetail, round, details]);

  const handleNextDetail = () => {
    if (!details.length) return;

    const currentIndex = details.findIndex((d) => d.id === selectedDetail);
    if (currentIndex === -1 || currentIndex === details.length - 1) {
      // At the end, wrap to first
      setSelectedDetail(details[0].id);
    } else {
      // Move to next
      setSelectedDetail(details[currentIndex + 1].id);
    }
  };

  const handleSelectAthlete = (athlete: Athlete) => {
    setSelectedAthlete(athlete);
    setSelectedSymbol(null); // Reset symbol when selecting new athlete
    setSaveMessage("");
  };

  const handlePrevFinalist = () => {
    if (!athletes.length || !selectedAthlete) return;
    const currentIndex = athletes.findIndex((a) => a.id === selectedAthlete.id);
    if (currentIndex <= 0) {
      // At start, wrap to last
      setSelectedAthlete(athletes[athletes.length - 1]);
    } else {
      setSelectedAthlete(athletes[currentIndex - 1]);
    }
  };

  const handleNextFinalist = () => {
    if (!athletes.length || !selectedAthlete) return;
    const currentIndex = athletes.findIndex((a) => a.id === selectedAthlete.id);
    if (currentIndex === -1 || currentIndex === athletes.length - 1) {
      // At end, wrap to first
      setSelectedAthlete(athletes[0]);
    } else {
      setSelectedAthlete(athletes[currentIndex + 1]);
    }
  };

  const handleBackToLastAthlete = () => {
    if (lastAthlete) {
      setSelectedAthlete(lastAthlete);
      setSelectedSymbol(null);
      setSaveMessage("");
    }
  };

  const handleSaveAttempt = async () => {
    if (!firestore || !selectedAthlete || !selectedSymbol || !selectedComp || !selectedCategory || !selectedRoute) {
      setSaveMessage("Missing required information");
      return;
    }

    setSaving(true);
    setSaveMessage("");

    try {
      const db = firestore;
      const attemptsPath = `boulderComps/${selectedComp}/attempts`;

      // Get detail index for qualification rounds
      const selectedDetailObj = details.find(d => d.id === selectedDetail);
      const detailIndex = selectedDetailObj?.detailIndex || selectedDetailObj?.id || selectedDetail;

      const attemptData = {
        compId: selectedComp,
        categoryId: selectedCategory,
        athleteId: selectedAthlete.id,
        routeId: selectedRoute,
        problemId: selectedRoute, // alias for routeId
        round,
        detailIndex: round === "qualification" ? detailIndex : undefined,
        symbol: selectedSymbol,
        stationId: `station_${selectedRoute}`,
        enteredBy: user?.id || null,
        clientAt: serverTimestamp(),
        clientAtMs: Date.now(),
        offline: false,
      };

      await addDoc(collection(db, attemptsPath), attemptData);

      // Success feedback
      setSaveMessage(`Saved: ${selectedSymbol} for ${selectedAthlete.name || selectedAthlete.id}`);
      setLastAthlete(selectedAthlete);
      setSelectedSymbol(null);

      // Auto-clear message after 3 seconds
      setTimeout(() => setSaveMessage(""), 3000);
    } catch (error) {
      console.error("Error saving attempt:", error);
      setSaveMessage("Error saving attempt. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleStartTimer = () => {
    setTimerRunning(true);
  };

  const handleStopTimer = () => {
    setTimerRunning(false);
  };

  // Timer effect
  useEffect(() => {
    if (!timerRunning) return;

    const interval = setInterval(() => {
      setTimerSeconds((prev) => {
        if (prev <= 1) {
          setTimerRunning(false);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [timerRunning]);

  // Update timer display
  useEffect(() => {
    const minutes = Math.floor(timerSeconds / 60);
    const seconds = timerSeconds % 60;
    setTimerDisplay(`${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`);
  }, [timerSeconds]);

  // Helper to get selected option label
  const getSelectedLabel = (items: { id: string; name?: string; label?: string }[], selectedId: string): string => {
    const item = items.find(i => i.id === selectedId);
    if (item) {
      return (item.name || item.label || item.id);
    }
    return "";
  };

  // Generate context summary
  const contextSummary = useMemo(() => {
    const compText = selectedComp ? getSelectedLabel(competitions, selectedComp) || "Comp?" : "Comp?";
    const catText = selectedCategory ? getSelectedLabel(categories, selectedCategory) || "Cat?" : "Cat?";
    const routeText = selectedRoute ? getSelectedLabel(routes, selectedRoute) || "Route?" : "Route?";
    const detailText = selectedDetail ? getSelectedLabel(details, selectedDetail) || "Detail?" : "Detail?";
    const roundText = round === "final" ? "Final" : "Qualification";

    const parts = [compText, catText, roundText, routeText];
    if (round !== "final") {
      parts.push(detailText);
    }

    return parts.join(" • ");
  }, [selectedComp, selectedCategory, selectedRoute, selectedDetail, round, competitions, categories, routes, details]);

  if (!isLoaded || !firestore) {
    return (
      <main className="py-12 text-foreground bg-background min-h-screen">
        <Container>
          <div className="text-center">Loading...</div>
        </Container>
      </main>
    );
  }

  return (
    <main className="py-12 text-foreground bg-background min-h-screen">
      <Container className="space-y-8">
        {/* Header */}
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-4">
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
            <span className="text-muted-foreground">Judge Console</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-muted-foreground">
              {user?.emailAddresses[0]?.emailAddress}
            </span>
            <UserButton afterSignOutUrl="/" />
          </div>
        </header>

        {/* Judge Station Panel */}
        <section className="rounded-2xl border border-border bg-panel p-6">
          <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
            <h2 className="text-2xl font-bold">Judge Station</h2>
            <span className="flex-1 text-sm text-muted-foreground min-w-[160px]">
              {contextSummary}
            </span>
            <button
              onClick={() => setContextExpanded(!contextExpanded)}
              className="px-4 py-2 text-sm rounded-lg border border-border bg-input hover:bg-input/80 transition-colors"
              aria-expanded={contextExpanded}
            >
              {contextExpanded ? "Hide" : "Show"}
            </button>
          </div>

          {contextExpanded && (
            <div className="grid gap-4 auto-fit-grid">
              <label className="block text-sm font-medium text-muted-foreground">
                Competition
                <select
                  className="mt-1 w-full rounded-xl border border-border bg-input px-4 py-3 text-sm text-foreground focus:border-ring focus:outline-none disabled:opacity-50"
                  value={selectedComp}
                  onChange={(e) => setSelectedComp(e.target.value)}
                  disabled={competitionsLoading}
                >
                  <option value="">
                    {competitionsLoading ? "Loading..." : "Select competition"}
                  </option>
                  {competitions.map((comp) => (
                    <option key={comp.id} value={comp.id}>
                      {comp.name || comp.id}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block text-sm font-medium text-muted-foreground">
                Category
                <select
                  className="mt-1 w-full rounded-xl border border-border bg-input px-4 py-3 text-sm text-foreground focus:border-ring focus:outline-none disabled:opacity-50"
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  disabled={!selectedComp || categoriesLoading}
                >
                  <option value="">
                    {categoriesLoading ? "Loading..." : "Select category"}
                  </option>
                  {categories.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.name || cat.id}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block text-sm font-medium text-muted-foreground">
                Round
                <select
                  className="mt-1 w-full rounded-xl border border-border bg-input px-4 py-3 text-sm text-foreground focus:border-ring focus:outline-none"
                  value={round}
                  onChange={(e) => setRound(e.target.value as RoundType)}
                >
                  <option value="qualification">Qualification</option>
                  <option value="final">Final</option>
                </select>
              </label>

              <label className="block text-sm font-medium text-muted-foreground">
                Route
                <select
                  className="mt-1 w-full rounded-xl border border-border bg-input px-4 py-3 text-sm text-foreground focus:border-ring focus:outline-none disabled:opacity-50"
                  value={selectedRoute}
                  onChange={(e) => setSelectedRoute(e.target.value)}
                  disabled={routesLoading || !routes.length}
                >
                  <option value="">
                    {routesLoading ? "Loading..." : routes.length === 0 ? "No routes available" : "Select route"}
                  </option>
                  {routes.map((route) => (
                    <option key={route.id} value={route.id}>
                      {route.label || route.id}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block text-sm font-medium text-muted-foreground">
                Detail
                <select
                  className="mt-1 w-full rounded-xl border border-border bg-input px-4 py-3 text-sm text-foreground focus:border-ring focus:outline-none disabled:opacity-50"
                  value={selectedDetail}
                  onChange={(e) => setSelectedDetail(e.target.value)}
                  disabled={detailsLoading || !details.length}
                >
                  <option value="">
                    {detailsLoading ? "Loading..." : details.length === 0 ? "No details available" : "Select detail"}
                  </option>
                  {details.map((detail) => (
                    <option key={detail.id} value={detail.id}>
                      {detail.label || detail.detailIndex || detail.id}
                    </option>
                  ))}
                </select>
              </label>

              <div className="flex items-end">
                <button
                  onClick={handleNextDetail}
                  disabled={!details.length || !selectedDetail}
                  className="w-full px-6 py-3 bg-primary text-white rounded-xl font-semibold hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed shadow-md"
                >
                  Next Detail
                </button>
              </div>
            </div>
          )}
        </section>

        {/* Detail Roster Panel */}
        <section className="rounded-2xl border border-border bg-panel p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-bold">Detail Roster</h2>
            <button
              onClick={() => setRosterExpanded(!rosterExpanded)}
              className="px-4 py-2 text-sm rounded-lg border border-border bg-input hover:bg-input/80 transition-colors"
              aria-expanded={rosterExpanded}
            >
              {rosterExpanded ? "Hide" : "Show"}
            </button>
          </div>

          {/* Finals Navigation Tools (only for final rounds) */}
          {round === "final" && rosterExpanded && athletes.length > 0 && (
            <div className="flex items-center gap-2 mb-4">
              <button
                onClick={handlePrevFinalist}
                disabled={!selectedAthlete}
                className="px-4 py-2 text-sm rounded-lg border border-border bg-input hover:bg-input/80 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Prev Finalist
              </button>
              <button
                onClick={handleNextFinalist}
                disabled={!selectedAthlete}
                className="px-4 py-2 text-sm rounded-lg border border-border bg-input hover:bg-input/80 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next Finalist
              </button>
              {selectedAthlete && (
                <span className="text-sm text-muted-foreground">
                  {athletes.findIndex(a => a.id === selectedAthlete.id) + 1} of {athletes.length}
                </span>
              )}
            </div>
          )}

          {rosterExpanded && (
            <div className="min-h-[100px] max-h-[260px] overflow-y-auto">
              {athletesLoading ? (
                <div className="text-muted-foreground text-center py-8">
                  Loading athletes...
                </div>
              ) : !selectedDetail ? (
                <div className="text-muted-foreground text-center py-8">
                  Select a detail to view athletes.
                </div>
              ) : athletes.length === 0 ? (
                <div className="text-muted-foreground text-center py-8">
                  No athletes found for this detail.
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {athletes.map((athlete) => (
                    <button
                      key={athlete.id}
                      onClick={() => handleSelectAthlete(athlete)}
                      className={`px-3 py-1 rounded-lg border text-xs font-medium transition-colors ${
                        selectedAthlete?.id === athlete.id
                          ? "bg-primary text-white border-primary"
                          : "bg-input border-border hover:bg-input/80"
                      }`}
                    >
                      {athlete.bib && <span className="font-bold">#{athlete.bib} </span>}
                      {athlete.name || athlete.id}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </section>

        {/* Record Attempt Panel */}
        <section className="rounded-2xl border border-border bg-panel p-6">
          <h2 className="text-2xl font-bold mb-4">Record Attempt</h2>

          {/* Attempt Context */}
          <div className={`mb-4 p-4 rounded-xl border transition-all ${
            selectedAthlete
              ? "bg-white text-gray-900 border-transparent shadow-lg"
              : "bg-input/30 text-muted-foreground border-border"
          }`}>
            {selectedAthlete ? (
              <div className="text-lg font-semibold">
                {selectedAthlete.bib && <span className="font-bold">#{selectedAthlete.bib} </span>}
                {selectedAthlete.name || selectedAthlete.id}
                {selectedAthlete.team && <span className="text-sm font-normal ml-2">({selectedAthlete.team})</span>}
              </div>
            ) : (
              <div>No athlete selected.</div>
            )}
          </div>

          {/* Scoring Buttons */}
          <div className="grid grid-cols-3 gap-4 mb-4">
            <button
              onClick={() => setSelectedSymbol("1")}
              disabled={!selectedAthlete}
              className={`py-8 rounded-xl font-bold text-xl border-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
                selectedSymbol === "1"
                  ? "bg-red-500 text-white border-red-600 shadow-lg scale-105"
                  : "bg-input border-border"
              }`}
            >
              1
            </button>
            <button
              onClick={() => setSelectedSymbol("Z")}
              disabled={!selectedAthlete}
              className={`py-8 rounded-xl font-bold text-xl border-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
                selectedSymbol === "Z"
                  ? "bg-yellow-500 text-white border-yellow-600 shadow-lg scale-105"
                  : "bg-input border-border"
              }`}
            >
              Zone
            </button>
            <button
              onClick={() => setSelectedSymbol("T")}
              disabled={!selectedAthlete}
              className={`py-8 rounded-xl font-bold text-xl border-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
                selectedSymbol === "T"
                  ? "bg-green-500 text-white border-green-600 shadow-lg scale-105"
                  : "bg-input border-border"
              }`}
            >
              Top
            </button>
          </div>

          {/* Save and Timer Row */}
          <div className="grid md:grid-cols-2 gap-4 mb-4">
            <div>
              <button
                onClick={handleSaveAttempt}
                disabled={!selectedAthlete || !selectedSymbol || saving}
                className="w-full py-4 bg-primary text-white rounded-xl font-semibold text-lg hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed shadow-md"
              >
                {saving ? "Saving..." : "Save"}
              </button>
              {saveMessage && (
                <div className={`mt-2 text-sm text-center ${saveMessage.includes("Error") ? "text-red-500" : "text-green-500"}`}>
                  {saveMessage}
                </div>
              )}
            </div>

            <button
              onClick={handleBackToLastAthlete}
              disabled={!lastAthlete}
              className="px-6 py-4 rounded-xl border-2 border-border bg-input hover:bg-input/80 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium"
            >
              Back to last athlete
            </button>
          </div>

          {/* Timer Controls */}
          <div className="rounded-xl border border-border bg-input/30 p-4">
            <div className="flex items-center gap-4 flex-wrap">
              <label className="flex items-center gap-2 text-sm font-medium">
                Timer (seconds)
                <input
                  type="number"
                  min="5"
                  value={timerSeconds}
                  onChange={(e) => setTimerSeconds(parseInt(e.target.value) || 60)}
                  disabled={timerRunning}
                  className="w-20 px-3 py-2 rounded-lg border border-border bg-input text-foreground disabled:opacity-50"
                />
              </label>
              <button
                onClick={handleStartTimer}
                disabled={timerRunning}
                className="px-4 py-2 rounded-lg border border-border bg-input hover:bg-input/80 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
              >
                Start
              </button>
              <button
                onClick={handleStopTimer}
                disabled={!timerRunning}
                className="px-4 py-2 rounded-lg border border-border bg-input hover:bg-input/80 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
              >
                Stop
              </button>
              <div className={`text-3xl font-bold tabular-nums ${timerRunning ? "text-primary" : "text-muted-foreground"}`}>
                {timerDisplay}
              </div>
            </div>
          </div>

          {/* Next Attempt Log */}
          <div className="mt-4 p-3 rounded-lg bg-input/30 border border-border text-sm text-muted-foreground">
            {selectedAthlete && !selectedSymbol && "Next Attempt: (choose 1 / Z / T, then Save)"}
            {selectedAthlete && selectedSymbol && `Ready to save: ${selectedSymbol} for ${selectedAthlete.name || selectedAthlete.id}`}
            {!selectedAthlete && "Select an athlete to begin judging"}
          </div>
        </section>
      </Container>

      <style jsx>{`
        .auto-fit-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
          align-items: end;
        }
      `}</style>
    </main>
  );
}
