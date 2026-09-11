import type * as CV from "@techstark/opencv-js";
import { quadArea, type Point } from "./capture";

export function orderCardCorners(points: Point[]) {
  const center = { x: points.reduce((s, p) => s + p.x, 0) / 4, y: points.reduce((s, p) => s + p.y, 0) / 4 };
  const ordered = [...points].sort((a, b) => Math.atan2(a.y - center.y, a.x - center.x) - Math.atan2(b.y - center.y, b.x - center.x));
  const start = ordered.reduce((best, p, i) => p.x + p.y < ordered[best].x + ordered[best].y ? i : best, 0);
  return [...ordered.slice(start), ...ordered.slice(0, start)];
}

export function handSupportsQuad(hand: Point[], quad: Point[]) {
  if (hand.length < 5 || quad.length !== 4) return false;
  const inside = (point: Point) => {
    const crosses = quad.map((a, i) => { const b = quad[(i + 1) % 4]; return (b.x - a.x) * (point.y - a.y) - (b.y - a.y) * (point.x - a.x); });
    return crosses.every(x => x >= 0) || crosses.every(x => x <= 0);
  };
  // Hands printed on the card must not count as the breaker's hand.
  if (hand.filter(p => !inside(p)).length < hand.length * .35) return false;
  const margin = Math.hypot(quad[0].x - quad[2].x, quad[0].y - quad[2].y) * .08;
  return hand.some(point => quad.some((a, i) => {
    const b = quad[(i + 1) % 4], dx = b.x - a.x, dy = b.y - a.y;
    const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / Math.max(1, dx * dx + dy * dy)));
    return Math.hypot(point.x - a.x - t * dx, point.y - a.y - t * dy) < margin;
  }));
}

