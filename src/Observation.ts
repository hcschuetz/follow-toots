/**
 * An `Observation` takes a callback, which will be called to inform about
 * some changed value.  The new value will be passed to the callback.
 * 
 * An `Observation<T>` can also be considered as the continuation-passing
 * variant of type `T`.  (The callback is the continuation.)
 */
export
type Observation<T> = (update: (t: T) => unknown) => unknown;