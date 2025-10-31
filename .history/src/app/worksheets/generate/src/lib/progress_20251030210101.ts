
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
