export default <T>(obj: T | Iterable<T>): obj is Iterable<T> =>
  typeof (obj as Iterable<T>)?.[Symbol.iterator] === 'function';
