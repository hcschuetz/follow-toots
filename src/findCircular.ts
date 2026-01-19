/**
 * Find the first element in `ts` satisfying predicate `pred`,
 * starting the search just after element `pivot` and
 * continuing at the beginning of `ts` if necessary.
 * If `pivot` is not in `ts`, just start at the beginning.
 * @returns the found element or `undefined`
 */
export
function findCircular<T>(ts: Iterable<T>, pivot: T, pred: (t: T) => unknown): T | undefined {
  const array = ts instanceof Array ? ts : [...ts];
  const n = array.length;
  const pivotIdx = array.findIndex(t => t === pivot);
  let i = pivotIdx;
  do {
    i = (i + 1) % n;
    const t = array[i];
    if (pred(t)) return t;
  } while(i !== pivotIdx);
}

/**
 * Find the first element in `ts` satisfying predicate `pred`,
 * starting a backward search just before element `pivot` and
 * continuing at the end of `ts` if necessary.
 * If `pivot` is not in `ts`, just start at the end.
 * @returns the found element or `undefined`
 * @throws a string if the pivot element cannot be found
 */
export
function findLastCircular<T>(ts: Iterable<T>, pivot: T, pred: (t: T) => unknown): T | undefined {
  return findCircular([...ts].reverse(), pivot, pred);
}
