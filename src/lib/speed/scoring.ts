export type SpeedTimingPrecision = "ms2" | "ms3";
export type SpeedFalseStartRule = "IFSC" | "TOLERANT";

export type SpeedRunStatus = "TIME" | "FS" | "DNS" | "DNF";

export interface SpeedRunResult {
  status?: SpeedRunStatus | null;
  ms?: number | null;
}

export interface SpeedQualifierResult {
  runA?: SpeedRunResult;
  runB?: SpeedRunResult;
  updatedAt?: unknown;
}

export interface SpeedAthlete {
  id: string;
  name?: string;
  team?: string;
  order?: number;
}

export interface QualifierStandingRow {
  athleteId: string;
  name: string;
  team: string;
  bestMs: number | null;
  secondMs: number | null;
  bestLabel: string;
  secondLabel: string;
  rank: number;
}

export type RoundId = "R16" | "QF" | "SF" | "F" | string;

export interface FinalsMatch {
  id?: string;
  matchIndex?: number;
  athleteA?: string | null;
  athleteB?: string | null;
  laneA?: SpeedRunResult | null;
  laneB?: SpeedRunResult | null;
  winner?: "A" | "B" | null;
  allowWinnerRun?: boolean | null;
}

export type FinalsRounds = Record<RoundId, FinalsMatch[]>;

export interface FinalsMeta {
  size?: number;
  seeds?: { seed: number; aid: string }[];
  seedRule?: string;
  seedVersion?: number;
  generator?: string;
  allowWinnerRun?: boolean;
}

export interface OverallRankingRow {
  athleteId: string;
  name: string;
  team: string;
  stage: string;
  bestMs: number | null;
  rank: number;
}

export function formatMs(
  ms: number | null | undefined,
  precision: SpeedTimingPrecision = "ms3"
) {
  if (ms == null || Number.isNaN(ms)) return "";
  const decimals = precision === "ms2" ? 2 : 3;
  return (ms / 1000).toFixed(decimals);
}

function collectTimes(res: SpeedQualifierResult | undefined | null) {
  const arr: number[] = [];
  if (res?.runA?.status === "TIME" && typeof res.runA.ms === "number") {
    arr.push(res.runA.ms);
  }
  if (res?.runB?.status === "TIME" && typeof res.runB.ms === "number") {
    arr.push(res.runB.ms);
  }
  arr.sort((a, b) => a - b);
  return arr;
}

function faultSummary(res: SpeedQualifierResult | undefined | null) {
  const statuses: SpeedRunStatus[] = ["FS", "DNS", "DNF"];
  const observed: SpeedRunStatus[] = [];
  statuses.forEach((status) => {
    if (res?.runA?.status === status && !observed.includes(status)) {
      observed.push(status);
    }
    if (res?.runB?.status === status && !observed.includes(status)) {
      observed.push(status);
    }
  });
  return observed.join("/") || "—";
}

function secondDisplay(
  res: SpeedQualifierResult | undefined | null,
  precision: SpeedTimingPrecision
) {
  const times = collectTimes(res);
  if (times.length > 1) {
    return formatMs(times[1], precision);
  }

  const statuses: SpeedRunStatus[] = ["FS", "DNS", "DNF"];
  const values = [res?.runA?.status, res?.runB?.status].filter((v): v is SpeedRunStatus =>
    Boolean(v && statuses.includes(v as SpeedRunStatus))
  );

  if (values.length >= 2) return values[1] || "—";
  if (values.length === 1) return values[0] || "—";
  return "—";
}

export function buildQualifierStandings({
  athletes,
  results,
  precision = "ms3",
}: {
  athletes: SpeedAthlete[];
  results: Map<string, SpeedQualifierResult> | Record<string, SpeedQualifierResult>;
  precision?: SpeedTimingPrecision;
}): QualifierStandingRow[] {
  const resolveResult = (athleteId: string) => {
    if (results instanceof Map) return results.get(athleteId);
    return results[athleteId];
  };

  const rows = athletes.map((athlete) => {
    const res = resolveResult(athlete.id);
    const times = collectTimes(res);
    const bestMs = times[0] ?? null;
    const secondMs = times[1] ?? null;
    const hasTime = bestMs != null;

    return {
      athleteId: athlete.id,
      name: athlete.name || athlete.id,
      team: athlete.team || "",
      bestMs,
      secondMs,
      bestLabel: hasTime ? formatMs(bestMs, precision) : faultSummary(res),
      secondLabel: hasTime ? secondDisplay(res, precision) : secondDisplay(res, precision),
    };
  });

  const valids = rows
    .filter((r) => r.bestMs != null)
    .sort((a, b) => (a.bestMs! - b.bestMs!) || ((a.secondMs ?? Infinity) - (b.secondMs ?? Infinity)) || a.name.localeCompare(b.name));

  const noTimes = rows
    .filter((r) => r.bestMs == null)
    .sort((a, b) => a.name.localeCompare(b.name));

  const ranked: QualifierStandingRow[] = [];
  valids.forEach((row, idx) => {
    ranked.push({ ...row, rank: idx + 1 });
  });

  const lastRank = valids.length ? valids.length + 1 : 1;
  noTimes.forEach((row) => {
    ranked.push({ ...row, rank: lastRank });
  });

  return ranked;
}

