/** A shortened product label is incomplete evidence, not a contradiction. */
export function hasSetConflict(detected: string, selected: string): boolean {
  const tokens = (value: string) => value.toLowerCase().match(/[a-z0-9]+/g) ?? [];
  const actual = tokens(detected);
  const expected = new Set(tokens(selected));
  return actual.some(token => !expected.has(token));
}
