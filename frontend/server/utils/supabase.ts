// Supabase client utility for server-side usage
import { createClient } from '@supabase/supabase-js'

let _supabase: ReturnType<typeof createClient> | null = null

export function useSupabase() {
    if (_supabase) return _supabase

    const config = useRuntimeConfig()
    const supabaseUrl = config.supabaseUrl
    const supabaseKey = config.supabaseKey

    if (!supabaseUrl || !supabaseKey) {
        throw new Error('[Supabase] Missing SUPABASE_URL or SUPABASE_KEY in runtime config')
    }

    _supabase = createClient(supabaseUrl, supabaseKey)
    return _supabase
}