export function bracketOrder(size?: number): RoundId[] {
  if (size === 16) return ["R16", "QF", "SF", "F"];
  if (size === 8) return ["QF", "SF", "F"];
  if (size === 4) return ["SF", "F"];
  return ["F"];
}

function collectAllTimesMs(
  athleteId: string,
  rounds: FinalsRounds,
  qualifiers: Map<string, SpeedQualifierResult> | Record<string, SpeedQualifierResult>
) {
  const list = collectTimes(
    qualifiers instanceof Map ? qualifiers.get(athleteId) : qualifiers[athleteId]
  );

  Object.values(rounds).forEach((matches) => {
    matches.forEach((match) => {
      if (match?.athleteA === athleteId && match?.laneA?.status === "TIME" && typeof match.laneA.ms === "number") {
        list.push(match.laneA.ms);
      }
      if (match?.athleteB === athleteId && match?.laneB?.status === "TIME" && typeof match.laneB.ms === "number") {
        list.push(match.laneB.ms);
      }
    });
  });

  list.sort((a, b) => a - b);
  return { best: list[0] ?? null, second: list[1] ?? null, all: list };
}

function compareTimeArraysAsc(aArr: number[], bArr: number[]) {
  const a = aArr || [];
  const b = bArr || [];
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i += 1) {
    const av = i < a.length ? a[i] : Infinity;
    const bv = i < b.length ? b[i] : Infinity;
    if (av !== bv) return av - bv;
  }
  return 0;
}

function assignSharedRanks(rows: { allTimes: number[] }[], startRank: number) {
  const out: { rank: number }[] = [];
  let k = 0;
  let prev: { allTimes: number[] } | null = null;
  let prevRank = startRank;
  rows.forEach((row, idx) => {
    let rank: number;
    if (idx === 0) {
      rank = startRank;
    } else {
      const cmp = compareTimeArraysAsc(prev?.allTimes || [], row.allTimes);
      rank = cmp === 0 ? prevRank : startRank + k;
    }
    out.push({ rank });
    k += 1;
    prev = row;
    prevRank = rank;
  });
  return out;
}

function finalsOutcomeFor(aid: string, rounds: FinalsRounds) {
  const finals = (rounds["F"] || []).slice().sort((a, b) => (a.matchIndex || 0) - (b.matchIndex || 0));
  const smallFinal = finals.find((m) => m.matchIndex === 1);
  const bigFinal = finals.find((m) => m.matchIndex === 2) || finals.find((m) => m.matchIndex === 1 && !smallFinal);

  if (bigFinal) {
    const winnerAid = bigFinal.winner === "A" ? bigFinal.athleteA : bigFinal.winner === "B" ? bigFinal.athleteB : null;
    const loserAid = bigFinal.winner === "A" ? bigFinal.athleteB : bigFinal.winner === "B" ? bigFinal.athleteA : null;
    if (winnerAid === aid) return { stage: "WIN", bigFinalWinner: true };
    if (loserAid === aid) return { stage: "F", bigFinalLoser: true };
  }

  if (smallFinal) {
    const winnerAid = smallFinal.winner === "A" ? smallFinal.athleteA : smallFinal.winner === "B" ? smallFinal.athleteB : null;
    const loserAid = smallFinal.winner === "A" ? smallFinal.athleteB : smallFinal.winner === "B" ? smallFinal.athleteA : null;
    if (winnerAid === aid) return { stage: "SF", smallFinalWinner: true };
    if (loserAid === aid) return { stage: "SF", smallFinalLoser: true };
  }

  const inSF = (rounds["SF"] || []).some((m) => m.athleteA === aid || m.athleteB === aid);
  const inF = (rounds["F"] || []).some((m) => m.athleteA === aid || m.athleteB === aid);
  if (inSF && !inF) return { stage: "SF" };

  const inQF = (rounds["QF"] || []).some((m) => m.athleteA === aid || m.athleteB === aid);
  const inR16 = (rounds["R16"] || []).some((m) => m.athleteA === aid || m.athleteB === aid);
  if (inQF && !inSF) return { stage: "QF" };
  if (inR16 && !inQF) return { stage: "R16" };

  return { stage: "QUAL" };
}

