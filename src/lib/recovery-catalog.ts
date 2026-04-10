/**
 * Static catalogs for injury / illness tracking and suggested treatments.
 * Not medical advice — for self-tracking only.
 */

export type ConditionKind = "injury" | "illness"

export interface TreatmentDef {
  id: string
  name: string
  description?: string
}

export interface ConditionDef {
  id: string
  name: string
  kind: ConditionKind
  /** Broad area for filtering / display */
  region?: string
  /**
   * Body diagram slugs (body-highlighter) where this injury can be chosen when that SVG segment is tapped.
   * Omit or leave empty for “general” injuries shown on every segment (e.g. contusion).
   */
  injurySvgSlugs?: string[]
  suggestedTreatments: string[]
}

export const TREATMENTS: TreatmentDef[] = [
  { id: "rest", name: "Rest / activity reduction", description: "Reduce load until symptoms ease." },
  { id: "ice", name: "Ice / cold therapy", description: "Short sessions; avoid ice burn." },
  { id: "heat", name: "Heat therapy", description: "For stiffness once acute swelling is low." },
  { id: "compression", name: "Compression", description: "Brace, sleeve, or wrap as appropriate." },
  { id: "elevation", name: "Elevation", description: "Reduce dependent swelling." },
  { id: "nsaid", name: "OTC anti-inflammatory", description: "Only if appropriate for you; follow label / clinician." },
  { id: "topical_analgesic", name: "Topical analgesic", description: "Gel or cream for localized pain." },
  { id: "physio", name: "Physio / PT exercises", description: "Prescribed or guided rehab." },
  { id: "massage", name: "Massage / soft tissue work", description: "Self or professional." },
  { id: "stretch", name: "Gentle stretching", description: "Pain-free range only." },
  { id: "mobility", name: "Mobility drills", description: "Joint-friendly movement prep." },
  { id: "brace_tape", name: "Brace / taping", description: "Support during return to activity." },
  { id: "hydration", name: "Hydration", description: "Fluids across the day." },
  { id: "electrolytes", name: "Electrolytes", description: "If depleted from sweat or illness." },
  { id: "sleep_priority", name: "Prioritize sleep", description: "Earlier wind-down, consistent schedule." },
  { id: "gentle_movement", name: "Easy walking / light movement", description: "Blood flow without flaring symptoms." },
  { id: "bland_diet", name: "Bland / easy foods", description: "When GI is upset." },
  { id: "saline_rinse", name: "Saline nasal rinse", description: "For congestion; sterile water if DIY." },
  { id: "throat_care", name: "Throat lozenges / warm fluids", description: "Comfort for sore throat." },
  { id: "steam_inhalation", name: "Steam / humidified air", description: "Short sessions; avoid burns." },
  { id: "decongestant", name: "Decongestant (if appropriate)", description: "Per label / pharmacist guidance." },
  { id: "antihistamine", name: "Antihistamine", description: "Allergies / some sinus symptoms." },
  { id: "migraine_dark_quiet", name: "Dark, quiet environment", description: "Reduce sensory triggers." },
  { id: "breathing_meditation", name: "Breathing / meditation", description: "Down-regulate stress response." },
  { id: "heat_cramps_fluids", name: "Cool down + fluids", description: "After heat exposure or cramps." },
  { id: "gradual_return", name: "Gradual return to training", description: "Step-wise load progression." },
  { id: "see_clinician", name: "Medical evaluation", description: "Red flags, worsening, or uncertainty." },
  {
    id: "eccentric_rehab",
    name: "Loaded eccentric rehab (guided)",
    description: "Often used for tendons — only as prescribed / tolerated.",
  },
]

const T = (ids: string[]) => ids

