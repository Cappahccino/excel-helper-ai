// Add these states to your Chat component
const [isTransitioning, setIsTransitioning] = useState(false);
const [pendingMessage, setPendingMessage] = useState<{
  content: string;
  fileIds?: string[] | null;
  tagNames?: string[] | null;
} | null>(null);

// Update your handleSendMessage function
const handleSendMessage = async (message: string, fileIds?: string[] | null, tagNames?: string[] | null) => {
  if (!message.trim() && !fileIds?.length) return;

  try {
    setIsCreatingSession(true);
    setPendingMessage({ content: message, fileIds, tagNames });
    
    let currentSessionId = selectedSessionId;
    let shouldNavigate = false;
    let queryParams = new URLSearchParams(location.search);
    
    // Create new session if needed
    if (!currentSessionId) {
      console.log('Creating new session...');
      setIsTransitioning(true);
      const newSession = await createSession.mutateAsync();
      currentSessionId = newSession.session_id;
      shouldNavigate = true;
      
      queryParams = new URLSearchParams();
      queryParams.set('sessionId', currentSessionId);
      if (fileIds?.length) {
        queryParams.set('fileId', fileIds[0]);
      }
      
      // If session was named, update it
      if (sessionName.trim()) {
        try {
          await supabase
            .from('chat_sessions')
            .update({ 
              chat_name: sessionName.trim(),
              thread_metadata: { title: sessionName.trim(), summary: null }
            })
            .eq('session_id', currentSessionId);
        } catch (error) {
          console.error('Failed to update session name:', error);
        }
      }
    }

    // Send the message
    console.log('Sending message to session:', currentSessionId);
    await sendMessageMutation.mutateAsync({
      content: message,
      fileIds: fileIds || [],
      tagNames: tagNames || [],
      sessionId: currentSessionId
    });

    if (shouldNavigate) {
      console.log('Navigating to new session...');
      navigate(`/chat?${queryParams.toString()}`);
    }

    resetUpload();
  } catch (error) {
    console.error('Send message error:', error);
    toast({
      title: "Error",
      description: error instanceof Error ? error.message : "Failed to send message",
      variant: "destructive"
    });
    await queryClient.invalidateQueries({ queryKey: ['chat-messages', selectedSessionId] });
  } finally {
    setIsCreatingSession(false);
    setIsTransitioning(false);
    setPendingMessage(null);
  }
};

// Add this component in your render function between the empty state and messages view
{!showMessages && pendingMessage && (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    exit={{ opacity: 0, y: -20 }}
    className="flex-grow flex flex-col p-4"
  >
    <OptimisticMessage
      message={pendingMessage.content}
      fileInfo={currentFile}
    />
    <div className="flex items-center justify-center mt-4">
      <Loader2 className="h-6 w-6 animate-spin text-excel" />
      <span className="ml-2 text-sm text-gray-600">Creating new chat...</span>
    </div>
  </motion.div>
)}

// Update your loading spinner in the messages view
{isLoading && messages.length === 0 ? (
  <div className="flex-grow flex flex-col items-center justify-center">
    <Loader2 className="h-8 w-8 animate-spin text-excel" />
    <span className="mt-2 text-sm text-gray-600">
      {isTransitioning ? 'Setting up your chat...' : 'Loading messages...'}
    </span>
  </div>
) : (
  // Your existing messages view
)}
