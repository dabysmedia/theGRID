/**
 * Move an exercise to the back of the deferred queue.
 *
 * An exercise can surface more than once in one workout. Removing its earlier
 * position before appending it makes a second skip meaningful and guarantees
 * that the queue never stores duplicate exercise ids.
 */
export function deferExercise(
  skippedExerciseIds: readonly string[],
  exerciseId: string,
): string[] {
  return [...skippedExerciseIds.filter((id) => id !== exerciseId), exerciseId]
}
