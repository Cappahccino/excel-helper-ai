
import { FileSpreadsheet, Table } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ExcelPreview } from "./ExcelPreview";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchFileTags, createTag, assignTagToFile } from "@/services/tagService";
import { TagSelect } from "./tags/TagSelect";
import { useToast } from "@/hooks/use-toast";
import { Tag } from "@/types/tags";

interface FileInfoProps {
  filename: string;
  fileSize?: number;
  fileId?: string;
  messageId?: string;
  className?: string;
}

export function FileInfo({ filename, fileSize, fileId, messageId, className }: FileInfoProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return '';
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const { data: fileTags = [] } = useQuery({
    queryKey: ['file-tags', fileId],
    queryFn: () => fileId ? fetchFileTags(fileId) : Promise.resolve([]),
    enabled: !!fileId
  });

  const createTagMutation = useMutation({
    mutationFn: createTag,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tags'] });
      toast({
        title: "Success",
        description: "Tag created successfully",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to create tag",
        variant: "destructive",
      });
    }
  });

  const assignTagMutation = useMutation({
    mutationFn: (tag: Tag) => {
      if (!fileId || !messageId) throw new Error("Missing file or message ID");
      return assignTagToFile(messageId, fileId, tag.id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['file-tags', fileId] });
      toast({
        title: "Success",
        description: "Tag assigned successfully",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to assign tag",
        variant: "destructive",
      });
    }
  });

  const handleCreateTag = async (name: string) => {
    await createTagMutation.mutateAsync(name);
  };

  const handleAssignTag = async (tag: Tag) => {
    await assignTagMutation.mutateAsync(tag);
  };

  return (
    <div className={`flex items-center gap-4 p-4 bg-[#E8F1FF] rounded-lg border border-[#C8C8C9] ${className || ''}`}>
      <div className="flex items-center gap-3 flex-1">
        <FileSpreadsheet className="w-8 h-8 text-[#217346]" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-black truncate">{filename}</p>
          {fileSize && (
            <p className="text-xs text-black/70">
              spreadsheet - {formatFileSize(fileSize)}
            </p>
          )}
          {fileId && messageId && (
            <TagSelect
              tags={[]}
              selectedTags={fileTags.map((ft: any) => ft.file_tags)}
              onSelect={handleAssignTag}
              onRemove={() => {}}
              onCreate={handleCreateTag}
              className="mt-2"
            />
          )}
        </div>
      </div>
      {fileId && (
        <Dialog>
          <DialogTrigger asChild>
            <Button 
              variant="outline" 
              size="sm"
              className="bg-[#D3E4FD] hover:bg-[#D3E4FD]/90 text-black border-[#C8C8C9]"
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
