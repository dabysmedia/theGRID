import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

const mocks = vi.hoisted(() => ({
  readEntries: vi.fn(), readProfile: vi.fn(), readUser: vi.fn(), updateUser: vi.fn(),
  readMeal: vi.fn(), deleteMeal: vi.fn(), resolveUser: vi.fn(), transaction: vi.fn(),
}))
vi.mock("@/lib/prisma", () => ({ prisma: {
  calorieEntry: { findMany: mocks.readEntries }, user: { findUnique: mocks.readProfile }, $transaction: mocks.transaction,
} }))
vi.mock("@/lib/current-user", () => ({ resolveUserId: mocks.resolveUser, UserError: class extends Error {} }))
import { GET, PATCH } from "@/app/api/calories/frequent/route"
import { DELETE } from "@/app/api/saved-meals/route"

beforeEach(() => {
  vi.resetAllMocks()
  mocks.resolveUser.mockResolvedValue("profile-a")
  mocks.readProfile.mockResolvedValue({ timeZone: "UTC", hiddenFoodNamesJson: '["built"]' })
  mocks.readUser.mockResolvedValue({ hiddenFoodNamesJson: "[]" })
  mocks.transaction.mockImplementation(async (callback) => callback({
    user: { findUniqueOrThrow: mocks.readUser, update: mocks.updateUser },
    savedMeal: { findFirst: mocks.readMeal, delete: mocks.deleteMeal },
  }))
})

describe("food suggestion persistence", () => {
  it("filters hidden history from single-slot and timeline batch responses", async () => {
    mocks.readEntries.mockResolvedValue([{ id: "log", mealType: "dinner", mealSlot: "evening", description: "Built", calories: 180, protein: 20, carbs: 10, fat: 6, imageUrl: null, portionAmount: 1, portionUnit: "serving", createdAt: new Date() }])
    const response = await GET(new NextRequest("https://example.test/api/calories/frequent?slot=evening"))
    expect(await response.json()).toEqual({ picks: [], recent: [], library: [], hiddenNames: ["built"] })
    const batch = await GET(new NextRequest("https://example.test/api/calories/frequent?slots=morning,evening"))
    expect(await batch.json()).toEqual({ morning: [], evening: [] })
    expect(mocks.readEntries.mock.calls[0][0].where).toEqual({ userId: "profile-a" })
  })
  it("persists a hide only for the authenticated profile", async () => {
    const response = await PATCH(new NextRequest("https://example.test/api/calories/frequent", { method: "PATCH", body: JSON.stringify({ name: "Built", hidden: true }) }))
    expect(response.status).toBe(200)
    expect(mocks.updateUser).toHaveBeenCalledWith({ where: { id: "profile-a" }, data: { hiddenFoodNamesJson: '["built"]' } })
  })
  it("suppresses a deleted library food in the same transaction", async () => {
    mocks.readMeal.mockResolvedValue({ id: "saved", name: "Built" })
    const response = await DELETE(new NextRequest("https://example.test/api/saved-meals?id=saved", { method: "DELETE" }))
    expect(response.status).toBe(200)
    expect(mocks.readMeal).toHaveBeenCalledWith({ where: { id: "saved", userId: "profile-a" } })
    expect(mocks.updateUser.mock.calls[0][0].data.hiddenFoodNamesJson).toBe('["built"]')
    expect(mocks.deleteMeal).toHaveBeenCalledWith({ where: { id: "saved" } })
  })
  it("cannot delete or suppress a saved food belonging to another profile", async () => {
    mocks.readMeal.mockResolvedValue(null)
    const response = await DELETE(new NextRequest("https://example.test/api/saved-meals?id=other-profile-food", { method: "DELETE" }))
    expect(response.status).toBe(404)
    expect(mocks.updateUser).not.toHaveBeenCalled()
    expect(mocks.deleteMeal).not.toHaveBeenCalled()
  })
})
