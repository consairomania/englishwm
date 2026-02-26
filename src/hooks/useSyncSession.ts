import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import { SessionState } from '@/types/database';

export const useSyncSession = (sessionId: string) => {
  const [state, setState] = useState<SessionState | null>(null);

  useEffect(() => {
    if (!sessionId) return;

    // 1. Încărcăm starea inițială a sesiunii
    const fetchInitialState = async () => {
      const { data, error } = await supabase
        .from('session_state')
        .select('*')
        .eq('session_id', sessionId)
        .single();

      if (!error && data) {
        setState(data);
      }
    };

    fetchInitialState();

    // 2. Ne abonăm la schimbările în timp real (Realtime)
    const channel = supabase
      .channel(`session:${sessionId}`) // Creăm un "canal" unic pentru această sesiune
      .on(
        'postgres_changes',
        {
          event: 'UPDATE', // Ne interesează doar când profesorul face update la stare
          schema: 'public',
          table: 'session_state',
          filter: `session_id=eq.${sessionId}`,
        },
        (payload) => {
          setState(payload.new as SessionState);
        }
      )
      .subscribe();

    // 3. Curățăm conexiunea când componenta se închide
    return () => {
      supabase.removeChannel(channel);
    };
  }, [sessionId]);

  return { state };
};