/** Detect closed, convex card boundaries, including inner contours of sleeves. */
export function rectifyCard(cv: typeof CV, input: CV.Mat, hands: Point[][] = []) {
  // OpenCV.js exposes this static helper; the package declarations model only
  // the C++ instance method. Keep the runtime call and declare its JS signature.
  const rotatedRect = cv.RotatedRect as typeof CV.RotatedRect & { points(rect: CV.RotatedRect): Point[] };
  const scale = Math.min(1, 640 / Math.max(input.cols, input.rows));
  const small = new cv.Mat(), gray = new cv.Mat(), edges = new cv.Mat();
  const contours = new cv.MatVector(), hierarchy = new cv.Mat(), colorHulls = new cv.MatVector();
  let best: Point[] | null = null, bestScore = -Infinity;
  try {
    cv.resize(input, small, new cv.Size(Math.round(input.cols * scale), Math.round(input.rows * scale)));
    // A chrome card on a neutral breaking mat may have interrupted edges at a
    // transparent sleeve. Its chromatic regions provide a second boundary cue.
    const rgb = new cv.Mat(), hsv = new cv.Mat(), mask = new cv.Mat();
    const colored = new cv.MatVector(), colorHierarchy = new cv.Mat();
    try {
      cv.cvtColor(small, rgb, cv.COLOR_RGBA2RGB);
      cv.cvtColor(rgb, hsv, cv.COLOR_RGB2HSV);
      const low = new cv.Mat(hsv.rows, hsv.cols, hsv.type(), new cv.Scalar(0, 110, 40, 0));
      const high = new cv.Mat(hsv.rows, hsv.cols, hsv.type(), new cv.Scalar(180, 255, 255, 255));
      try { cv.inRange(hsv, low, high, mask); } finally { low.delete(); high.delete(); }
      cv.findContours(mask, colored, colorHierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);
      const coordinates: number[] = [];
      for (let i = 0; i < colored.size(); i++) {
        const contour = colored.get(i);
        try { if (cv.contourArea(contour) > small.cols * small.rows * .004) coordinates.push(...contour.data32S); }
        finally { contour.delete(); }
      }
      if (coordinates.length >= 8) {
        const points = cv.matFromArray(coordinates.length / 2, 1, cv.CV_32SC2, coordinates), hull = new cv.Mat();
        try { cv.convexHull(points, hull); contours.push_back(hull); }
        finally { points.delete(); hull.delete(); }
      }
    } finally { rgb.delete(); hsv.delete(); mask.delete(); colored.delete(); colorHierarchy.delete(); }
    for (let i = 0; i < contours.size(); i++) { const hull = contours.get(i); colorHulls.push_back(hull); hull.delete(); }
    cv.cvtColor(small, gray, cv.COLOR_RGBA2GRAY);
    cv.GaussianBlur(gray, gray, new cv.Size(5, 5), 0);
    cv.Canny(gray, edges, 40, 120);
    cv.findContours(edges, contours, hierarchy, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE);
    const colorStart = contours.size();
    for (let i = 0; i < colorHulls.size(); i++) { const hull = colorHulls.get(i); contours.push_back(hull); hull.delete(); }
    for (let index = 0; index < contours.size(); index++) {
      const contour = contours.get(index), approx = new cv.Mat();
      try {
        const area = Math.abs(cv.contourArea(contour));
        const fraction = area / (small.cols * small.rows);
        if (fraction < .12 || fraction > .97) continue;
        cv.approxPolyDP(contour, approx, .018 * cv.arcLength(contour, true), true);
        const colorBoundary = index >= colorStart;
        if (!colorBoundary && (approx.rows !== 4 || !cv.isContourConvex(approx))) continue;
        const points = orderCardCorners(colorBoundary ? rotatedRect.points(cv.minAreaRect(contour))
          : Array.from({ length: 4 }, (_, i) => ({ x: approx.data32S[2 * i], y: approx.data32S[2 * i + 1] })));
        const side = (i: number, j: number) => Math.hypot(points[i].x - points[j].x, points[i].y - points[j].y);
        const width = (side(0, 1) + side(2, 3)) / 2, height = (side(1, 2) + side(3, 0)) / 2;
        const aspect = Math.min(width, height) / Math.max(width, height);
        const solidity = area / quadArea(points);
        if (aspect < .52 || aspect > .88 || solidity < (colorBoundary ? .72 : .9) || solidity > 1.1) continue;
        // Prefer physical card proportions over the larger plastic holder.
        const supported = hands.some(hand => handSupportsQuad(hand, points.map(p => ({ x: p.x / scale, y: p.y / scale }))));
        const score = 1 - Math.abs(aspect - 63 / 88) * 3 + fraction * .15 + (supported ? .15 : 0);
        if (score > bestScore) { bestScore = score; const center = { x: points.reduce((s, p) => s + p.x, 0) / 4, y: points.reduce((s, p) => s + p.y, 0) / 4 };
          best = points.map(p => ({ x: (center.x + (p.x - center.x) * (colorBoundary ? 1.06 : 1)) / scale, y: (center.y + (p.y - center.y) * (colorBoundary ? 1.06 : 1)) / scale })); }
      } finally { approx.delete(); contour.delete(); }
    }
  } finally { small.delete(); gray.delete(); edges.delete(); contours.delete(); hierarchy.delete(); colorHulls.delete(); }
  if (!best) return { mat: input.clone(), quad: null };
  const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
  if (distance(best[0], best[1]) > distance(best[0], best[3])) best = [best[3], best[0], best[1], best[2]];
  const width = Math.min(900, Math.max(400, Math.round((distance(best[0], best[1]) + distance(best[2], best[3])) / 2)));
  const height = Math.round(width * 88 / 63);
  const src = cv.matFromArray(4, 1, cv.CV_32FC2, best.flatMap(p => [p.x, p.y]));
  const dst = cv.matFromArray(4, 1, cv.CV_32FC2, [0, 0, width - 1, 0, width - 1, height - 1, 0, height - 1]);
  const transform = cv.getPerspectiveTransform(src, dst), output = new cv.Mat();
  try { cv.warpPerspective(input, output, transform, new cv.Size(width, height), cv.INTER_LINEAR, cv.BORDER_REPLICATE); }
  catch (error) { output.delete(); throw error; }
  finally { src.delete(); dst.delete(); transform.delete(); }
  return { mat: output, quad: best };
}
