import { useState, useCallback, useMemo } from "react";
import { Handle, Position } from "@xyflow/react";
import { SearchIcon, FileInput, Upload, X } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { useFileUpload } from "@/hooks/useFileUpload";
import { NodeProps, InputNodeType } from "@/types/workflow";
import { supabase } from "@/integrations/supabase/client";
import { FileUploadCard } from "@/components/FileUploadCard";

interface FileUploadNodeProps extends NodeProps {
  data: {
    label: string;
    fileId?: string;
    hasHeaders?: boolean;
    delimiter?: string;
  };
}

const FileUploadNode = ({ data, id }: FileUploadNodeProps) => {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedFile, setSelectedFile] = useState(data.fileId || null);
  const [availableFiles, setAvailableFiles] = useState([]);
  const [loadingFiles, setLoadingFiles] = useState(false);

  const {
    files,
    isUploading,
    uploadProgress,
    handleFileUpload,
    resetUpload,
    error: uploadError
  } = useFileUpload();

  const fetchFiles = useCallback(async () => {
    setLoadingFiles(true);
    try {
      const { data, error } = await supabase
        .from('excel_files')
        .select('*')
        .like('filename', `%${searchTerm}%`);

      if (error) {
        throw error;
      }

      setAvailableFiles(data);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to fetch files",
        variant: "destructive"
      });
    } finally {
      setLoadingFiles(false);
    }
  }, [searchTerm, toast]);

  useMemo(() => {
    fetchFiles();
  }, [fetchFiles]);

  const handleFileSelect = (fileId: string) => {
    setSelectedFile(fileId);
  };

  const handleSave = () => {
    // Implement save logic here
    setOpen(false);
  };

  return (
    <Card className="w-64">
      <CardContent className="p-4">
        <div className="space-y-2">
          <h3 className="text-sm font-medium">{data.label}</h3>
          <p className="text-xs text-muted-foreground">
            Upload or select an existing Excel file.
          </p>
        </div>
        <Tabs defaultValue="upload" className="mt-4">
          <TabsList>
            <TabsTrigger value="upload" className="text-xs">Upload</TabsTrigger>
            <TabsTrigger value="existing" className="text-xs">Existing</TabsTrigger>
          </TabsList>
          <TabsContent value="upload" className="pt-2">
            <Button variant="outline" size="sm" className="w-full justify-start gap-2 text-xs">
              <FileInput className="w-3 h-3" />
              Select File
            </Button>
          </TabsContent>
          <TabsContent value="existing" className="pt-2">
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm" className="w-full justify-start gap-2 text-xs">
                  <SearchIcon className="w-3 h-3" />
                  Select Existing
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                  <DialogTitle>Select Existing File</DialogTitle>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="search">Search:</Label>
                    <Input
                      id="search"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="col-span-3"
                    />
                  </div>
                  <ScrollArea className="h-40">
                    {loadingFiles ? (
                      <div>Loading files...</div>
                    ) : (
                      availableFiles.map((file) => (
                        <div
                          key={file.id}
                          className={`p-2 rounded-md hover:bg-gray-100 cursor-pointer ${
                            selectedFile === file.id ? "bg-gray-100" : ""
                          }`}
                          onClick={() => handleFileSelect(file.id)}
                        >
                          {file.filename}
                        </div>
                      ))
                    )}
                  </ScrollArea>
                </div>
                <Button type="submit" onClick={handleSave}>
                  Save
                </Button>
              </DialogContent>
            </Dialog>
          </TabsContent>
        </Tabs>
      </CardContent>
      <Handle type="source" position={Position.Right} id="file" />
    </Card>
  );
};

export default FileUploadNode;
