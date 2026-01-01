import asgn from "./asgn";

// TODO I'm actually setting up separate objects for outgoing and incoming
// notifications.  Adapt this utility accordingly.

/** A notification object must specialize this type. */
type Constraint = Record<string, (...args: any[]) => void>;

/**
 * Take an object of functions and return an object of the same type.
 * The functions of the returned object will invoke the corresponding functions
 * in all scopes of the same origin with an equivalent set-up (using
 * compatible handlers and the same channel name):
 */
export default
<N extends Constraint>(channelName: string, handlers: N): N => {
  const broadcastChannel = asgn(new BroadcastChannel(channelName), {
    onmessage(ev) {
      const [operation, ...args] = ev.data;
      (handlers as any)[operation](...args);
    },
  });

  return new Proxy({}, {
    get: (_, operation: string) => 
      (...args: any[]) => {
        broadcastChannel.postMessage([operation, ...args]);
        // The broadcast message will not be sent to this window.
        // So the handler must be invoked directly:
        // TODO: Maybe superfluous if we use separate channels for
        // sending and receiving.
        (handlers as any)[operation](...args);
      },
    }
  ) as N;
}
