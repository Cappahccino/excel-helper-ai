import { useState } from "react";
import { useToast } from "@/components/ui/use-toast";
import { AIInputWithFile } from "@/components/ui/ai-input-with-file";

export function Chat() {
  const { toast } = useToast();

  const handleSubmit = (message: string, file?: File) => {
    if (!message.trim() && !file) return;

    if (file) {
      // Check if the file is an Excel file
      const isExcel = file.type === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" || 
                     file.type === "application/vnd.ms-excel" ||
                     file.name.endsWith('.xlsx') ||
                     file.name.endsWith('.xls') ||
                     file.name.endsWith('.xlsm') ||
                     file.name.endsWith('.xlsb') ||
                     file.name.endsWith('.xltx') ||
                     file.name.endsWith('.xltm') ||
                     file.name.endsWith('.xml') ||
                     file.name.endsWith('.xlam') ||
                     file.name.endsWith('.xla') ||
                     file.name.endsWith('.xlw') ||
                     file.name.endsWith('.xlr');

      if (!isExcel) {
        toast({
          title: "Invalid file type",
          description: "Please upload only Excel files",
          variant: "destructive",
        });
        return;
      }

      toast({
        title: "File uploaded",
        description: `Successfully uploaded ${file.name}`,
      });
    }

    // Handle message and file submission here
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
      <div className="border-t p-4">
        <AIInputWithFile 
          placeholder="Ask about your Excel file..."
          onSubmit={handleSubmit}
          accept=".xlsx,.xls,.xlsm,.xlsb,.xltx,.xltm,.xls,.xlt,.xml,.xlam,.xla,.xlw,.xlr"
          maxFileSize={10}
        />
      </div>
    </div>
  );
}
