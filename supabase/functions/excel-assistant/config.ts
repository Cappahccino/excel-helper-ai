
export const ASSISTANT_INSTRUCTIONS = `You are an Excel data analyst assistant. Help users analyze Excel data and answer questions about spreadsheets. 
When data is provided, focus on giving clear insights and explanations. If data seems incomplete or unclear, mention this in your response. 
Focus only on the current question, do not reference previous conversations. When no specific Excel file is provided, provide general Excel advice and guidance.`;

export const STATUS_POLL_INTERVAL = 500;
export const CONTENT_POLL_INTERVAL = 1000;
export const MAX_DURATION = 60000;

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
