import { supabase } from "./supabase/client";

export type ProgressRow = {
  id: string;
  user_id: string;
  total_stars: number;
  streak: number;
  last_played: string;
  updated_at: string;
};

// Load progress for a user
export async function loadProgress(userId: string) {
  const { data, error } = await supabase
    .from("progress")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return (data as ProgressRow) ?? null;
}

// Create/update progress (adds starsDelta to total)
export async function saveProgress(userId: string, starsDelta: number, streak: number) {
  const current = await loadProgress(userId);

  if (!current) {
    const { data, error } = await supabase
      .from("progress")
      .insert({
        user_id: userId,
        total_stars: Math.max(0, starsDelta),
        streak,
        last_played: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select()
      .maybeSingle();
    if (error) throw error;
    return data as ProgressRow;
  }

  const { data, error } = await supabase
    .from("progress")
    .update({
      total_stars: Math.max(0, (current.total_stars ?? 0) + starsDelta),
      streak,
      last_played: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", current.id)
    .select()
    .maybeSingle();
  if (error) throw error;
  return data as ProgressRow;
}

export async function logQuizSession(userId: string, subject: string, correct: number, total: number) {
  const { error } = await supabase.from("quiz_sessions").insert({
    user_id: userId,
    subject,
    correct_count: correct,
    total_count: total,
  });
  if (error) throw error;
  return true;
}
