import {
  getRestaurantMenu,
  RESTAURANT_MENUS,
} from "@/lib/calories/restaurant-menu-catalog"

export async function GET(request: Request) {
  const restaurantId = new URL(request.url).searchParams.get("restaurant")

  if (restaurantId) {
    const restaurant = getRestaurantMenu(restaurantId)
    if (!restaurant) {
      return Response.json({ error: "Restaurant not found" }, { status: 404 })
    }
    return Response.json({ restaurant })
  }

  return Response.json({ restaurants: RESTAURANT_MENUS })
}
