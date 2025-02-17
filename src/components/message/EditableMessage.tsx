
import React, { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/integrations/supabase/client';

interface EditableMessageProps {
  content: string;
  messageId: string;
  onCancel: () => void;
  onSave: (newContent: string) => void;
}

export function EditableMessage({ content, messageId, onCancel, onSave }: EditableMessageProps) {
  const [editedContent, setEditedContent] = useState(content);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { toast } = useToast();

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.setSelectionRange(content.length, content.length);
    }
  }, [content]);

  const handleSave = async () => {
    if (editedContent.trim() === '') {
      toast({
        title: "Error",
        description: "Message cannot be empty",
        variant: "destructive",
      });
      return;
    }

    if (editedContent === content) {
      onCancel();
      return;
    }

    try {
      const { error } = await supabase
        .from('chat_messages')
        .update({ content: editedContent })
        .eq('id', messageId);

      if (error) throw error;
      onSave(editedContent);
      
      toast({
        title: "Success",
        description: "Message updated successfully",
      });
    } catch (error) {
      console.error('Error updating message:', error);
      toast({
        title: "Error",
        description: "Failed to update message",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="space-y-2">
      <Textarea
        ref={textareaRef}
        value={editedContent}
        onChange={(e) => setEditedContent(e.target.value)}
        className="min-h-[100px] w-full"
        placeholder="Edit your message..."
      />
      <div className="flex justify-end space-x-2">
        <Button
          variant="outline"
          size="sm"
          onClick={onCancel}
        >
          Cancel
        </Button>
        <Button
          size="sm"
          onClick={handleSave}
        >
          Save
        </Button>
      </div>
    </div>
  );
}
