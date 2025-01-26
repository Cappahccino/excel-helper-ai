import { useState } from "react";
import { Send, Paperclip } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";

export function Chat() {
  const [message, setMessage] = useState("");
  const { toast } = useToast();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (message.trim()) {
      // Handle message submission here
      setMessage("");
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Check if the file is an Excel file
    const isExcel = file.type === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" || 
                   file.type === "application/vnd.ms-excel" ||
                   file.name.endsWith('.xlsx') ||
                   file.name.endsWith('.xls');

    if (!isExcel) {
      toast({
        title: "Invalid file type",
        description: "Please upload only Excel files (.xlsx or .xls)",
        variant: "destructive",
      });
      e.target.value = ''; // Reset the input
      return;
    }

    // Handle the Excel file upload here
    toast({
      title: "File uploaded",
      description: `Successfully uploaded ${file.name}`,
    });
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
        <div className="flex gap-2 items-center">
          <input
            type="text"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Ask about your Excel file..."
            className="flex-1 min-w-0 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          />
          <div className="flex gap-2">
            <div className="relative">
              <input
                type="file"
                accept=".xlsx,.xls"
                onChange={handleFileUpload}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                title="Upload Excel file"
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="relative"
              >
                <Paperclip className="h-4 w-4" />
              </Button>
            </div>
            <Button type="submit" className="bg-excel hover:bg-excel/90">
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}