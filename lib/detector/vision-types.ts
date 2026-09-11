import type { Point } from "./capture";

export type TextLine = { text: string; score: number; poly: number[][]; source?: "detail" | "context" };
export type SignatureEvidence = {
  present: true | null;
  method: "certification-and-ink" | "unknown";
  reason: string;
  box?: { x: number; y: number; width: number; height: number };
};
export type VisionReading = {
  items: TextLine[];
  image: { width: number; height: number };
  metrics: { totalMs: number; detMs: number; recMs: number; detailMs?: number };
  quad: Point[] | null;
  signature: SignatureEvidence;
  handSupport?: { available: boolean; holdingCard: boolean };
  cardImage?: ImageData;
};
