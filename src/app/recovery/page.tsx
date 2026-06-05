import { redirect } from "next/navigation"

/** Recovery moved into the Workouts tab. */
export default function RecoveryPage() {
  redirect("/workouts#recovery")
}
