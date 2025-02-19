
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

  // Function to get a pastel color based on tag name
  const getTagColor = (name: string) => {
    const colors = [
      "bg-[#F2FCE2] text-[#4B7F52]", // Soft Green
      "bg-[#E5DEFF] text-[#4A3D89]", // Soft Purple
      "bg-[#FFDEE2] text-[#943D4B]", // Soft Pink
      "bg-[#D3E4FD] text-[#2C5282]", // Soft Blue
      "bg-[#FDE1D3] text-[#974E34]", // Soft Peach
      "bg-[#FEF7CD] text-[#8B7E2B]"  // Soft Yellow
    ];
    
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
  };

  const handleRoleSelect = (value: string) => {
    if (value === selectedRole) {
      onRoleSelect(null); // Clear the role if it's clicked again
    } else {
      onRoleSelect(value);
    }
  };

  const getRoleDisplayName = (role: string): string => {
    switch (role) {
      case "primary": return "Primary File";
      case "reference": return "Reference File";
      case "supporting": return "Supporting File";
      default: return role;
    }
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
            <div className="flex flex-wrap gap-2 ml-7 mt-1">
              {selectedRole && (
                <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-md text-xs font-medium bg-[#E0F2FE] text-[#0F5A89]">
                  <span>{getRoleDisplayName(selectedRole)}</span>
                  <button
                    onClick={() => onRoleSelect(null)}
                    className="p-0.5 hover:bg-black/10 rounded-md transition-colors"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              )}
              {selectedTags.length > 0 && selectedTags.map((tag) => (
                <div
                  key={tag.id}
                  className={cn(
                    "flex items-center gap-2 px-2.5 py-1.5 rounded-md text-xs font-medium",
                    getTagColor(tag.name)
                  )}
                >
                  <span>{tag.name}</span>
                  <button
                    onClick={() => onTagRemove(tag)}
                    className="p-0.5 hover:bg-black/10 rounded-md transition-colors"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
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
