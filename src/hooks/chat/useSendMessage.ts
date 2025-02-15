
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Message } from "@/types/chat";
import { useSession } from "./useSession";

interface SendMessageParams {
  content: string;
  fileId?: string | null;
}

export function useSendMessage(sessionId: string | null) {
  const queryClient = useQueryClient();
  const { data: session } = useSession(sessionId);

  return useMutation({
    mutationFn: async ({ content, fileId }: SendMessageParams) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not authenticated');

      let currentSessionId = sessionId;

      // Create new session if needed
      if (!currentSessionId) {
        const { data: newSession, error: sessionError } = await supabase
          .from('chat_sessions')
          .insert({
            user_id: user.id,
            status: 'active',
            thread_id: null,
            chat_name: 'New Chat'
          })
          .select()
          .single();

        if (sessionError) throw sessionError;
        currentSessionId = newSession.session_id;
      }

      // Store the message
      const { data: storedMessage, error: messageError } = await supabase
        .from('chat_messages')
        .insert({
          content,
          role: 'user' as const,
          session_id: currentSessionId,
          excel_file_id: fileId,
          is_ai_response: false,
          user_id: user.id
        })
        .select('*, excel_files(filename, file_size)')
        .single();

      if (messageError) throw messageError;

      // Call OpenAI via Edge Function
      const { error: aiError } = await supabase.functions.invoke('excel-assistant', {
        body: {
          fileId,
          query: content,
          userId: user.id,
          sessionId: currentSessionId,
          threadId: session?.thread_id
        }
      });

      if (aiError) throw aiError;

      return { storedMessage, newSessionId: currentSessionId };
    },
    onMutate: async ({ content, fileId }) => {
      const optimisticMessage: Message = {
        id: crypto.randomUUID(),
        content,
        role: 'user',
        session_id: sessionId,
        created_at: new Date().toISOString(),
        excel_file_id: fileId || null,
        temp: true
      };

      await queryClient.cancelQueries({ queryKey: ['chat-messages', sessionId] });

      const previousMessages = queryClient.getQueryData(['chat-messages', sessionId]) as Message[] || [];

      queryClient.setQueryData(['chat-messages', sessionId], (old: Message[] = []) => {
        return [...old, optimisticMessage];
      });

      return { previousMessages, optimisticMessage };
    },
    onSuccess: ({ storedMessage, newSessionId }, _, context) => {
      queryClient.setQueryData(['chat-messages', newSessionId], (old: Message[] = []) => {
        return old.map(msg => 
          msg.temp && msg.content === context?.optimisticMessage.content
            ? { ...storedMessage, role: storedMessage.role as 'user' | 'assistant', temp: false }
            : msg
        );
      });

      queryClient.invalidateQueries({ queryKey: ['chat-messages', newSessionId] });
      queryClient.invalidateQueries({ queryKey: ['chat-session', newSessionId] });
    },
    onError: (_, __, context) => {
      if (context?.previousMessages) {
        queryClient.setQueryData(['chat-messages', sessionId], context.previousMessages);
      }
    }
  });
}
