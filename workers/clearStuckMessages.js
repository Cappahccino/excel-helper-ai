
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function clearStuckMessages() {
  try {
    console.log('Finding stuck messages...');
    
    // Find messages that have been stuck in processing for more than 15 minutes
    const { data: stuckMessages, error } = await supabase
      .from('chat_messages')
      .select('id, content, role, session_id')
      .or('status.eq.processing,status.eq.in_progress')
      .lt('updated_at', new Date(Date.now() - 15 * 60 * 1000).toISOString());
    
    if (error) {
      console.error('Error fetching stuck messages:', error);
      return;
    }
    
    console.log(`Found ${stuckMessages?.length || 0} stuck messages to clear`);
    
    if (!stuckMessages || stuckMessages.length === 0) {
      return;
    }
    
    const processedMessages = [];
    
    // Update each stuck message
    for (const message of stuckMessages) {
      console.log(`Processing stuck message ${message.id}...`);
      
      try {
        // If this is a user message, mark it as failed
        if (message.role === 'user') {
          const { error: updateError } = await supabase
            .from('chat_messages')
            .update({
              status: 'failed',
              metadata: {
                processing_stage: {
                  stage: 'failed',
                  error: 'Message processing timed out',
                  cleared_at: Date.now()
                }
              }
            })
            .eq('id', message.id);
          
          if (updateError) {
            console.error(`Error updating user message ${message.id}:`, updateError);
          } else {
            processedMessages.push({ id: message.id, role: 'user', action: 'marked as failed' });
          }
        } 
        // If this is an assistant message with empty content, mark it as failed
        else if (message.role === 'assistant' && (!message.content || message.content.trim() === '')) {
          const { error: updateError } = await supabase
            .from('chat_messages')
            .update({
              status: 'failed',
              content: 'Sorry, I was unable to process your request. Please try again.',
              metadata: {
                processing_stage: {
                  stage: 'failed',
                  error: 'Message processing timed out',
                  cleared_at: Date.now()
                }
              }
            })
            .eq('id', message.id);
          
          if (updateError) {
            console.error(`Error updating assistant message ${message.id}:`, updateError);
          } else {
            processedMessages.push({ id: message.id, role: 'assistant', action: 'marked as failed with error message' });
          }
        }
        // If this is an assistant message with content, mark it as completed
        else if (message.role === 'assistant' && message.content && message.content.trim() !== '') {
          const { error: updateError } = await supabase
            .from('chat_messages')
            .update({
              status: 'completed',
              metadata: {
                processing_stage: {
                  stage: 'completed',
                  note: 'Automatically marked as completed after being stuck',
                  completed_at: Date.now()
                }
              }
            })
            .eq('id', message.id);
          
          if (updateError) {
            console.error(`Error updating assistant message ${message.id}:`, updateError);
          } else {
            processedMessages.push({ id: message.id, role: 'assistant', action: 'marked as completed' });
          }
        }
      } catch (messageError) {
        console.error(`Error processing message ${message.id}:`, messageError);
      }
    }
    
    console.log(`Processed ${processedMessages.length} stuck messages:`);
    console.table(processedMessages);
  } catch (error) {
    console.error('Error in clearStuckMessages:', error);
  }
}

// Run the script immediately
clearStuckMessages()
  .then(() => {
    console.log('Completed clearing stuck messages');
    process.exit(0);
  })
  .catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
