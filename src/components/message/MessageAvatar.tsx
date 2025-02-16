
import { Avatar, AvatarFallback } from "../ui/avatar";

interface MessageAvatarProps {
  role: "user" | "assistant";
}

export function MessageAvatar({ role }: MessageAvatarProps) {
  const getInitials = () => {
    return role === "assistant" ? "AI" : "U";
  };

  return (
    <Avatar className="h-8 w-8 shrink-0 shadow-sm">
      <AvatarFallback
        className={
          role === "assistant" ? "bg-excel text-white" : "bg-gray-600 text-white"
        }
      >
        {getInitials()}
      </AvatarFallback>
    </Avatar>
  );
}
