
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
  const [value, setValue] = useState("");
  const [inputValue, setInputValue] = useState("");

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
        <PopoverContent className="w-[200px] p-0">
          <Command>
            <CommandInput
              placeholder="Search tags..."
              value={inputValue}
              onValueChange={setInputValue}
            />
            <CommandEmpty>
              {onCreate && (
                <button
                  className="flex items-center gap-2 px-2 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground w-full"
                  onClick={() => {
                    onCreate(inputValue);
                    setInputValue("");
                  }}
                >
                  <Plus className="h-4 w-4" />
                  Create "{inputValue}"
                </button>
              )}
            </CommandEmpty>
            <CommandGroup>
              {tags
                .filter(tag => !selectedTags.find(t => t.id === tag.id))
                .map((tag) => (
                  <CommandItem
                    key={tag.id}
                    value={tag.name}
                    onSelect={() => {
                      onSelect(tag);
                      setOpen(false);
                    }}
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        value === tag.id ? "opacity-100" : "opacity-0"
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
