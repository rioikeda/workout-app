export type Exercise = {
  id: number
  name: string
  body_part: string
  user_id: string | null
}

export type WorkoutSession = {
  id: number
  user_id: string
  workout_date: string
  notes: string | null
}

export type WorkoutSet = {
  id: number
  workout_session_id: number
  exercise_id: number
  set_number: number
  weight: number
  reps: number
  notes: string | null
}

export type Preset = {
  id: number
  user_id: string
  name: string
}

export type PresetExercise = {
  id: number
  preset_id: number
  exercise_id: number
  sort_order: number
}