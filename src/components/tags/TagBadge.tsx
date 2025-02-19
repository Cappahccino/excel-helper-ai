
import { Tag } from "@/types/tags";
import { Badge } from "@/components/ui/badge";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

interface TagBadgeProps {
  tag: Tag;
  onRemove?: () => void;
  className?: string;
}

export function TagBadge({ tag, onRemove, className }: TagBadgeProps) {
  // Hash function to consistently assign the same color to the same tag
  const getColorIndex = (str: string) => {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    return Math.abs(hash);
  };

  const pastelColors = [
    "bg-[#F2FCE2] text-[#4B7F52] hover:bg-[#E7F7D7]", // Soft Green
    "bg-[#E5DEFF] text-[#4A3D89] hover:bg-[#DAD3F5]", // Soft Purple
    "bg-[#FFDEE2] text-[#943D4B] hover:bg-[#F5D4D8]", // Soft Pink
    "bg-[#D3E4FD] text-[#2C5282] hover:bg-[#C9DAF3]", // Soft Blue
    "bg-[#FDE1D3] text-[#974E34] hover:bg-[#F3D7C9]", // Soft Peach
    "bg-[#FEF7CD] text-[#8B7E2B] hover:bg-[#F4EDC3]"  // Soft Yellow
  ];

  const colorIndex = getColorIndex(tag.name) % pastelColors.length;
  const colorStyle = tag.is_system 
    ? "bg-blue-100 text-blue-800 hover:bg-blue-200" 
    : pastelColors[colorIndex];

  return (
    <Badge
      variant="secondary"
      className={cn(
        "px-2.5 py-1.5 h-7 text-xs font-medium rounded-md transition-colors",
        colorStyle,
        "border-none shadow-sm",
        className
      )}
    >
      {tag.name}
      {onRemove && (
        <button
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onRemove();
          }}
          className={cn(
            "ml-1.5 p-0.5 rounded-md hover:bg-black/10 transition-colors",
            "flex items-center justify-center"
          )}
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </Badge>
  );
}
