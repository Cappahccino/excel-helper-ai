import { useState } from "react";
import { Send, Paperclip } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { ExcelPreview } from "./ExcelPreview";
import { supabase } from "@/integrations/supabase/client";

const ALLOWED_EXCEL_EXTENSIONS = [
  '.xlsx', '.xlsm', '.xlsb', '.xltx', '.xltm', '.xls', '.xlt',
  '.xml', '.xlam', '.xla', '.xlw', '.xlr', '.csv'
];

export function Chat() {
  const [message, setMessage] = useState("");
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadedFile && !message.trim()) return;

    try {
      setIsAnalyzing(true);
      
      // Get the Excel content from the preview component
      const fileContent = await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target?.result);
        reader.readAsText(uploadedFile as File);
      });

      // Call the edge function to analyze the file
      const { data, error } = await supabase.functions.invoke('analyze-excel', {
        body: { fileContent, userPrompt: message },
      });

      if (error) throw error;

      toast({
        title: "Analysis Complete",
        description: data.analysis,
      });

      setMessage("");
    } catch (error) {
      console.error('Error:', error);
      toast({
        title: "Error",
        description: "Failed to analyze the file. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const fileExtension = '.' + file.name.split('.').pop()?.toLowerCase();
    
    if (!ALLOWED_EXCEL_EXTENSIONS.includes(fileExtension)) {
      toast({
        title: "Invalid file type",
        description: "Please upload only Excel compatible files",
        variant: "destructive",
      });
      e.target.value = '';
      return;
    }

    setUploadedFile(file);
    toast({
      title: "File uploaded",
      description: `Successfully uploaded ${file.name}`,
    });
  };

  return (
    <div className="w-full max-w-4xl mx-auto bg-white rounded-lg shadow-sm border">
      <div className="h-[600px] p-4 overflow-y-auto">
        <div className="flex flex-col gap-4">
          <div className="bg-muted p-3 rounded-lg max-w-[80%]">
            <p className="text-sm">Hello! Upload an Excel file and I'll help you analyze it.</p>
          </div>
          {uploadedFile && (
            <div className="w-full">
              <ExcelPreview file={uploadedFile} />
            </div>
          )}
          {isAnalyzing && (
            <div className="flex items-center justify-center p-4">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-excel"></div>
              <span className="ml-2 text-sm text-gray-600">Analyzing...</span>
            </div>
          )}
        </div>
      </div>
      <form onSubmit={handleSubmit} className="border-t p-4">
        <div className="flex gap-2 items-center">
          <div className="relative">
            <input
              type="file"
              accept={ALLOWED_EXCEL_EXTENSIONS.join(',')}
              onChange={handleFileUpload}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              aria-label="Upload Excel file"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-9 w-9"
            >
              <Paperclip className="h-4 w-4" />
            </Button>
          </div>
          <input
            type="text"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Ask about your Excel file..."
            className="flex-1 min-w-0 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          />
          <Button 
            type="submit" 
            className="bg-excel hover:bg-excel/90"
            disabled={isAnalyzing || (!uploadedFile && !message.trim())}
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </form>
    </div>
  );
}