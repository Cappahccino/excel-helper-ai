
import { FileSpreadsheet, X } from "lucide-react";
import { TagSelect } from "./tags/TagSelect";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tag } from "@/types/tags";

interface FileUploadCardProps {
  file: File;
  isUploading: boolean;
  onRemove: () => void;
  onTagSelect: (tag: Tag) => void;
  onTagRemove: (tag: Tag) => void;
  onTagCreate: (name: string) => Promise<void>;
  onRoleSelect: (role: string) => void;
  selectedTags: Tag[];
  selectedRole?: string;
  availableTags: Tag[];
}

export function FileUploadCard({
  file,
  isUploading,
  onRemove,
  onTagSelect,
  onTagRemove,
  onTagCreate,
  onRoleSelect,
  selectedTags,
  selectedRole,
  availableTags
}: FileUploadCardProps) {
  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  return (
    <div className="flex flex-col gap-3 p-4 bg-white rounded-lg border shadow-sm">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileSpreadsheet className="h-5 w-5 text-green-600" />
          {isUploading ? (
            <div className="flex items-center gap-2">
              <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-green-600" />
              <span className="text-sm text-gray-700">Uploading file...</span>
            </div>
          ) : (
            <span className="text-sm font-medium text-gray-700">
              {file.name} ({formatFileSize(file.size)})
            </span>
          )}
        </div>
        
        <button
          onClick={onRemove}
          className="p-1.5 rounded-full hover:bg-gray-100 transition-colors"
          aria-label="Remove file"
        >
          <X className="w-4 h-4 text-gray-600" />
        </button>
      </div>

      {!isUploading && (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-gray-700">
              System Role
            </label>
            <Select
              value={selectedRole}
              onValueChange={onRoleSelect}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select file role" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="primary">Primary File</SelectItem>
                <SelectItem value="reference">Reference File</SelectItem>
                <SelectItem value="supporting">Supporting File</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-gray-700">
              Tags
            </label>
            <TagSelect
              tags={availableTags}
              selectedTags={selectedTags}
              onSelect={onTagSelect}
              onRemove={onTagRemove}
              onCreate={onTagCreate}
              className="w-full"
            />
          </div>
        </div>
      )}
    </div>
  );
}
