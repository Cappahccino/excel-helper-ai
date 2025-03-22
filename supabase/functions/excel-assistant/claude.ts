
// Claude API Integration for Excel Assistant
import { CLAUDE_MODEL, ASSISTANT_INSTRUCTIONS } from "./config.ts";
import { supabaseAdmin } from "./database.ts";

interface ClaudeMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

interface ClaudeResponse {
  id: string;
  content: Array<{
    type: string;
    text?: string;
  }>;
  role: string;
  model: string;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}

interface FileContent {
  filename: string;
  sheets: Array<{
    name: string;
    rowCount: number;
    columnCount: number;
    preview: any[];
  }>;
}

/**
 * Process Excel file analysis using Claude API
 */
export async function processWithClaude({
  query,
  fileContents,
  messageId,
  sessionId,
  userId
}: {
  query: string;
  fileContents: FileContent[];
  messageId: string;
  sessionId: string;
  userId: string;
}): Promise<{
  messageId: string;
  content: string;
  modelUsed: string;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}> {
  try {
    console.log('Processing Excel file analysis with Claude API');
    
    // Update message status to processing
    await updateMessageStatus(messageId, 'processing', '', {
      stage: 'preparing_claude_request',
      started_at: Date.now()
    });
    
    // Prepare file context
    const fileInfo = fileContents.map(content => {
      const sheetInfo = content.sheets.map(sheet => 
        `    - ${sheet.name}: ${sheet.rowCount} rows × ${sheet.columnCount} columns`
      ).join('\n');
      
      return `
- ${content.filename}
  Sheets:
${sheetInfo}`;
    }).join('\n');

    // Create comprehensive prompt with context and specific instructions
    const userPrompt = `
USER QUERY: ${query}

AVAILABLE EXCEL FILES:
${fileInfo}

INSTRUCTIONS:
1. Please analyze these Excel files and answer the query thoroughly
2. If appropriate, suggest ways to analyze the data further
3. If analyzing multiple files, consider relationships between them
4. For large datasets, provide summary statistics to give an overview
5. If formulas or complex calculations are involved, explain your approach

ADDITIONAL CONTEXT:
This query is part of chat session: ${sessionId}
`.trim();

    // Update message status
    await updateMessageStatus(messageId, 'processing', '', {
      stage: 'sending_to_claude',
      completion_percentage: 30
    });

    // Make API call to Claude
    const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');
    if (!ANTHROPIC_API_KEY) {
      throw new Error('ANTHROPIC_API_KEY environment variable not set');
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: CLAUDE_MODEL,
        max_tokens: 4000,
        system: ASSISTANT_INSTRUCTIONS,
        messages: [
          { role: 'user', content: userPrompt }
        ],
        metadata: {
          user_id: userId,
          session_id: sessionId,
          message_id: messageId
        }
      })
    });

    if (!response.ok) {
      const errorDetails = await response.text();
      throw new Error(`Claude API error: ${response.status} ${response.statusText} - ${errorDetails}`);
    }

    const claudeResponse = await response.json() as ClaudeResponse;
    
    // Extract content from Claude response
    const responseContent = claudeResponse.content[0]?.text || '';
    
    if (!responseContent.trim()) {
      throw new Error('Empty Claude response');
    }

    // Update message with response
    await updateMessageStatus(messageId, 'completed', responseContent, {
      stage: 'completed',
      completion_percentage: 100,
      claude_message_id: claudeResponse.id,
      model_used: claudeResponse.model,
      usage: claudeResponse.usage,
      completed_at: Date.now()
    });

    return {
      messageId: claudeResponse.id,
      content: responseContent,
      modelUsed: claudeResponse.model,
      usage: claudeResponse.usage
    };
  } catch (error) {
    console.error('Error in processWithClaude:', error);
    
    // Update message to failed status
    await updateMessageStatus(messageId, 'failed', error.message || 'Claude processing failed', {
      error: error.message,
      stage: 'claude_processing_error',
      failed_at: Date.now()
    });
    
    throw error;
  }
}

/**
 * Update message status in database
 */
async function updateMessageStatus(
  messageId: string, 
  status: string, 
  content: string = '', 
  metadata: Record<string, any> = {}
): Promise<void> {
  if (!messageId) {
    console.warn('No messageId provided to updateMessageStatus');
    return;
  }
  
  console.log(`Updating message ${messageId} to status: ${status}`);
  
  try {
    const updateData: Record<string, any> = {
      status,
      metadata: {
        ...metadata,
        processing_stage: {
          stage: status === 'processing' ? metadata.stage || 'generating' : status,
          last_updated: Date.now()
        }
      }
    };
    
    if (content) {
      updateData.content = content;
    }
    
    if (metadata.claude_message_id) {
      updateData.claude_message_id = metadata.claude_message_id;
    }
    
    const { error } = await supabaseAdmin
      .from('chat_messages')
      .update(updateData)
      .eq('id', messageId);

    if (error) {
      console.error('Error updating message status:', error);
      throw new Error(`Failed to update message status: ${error.message}`);
    }
  } catch (error) {
    console.error('Error in updateMessageStatus:', error);
    // Don't throw here to prevent cascading failures
  }
}
