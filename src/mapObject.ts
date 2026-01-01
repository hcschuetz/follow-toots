export default
<K extends string | symbol, V, W>(
  o: Record<K, V>,
  f: (v: V, k: K) => W
) => Object.fromEntries(
  Object.entries<V>(o).map(([k, v]) => [k, f(v, k as K)])
) as Record<K, W>;
