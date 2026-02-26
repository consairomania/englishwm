import { createClient } from '@supabase/supabase-js';

// Folosim numele variabilelor definite în .env.local
// Semnul "!" de la final îi spune lui TypeScript că suntem siguri că aceste valori există
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Acesta este obiectul pe care îl vom folosi în toată aplicația pentru a vorbi cu baza de date
export const supabase = createClient(supabaseUrl, supabaseAnonKey);