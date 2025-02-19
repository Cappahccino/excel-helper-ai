
import { useState } from "react";
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
import { TagBadge } from "./TagBadge";
import { Check, ChevronsUpDown, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

interface TagSelectProps {
  tags: Tag[];
  selectedTags: Tag[];
  onSelect: (tag: Tag) => void;
  onRemove: (tag: Tag) => void;
  onCreate?: (name: string) => Promise<void>;
  className?: string;
}

export function TagSelect({
  tags,
  selectedTags,
  onSelect,
  onRemove,
  onCreate,
  className
}: TagSelectProps) {
  const [open, setOpen] = useState(false);
  const [searchValue, setSearchValue] = useState("");

  // Filter out already selected tags and filter by search value
  const filteredTags = tags
    .filter(tag => !selectedTags.find(t => t.id === tag.id))
    .filter(tag => 
      tag.name.toLowerCase().includes(searchValue.toLowerCase())
    );

  const handleSelect = (selectedTag: Tag) => {
    onSelect(selectedTag);
    setSearchValue("");
    setOpen(false);
  };

  const handleCreate = async () => {
    if (!searchValue.trim() || !onCreate) return;
    
    await onCreate(searchValue.trim());
    setSearchValue("");
    setOpen(false);
  };

  return (
    <div className={cn("flex flex-wrap gap-2", className)}>
      {selectedTags.map((tag) => (
        <TagBadge
          key={tag.id}
          tag={tag}
          onRemove={() => onRemove(tag)}
        />
      ))}
      
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="h-8 px-2 gap-1"
          >
            Add tag
            <ChevronsUpDown className="h-4 w-4 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[200px] p-0" align="start">
          <Command shouldFilter={false}>
            <CommandInput 
              placeholder="Search tags..."
              value={searchValue}
              onValueChange={setSearchValue}
            />
            <CommandEmpty>
              {onCreate && searchValue.trim() && (
                <button
                  className="flex items-center gap-2 px-2 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground w-full"
                  onClick={handleCreate}
                >
                  <Plus className="h-4 w-4" />
                  Create "{searchValue.trim()}"
                </button>
              )}
            </CommandEmpty>
            <CommandGroup>
              {filteredTags.map((tag) => (
                <CommandItem
                  key={tag.id}
                  value={tag.id}
                  onSelect={() => handleSelect(tag)}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4 opacity-0"
                    )}
                  />
                  {tag.name}
                </CommandItem>
              ))}
            </CommandGroup>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}
