/** Short command card. Models should fetch this once, then call POST /api/agent/act. */
export function agentActCatalog(): string {
  return `theGRID agent commands
POST /api/agent/act
Authorization: Bearer <AGENT_API_TOKEN>
Content-Type: application/json

One call can read and write. Name the profile every time more than one exists:
{"user":"Carlos","op":"day"}
{"user":"Carlos","ops":[{"op":"food.search","q":"oikos","n":3},{"op":"log.add","date":"today","slot":"morning","name":"Oikos","kcal":90,"p":15,"c":6,"f":0}]}

Also accepted: ["food.search","oikos"] and ["log.del","<id>"].
user is a profile name or id. Omit it only when the instance has one profile (or AGENT_PROFILE_ID / AGENT_PROFILE_NAME is set).
The response always echoes user.id and user.name. userDefaulted:true means the name was chosen for you — confirm it before writing.
HTTP 200 means the batch ran. Check results[].ok. Earlier ops are saved even if a later op fails. Ops run in order.
Dates: YYYY-MM-DD, today, or yesterday. Times: HH:MM in the profile timezone, or an ISO timestamp.
Food slots: morning, afternoon, evening. breakfast/lunch/dinner/snack also work. Omitted slot uses the current part of the day.
Units: serving, g, oz, piece. Macros are kcal, p, c, f. Portion is amt + unit.
Steps and cardio use the 5am tracking day. Every other date is a calendar day.
Synced Google Health rows can be deleted; the next sync may recreate steps and sleep. Cardio sync rows are tombstoned.
Window dumps stay at GET /api/agent/text/<window> and GET /api/agent/json/<window> (the public profile only). Use op day before an edit — it is much smaller.

Read
- help
- users — id and name of every profile
- day — one day: foods, water, weight, steps, sleep, runs, cardio, workouts, habits, alcohol, bowel, journal, recovery, peptides. date defaults to today
- food.search — q (2+ chars) or barcode. n defaults to 6, max 12. No profile required. Copy kcal/p/c/f into log.add or foods.add
- log.list — foods on a date
- foods.list — saved custom foods. optional q, n (default 25, max 50)
- recipes.list — saved recipes. optional q
- habits.list
- workout.list — date, or the latest n (default 5)

Food log
- log.add — date, slot, and either name+kcal or foodId or recipeId. Optional p, c, f, amt, unit, servings (multiplier). items:[...] logs many rows and returns ids
- log.update — id plus any fields to change
- log.move — id (or ids) and date and/or slot
- log.del — id or ids
- foods.add — custom food. name, kcal. Optional p, c, f, tags (breakfast|lunch|dinner|snack, default snack), category (shake|bar|snack|meal|restaurant|ingredient|drink|other), amt, unit, grams
- foods.update — id plus fields
- foods.del — id. Hides that name from suggestions
- recipes.add — name, items:[{name,kcal,p,c,f,amt,unit}]. Optional tags
- recipes.update — id plus fields. items replaces the ingredient list
- recipes.del — id
- recipes.log — id, date, slot, servings. Writes one food row for the whole recipe

Daily logs
- water.add — oz (max 128). water.del — id
- weight.set — lbs. weight.del — id
- steps.set — count (manual row; synced steps are left in place and both are returned)
- steps.del — id
- sleep.set — bedtime and wake as HH:MM or ISO. date is the wake day. Optional score 0–100, notes. Replaces the row for that day
- sleep.del — id
- run.add — miles, minutes. Optional where (outdoor|indoor), notes. run.move — id, date. run.del — id
- cardio.add — activity (cycling|running|stair_stepper|elliptical|rowing|swimming|hiit|cardio), minutes, optional notes. cardio.del — id
- alcohol.add — drink, qty. units defaults to qty. alcohol.del — id
- bowel.add — bristol 0–7 (0 = none). Optional time, notes. bowel.del — id
- journal.add — text (max 600), optional mood 1–5. journal.update — id plus text and/or mood. journal.del — id
- habits.add — name. habits.done — id or name, optional date, on:false to clear (default marks done; repeating is safe). habits.del — id
- recovery.set — any of pain, energy, mood, soreness, stress, mobility, sleep as integers 1–10. Optional notes
- peptide.add — doseMg, site (abd|leg|glute). Optional compound (default retatrutide), notes, sideEffects. peptide.del — id. Profile must have protocol tracking on

Workouts
- workout.add — name, exercises:[{name, machine?, sets:[[lb,reps]|{lb,reps,type,done}]}]. Sets are completed working sets unless type (warmup|dropset|failure) or done:false. Optional date, minutes, bw, notes, status (completed default, or active). Starting an active workout closes the previous active one
- workout.update — id plus any of those fields. exercises replaces the whole session
- workout.move — id, date
- workout.del — id

Aliases: meal.add=log.add, foods.search=food.search, foods.save=foods.add, recipe.log=recipes.log, habit.done=habits.done, weight.add=weight.set.
`
}
