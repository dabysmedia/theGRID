import { prisma } from "@/lib/prisma"

/**
 * Compacts `sortOrder` to 0..n-1 for this user while preserving current list order
 * (order by sortOrder, then createdAt).
 */
export async function ensureSequentialWorkoutTemplateSortOrders(userId: string): Promise<void> {
  const rows = await prisma.workoutTemplate.findMany({
    where: { userId },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: { id: true, sortOrder: true },
  })
  if (rows.length === 0) return
  let needsFix = false
  for (let i = 0; i < rows.length; i++) {
    if (rows[i].sortOrder !== i) {
      needsFix = true
      break
    }
  }
  if (!needsFix) return
  await prisma.$transaction(
    rows.map((row, i) =>
      prisma.workoutTemplate.update({
        where: { id: row.id },
        data: { sortOrder: i },
      }),
    ),
  )
}
