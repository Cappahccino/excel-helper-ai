
import { useState, useEffect } from "react";
import { Tag } from "@/types/tags";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, ChevronsUpDown, Loader2, Tag as TagIcon, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { TagFeedback } from "./TagFeedback";

interface TagSelectProps {
  selectedTags: Tag[];
  onTagInput: (tagName: string) => void;
  onTagRemove: (tag: Tag) => void;
  isLoading?: boolean;
  error?: string;
  className?: string;
}

export function TagSelect({ 
  selectedTags, 
  onTagInput,
  onTagRemove,
  isLoading,
  error,
  className 
}: TagSelectProps) {
  const [open, setOpen] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [availableTags, setAvailableTags] = useState<Tag[]>([]);

  useEffect(() => {
    const mockTags: Tag[] = [
      { 
        id: '1', 
        name: 'sales', 
        type: 'custom',
        category: null,
        created_at: new Date().toISOString(),
        is_system: false
      },
      { 
        id: '2', 
        name: 'finance', 
        type: 'custom',
        category: null,
        created_at: new Date().toISOString(),
        is_system: false
      },
      { 
        id: '3', 
        name: 'inventory', 
        type: 'custom',
        category: null,
        created_at: new Date().toISOString(),
        is_system: false
      }
    ];
    setAvailableTags(mockTags);
  }, []);

  const handleCreateNew = () => {
    if (inputValue.trim()) {
      onTagInput(inputValue.trim().toLowerCase());
      setInputValue("");
      setOpen(false);
    }
  };

  const handleSelect = (tag: Tag) => {
    if (!selectedTags.find(t => t.id === tag.id)) {
      onTagInput(tag.name);
    }
    setInputValue("");
  };

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="justify-between"
            disabled={isLoading}
          >
            <div className="flex items-center gap-2">
              <TagIcon className="w-4 h-4" />
              <span>{selectedTags.length > 0 ? `${selectedTags.length} tags selected` : "Select tags..."}</span>
            </div>
            {isLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <ChevronsUpDown className="w-4 h-4 opacity-50" />
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="p-0" align="start">
          <Command>
            <CommandInput 
              placeholder="Search or create new tag..." 
              value={inputValue}
              onValueChange={setInputValue}
            />
            <CommandEmpty>
              <button
                className="flex items-center gap-2 p-2 text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground w-full"
                onClick={handleCreateNew}
              >
                Create tag "{inputValue}"
              </button>
            </CommandEmpty>
            <CommandGroup>
              {availableTags.map((tag) => (
                <CommandItem
                  key={tag.id}
                  onSelect={() => handleSelect(tag)}
                  className="flex items-center justify-between"
                >
                  <span>{tag.name}</span>
                  {selectedTags.find(t => t.id === tag.id) && (
                    <Check className="w-4 h-4" />
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          </Command>
        </PopoverContent>
      </Popover>

      {selectedTags.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {selectedTags.map((tag) => (
            <Badge
              key={tag.id}
              variant="secondary"
              className="flex items-center gap-1"
            >
              {tag.name}
              <X
                className="w-3 h-3 cursor-pointer hover:text-destructive"
                onClick={() => onTagRemove(tag)}
              />
            </Badge>
          ))}
        </div>
      )}

      {(isLoading || error) && (
        <TagFeedback
          tags={selectedTags}
          status={error ? 'error' : isLoading ? 'loading' : 'success'}
          error={error}
        />
      )}
    </div>
  );
}
