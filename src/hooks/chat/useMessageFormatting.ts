
import { format, isToday, isYesterday } from "date-fns";
import { Message } from "@/types/chat";

export function useMessageFormatting() {
  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    if (isToday(date)) {
      return `Today at ${format(date, 'HH:mm')}`;
    } else if (isYesterday(date)) {
      return `Yesterday at ${format(date, 'HH:mm')}`;
    }
    return format(date, 'MMM d, yyyy HH:mm');
  };

  const groupMessagesByDate = (messages: Message[]) => {
    const groups: { [key: string]: Message[] } = {};
    
    messages.forEach(msg => {
      const date = new Date(msg.created_at);
      let key = format(date, 'yyyy-MM-dd');
      
      if (isToday(date)) {
        key = 'Today';
      } else if (isYesterday(date)) {
        key = 'Yesterday';
      }
      
      if (!groups[key]) {
        groups[key] = [];
      }
      groups[key].push(msg);
    });
    
    return groups;
  };

  return {
    formatTimestamp,
    groupMessagesByDate
  };
}
