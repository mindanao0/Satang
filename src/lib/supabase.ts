import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL ?? 'https://nbfnwnyvmlhiloixqgtg.supabase.co'
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY ?? 'YOUR_LEGACY_ANON_KEY'

export const supabase = createClient(supabaseUrl, supabaseKey)
