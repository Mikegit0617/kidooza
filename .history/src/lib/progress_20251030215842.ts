
export async function saveProgress(userId: string, starsDelta: number, streak: number) {
  const { data: current, error: fetchError } = await supabase
    .from('progress')
    .select('*')
    .eq('id', userId)
    .maybeSingle();

  if (fetchError) throw fetchError;

  const { data, error: updateError } = await supabase
    .from('progress')
    .update({
      total_stars: Math.max(0, (current?.total_stars ?? 0) + starsDelta),
      streak,
      last_played: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', userId)
    .maybeSingle();

  if (updateError) throw updateError;

  return data;
}

export async function logQuizSession(userId: string, subject: string, correct: number, total: number) {
  const { error } = await supabase.from('quiz_sessions').insert({
    user_id: userId,
    subject,
    correct_count: correct,
    total_count: total,
  });

  if (error) throw error;
  return true;
}
