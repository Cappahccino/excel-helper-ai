import { createClient } from '@supabase/supabase-js';
import type { Database } from '../../src/integrations/supabase/types';

const supabase = createClient<Database>(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export const getFileMetadata = async (fileId: string) => {
  const { data, error } = await supabase
    .from('excel_files')
    .select('*')
    .eq('id', fileId)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error('File not found');
  return data;
};

export const downloadExcelFile = async (filePath: string) => {
  const { data, error } = await supabase
    .storage
    .from('excel_files')
    .download(filePath);

  if (error) throw error;
  if (!data) throw new Error('File buffer is empty');
  return data;
};

export const storeUserMessage = async (query: string, fileId: string, userId: string) => {
  const { error } = await supabase
    .from('chat_messages')
    .insert({
      content: query,
      excel_file_id: fileId,
      is_ai_response: false,
      user_id: userId
    });

  if (error) throw error;
};

export const storeAIResponse = async (
  response: any,
  fileId: string,
  userId: string
) => {
  const { error } = await supabase
    .from('chat_messages')
    .insert({
      content: response.choices[0].message.content,
      excel_file_id: fileId,
      is_ai_response: true,
      user_id: userId,
      openai_model: response.model,
      openai_usage: response.usage,
      raw_response: response,
      chat_id: response.id
    });

  if (error) throw error;
};

export const updateFileAccess = async (fileId: string) => {
  const { error } = await supabase
    .from('excel_files')
    .update({ last_accessed: new Date().toISOString() })
    .eq('id', fileId);

  if (error) throw error;
};