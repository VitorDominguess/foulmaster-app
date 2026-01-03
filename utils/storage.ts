
import { createClient } from '@supabase/supabase-js';
import { Bet, Transaction } from '../types';

const BETS_KEY = 'foulmaster_bets';
const TRANSACTIONS_KEY = 'foulmaster_transactions';
const SYNC_CONFIG_KEY = 'foulmaster_sync_config';

interface SyncConfig {
  url: string;
  key: string;
}

export const getSyncConfig = (): SyncConfig | null => {
  const data = localStorage.getItem(SYNC_CONFIG_KEY);
  return data ? JSON.parse(data) : null;
};

export const saveSyncConfig = (config: SyncConfig | null) => {
  if (config) localStorage.setItem(SYNC_CONFIG_KEY, JSON.stringify(config));
  else localStorage.removeItem(SYNC_CONFIG_KEY);
};

const getSupabase = () => {
  const config = getSyncConfig();
  if (!config || !config.url || !config.key) return null;
  return createClient(config.url, config.key);
};

export const saveBets = async (bets: Bet[]) => {
  localStorage.setItem(BETS_KEY, JSON.stringify(bets));
  
  const supabase = getSupabase();
  if (supabase) {
    // No Supabase, sincronizamos a tabela 'bets'
    // Nota: O usuário precisaria criar a tabela no Supabase primeiro
    // Mas para facilitar, o app foca no LocalStorage e o Supabase é o backup/sync
    const { error } = await supabase.from('user_data').upsert({ 
      id: 'bets_data', 
      content: bets,
      updated_at: new Date().toISOString()
    });
    if (error) console.error('Erro sync Supabase:', error);
  }
};

export const loadBets = async (): Promise<Bet[]> => {
  const supabase = getSupabase();
  if (supabase) {
    const { data, error } = await supabase.from('user_data').select('content').eq('id', 'bets_data').single();
    if (!error && data) return data.content;
  }
  
  const data = localStorage.getItem(BETS_KEY);
  return data ? JSON.parse(data) : [];
};

export const saveTransactions = async (transactions: Transaction[]) => {
  localStorage.setItem(TRANSACTIONS_KEY, JSON.stringify(transactions));
  
  const supabase = getSupabase();
  if (supabase) {
    await supabase.from('user_data').upsert({ 
      id: 'transactions_data', 
      content: transactions,
      updated_at: new Date().toISOString()
    });
  }
};

export const loadTransactions = async (): Promise<Transaction[]> => {
  const supabase = getSupabase();
  if (supabase) {
    const { data, error } = await supabase.from('user_data').select('content').eq('id', 'transactions_data').single();
    if (!error && data) return data.content;
  }

  const data = localStorage.getItem(TRANSACTIONS_KEY);
  return data ? JSON.parse(data) : [];
};
