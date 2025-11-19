const SYMBOL_ORDER: Record<string, number> = { "": 0, "1": 1, Z: 2, T: 3 };

export interface AttemptDoc {
  athleteId?: string;
  detailIndex?: string;
  routeId?: string;
  symbol?: string;
  round?: string;
  createdAt?: number;
}

interface DetailSummary {
  totalAttempts: number;
  zoneAttempt: number | null;
  topAttempt: number | null;
  bestSymbol: string;
}

export interface AthleteInfo {
  bib?: string;
  name?: string;
  team?: string;
}

export interface DetailMeta {
  type: "detail" | "route";
  detailIndex?: string;
  routeId?: string;
  label?: string;
  order?: number;
}

export interface LeaderboardRoute {
  key: string;
  pointValue: number;
  zoneAttempt: number | null;
  topAttempt: number | null;
  bestSymbol: string;
  detailIndex?: string;
  detailLabel?: string;
  routeId?: string;
}

export interface LeaderboardRow {
  athleteId: string;
  bib: string;
  name: string;
  team: string;
  points: number;
  tops: number;
  zones: number;
  routes: LeaderboardRoute[];
}

export function computeDetailScore(detail: DetailSummary) {
  if (detail.topAttempt != null) {
    const pts = 25 - 0.1 * (detail.topAttempt - 1);
    return Number(Math.max(0, pts).toFixed(1));
  }
  if (detail.zoneAttempt != null) {
    const pts = 10 - 0.1 * (detail.zoneAttempt - 1);
    return Number(Math.max(0, pts).toFixed(1));
  }
  return 0;
}

function bestSymbol(existing: string | undefined, next: string | undefined) {
  const currentRank = SYMBOL_ORDER[existing || ""] || 0;
  const nextRank = SYMBOL_ORDER[next || ""] || 0;
  return nextRank > currentRank ? next : existing;
}

export function summarizeAttempts(attemptDocs: AttemptDoc[]) {
  const perAthlete = new Map<string, { details: Map<string, DetailSummary> }>();
  const sorted = [...attemptDocs].sort(
    (a, b) => (a.createdAt || 0) - (b.createdAt || 0)
  );

  for (const attempt of sorted) {
    const athleteId = attempt.athleteId;
    if (!athleteId) continue;
    const symbol = attempt.symbol || "";
    if (!SYMBOL_ORDER[symbol]) continue;

    const detailKey = attempt.routeId
      ? `route:${attempt.routeId}`
      : attempt.detailIndex != null
      ? `detail:${attempt.detailIndex}`
      : "detail:unknown";

    const athleteEntry = perAthlete.get(athleteId) || { details: new Map() };
    const detail = athleteEntry.details.get(detailKey) || {
      totalAttempts: 0,
      zoneAttempt: null,
      topAttempt: null,
      bestSymbol: "",
    };

    detail.totalAttempts += 1;

    if (symbol === "T") {
      if (detail.zoneAttempt == null) detail.zoneAttempt = detail.totalAttempts;
      if (detail.topAttempt == null) detail.topAttempt = detail.totalAttempts;
    } else if (symbol === "Z" && detail.zoneAttempt == null) {
      detail.zoneAttempt = detail.totalAttempts;
    }

    detail.bestSymbol = bestSymbol(detail.bestSymbol, symbol) || "";

    athleteEntry.details.set(detailKey, detail);
    perAthlete.set(athleteId, athleteEntry);
  }

  return perAthlete;
}

export function buildLeaderboardRows({
  attemptDocs,
  athletesById = new Map<string, AthleteInfo>(),
  detailsMeta = new Map<string, DetailMeta>(),
}: {
  attemptDocs: AttemptDoc[];
  athletesById?: Map<string, AthleteInfo>;
  detailsMeta?: Map<string, DetailMeta>;
}): LeaderboardRow[] {
  const summary = summarizeAttempts(attemptDocs);
  const rows: LeaderboardRow[] = [];

  const hasRouteMeta = Array.from(detailsMeta.values()).some(
    (meta) => meta?.type === "route"
  );

  summary.forEach((entry, athleteId) => {
    const athlete = athletesById.get(athleteId) || {};
    let points = 0;
    let tops = 0;
    let zones = 0;

    const detailKeySet = new Set([...entry.details.keys()]);
    const routeMetaKeys = new Set<string>();
    detailsMeta.forEach((meta, key) => {
      if (meta?.type === "route") {
        routeMetaKeys.add(key);
      }
      if (meta?.type === "route" || !hasRouteMeta) {
        detailKeySet.add(key);
      }
    });

    if (hasRouteMeta && routeMetaKeys.size) {
      [...detailKeySet].forEach((key) => {
        if (!routeMetaKeys.has(key)) {
          detailKeySet.delete(key);
        }
      });
    }

    const orderedKeys = Array.from(detailKeySet).sort((a, b) => {
      const metaA = detailsMeta.get(a);
      const metaB = detailsMeta.get(b);
      if (
        metaA?.order != null &&
        metaB?.order != null &&
        metaA.order !== metaB.order
      ) {
        return metaA.order - metaB.order;
      }
      return String(a).localeCompare(String(b), undefined, {
        numeric: true,
        sensitivity: "base",
      });
    });

    const routes = orderedKeys.map((key) => {
      const detail = entry.details.get(key);
      const meta = detailsMeta.get(key) ?? ({} as DetailMeta);
      const [prefix, rawKey] = key.includes(":") ? key.split(":", 2) : ["detail", key];
      let detailPoints = 0;
      let topAttempt: number | null = null;
      let zoneAttempt: number | null = null;
      let bestSymbol = "";
      if (detail) {
        detailPoints = computeDetailScore(detail);
        if (detail.topAttempt != null) {
          tops += 1;
          zones += 1;
          topAttempt = detail.topAttempt;
          zoneAttempt = detail.zoneAttempt;
        } else if (detail.zoneAttempt != null) {
          zones += 1;
          zoneAttempt = detail.zoneAttempt;
        }
        points += detailPoints;
        bestSymbol = detail.bestSymbol;
      }
      const detailIndex =
        meta.detailIndex ?? (prefix === "detail" ? rawKey : undefined);
      const routeId =
        meta.routeId ?? (prefix === "route" ? rawKey : undefined);
      const detailLabel =
        meta.label ||
        (prefix === "route"
          ? `Route ${rawKey}`
          : `Detail ${detailIndex ?? rawKey}`);
      return {
        key,
        pointValue: detailPoints,
        zoneAttempt,
        topAttempt,
        bestSymbol,
        detailIndex,
        detailLabel,
        routeId,
      };
    });

    rows.push({
      athleteId,
      bib: athlete.bib ?? "",
      name: athlete.name ?? athleteId,
      team: athlete.team ?? "",
      points: Number(points.toFixed(1)),
      tops,
      zones,
      routes,
    });
  });

  rows.sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (b.tops !== a.tops) return b.tops - a.tops;
    if (b.zones !== a.zones) return b.zones - a.zones;
    return a.name.localeCompare(b.name);
  });

  return rows;
}
