
import { Tag } from "@/types/tags";
import { Badge } from "@/components/ui/badge";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

interface TagBadgeProps {
  tag: Tag;
  onRemove?: () => void;
  className?: string;
}

export function TagBadge({ tag, onRemove, className }: TagBadgeProps) {
  const baseStyles = tag.is_system 
    ? "bg-blue-100 text-blue-800 hover:bg-blue-200" 
    : "bg-gray-100 text-gray-800 hover:bg-gray-200";

  return (
    <Badge
      variant="secondary"
      className={cn(
        "gap-1 pl-2 pr-1 py-1 h-6",
        baseStyles,
        className
      )}
    >
      {tag.name}
      {onRemove && (
        <button
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onRemove();
          }}
          className="p-0.5 hover:bg-gray-200 rounded-full"
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </Badge>
  );
}
