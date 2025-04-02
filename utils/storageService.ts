import { supabase } from './supabase';

export function getPublicUrl(path: string): string {
  const { data } = supabase.storage.from('public_assets').getPublicUrl(path);
  return data.publicUrl;
}

export function getLogoUrl(): string {
  return getPublicUrl('logo/BLETblackgold.png');
} 