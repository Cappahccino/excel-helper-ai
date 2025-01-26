import { useState } from "react";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";

export function Chat() {
  const [message, setMessage] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (message.trim()) {
      // Handle message submission here
      setMessage("");
    }
  };

  return (
    <div className="w-full max-w-2xl mx-auto bg-white rounded-lg shadow-sm border">
      <div className="h-[400px] p-4 overflow-y-auto">
        {/* Chat messages will go here */}
        <div className="flex flex-col gap-4">
          <div className="bg-muted p-3 rounded-lg max-w-[80%]">
            <p className="text-sm">Hello! Upload an Excel file and I'll help you analyze it.</p>
          </div>
        </div>
      </div>
      <form onSubmit={handleSubmit} className="border-t p-4">
        <div className="flex gap-2">
          <input
            type="text"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Ask about your Excel file..."
            className="flex-1 min-w-0 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          />
          <Button type="submit" className="bg-excel hover:bg-excel/90">
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </form>
    </div>
  );
}