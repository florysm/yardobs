import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

export function useAuth() {
  // undefined = still initializing, null = no session, object = signed in
  const [user, setUser]       = useState(undefined);
  const [session, setSession] = useState(null);

  useEffect(() => {
    if (!supabase) {
      // Supabase not configured — dev mode, skip auth entirely
      setUser(null);
      return;
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signIn = async (email) => {
    if (!supabase) return new Error('Supabase not configured');
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: false,
      },
    });
    return error ?? null;
  };

  const verifyOtp = async (email, token) => {
    if (!supabase) return new Error('Supabase not configured');
    const { error } = await supabase.auth.verifyOtp({
      email,
      token,
      type: 'email',
    });
    return error ?? null;
  };

  const signOut = async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
  };

  return {
    user,
    session,
    signIn,
    verifyOtp,
    signOut,
    isLoading: user === undefined,
  };
}
