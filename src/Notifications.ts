
export type Notifications = {
  // The `updated...` functions could
  // 1. pass key and value (but why transfer the value to a window that might
  //    not need it?)
  // 2. pass the key only and leave it to the receiver to get the value from the
  //    database (but why retrieve the value from the database in the local
  //    window, where it is already available as a JS value?)
  // 3. re-use the value locally and retrieve it in other pages when needed
  //    (but that complicates things.)
  // For now we use variant 2.  (This also provides some test coverage for
  // DB usage even if there is only one page open.)
  updatedTreeOverview(key: string): void,
  updatedTree(key: string): void,
  deletedTree(key: string): void,
  cleared(): void,
}
