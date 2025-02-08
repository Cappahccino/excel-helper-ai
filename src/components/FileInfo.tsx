
import { FileSpreadsheet, Table } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ExcelPreview } from "./ExcelPreview";

interface FileInfoProps {
  filename: string;
  fileSize?: number;
  fileId?: string;
}

export function FileInfo({ filename, fileSize, fileId }: FileInfoProps) {
  const formatFileSize = (bytes?: number) => {
    if (!bytes) return '';
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div className="flex items-center gap-4 p-4 bg-zinc-900 rounded-lg text-white">
      <div className="flex items-center gap-3 flex-1">
        <FileSpreadsheet className="w-8 h-8 text-green-500" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{filename}</p>
          {fileSize && (
            <p className="text-xs text-zinc-400">
              spreadsheet - {formatFileSize(fileSize)}
            </p>
          )}
        </div>
      </div>
      {fileId && (
        <Dialog>
          <DialogTrigger asChild>
            <Button 
              variant="outline" 
              size="sm"
              className="bg-zinc-800 hover:bg-zinc-700 text-white border-zinc-700"
            >
              <Table className="w-4 h-4 mr-2" />
              View Data
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-4xl max-h-[70vh] overflow-hidden flex flex-col">
            <DialogHeader>
              <DialogTitle>Preview: {filename}</DialogTitle>
              <DialogDescription className="text-muted-foreground">
                Showing the first 10 rows of your Excel file
              </DialogDescription>
            </DialogHeader>
            <div className="flex-1 overflow-hidden">
              <ExcelPreview sessionFileId={fileId} />
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
