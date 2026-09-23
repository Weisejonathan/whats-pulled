type Proof = { imageUrl: string; value: string | boolean; source: string; proofImage?: {width: number; height: number}; proof?: Array<{ text: string; box: { x: number; y: number; width: number; height: number } }> };

/** Field crops stay linked to their source frame when the group's cover changes. */
export function FieldProof({ label, evidence }: { label: string; evidence?: Proof }) {
  if (!evidence) return null;
  const boxes = evidence.proof?.map(item => item.box).filter(box => box.width > 0 && box.height > 0);
  const left = boxes?.length ? Math.max(0, Math.min(...boxes.map(box => box.x)) - .025) : 0;
  const top = boxes?.length ? Math.max(0, Math.min(...boxes.map(box => box.y)) - .025) : 0;
  const right = boxes?.length ? Math.min(1, Math.max(...boxes.map(box => box.x + box.width)) + .025) : 1;
  const bottom = boxes?.length ? Math.min(1, Math.max(...boxes.map(box => box.y + box.height)) + .025) : 1;
  const width = evidence.proofImage?.width || 1000, height = evidence.proofImage?.height || 1400;
  return <a className="detector-field-proof" href={evidence.imageUrl} target="_blank" rel="noreferrer">
    <span>{label}: <strong>{String(evidence.value)}</strong></span>
    {boxes?.length ? <svg viewBox={`${left * width} ${top * height} ${(right - left) * width} ${(bottom - top) * height}`} role="img" aria-label={`${label} proof crop`}><image href={evidence.imageUrl} width={width} height={height} preserveAspectRatio="none" /></svg>
      : <span className="detector-proof-link">Open source frame</span>}
    <small>{evidence.source === "catalog" ? "Supplied by checklist · check printed name" : "Open original proof"}</small>
  </a>;
}
