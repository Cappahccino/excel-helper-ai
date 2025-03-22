import React, { useState, useRef, useEffect } from 'react';
import { useChatMessages } from '@/hooks/useChatMessages';
import { useChatRealtime } from '@/hooks/useChatRealtime'; 
import { Message, MessageStatus, ProcessingStage } from '@/types/chat';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { 
  Card, 
  CardContent, 
  CardFooter, 
  CardHeader, 
  CardTitle 
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Spinner } from '@/components/ui/spinner';
import { 
  ChevronDown, 
  Filter, 
  Pin, 
  RefreshCw, 
  Search, 
  Settings, 
  Trash, 
  Wifi, 
  WifiOff
} from 'lucide-react';

interface ChatContainerProps {
  sessionId: string | null;
}

export function ChatContainer({ sessionId }: ChatContainerProps) {
  const [messageInput, setMessageInput] = useState('');
  const [selectedFileIds, setSelectedFileIds] = useState<string[]>([]);
  const [isSearchActive, setIsSearchActive] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  // Use our enhanced hooks
  const { 
    messages, 
    filteredMessages,
    isLoading, 
    isError, 
    error,
    sendMessage, 
    refetch: refetchMessages,
    deleteMessage,
    filterMessages,
    currentFilter,
    pinMessage,
    unpinMessage,
    pinnedMessages,
    saveMessageDraft,
    getDraftMessage,
    getMessageStatistics
  } = useChatMessages(sessionId);

  const { 
    status, 
    content, 
    latestMessageId, 
    processingStage,
    isConnected,
    isConnecting,
    reconnect,
    connectionError
  } = useChatRealtime({ 
    sessionId, 
    refetch: refetchMessages,
    onAssistantMessage: (message) => {
      toast({
        title: "Analysis Complete",
        description: "Excel analysis has been completed."
      });
      scrollToBottom();
    },
    onStatusChange: (status, messageId) => {
      if (status === 'failed') {
        toast({
          title: "Analysis Failed",
          description: "There was an error processing your request.",
          variant: "destructive"
        });
      }
    },
    onConnectionChange: (connected) => {
      if (connected) {
        toast({
          title: "Connected",
          description: "Real-time updates are now active."
        });
      } else {
        toast({
          title: "Disconnected",
          description: "Real-time updates are not available. Trying to reconnect...",
          variant: "default"
        });
      }
    },
    onError: (errorMessage) => {
      toast({
        title: "Connection Error",
        description: errorMessage,
        variant: "destructive"
      });
    }
  });

  // Load draft message on mount
  useEffect(() => {
    const draft = getDraftMessage();
    if (draft) {
      setMessageInput(draft);
    }
  }, [sessionId, getDraftMessage]);

  // Save draft as user types
  useEffect(() => {
    saveMessageDraft(messageInput);
  }, [messageInput, saveMessageDraft]);

  // Auto-scroll to bottom when new messages arrive
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // Handle message sending
  const handleSendMessage = async () => {
    if (!messageInput.trim() || !sessionId) return;
    
    try {
      await sendMessage.mutateAsync({
        content: messageInput,
        fileIds: selectedFileIds.length > 0 ? selectedFileIds : null,
        sessionId
      });
      
      setMessageInput('');
      scrollToBottom();
    } catch (error) {
      console.error('Error sending message:', error);
    }
  };

  // Apply search filter
  const displayedMessages = searchTerm 
    ? messages.filter(msg => 
        msg.content.toLowerCase().includes(searchTerm.toLowerCase()))
    : filteredMessages;

  // Get statistics
  const stats = getMessageStatistics();

  // Helper for rendering message status badges
  const getStatusBadge = (status: MessageStatus) => {
    switch (status) {
      case 'processing':
        return <Badge variant="secondary">Processing...</Badge>;
      case 'completed':
        return <Badge variant="success">Completed</Badge>;
      case 'failed':
        return <Badge variant="destructive">Failed</Badge>;
      case 'cancelled':
        return <Badge variant="outline">Cancelled</Badge>;
      case 'expired':
        return <Badge variant="outline">Expired</Badge>;
      default:
        return null;
    }
  };

  // Helper for rendering progress
  const renderProgress = (stage?: ProcessingStage) => {
    if (!stage) return null;
    
    const completion = stage.completion_percentage || 0;
    
    return (
      <div className="w-full mt-2">
        <div className="text-xs text-gray-500 mb-1">
          {stage.stage} ({Math.round(completion)}%)
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div 
            className="bg-blue-600 h-2 rounded-full" 
            style={{ width: `${completion}%` }} 
          />
        </div>
      </div>
    );
  };

  // Connection status indicator
  const connectionStatus = () => {
    if (isConnected) {
      return <Badge variant="outline" className="bg-green-50"><Wifi className="h-3 w-3 mr-1" /> Connected</Badge>;
    } else if (isConnecting) {
      return <Badge variant="outline" className="bg-yellow-50"><Spinner className="h-3 w-3 mr-1" /> Connecting...</Badge>;
    } else {
      return (
        <Badge 
          variant="outline" 
          className="bg-red-50 cursor-pointer" 
          onClick={reconnect}
        >
          <WifiOff className="h-3 w-3 mr-1" /> Disconnected (Click to retry)
        </Badge>
      );
    }
  };

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="border-b px-4 py-3">
        <div className="flex justify-between items-center">
          <CardTitle className="text-lg">Excel Assistant</CardTitle>
          <div className="flex items-center space-x-2">
            {connectionStatus()}
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => setIsSearchActive(!isSearchActive)}
            >
              <Search className="h-4 w-4" />
            </Button>
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => refetchMessages()}
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => {
                // Show filter dialog (not implemented in this example)
                toast({
                  title: "Filter",
                  description: "Filter dialog would open here"
                });
              }}
            >
              <Filter className="h-4 w-4" />
            </Button>
          </div>
        </div>
        {isSearchActive && (
          <div className="mt-2">
            <Input
              placeholder="Search messages..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full"
            />
          </div>
        )}
        {stats && (
          <div className="flex gap-2 mt-2 text-xs text-gray-500">
            <span>{stats.totalCount} messages</span>
            <span>•</span>
            <span>{stats.userCount} queries</span>
            <span>•</span>
            <span>{stats.assistantCount} responses</span>
            {stats.processingCount > 0 && (
              <>
                <span>•</span>
                <span>{stats.processingCount} processing</span>
              </>
            )}
            {stats.averageProcessingTime && (
              <>
                <span>•</span>
                <span>Avg. time: {(stats.averageProcessingTime / 1000).toFixed(1)}s</span>
              </>
            )}
          </div>
        )}
      </CardHeader>
      
      <CardContent className="flex-grow overflow-y-auto p-4 space-y-4">
        {pinnedMessages.length > 0 && (
          <div className="mb-4 bg-blue-50 p-3 rounded-md">
            <div className="text-sm font-medium mb-2 flex justify-between">
              <span>Pinned Messages ({pinnedMessages.length})</span>
              <Button variant="ghost" size="xs">
                <ChevronDown className="h-3 w-3" />
              </Button>
            </div>
            <div className="space-y-2">
              {pinnedMessages.map(message => (
                <div 
                  key={`pinned-${message.id}`}
                  className="bg-white p-2 rounded text-sm flex justify-between items-start"
                >
                  <div className="truncate">{message.content.substring(0, 100)}{message.content.length > 100 ? '...' : ''}</div>
                  <Button 
                    variant="ghost" 
                    size="xs"
                    onClick={() => unpinMessage(message.id)}
                  >
                    <Pin className="h-3 w-3 fill-blue-500" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}
        
        {isLoading ? (
          <div className="flex justify-center items-center h-32">
            <Spinner />
          </div>
        ) : isError ? (
          <div className="bg-red-50 p-4 rounded-md text-red-800">
            <div className="font-medium">Error loading messages</div>
            <div className="text-sm mt-1">{error?.message || 'Unknown error'}</div>
            <Button 
              variant="outline" 
              size="sm" 
              className="mt-2"
              onClick={() => refetchMessages()}
            >
              Try Again
            </Button>
          </div>
        ) : displayedMessages.length === 0 ? (
          <div className="text-center text-gray-500 py-8">
            No messages yet. Start by asking a question about your Excel files.
          </div>
        ) : (
          displayedMessages.map((message) => (
            <div 
              key={message.id} 
              className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div 
                className={`max-w-3/4 p-3 rounded-lg ${
                  message.role === 'user' 
                    ? 'bg-blue-100 text-blue-900' 
                    : 'bg-gray-100 text-gray-900'
                }`}
              >
                <div className="flex justify-between items-start gap-2 mb-1">
                  <div className="text-xs text-gray-500">
                    {formatTimestamp(message.created_at)}
                  </div>
                  {getStatusBadge(message.status)}
                </div>
                <div className="whitespace-pre-wrap">{message.content}</div>
                {message.status === 'processing' && renderProgress(message.metadata?.processing_stage)}
                <div className="flex mt-2 gap-2 justify-end">
                  <Button 
                    variant="ghost" 
                    size="xs" 
                    onClick={() => pinMessage(message.id)}
                    disabled={pinnedMessages.some(m => m.id === message.id)}
                  >
                    <Pin className={`h-3 w-3 ${
                      pinnedMessages.some(m => m.id === message.id) ? 'fill-blue-500' : ''
                    }`} />
                  </Button>
                  <Button 
                    variant="ghost" 
                    size="xs"
                    onClick={() => deleteMessage(message.id)}
                  >
                    <Trash className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </CardContent>
      
      <CardFooter className="p-4 border-t">
        <div className="flex w-full gap-2">
          <Button 
            variant="outline" 
            size="icon"
            onClick={() => {
              // Open file selection dialog (not implemented in this example)
              toast({
                title: "File Selection",
                description: "File selection dialog would open here"
              });
            }}
          >
            <Settings className="h-4 w-4" />
          </Button>
          <Input
            placeholder="Ask a question about your Excel files..."
            value={messageInput}
            onChange={(e) => setMessageInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSendMessage();
              }
            }}
            disabled={!isConnected}
            className="flex-grow"
          />
          <Button 
            onClick={handleSendMessage}
            disabled={!messageInput.trim() || !isConnected}
          >
            Send
          </Button>
        </div>
      </CardFooter>
    </Card>
  );
}