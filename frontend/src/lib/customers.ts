import { supabase } from './supabase';

// CustomerCombobox: nama baru otomatis tersimpan sebagai customer baru
export async function getOrCreateCustomer(userId: string, name: string): Promise<string | null> {
  const trimmed = (name || '').trim();
  if (!trimmed) return null;
  const { data } = await supabase
    .from('customers')
    .select('id')
    .eq('user_id', userId)
    .ilike('name', trimmed)
    .maybeSingle();
  if (data) return data.id;
  const { data: created, error } = await supabase
    .from('customers')
    .insert({ user_id: userId, name: trimmed })
    .select('id')
    .single();
  if (error) return null;
  return created?.id ?? null;
}
