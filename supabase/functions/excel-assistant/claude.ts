
// Claude API Integration for Excel Assistant
import { CLAUDE_MODEL, ASSISTANT_INSTRUCTIONS, MAX_RETRIES, RETRY_DELAY } from "./config.ts";
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
    formulas?: Record<string, string>;
  }>;
}

// Error handling utility
class ClaudeError extends Error {
  status: number;
  stage: string;
  retryable: boolean;
  
  constructor(message: string, status = 500, stage = 'unknown', retryable = true) {
    super(message);
    this.name = 'ClaudeError';
    this.status = status;
    this.stage = stage;
    this.retryable = retryable;
  }
}

/**
 * Utility for retrying operations with exponential backoff
 */
async function withRetry<T>(
  operation: () => Promise<T>, 
  maxRetries = MAX_RETRIES,
  initialDelay = RETRY_DELAY,
  stage = 'unknown'
): Promise<T> {
  let lastError: Error | null = null;
  let delay = initialDelay;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      
      // If error is explicitly marked as not retryable, throw immediately
      if (error instanceof ClaudeError && !error.retryable) {
        throw error;
      }
      
      if (attempt >= maxRetries) {
        break;
      }
      
      console.warn(`Retry attempt ${attempt + 1}/${maxRetries} for stage "${stage}" after error:`, error.message);
      await new Promise(resolve => setTimeout(resolve, delay));
      
      // Exponential backoff with jitter
      delay = delay * 1.5 + Math.random() * 300;
    }
  }
  
  throw lastError || new ClaudeError(`Max retries (${maxRetries}) exceeded in stage ${stage}`, 500, stage);
}

/**
 * Process Excel file analysis using Claude API
 */
export async function processWithClaude({
  query,
  fileContents,
  messageId,
  sessionId,
  userId,
  isTextOnly = false
}: {
  query: string;
  fileContents: FileContent[];
  messageId: string;
  sessionId: string;
  userId: string;
  isTextOnly?: boolean;
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
    console.log(`Processing ${isTextOnly ? 'text-only query' : 'Excel file analysis'} with Claude 3.5 Sonnet API`);
    
    // Update message status to processing
    await updateMessageStatus(messageId, 'processing', '', {
      stage: 'preparing_claude_request',
      started_at: Date.now(),
      model: CLAUDE_MODEL,
      is_text_only: isTextOnly
    });
    
    let userPrompt: string;
    
    if (isTextOnly) {
      // Enhanced prompt for text-only queries
      userPrompt = `
USER QUERY (TEXT-ONLY): ${query}

INSTRUCTIONS:
1. This is a text-only query without any Excel files attached
2. Provide helpful information about Excel or data analysis related to the query
3. If the query requires file analysis, explain that files need to be uploaded
4. Suggest how the user could better utilize the Excel assistant with file uploads
5. Focus on providing educational content about Excel features, functions, or best practices

ADDITIONAL CONTEXT:
This query is part of chat session: ${sessionId}
`.trim();
    } else {
      // Prepare enhanced file context with formula information
      const fileContext = fileContents.map(content => {
        const sheetContexts = content.sheets.map(sheet => {
          // Basic sheet info
          let sheetContext = `    - ${sheet.name}: ${sheet.rowCount} rows × ${sheet.columnCount} columns`;
          
          // Add formula information if available
          if (sheet.formulas && Object.keys(sheet.formulas).length > 0) {
            const formulaCount = Object.keys(sheet.formulas).length;
            sheetContext += `\n      * Contains ${formulaCount} formula${formulaCount === 1 ? '' : 's'}`;
            
            // Add sample formulas (up to 3)
            const sampleFormulas = Object.entries(sheet.formulas).slice(0, 3);
            if (sampleFormulas.length > 0) {
              sheetContext += '\n      * Sample formulas:';
              sampleFormulas.forEach(([cell, formula]) => {
                sheetContext += `\n        - ${cell}: ${formula}`;
              });
            }
          }
          
          return sheetContext;
        }).join('\n');
        
        return `
- ${content.filename}
  Sheets:
${sheetContexts}`;
      }).join('\n');

      // Enhanced prompt for Excel file analysis
      userPrompt = `
USER QUERY: ${query}

AVAILABLE EXCEL FILES:
${fileContext}

INSTRUCTIONS:
1. Please analyze these Excel files and answer the query thoroughly
2. If formulas are present, explain what they do and provide insights about their logic
3. If appropriate, suggest ways to improve data organization or analysis
4. For large datasets, provide summary statistics to give an overview
5. If multiple files are present, check for relationships between them
6. Highlight important patterns, trends, or outliers in the data

ADDITIONAL CONTEXT:
This query is part of chat session: ${sessionId}
`.trim();
    }

    // Update message status
    await updateMessageStatus(messageId, 'processing', '', {
      stage: 'sending_to_claude',
      completion_percentage: 30,
      request_start: Date.now(),
      is_text_only: isTextOnly
    });

    // Make API call to Claude with retry logic
    const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');
    if (!ANTHROPIC_API_KEY) {
      throw new ClaudeError('ANTHROPIC_API_KEY environment variable not set', 500, 'configuration', false);
    }

    // Execute request with retry
    const response = await withRetry(
      async () => {
        const res = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': ANTHROPIC_API_KEY,
            'anthropic-version': '2023-06-01'
          },
          body: JSON.stringify({
            model: CLAUDE_MODEL,
            max_tokens: 4000,
            system: isTextOnly 
              ? ASSISTANT_INSTRUCTIONS + "\n\nNote: The user has not uploaded any Excel files, so focus on providing general guidance, educational content, or instructions on how they can utilize the Excel Assistant better with file uploads."
              : ASSISTANT_INSTRUCTIONS,
            messages: [
              { role: 'user', content: userPrompt }
            ],
            metadata: {
              user_id: userId,
              session_id: sessionId,
              message_id: messageId,
              is_text_only: isTextOnly ? "true" : "false"
            }
          })
        });
      
        if (!res.ok) {
          const errorText = await res.text();
          throw new ClaudeError(
            `Claude API error: ${res.status} ${res.statusText} - ${errorText}`,
            res.status,
            'claude_api_call',
            res.status !== 429 && res.status < 500
          );
        }
        
        return await res.json() as ClaudeResponse;
      },
      2,
      1000,
      'claude_api_call'
    );
    
    // Extract content from Claude response
    const responseContent = response.content[0]?.text || '';
    
    if (!responseContent.trim()) {
      throw new ClaudeError('Empty Claude response', 500, 'empty_response', false);
    }

    // Update message with response
    await updateMessageStatus(messageId, 'completed', responseContent, {
      stage: 'completed',
      completion_percentage: 100,
      claude_message_id: response.id,
      model_used: response.model,
      usage: response.usage,
      completed_at: Date.now(),
      is_text_only: isTextOnly
    });

    return {
      messageId: response.id,
      content: responseContent,
      modelUsed: response.model,
      usage: response.usage
    };
  } catch (error) {
    console.error('Error in processWithClaude:', error);
    
    // Update message to failed status
    await updateMessageStatus(messageId, 'failed', error.message || 'Claude processing failed', {
      error: error.message,
      stage: error instanceof ClaudeError ? error.stage : 'claude_processing_error',
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
