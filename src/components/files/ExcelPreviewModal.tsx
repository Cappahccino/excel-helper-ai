
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AgGridReact } from "ag-grid-react";
import { ColDef, GridOptions } from 'ag-grid-community';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useState, useEffect } from "react";
import "ag-grid-community/styles/ag-grid.css";
import "ag-grid-community/styles/ag-theme-alpine.css";

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
  
  // Reset and initialize state when files change
  useEffect(() => {
    if (files.length > 0) {
      const initialActiveFile = files[0]?.id || '';
      setActiveFile(initialActiveFile);
      
      const initialSheets: Record<string, string> = {};
      files.forEach(file => {
        if (file.sheets && file.sheets.length > 0) {
          initialSheets[file.id] = file.sheets[0]?.name || '';
        }
      });
      setActiveSheets(initialSheets);
    }
  }, [files]);

  const currentFile = files.find(f => f.id === activeFile);
  const currentSheet = currentFile?.sheets.find(s => s.name === activeSheets[activeFile]);

  // Transform row data for AG-Grid (from array to object with named properties)
  const getRowData = () => {
    if (!currentSheet) return [];
    
    return currentSheet.rows.map(row => {
      const rowData: Record<string, any> = {};
      currentSheet.headers.forEach((header, index) => {
        rowData[header] = row[index];
      });
      return rowData;
    });
  };

  const columnDefs: ColDef[] = currentSheet?.headers.map(header => ({
    field: header,
    headerName: header,
    flex: 1,
    minWidth: 100,
    sortable: true,
    filter: true,
  })) || [];

  const gridOptions: GridOptions = {
    defaultColDef: {
      resizable: true,
      sortable: true,
      filter: true,
    },
    domLayout: 'autoHeight' as 'autoHeight', // Use the correct type for domLayout
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-5xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Excel Preview</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col flex-grow overflow-hidden">
          {files.length > 0 ? (
            <Tabs value={activeFile} onValueChange={setActiveFile} className="w-full">
              <TabsList className="w-full max-w-full overflow-x-auto flex">
                {files.map(file => (
                  <TabsTrigger key={file.id} value={file.id} className="whitespace-nowrap">
                    {file.filename}
                  </TabsTrigger>
                ))}
              </TabsList>

              {files.map(file => (
                <TabsContent key={file.id} value={file.id} className="flex flex-col flex-grow">
                  {file.sheets && file.sheets.length > 0 ? (
                    <Tabs 
                      value={activeSheets[file.id] || ''}
                      onValueChange={(sheet) => setActiveSheets(prev => ({ ...prev, [file.id]: sheet }))}
                    >
                      <TabsList className="w-full max-w-full overflow-x-auto flex">
                        {file.sheets.map(sheet => (
                          <TabsTrigger key={sheet.name} value={sheet.name} className="whitespace-nowrap">
                            {sheet.name}
                          </TabsTrigger>
                        ))}
                      </TabsList>

                      {file.sheets.map(sheet => (
                        <TabsContent key={sheet.name} value={sheet.name} className="flex-grow">
                          <div className="ag-theme-alpine w-full h-[500px]">
                            {sheet.headers && sheet.headers.length > 0 ? (
                              <AgGridReact
                                columnDefs={columnDefs}
                                rowData={getRowData()}
                                gridOptions={gridOptions}
                              />
                            ) : (
                              <div className="flex items-center justify-center h-full text-gray-500">
                                No data available in this sheet
                              </div>
                            )}
                          </div>
                        </TabsContent>
                      ))}
                    </Tabs>
                  ) : (
                    <div className="flex items-center justify-center h-64 text-gray-500">
                      No sheets found in this file
                    </div>
                  )}
                </TabsContent>
              ))}
            </Tabs>
          ) : (
            <div className="flex items-center justify-center h-64 text-gray-500">
              No files selected for preview
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
