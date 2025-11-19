'use client';

import { useEffect, useState, useRef } from "react";
import { UserButton, useUser } from "@clerk/nextjs";
import Image from "next/image";
import Link from "next/link";
import Container from "@/components/Container";
import { firestore } from "@/lib/firebase/client";
import {
  collection,
  getDocs,
  query,
  where,
  orderBy,
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
        const q = query(
          collection(db, "competitions"),
          where("status", "==", "active"),
          orderBy("updatedAt", "desc")
        );
        const snapshot = await getDocs(q);
        const comps = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as Competition[];
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
          collection(db, `competitions/${selectedComp}/categories`),
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
        const routesPath = `competitions/${selectedComp}/categories/${selectedCategory}/${round}Routes`;
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
        const detailsPath = `competitions/${selectedComp}/categories/${selectedCategory}/${round}Routes/${selectedRoute}/details`;
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
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-bold">Judge Station</h2>
            <span className="text-sm text-muted-foreground">
              Select station details
            </span>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <label className="block text-sm font-medium text-muted-foreground">
              Competition
              <select
                className="mt-2 w-full rounded-xl border border-border bg-input px-4 py-3 text-sm text-foreground focus:border-ring focus:outline-none disabled:opacity-50"
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
                className="mt-2 w-full rounded-xl border border-border bg-input px-4 py-3 text-sm text-foreground focus:border-ring focus:outline-none disabled:opacity-50"
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
                className="mt-2 w-full rounded-xl border border-border bg-input px-4 py-3 text-sm text-foreground focus:border-ring focus:outline-none"
                value={round}
                onChange={(e) => setRound(e.target.value as RoundType)}
              >
                <option value="qualification">Qualification</option>
                <option value="final">Final</option>
              </select>
            </label>
          </div>
        </section>

        {/* Route/Detail Selection Panel */}
        {selectedCategory && (
          <section className="rounded-2xl border border-border bg-panel p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-2xl font-bold">Route & Detail</h2>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="block text-sm font-medium text-muted-foreground">
                Route
                <select
                  className="mt-2 w-full rounded-xl border border-border bg-input px-4 py-3 text-sm text-foreground focus:border-ring focus:outline-none disabled:opacity-50"
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
                <div className="flex gap-2 mt-2">
                  <select
                    className="flex-1 rounded-xl border border-border bg-input px-4 py-3 text-sm text-foreground focus:border-ring focus:outline-none disabled:opacity-50"
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
                  <button
                    onClick={handleNextDetail}
                    disabled={!details.length || !selectedDetail}
                    className="px-6 py-3 bg-primary text-white rounded-xl font-medium hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Next
                  </button>
                </div>
              </label>
            </div>
          </section>
        )}

        {/* Coming Soon Notice */}
        <section className="rounded-2xl border border-border bg-card p-8 text-center">
          <h3 className="text-xl font-semibold mb-2">Judge Console</h3>
          <p className="text-muted-foreground">
            Full judge functionality coming soon...
          </p>
        </section>
      </Container>
    </main>
  );
}
