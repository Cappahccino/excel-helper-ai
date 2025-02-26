
import { supabase } from "@/integrations/supabase/client";

export async function triggerAIResponse(params: {
  fileIds: string[];
  query: string;
  userId: string;
  sessionId: string;
  messageId: string;
}) {
  console.log('Triggering AI response for message:', params.messageId);
  const aiResponse = await supabase.functions.invoke('excel-assistant', {
    body: {
      fileIds: params.fileIds,
      query: params.query,
      userId: params.userId,
      sessionId: params.sessionId,
      threadId: null,
      messageId: params.messageId
    }
  });

  if (aiResponse.error) {
    console.error('Error triggering AI response:', aiResponse.error);
    throw aiResponse.error;
  }

  return aiResponse;
}
