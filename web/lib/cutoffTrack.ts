export const CUTOFF_TRACK_TYPES = ["general", "academic"] as const;

export type CutoffTrackType = (typeof CUTOFF_TRACK_TYPES)[number];

const ACADEMIC_SUFFIX = "__academic";

export function parseCutoffTrack(value: unknown): CutoffTrackType | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim() as CutoffTrackType;
  if (!CUTOFF_TRACK_TYPES.includes(normalized)) return null;
  return normalized;
}

export function encodeMajorWithTrack(major: string, track: CutoffTrackType): string {
  if (track === "academic") {
    return `${major}${ACADEMIC_SUFFIX}`;
  }
  return major;
}

export function decodeMajorAndTrack(storedMajor: string): { major: string; track: CutoffTrackType } {
  if (storedMajor.endsWith(ACADEMIC_SUFFIX)) {
    const major = storedMajor.slice(0, -ACADEMIC_SUFFIX.length).trim();
    if (major) {
      return { major, track: "academic" };
    }
  }
  return { major: storedMajor, track: "general" };
}

export function cutoffTrackLabel(track: CutoffTrackType): string {
  return track === "academic" ? "학사" : "일반";
}