export const CONDITIONS: ConditionDef[] = [
  // Lower limb
  {
    id: "ankle_sprain",
    name: "Ankle sprain",
    kind: "injury",
    region: "Ankle / foot",
    injurySvgSlugs: ["ankles", "feet"],
    suggestedTreatments: T(["rest", "ice", "compression", "elevation", "brace_tape", "physio", "gradual_return", "see_clinician"]),
  },
  {
    id: "plantar_fasciitis",
    name: "Plantar fasciitis",
    kind: "injury",
    region: "Foot",
    injurySvgSlugs: ["feet"],
    suggestedTreatments: T(["rest", "ice", "stretch", "brace_tape", "physio", "gentle_movement", "see_clinician"]),
  },
  {
    id: "achilles_tendinopathy",
    name: "Achilles tendinopathy",
    kind: "injury",
    region: "Lower leg",
    injurySvgSlugs: ["calves"],
    suggestedTreatments: T(["rest", "ice", "eccentric_rehab", "physio", "gradual_return", "see_clinician"]),
  },
  {
    id: "shin_splints",
    name: "Shin splints (MTSS)",
    kind: "injury",
    region: "Lower leg",
    injurySvgSlugs: ["tibialis"],
    suggestedTreatments: T(["rest", "ice", "compression", "gradual_return", "physio", "see_clinician"]),
  },
  {
    id: "stress_fracture_suspected",
    name: "Stress injury / fracture (suspected)",
    kind: "injury",
    region: "Lower leg",
    injurySvgSlugs: ["tibialis", "feet", "ankles"],
    suggestedTreatments: T(["rest", "see_clinician", "gradual_return"]),
  },
  {
    id: "calf_strain",
    name: "Calf strain",
    kind: "injury",
    region: "Lower leg",
    injurySvgSlugs: ["calves"],
    suggestedTreatments: T(["rest", "ice", "compression", "gentle_movement", "physio", "gradual_return", "see_clinician"]),
  },
  {
    id: "runners_knee",
    name: "Runner’s knee (PFPS)",
    kind: "injury",
    region: "Knee",
    injurySvgSlugs: ["knees"],
    suggestedTreatments: T(["rest", "ice", "physio", "mobility", "gradual_return", "see_clinician"]),
  },
  {
    id: "it_band_syndrome",
    name: "IT band syndrome",
    kind: "injury",
    region: "Knee / hip",
    injurySvgSlugs: ["knees", "quadriceps", "gluteal"],
    suggestedTreatments: T(["rest", "ice", "stretch", "physio", "gradual_return", "see_clinician"]),
  },
  {
    id: "hamstring_strain",
    name: "Hamstring strain",
    kind: "injury",
    region: "Thigh",
    injurySvgSlugs: ["hamstring"],
    suggestedTreatments: T(["rest", "ice", "compression", "physio", "gradual_return", "see_clinician"]),
  },
  {
    id: "quad_strain",
    name: "Quadriceps strain",
    kind: "injury",
    region: "Thigh",
    injurySvgSlugs: ["quadriceps"],
    suggestedTreatments: T(["rest", "ice", "compression", "physio", "gradual_return", "see_clinician"]),
  },
  {
    id: "groin_strain",
    name: "Groin strain",
    kind: "injury",
    region: "Hip / groin",
    injurySvgSlugs: ["adductors"],
    suggestedTreatments: T(["rest", "ice", "gentle_movement", "physio", "gradual_return", "see_clinician"]),
  },
  {
    id: "hip_flexor_strain",
    name: "Hip flexor strain",
    kind: "injury",
    region: "Hip",
    injurySvgSlugs: ["quadriceps", "abs", "adductors"],
    suggestedTreatments: T(["rest", "ice", "stretch", "physio", "gradual_return", "see_clinician"]),
  },
  {
    id: "bursitis_hip",
    name: "Hip bursitis (trochanteric)",
    kind: "injury",
    region: "Hip",
    injurySvgSlugs: ["gluteal"],
    suggestedTreatments: T(["rest", "ice", "nsaid", "physio", "see_clinician"]),
  },
  // Spine / trunk
  {
    id: "lower_back_strain",
    name: "Lower back strain",
    kind: "injury",
    region: "Back",
    injurySvgSlugs: ["lower-back"],
    suggestedTreatments: T(["rest", "heat", "gentle_movement", "mobility", "physio", "see_clinician"]),
  },
  {
    id: "neck_strain",
    name: "Neck strain (whiplash-type)",
    kind: "injury",
    region: "Neck",
    injurySvgSlugs: ["neck", "trapezius"],
    suggestedTreatments: T(["rest", "ice", "heat", "gentle_movement", "physio", "see_clinician"]),
  },
  {
    id: "rib_contusion",
    name: "Rib contusion / bruise",
    kind: "injury",
    region: "Chest",
    injurySvgSlugs: ["chest"],
    suggestedTreatments: T(["rest", "ice", "breathing_meditation", "see_clinician"]),
  },
  // Upper limb
  {
    id: "shoulder_impingement",
    name: "Shoulder impingement",
    kind: "injury",
    region: "Shoulder",
    injurySvgSlugs: ["deltoids"],
    suggestedTreatments: T(["rest", "ice", "physio", "mobility", "gradual_return", "see_clinician"]),
  },
  {
    id: "rotator_cuff_strain",
    name: "Rotator cuff strain",
    kind: "injury",
    region: "Shoulder",
    injurySvgSlugs: ["deltoids"],
    suggestedTreatments: T(["rest", "ice", "physio", "see_clinician"]),
  },
  {
    id: "tennis_elbow",
    name: "Tennis elbow (lateral epicondylalgia)",
    kind: "injury",
    region: "Elbow",
    injurySvgSlugs: ["forearm", "biceps"],
    suggestedTreatments: T(["rest", "ice", "brace_tape", "physio", "topical_analgesic", "see_clinician"]),
  },
  {
    id: "golfers_elbow",
    name: "Golfer’s elbow (medial epicondylalgia)",
    kind: "injury",
    region: "Elbow",
    injurySvgSlugs: ["forearm", "biceps"],
    suggestedTreatments: T(["rest", "ice", "brace_tape", "physio", "see_clinician"]),
  },
  {
    id: "wrist_strain",
    name: "Wrist strain",
    kind: "injury",
    region: "Wrist / hand",
    injurySvgSlugs: ["hands", "forearm"],
    suggestedTreatments: T(["rest", "ice", "compression", "brace_tape", "physio", "see_clinician"]),
  },
  {
    id: "tfcc_wrist",
    name: "Wrist TFCC irritation",
    kind: "injury",
    region: "Wrist",
    injurySvgSlugs: ["hands"],
    suggestedTreatments: T(["rest", "brace_tape", "physio", "see_clinician"]),
  },
  // General MSK
  { id: "doms", name: "DOMS (delayed onset muscle soreness)", kind: "injury", region: "General", suggestedTreatments: T(["rest", "gentle_movement", "hydration", "sleep_priority", "heat"]) },
  { id: "muscle_cramp", name: "Muscle cramping", kind: "injury", region: "General", suggestedTreatments: T(["hydration", "electrolytes", "gentle_movement", "stretch"]) },
  { id: "contusion", name: "Contusion / deep bruise", kind: "injury", region: "General", suggestedTreatments: T(["rest", "ice", "compression", "elevation", "see_clinician"]) },
  { id: "bursitis_general", name: "Bursitis (general)", kind: "injury", region: "General", suggestedTreatments: T(["rest", "ice", "nsaid", "physio", "see_clinician"]) },
  { id: "tendonitis_general", name: "Tendon irritation (tendinopathy)", kind: "injury", region: "General", suggestedTreatments: T(["rest", "ice", "physio", "eccentric_rehab", "gradual_return", "see_clinician"]) },
  {
    id: "concussion_suspected",
    name: "Head injury / concussion (suspected)",
    kind: "injury",
    region: "Head",
    injurySvgSlugs: ["head", "hair"],
    suggestedTreatments: T(["rest", "sleep_priority", "see_clinician"]),
  },
  { id: "heat_exhaustion_suspected", name: "Heat exhaustion (suspected)", kind: "injury", region: "General", suggestedTreatments: T(["heat_cramps_fluids", "electrolytes", "rest", "see_clinician"]) },
  // Illness — respiratory / systemic
  { id: "common_cold", name: "Common cold", kind: "illness", region: "Respiratory", suggestedTreatments: T(["hydration", "sleep_priority", "throat_care", "saline_rinse", "see_clinician"]) },
  { id: "influenza_like", name: "Influenza-like illness", kind: "illness", region: "Systemic", suggestedTreatments: T(["rest", "hydration", "sleep_priority", "see_clinician"]) },
  { id: "covid_like", name: "COVID-like respiratory illness (suspected)", kind: "illness", region: "Respiratory", suggestedTreatments: T(["rest", "hydration", "sleep_priority", "see_clinician"]) },
  { id: "sinusitis", name: "Sinus congestion / sinusitis symptoms", kind: "illness", region: "Sinus", suggestedTreatments: T(["saline_rinse", "hydration", "steam_inhalation", "decongestant", "see_clinician"]) },
  { id: "strep_throat_suspected", name: "Strep throat (suspected)", kind: "illness", region: "Throat", suggestedTreatments: T(["throat_care", "hydration", "see_clinician"]) },
  { id: "allergic_rhinitis", name: "Allergic rhinitis / hay fever", kind: "illness", region: "Respiratory", suggestedTreatments: T(["saline_rinse", "antihistamine", "see_clinician"]) },
  // GI
  { id: "gastroenteritis", name: "Gastroenteritis (stomach bug)", kind: "illness", region: "GI", suggestedTreatments: T(["hydration", "electrolytes", "bland_diet", "rest", "see_clinician"]) },
  { id: "food_poisoning_suspected", name: "Food poisoning (suspected)", kind: "illness", region: "GI", suggestedTreatments: T(["hydration", "electrolytes", "rest", "see_clinician"]) },
  { id: "heartburn_reflux", name: "Heartburn / reflux flare", kind: "illness", region: "GI", suggestedTreatments: T(["bland_diet", "hydration", "see_clinician"]) },
  { id: "constipation", name: "Constipation", kind: "illness", region: "GI", suggestedTreatments: T(["hydration", "gentle_movement", "see_clinician"]) },
  { id: "ibs_flare", name: "IBS-type flare (self-tracked)", kind: "illness", region: "GI", suggestedTreatments: T(["bland_diet", "hydration", "breathing_meditation", "see_clinician"]) },
  // Neuro / pain / other
  { id: "migraine", name: "Migraine", kind: "illness", region: "Head", suggestedTreatments: T(["migraine_dark_quiet", "hydration", "sleep_priority", "see_clinician"]) },
  { id: "tension_headache", name: "Tension-type headache", kind: "illness", region: "Head", suggestedTreatments: T(["hydration", "breathing_meditation", "massage", "heat", "see_clinician"]) },
  { id: "vertigo_suspected", name: "Vertigo (suspected)", kind: "illness", region: "Neuro", suggestedTreatments: T(["rest", "see_clinician"]) },
  { id: "fatigue_unknown", name: "Fatigue / low energy (non-specific)", kind: "illness", region: "Systemic", suggestedTreatments: T(["sleep_priority", "hydration", "gentle_movement", "see_clinician"]) },
  { id: "insomnia_bout", name: "Insomnia / poor sleep bout", kind: "illness", region: "Sleep", suggestedTreatments: T(["sleep_priority", "breathing_meditation", "see_clinician"]) },
  { id: "anxiety_spike", name: "Anxiety spike (self-tracked)", kind: "illness", region: "Mental health", suggestedTreatments: T(["breathing_meditation", "gentle_movement", "sleep_priority", "see_clinician"]) },
  { id: "menstrual_cramps", name: "Menstrual cramps", kind: "illness", region: "Pelvic", suggestedTreatments: T(["heat", "nsaid", "rest", "hydration", "see_clinician"]) },
  { id: "uti_suspected", name: "UTI (suspected)", kind: "illness", region: "Urinary", suggestedTreatments: T(["hydration", "see_clinician"]) },
  { id: "ear_infection_suspected", name: "Ear infection (suspected)", kind: "illness", region: "Ear", suggestedTreatments: T(["rest", "see_clinician"]) },
  { id: "pink_eye_suspected", name: "Pink eye / conjunctivitis (suspected)", kind: "illness", region: "Eye", suggestedTreatments: T(["see_clinician"]) },
  { id: "skin_rash_flare", name: "Skin rash / irritation flare", kind: "illness", region: "Skin", suggestedTreatments: T(["see_clinician"]) },
  { id: "oral_ulcers", name: "Mouth ulcers / canker sores", kind: "illness", region: "Mouth", suggestedTreatments: T(["throat_care", "see_clinician"]) },
]

const treatmentById = new Map(TREATMENTS.map((t) => [t.id, t]))

export function getTreatmentById(id: string): TreatmentDef | undefined {
  return treatmentById.get(id)
}

export function getConditionById(id: string): ConditionDef | undefined {
  return CONDITIONS.find((c) => c.id === id)
}

export function isKnownTreatmentKey(key: string): boolean {
  return treatmentById.has(key)
}