export function buildOverallRanking({
  athletes,
  rounds,
  qualifiers,
}: {
  athletes: SpeedAthlete[];
  rounds: FinalsRounds;
  qualifiers: Map<string, SpeedQualifierResult> | Record<string, SpeedQualifierResult>;
}): OverallRankingRow[] {
  type OverallSourceRow = {
    athleteId: string;
    name: string;
    team: string;
    bestMs: number | null;
    secondMs: number | null;
    allTimes: number[];
    stage: string;
    flags: ReturnType<typeof finalsOutcomeFor>;
  };

  const allIds = athletes.map((a) => a.id);
  const outcomeMap = new Map<string, ReturnType<typeof finalsOutcomeFor>>();
  allIds.forEach((aid) => outcomeMap.set(aid, finalsOutcomeFor(aid, rounds)));

  const groupWIN: OverallSourceRow[] = [];
  const groupF: OverallSourceRow[] = [];
  const groupSF: OverallSourceRow[] = [];
  const groupQF: OverallSourceRow[] = [];
  const groupR16: OverallSourceRow[] = [];
  const groupQual: OverallSourceRow[] = [];

  const rows: OverallSourceRow[] = athletes.map((athlete) => {
    const times = collectAllTimesMs(athlete.id, rounds, qualifiers);
    const outcome = outcomeMap.get(athlete.id) || { stage: "QUAL" };
    return {
      athleteId: athlete.id,
      name: athlete.name || athlete.id,
      team: athlete.team || "",
      bestMs: times.best,
      secondMs: times.second,
      allTimes: times.all,
      stage: outcome.stage,
      flags: outcome,
    };
  });

  rows.forEach((row) => {
    switch (row.stage) {
      case "WIN":
        groupWIN.push(row);
        break;
      case "F":
        groupF.push(row);
        break;
      case "SF":
        groupSF.push(row);
        break;
      case "QF":
        groupQF.push(row);
        break;
      case "R16":
        groupR16.push(row);
        break;
      default:
        groupQual.push(row);
    }
  });

  const rankEntries: OverallRankingRow[] = [];
  let nextRankBase = 1;

  if (groupWIN.length === 1) {
    rankEntries.push({
      athleteId: groupWIN[0].athleteId,
      name: groupWIN[0].name,
      team: groupWIN[0].team,
      bestMs: groupWIN[0].bestMs,
      stage: "WIN",
      rank: nextRankBase,
    });
    nextRankBase += 1;
  }

  if (groupF.length === 1) {
    rankEntries.push({
      athleteId: groupF[0].athleteId,
      name: groupF[0].name,
      team: groupF[0].team,
      bestMs: groupF[0].bestMs,
      stage: "F",
      rank: nextRankBase,
    });
    nextRankBase += 1;
  }

  const finals = (rounds["F"] || []).slice().sort((a, b) => (a.matchIndex || 0) - (b.matchIndex || 0));
  const hasSmallFinal = finals.some((m) => m.matchIndex === 1);

  if (hasSmallFinal) {
    const sfw = groupSF.find((x) => x.flags.smallFinalWinner);
    const sfl = groupSF.find((x) => x.flags.smallFinalLoser);
    if (sfw) {
      rankEntries.push({
        athleteId: sfw.athleteId,
        name: sfw.name,
        team: sfw.team,
        bestMs: sfw.bestMs,
        stage: "SF",
        rank: nextRankBase,
      });
      nextRankBase += 1;
      groupSF.splice(groupSF.indexOf(sfw), 1);
    }
    if (sfl) {
      rankEntries.push({
        athleteId: sfl.athleteId,
        name: sfl.name,
        team: sfl.team,
        bestMs: sfl.bestMs,
        stage: "SF",
        rank: nextRankBase,
      });
      nextRankBase += 1;
      groupSF.splice(groupSF.indexOf(sfl), 1);
    }
  } else {
    groupSF.sort((a, b) => compareTimeArraysAsc(a.allTimes, b.allTimes));
    assignSharedRanks(groupSF, nextRankBase).forEach((entry, idx) => {
      rankEntries.push({
        athleteId: groupSF[idx].athleteId,
        name: groupSF[idx].name,
        team: groupSF[idx].team,
        bestMs: groupSF[idx].bestMs,
        stage: "SF",
        rank: entry.rank,
      });
    });
    nextRankBase += groupSF.length;
    groupSF.length = 0;
  }

  const appendGrouped = (group: OverallSourceRow[], stage: string) => {
    group.sort((a, b) => compareTimeArraysAsc(a.allTimes, b.allTimes));
    assignSharedRanks(group, nextRankBase).forEach((entry, idx) => {
      rankEntries.push({
        athleteId: group[idx].athleteId,
        name: group[idx].name,
        team: group[idx].team,
        bestMs: group[idx].bestMs,
        stage,
        rank: entry.rank,
      });
    });
    nextRankBase += group.length;
  };

  appendGrouped(groupQF, "QF");
  appendGrouped(groupR16, "R16");
  appendGrouped(groupQual, "QUAL");

  return rankEntries;
}

export function laneResultLabel({
  lane,
  opponent,
  isWinner,
  isBigFinal,
  allowWinnerRun,
  precision,
}: {
  lane?: SpeedRunResult | null;
  opponent?: SpeedRunResult | null;
  isWinner: boolean;
  isBigFinal?: boolean;
  allowWinnerRun?: boolean | null;
  precision: SpeedTimingPrecision;
}) {
  if (!lane) return "—";
  const allow = Boolean(allowWinnerRun);
  if (isWinner && isBigFinal && !allow) {
    if (opponent?.status === "FS" || opponent?.status === "DNS") {
      return "–";
    }
  }
  if (lane.status === "TIME" && typeof lane.ms === "number") {
    return `${formatMs(lane.ms, precision)} s`;
  }
  return lane.status || "—";
}
