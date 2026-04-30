import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://yxdeyejkkqaubvymhugu.supabase.co'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl4ZGV5ZWpra3FhdWJ2eW1odWd1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc1NzE5NDMsImV4cCI6MjA5MzE0Nzk0M30.wr1H7XmaEB1pTwZLFe7tGDVMuCjuJDLSFynnyAb6BEY'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
