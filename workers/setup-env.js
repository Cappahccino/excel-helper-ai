const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// These values need to be provided when running the script
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Please provide SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY as environment variables');
  process.exit(1);
}

async function fetchSecretsAndSetupEnv() {
  console.log('Fetching secrets from Supabase...');
  
  try {
    // Initialize Supabase client
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    
    // Fetch secrets
    const { data: secrets, error } = await supabase
      .from('secrets')
      .select('name, value')
      .in('name', [
        'REDIS_URL',
        'UPSTASH_REDIS_REST_URL',
        'UPSTASH_REDIS_REST_TOKEN',
        'OPENAI_API_KEY',
        'ANTHROPIC_API_KEY'
      ]);
      
    if (error) {
      throw error;
    }
    
    // Convert secrets array to object
    const secretsObj = secrets.reduce((acc, { name, value }) => {
      acc[name] = value;
      return acc;
    }, {});
    
    // Create .env content
    const envContent = `# Supabase configuration
SUPABASE_URL=${SUPABASE_URL}
SUPABASE_SERVICE_ROLE_KEY=${SUPABASE_SERVICE_ROLE_KEY}
SUPABASE_ANON_KEY=${secretsObj.SUPABASE_ANON_KEY || ''}

# Redis configuration
REDIS_URL=${secretsObj.REDIS_URL || ''}
UPSTASH_REDIS_REST_URL=${secretsObj.UPSTASH_REDIS_REST_URL || ''}
UPSTASH_REDIS_REST_TOKEN=${secretsObj.UPSTASH_REDIS_REST_TOKEN || ''}

# AI Service configuration
USE_CLAUDE=true
OPENAI_API_KEY=${secretsObj.OPENAI_API_KEY || ''}
ANTHROPIC_API_KEY=${secretsObj.ANTHROPIC_API_KEY || ''}

# Worker configuration
MAX_CONCURRENT_JOBS=5
MAX_RETRY_COUNT=3
RECOVERY_CHECK_INTERVAL=300000 # 5 minutes in milliseconds`;
    
    // Write to .env file
    fs.writeFileSync(path.join(__dirname, '.env'), envContent);
    
    console.log('Successfully created .env file with secrets from Supabase');
  } catch (error) {
    console.error('Error fetching secrets:', error);
    process.exit(1);
  }
}

fetchSecretsAndSetupEnv().catch(console.error); 