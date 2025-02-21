
import { Tag } from "@/types/tags";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface TagFeedbackProps {
  tags: Tag[];
  status: 'success' | 'error' | 'loading';
  error?: string;
  className?: string;
}

export function TagFeedback({ tags, status, error, className }: TagFeedbackProps) {
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className="flex flex-wrap gap-2">
        {tags.map((tag) => (
          <Badge 
            key={tag.id}
            variant={status === 'error' ? "destructive" : "default"}
            className="flex items-center gap-1"
          >
            {status === 'success' && <CheckCircle className="w-3 h-3" />}
            {status === 'error' && <AlertCircle className="w-3 h-3" />}
            {tag.name}
          </Badge>
        ))}
      </div>
      {error && (
        <p className="text-sm text-red-500">{error}</p>
      )}
    </div>
  );
}
