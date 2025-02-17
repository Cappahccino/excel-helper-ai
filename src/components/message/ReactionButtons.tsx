
import { useState } from "react";
import { ThumbsDown, ThumbsUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";

interface ReactionButtonsProps {
  messageId: string;
  initialCounts?: {
    positive: number;
    negative: number;
  };
  userReaction?: boolean | null;
}

export function ReactionButtons({ 
  messageId, 
  initialCounts = { positive: 0, negative: 0 },
  userReaction = null 
}: ReactionButtonsProps) {
  const [counts, setCounts] = useState(initialCounts);
  const [currentReaction, setCurrentReaction] = useState<boolean | null>(userReaction);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const handleReaction = async (isPositive: boolean) => {
    try {
      setIsLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast({
          title: "Authentication required",
          description: "Please sign in to react to messages",
          variant: "destructive"
        });
        return;
      }

      // If clicking the same reaction, remove it
      if (currentReaction === isPositive) {
        const { error } = await supabase
          .from('message_reactions')
          .delete()
          .eq('message_id', messageId)
          .eq('user_id', user.id);

        if (error) throw error;

        setCounts(prev => ({
          ...prev,
          [isPositive ? 'positive' : 'negative']: Math.max(0, prev[isPositive ? 'positive' : 'negative'] - 1)
        }));
        setCurrentReaction(null);
      } else {
        try {
          // Try to delete any existing reaction first
          if (currentReaction !== null) {
            await supabase
              .from('message_reactions')
              .delete()
              .eq('message_id', messageId)
              .eq('user_id', user.id);

            setCounts(prev => ({
              ...prev,
              [currentReaction ? 'positive' : 'negative']: Math.max(0, prev[currentReaction ? 'positive' : 'negative'] - 1)
            }));
          }

          // Add new reaction
          const { error } = await supabase
            .from('message_reactions')
            .insert({
              message_id: messageId,
              user_id: user.id,
              is_positive: isPositive
            });

          if (error) {
            if (error.code === '23505') { // Unique constraint violation
              toast({
                title: "Already reacted",
                description: "You've already reacted to this message",
                variant: "default"
              });
              return;
            }
            throw error;
          }

          setCounts(prev => ({
            ...prev,
            [isPositive ? 'positive' : 'negative']: prev[isPositive ? 'positive' : 'negative'] + 1
          }));
          setCurrentReaction(isPositive);
        } catch (error) {
          console.error('Error adding reaction:', error);
          toast({
            title: "Error",
            description: "Failed to add reaction",
            variant: "destructive"
          });
        }
      }

      // Invalidate the messages cache to refresh reaction counts
      await queryClient.invalidateQueries({ queryKey: ['chat-messages'] });
    } catch (error) {
      console.error('Error handling reaction:', error);
      toast({
        title: "Error",
        description: "Failed to update reaction",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
      <Button
        variant="ghost"
        size="sm"
        className={cn(
          "h-8 px-2 hover:bg-green-50",
          currentReaction === true && "text-green-600 bg-green-50"
        )}
        onClick={() => handleReaction(true)}
        disabled={isLoading}
      >
        <ThumbsUp className="h-4 w-4 mr-1" />
        <span className="text-xs">{counts.positive}</span>
      </Button>

      <Button
        variant="ghost"
        size="sm"
        className={cn(
          "h-8 px-2 hover:bg-red-50",
          currentReaction === false && "text-red-600 bg-red-50"
        )}
        onClick={() => handleReaction(false)}
        disabled={isLoading}
      >
        <ThumbsDown className="h-4 w-4 mr-1" />
        <span className="text-xs">{counts.negative}</span>
      </Button>
    </div>
  );
}
