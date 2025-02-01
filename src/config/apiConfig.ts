export const API_CONFIG = {
  LAMBDA_FUNCTION_URL: import.meta.env.VITE_LAMBDA_FUNCTION_URL,
  LAMBDA_AUTH_TOKEN: import.meta.env.VITE_LAMBDA_AUTH_TOKEN,
  SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL,
  SUPABASE_KEY: import.meta.env.VITE_SUPABASE_SERVICE_ROLE_KEY,
} as const;