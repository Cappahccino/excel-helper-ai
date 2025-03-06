
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AgGridReact } from "ag-grid-react";
import { ColDef } from 'ag-grid-community';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useState } from "react";
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
  const [activeFile, setActiveFile] = useState<string>(files[0]?.id || '');
  const [activeSheets, setActiveSheets] = useState<Record<string, string>>({});

  // Initialize active sheets for each file
  useState(() => {
    const initialSheets: Record<string, string> = {};
    files.forEach(file => {
      initialSheets[file.id] = file.sheets[0]?.name || '';
    });
    setActiveSheets(initialSheets);
  });

  const currentFile = files.find(f => f.id === activeFile);
  const currentSheet = currentFile?.sheets.find(s => s.name === activeSheets[activeFile]);

  const gridOptions = {
    defaultColDef: {
      resizable: true,
      sortable: true,
      filter: true,
    },
  };

  const columnDefs: ColDef[] = currentSheet?.headers.map(header => ({
    field: header,
    headerName: header,
  })) || [];

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-5xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Excel Preview</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col flex-grow overflow-hidden">
          <Tabs value={activeFile} onValueChange={setActiveFile} className="w-full">
            <TabsList>
              {files.map(file => (
                <TabsTrigger key={file.id} value={file.id}>
                  {file.filename}
                </TabsTrigger>
              ))}
            </TabsList>

            {files.map(file => (
              <TabsContent key={file.id} value={file.id} className="flex flex-col flex-grow">
                <Tabs 
                  value={activeSheets[file.id]} 
                  onValueChange={(sheet) => setActiveSheets(prev => ({ ...prev, [file.id]: sheet }))}
                >
                  <TabsList>
                    {file.sheets.map(sheet => (
                      <TabsTrigger key={sheet.name} value={sheet.name}>
                        {sheet.name}
                      </TabsTrigger>
                    ))}
                  </TabsList>

                  {file.sheets.map(sheet => (
                    <TabsContent key={sheet.name} value={sheet.name} className="flex-grow">
                      <div className="ag-theme-alpine w-full h-[500px]">
                        <AgGridReact
                          columnDefs={columnDefs}
                          rowData={sheet.rows.slice(0, 15)}
                          gridOptions={gridOptions}
                        />
                      </div>
                    </TabsContent>
                  ))}
                </Tabs>
              </TabsContent>
            ))}
          </Tabs>
        </div>
      </DialogContent>
    </Dialog>
  );
}
