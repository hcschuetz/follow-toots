export
type SourceValue<T> = Partial<T> | null | undefined | void;

export
type Source<T> = (SourceValue<T> | ((it: T) => SourceValue<T>));

/**
 * A pimped-up variant of `Object.assign`:
 * - Sources may be functions receiving the target as an argument.
 * - A more helpful TypeScript type.
 * - And finally: a shorter name.
 */
export default
<T extends object>(target: T, ...sources: Source<T>[]): T =>
  Object.assign(target, ...sources.map(source =>
    typeof source === "function" ? source(target) : source
  ));
