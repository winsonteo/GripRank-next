/**
 * Judge Stations - Data model and helpers for judge station confirmation
 *
 * Path: boulderComps/{compId}/judgeStations/{stationKey}
 *
 * Judges write a "station confirmed" pulse when they confirm their station.
 * Admin reads these docs to see which routes have ready judges.
 */

import type { Timestamp } from "firebase/firestore";

/**
 * Station configuration - the judge's current selection
 */
export interface StationConfig {
  compId: string;
  round: "qualification" | "final";
  categoryId: string;
  detailIndex: number | null; // null for finals
  routeId: string;
}

/**
 * JudgeStation document stored in Firestore
 */
export interface JudgeStation {
  compId: string;
  round: "qualification" | "final";
  categoryId: string;
  detailIndex: number | null;
  routeId: string;
  ready: boolean;
  updatedAt: Timestamp;
}

/**
 * JudgeStation with resolved labels for display
 */
export interface JudgeStationView extends JudgeStation {
  stationKey: string;
  categoryName: string;
  detailLabel: string;
  routeLabel: string;
}

/**
 * Generate a deterministic station key from station configuration.
 *
 * Format:
 * - Qualification: `qualification_${categoryId}_${detailIndex}_${routeId}`
 * - Final: `final_${categoryId}_final_${routeId}`
 *
 * The key uniquely identifies a station so multiple judges can confirm
 * the same station (they'll just overwrite each other's doc, which is fine).
 */
export function generateStationKey(config: StationConfig): string {
  const { round, categoryId, detailIndex, routeId } = config;

  // Use "final" as the detailIndex placeholder for finals
  const detailPart = round === "final" ? "final" : String(detailIndex ?? "0");

  return `${round}_${categoryId}_${detailPart}_${routeId}`;
}

/**
 * Parse a station key back into its components (for debugging/display)
 */
export function parseStationKey(key: string): {
  round: string;
  categoryId: string;
  detailPart: string;
  routeId: string;
} | null {
  const parts = key.split("_");
  if (parts.length < 4) return null;

  // Handle category IDs that might contain underscores
  // Format is: round_categoryId_detailPart_routeId
  // We know round is first, and routeId is last, detailPart is second-to-last
  const round = parts[0];
  const routeId = parts[parts.length - 1];
  const detailPart = parts[parts.length - 2];
  const categoryId = parts.slice(1, -2).join("_");

  return { round, categoryId, detailPart, routeId };
}

/**
 * Check if a station configuration is complete (all required fields set)
 */
export function isStationConfigComplete(config: Partial<StationConfig>): config is StationConfig {
  const { compId, round, categoryId, routeId, detailIndex } = config;

  // Basic required fields
  if (!compId || !round || !categoryId || !routeId) {
    return false;
  }

  // For qualification rounds, detailIndex must be set (can be 0)
  if (round === "qualification" && detailIndex === undefined) {
    return false;
  }

  return true;
}
