
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
import { TagBadge } from "./tags/TagBadge";
import { cn } from "@/lib/utils";

interface FileUploadCardProps {
  file: File;
  isUploading: boolean;
  onRemove: () => void;
  onRoleSelect: (role: string | null) => void;
  selectedTags: Tag[];
  selectedRole?: string;
  availableTags: Tag[];
  onTagInput: (tagName: string) => void;
  onTagRemove: (tag: Tag) => void;
}

export function FileUploadCard({
  file,
  isUploading,
  onRemove,
  onTagInput,
  onTagRemove,
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

  const handleRoleSelect = (value: string | undefined) => {
    onRoleSelect(value || null);
  };

  return (
    <div className="flex flex-col gap-3 p-4 bg-white rounded-lg border shadow-sm">
      <div className="flex flex-col gap-2">
        <div className="flex items-start justify-between">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5 text-green-600 flex-shrink-0" />
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
            {selectedTags.length > 0 && (
              <div className="flex flex-wrap gap-2 ml-7 mt-1">
                {selectedTags.map((tag) => (
                  <TagBadge
                    key={tag.id}
                    tag={tag}
                    onRemove={() => onTagRemove(tag)}
                    className="flex items-center gap-1.5"
                  />
                ))}
              </div>
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
          <div className="space-y-3 mt-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-gray-700">
                System Role
              </label>
              <Select
                value={selectedRole}
                onValueChange={handleRoleSelect}
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
                onTagInput={onTagInput}
                onRemove={onTagRemove}
                className="w-full"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
