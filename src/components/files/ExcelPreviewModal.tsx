
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AgGridReact } from "ag-grid-react";
import { ColDef } from 'ag-grid-community';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useState, useEffect } from "react";
import "ag-grid-community/styles/ag-grid.css";
import "ag-grid-community/styles/ag-theme-alpine.css";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertCircle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface SheetData {
  name: string;
  headers: string[];
  rows: any[][];
}

interface FilePreview {
  id: string;
  filename: string;
  sheets: SheetData[];
}

interface ExcelPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  files: FilePreview[];
}

export function ExcelPreviewModal({ isOpen, onClose, files }: ExcelPreviewModalProps) {
  const [activeFile, setActiveFile] = useState<string>('');
  const [activeSheets, setActiveSheets] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Initialize active file and sheets whenever files change
  useEffect(() => {
    if (files.length > 0) {
      const initialFile = files[0]?.id || '';
      setActiveFile(initialFile);
      
      const initialSheets: Record<string, string> = {};
      files.forEach(file => {
        if (file.sheets && file.sheets.length > 0) {
          initialSheets[file.id] = file.sheets[0]?.name || '';
        }
      });
      setActiveSheets(initialSheets);
      setError(null);
    } else {
      setError("No valid file data available for preview");
    }
  }, [files]);

  const currentFile = files.find(f => f.id === activeFile);
  const currentSheet = currentFile?.sheets?.find(s => s.name === activeSheets[activeFile]);

  const handleFileChange = (fileId: string) => {
    setActiveFile(fileId);
    setError(null);
  };

  const handleSheetChange = (sheetName: string) => {
    setActiveSheets(prev => ({ ...prev, [activeFile]: sheetName }));
  };

  // Prepare column definitions for AG-Grid
  const columnDefs: ColDef[] = currentSheet?.headers?.map(header => ({
    field: header,
    headerName: header,
    resizable: true,
    sortable: true,
    filter: true,
  })) || [];

  // Prepare row data for AG-Grid
  const rowData = currentSheet?.rows?.map(row => {
    const rowObj: Record<string, any> = {};
    currentSheet.headers.forEach((header, index) => {
      rowObj[header] = row[index];
    });
    return rowObj;
  }) || [];

  if (!isOpen) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-5xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Excel Preview</DialogTitle>
        </DialogHeader>

        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="flex flex-col flex-grow overflow-hidden">
          <Tabs value={activeFile} onValueChange={handleFileChange} className="w-full">
            <TabsList className="mb-2">
              {files.map(file => (
                <TabsTrigger key={file.id} value={file.id}>
                  {file.filename}
                </TabsTrigger>
              ))}
            </TabsList>

            {files.map(file => (
              <TabsContent key={file.id} value={file.id} className="flex flex-col flex-grow">
                {file.sheets && file.sheets.length > 0 ? (
                  <Tabs 
                    value={activeSheets[file.id] || ''} 
                    onValueChange={handleSheetChange}
                    className="flex flex-col flex-grow"
                  >
                    <TabsList className="mb-2">
                      {file.sheets.map(sheet => (
                        <TabsTrigger key={sheet.name} value={sheet.name}>
                          {sheet.name}
                        </TabsTrigger>
                      ))}
                    </TabsList>

                    {file.sheets.map(sheet => (
                      <TabsContent key={sheet.name} value={sheet.name} className="flex-grow">
                        <div className="ag-theme-alpine w-full h-[500px]">
                          {isLoading ? (
                            <div className="p-4 space-y-2">
                              <Skeleton className="h-8 w-full" />
                              <Skeleton className="h-8 w-full" />
                              <Skeleton className="h-8 w-full" />
                            </div>
                          ) : sheet.headers.length > 0 ? (
                            <AgGridReact
                              columnDefs={columnDefs}
                              rowData={rowData}
                              defaultColDef={{
                                resizable: true,
                                sortable: true,
                                filter: true,
                              }}
                            />
                          ) : (
                            <div className="flex items-center justify-center h-full">
                              <p className="text-muted-foreground">No data available in this sheet</p>
                            </div>
                          )}
                        </div>
                      </TabsContent>
                    ))}
                  </Tabs>
                ) : (
                  <div className="flex items-center justify-center h-40">
                    <p className="text-muted-foreground">No sheets found in this file</p>
                  </div>
                )}
              </TabsContent>
            ))}
          </Tabs>
        </div>
      </DialogContent>
    </Dialog>
  );
}
