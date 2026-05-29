import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://xzjjelyvwwtwzirbuowj.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_IXJ2u6HkB261V4C4Sw05cQ_NwN7qTas';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export const signUp = async (email, password, fullName) => {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name: fullName } }
  });
  return { data, error };
};

export const signIn = async (email, password) => {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  return { data, error };
};

export const signOut = async () => {
  const { error } = await supabase.auth.signOut();
  return { error };
};

export const getCurrentUser = async () => {
  const { data: { user }, error } = await supabase.auth.getUser();
  return { user, error };
};

export const getUserRole = async (userId) => {
  const { data, error } = await supabase
    .from('users')
    .select('role')
    .eq('id', userId)
    .single();
  return { role: data?.role || 'viewer', error };
};
