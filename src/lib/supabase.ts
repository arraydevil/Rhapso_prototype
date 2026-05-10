import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export interface LookType {
  id: string;
  name: string;
  skin_tone: string;
  body_type: string;
  created_at: string;
  updated_at: string;
}

export interface GarmentType {
  id: string;
  look_id: string;
  category: string;
  name: string;
  image_url: string;
  shop_url: string | null;
  created_at: string;
}

export const looks = {
  getAll: async () => {
    const { data, error } = await supabase
      .from('looks')
      .select('*')
      .order('updated_at', { ascending: false });
    if (error) throw error;
    return data;
  },

  create: async (look: Omit<LookType, 'id' | 'created_at' | 'updated_at'>) => {
    const { data, error } = await supabase
      .from('looks')
      .insert([look])
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  update: async (id: string, updates: Partial<LookType>) => {
    const { data, error } = await supabase
      .from('looks')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  delete: async (id: string) => {
    const { error } = await supabase
      .from('looks')
      .delete()
      .eq('id', id);
    if (error) throw error;
  },
};

export const garments = {
  getByLookId: async (lookId: string) => {
    const { data, error } = await supabase
      .from('garments')
      .select('*')
      .eq('look_id', lookId);
    if (error) throw error;
    return data;
  },

  create: async (garment: Omit<GarmentType, 'id' | 'created_at'>) => {
    const { data, error } = await supabase
      .from('garments')
      .insert([garment])
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  delete: async (id: string) => {
    const { error } = await supabase
      .from('garments')
      .delete()
      .eq('id', id);
    if (error) throw error;
  },
};
