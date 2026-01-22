export default
class Registry {
  disposers: (() => void)[] = [];

  register(dispose: () => void) {
    this.disposers.push(dispose);
  }

  disposeAll() {
    for (const dispose of this.disposers) {
      dispose();
    }
    this.disposers.length = 0;
  }
}