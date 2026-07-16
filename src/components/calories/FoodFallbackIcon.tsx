import { cn } from "@/lib/utils"

const FOOD_EMOJI_RULES: Array<[RegExp, string]> = [
  [/\b(beer|lager|ale|ipa)\b/i, "🍺"],
  [/\b(wine|merlot|cabernet|pinot)\b/i, "🍷"],
  [/\b(coffee|latte|espresso|cappuccino|mocha)\b/i, "☕"],
  [/\b(pizza)\b/i, "🍕"],
  [/\b(taco|burrito|quesadilla|nacho)\b/i, "🌮"],
  [/\b(burger|hamburger|cheeseburger|whopper)\b/i, "🍔"],
  [/\b(fries|french fry|potato|hash brown)\b/i, "🍟"],
  [/\b(chicken|turkey|poultry)\b/i, "🍗"],
  [/\b(steak|beef|barbacoa|carnitas)\b/i, "🥩"],
  [/\b(fish|salmon|tuna|shrimp|seafood)\b/i, "🐟"],
  [/\b(egg|omelet|omelette)\b/i, "🍳"],
  [/\b(rice|grain|quinoa)\b/i, "🍚"],
  [/\b(pasta|spaghetti|noodle|mac(?:aroni)?(?: and| &)? cheese)\b/i, "🍝"],
  [/\b(salad|greens|vegetable|veggie|broccoli|spinach)\b/i, "🥗"],
  [/\b(apple|fruit|berries|berry|banana|orange)\b/i, "🍎"],
  [/\b(bread|toast|bagel|biscuit|sandwich|sub)\b/i, "🥪"],
  [/\b(cookie|oreo)\b/i, "🍪"],
  [/\b(donut|doughnut)\b/i, "🍩"],
  [/\b(cake|cupcake|brownie|dessert)\b/i, "🍰"],
  [/\b(shake|smoothie|juice|soda|drink)\b/i, "🥤"],
  [/\b(soup|chili|stew|bowl)\b/i, "🥣"],
  [/\b(cheese)\b/i, "🧀"],
  [/\b(protein bar|granola bar|energy bar)\b/i, "🍫"],
]

export function foodEmojiForLabel(label: string, recipe = false): string {
  if (recipe) return "🍲"
  return FOOD_EMOJI_RULES.find(([pattern]) => pattern.test(label))?.[1] ?? "🥣"
}

export function FoodFallbackIcon({
  label,
  large = false,
  recipe = false,
  className,
}: {
  label: string
  large?: boolean
  recipe?: boolean
  className?: string
}) {
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center border border-white/[0.06] bg-glass-highlight/[0.08] shadow-[inset_0_1px_0_rgba(255,255,255,0.035)]",
        large ? "size-24 rounded-2xl text-4xl" : "size-12 rounded-2xl text-xl",
        className,
      )}
      role="img"
      aria-label={`${label} food icon`}
    >
      {foodEmojiForLabel(label, recipe)}
    </span>
  )
}
