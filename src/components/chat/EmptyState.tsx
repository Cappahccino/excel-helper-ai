
import { MessageCircle } from "lucide-react";

export function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <div className="flex h-20 w-20 items-center justify-center rounded-full bg-muted mb-4">
        <MessageCircle className="h-10 w-10 text-muted-foreground" />
      </div>
      <h3 className="mb-2 text-xl font-semibold">No messages yet</h3>
      <p className="mb-8 text-sm text-muted-foreground max-w-sm">
        Start a conversation by typing a message or uploading an Excel file for analysis.
      </p>
    </div>
  );
}
