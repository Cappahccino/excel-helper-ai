import { useState } from "react";
import { Send, Paperclip } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { ExcelPreview } from "./ExcelPreview";

const ALLOWED_EXCEL_EXTENSIONS = [
  '.xlsx', // Excel Workbook
  '.xlsm', // Excel Macro-Enabled Workbook
  '.xlsb', // Excel Binary Workbook
  '.xltx', // Template
  '.xltm', // Template with macros
  '.xls',  // Excel 97-2003 Workbook
  '.xlt',  // Excel 97-2003 Template
  '.xml',  // XML Spreadsheet 2003
  '.xlam', // Excel Add-In
  '.xla',  // Excel 97-2003 Add-In
  '.xlw',  // Excel 4.0 Workbook
  '.xlr',  // Works spreadsheet
  '.csv'   // CSV file
];

export function Chat() {
  const [message, setMessage] = useState("");
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
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

    const fileExtension = '.' + file.name.split('.').pop()?.toLowerCase();
    
    if (!ALLOWED_EXCEL_EXTENSIONS.includes(fileExtension)) {
      toast({
        title: "Invalid file type",
        description: "Please upload only Excel compatible files",
        variant: "destructive",
      });
      e.target.value = ''; // Reset input
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
          <Button type="submit" className="bg-excel hover:bg-excel/90">
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </form>
    </div>
  );
}
