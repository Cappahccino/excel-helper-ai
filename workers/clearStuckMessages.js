
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);

/**
 * Clear stuck messages that have been in processing/in_progress state for too long
 */
async function clearStuckMessages() {
  console.log('Looking for stuck messages...');
  
  try {
    // Get current timestamp
    const now = new Date();
    
    // Define threshold for "stuck" messages (15 minutes)
    const stuckThresholdMinutes = 15;
    const stuckThreshold = new Date(now.getTime() - stuckThresholdMinutes * 60 * 1000);
    const stuckThresholdIso = stuckThreshold.toISOString();
    
    console.log(`Looking for messages stuck in processing since before: ${stuckThresholdIso}`);
    
    // Find messages that are stuck in processing state
    const { data: stuckMessages, error } = await supabase
      .from('chat_messages')
      .select('id, updated_at, status, role')
      .in('status', ['processing', 'in_progress']) 
      .lt('updated_at', stuckThresholdIso)
      .order('updated_at', { ascending: true });
      
    if (error) {
      console.error('Error fetching stuck messages:', error);
      return;
    }
    
    if (!stuckMessages || stuckMessages.length === 0) {
      console.log('No stuck messages found');
      return;
    }
    
    console.log(`Found ${stuckMessages.length} stuck messages:`);
    stuckMessages.forEach(msg => {
      console.log(`- Message ID: ${msg.id}, Status: ${msg.status}, Role: ${msg.role}, Last Updated: ${msg.updated_at}`);
    });
    
    // Confirm with user
    const messageIds = stuckMessages.map(msg => msg.id);
    const { count, error: updateError } = await supabase
      .from('chat_messages')
      .update({
        status: 'failed',
        metadata: {
          processing_stage: {
            stage: 'failed',
            error: 'Message processing timed out',
            cleared_at: now.toISOString(),
            original_status: 'processing or in_progress',
            reason: 'stuck_message_recovery'
          }
        }
      })
      .in('id', messageIds);
      
    if (updateError) {
      console.error('Error updating stuck messages:', updateError);
      return;
    }
    
    console.log(`Successfully marked ${count} stuck messages as failed`);
    
  } catch (error) {
    console.error('Error in clearStuckMessages:', error);
  }
}

// Run the function
clearStuckMessages().catch(console.error).finally(() => {
  console.log('Script completed');
  process.exit(0);
});
