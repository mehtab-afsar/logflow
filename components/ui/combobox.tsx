"use client";

import * as React from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export interface ComboboxOption {
  value: string;
  label: string;
  /** Second line — a GSTIN or a vehicle type. Also searchable. */
  detail?: string;
}

/**
 * A searchable select, for lists a dropdown cannot hold.
 *
 * A dispatcher with 200 parties cannot scroll to the right one, and the PRD's
 * "under 60 seconds" claim depends on typing three letters instead. Below
 * roughly eight options a plain Select is faster, so this is used only where
 * the list genuinely grows: parties and vehicles.
 *
 * Matching runs over the label AND the detail, because a consignor is often
 * recognised by its GSTIN or its city rather than its registered name.
 */
export function Combobox({
  options, value, onChange, placeholder = "Select…", searchPlaceholder = "Type to search…",
  emptyText = "Nothing found", id, className, allowClear, ariaInvalid,
}: {
  options: ComboboxOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  id?: string;
  className?: string;
  allowClear?: boolean;
  ariaInvalid?: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const selected = options.find((o) => o.value === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-invalid={ariaInvalid}
          className={cn(
            "h-11 w-full justify-between px-3 font-normal",
            !selected && "text-ink-3",
            className,
          )}
        >
          <span className="truncate">{selected ? selected.label : placeholder}</span>
          <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" strokeWidth={1.5} />
        </Button>
      </PopoverTrigger>

      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command
          filter={(itemValue, search) => {
            // itemValue carries "label · detail"; match on either half.
            return itemValue.toLowerCase().includes(search.toLowerCase()) ? 1 : 0;
          }}
        >
          <CommandInput placeholder={searchPlaceholder} className="h-11" />
          <CommandList>
            <CommandEmpty className="py-6 text-center text-sm text-ink-3">{emptyText}</CommandEmpty>
            <CommandGroup>
              {allowClear && (
                <CommandItem
                  value="__clear__"
                  onSelect={() => {
                    onChange("");
                    setOpen(false);
                  }}
                  className="text-ink-3"
                >
                  Not assigned
                </CommandItem>
              )}
              {options.map((o) => (
                <CommandItem
                  key={o.value}
                  value={`${o.label} ${o.detail ?? ""}`}
                  onSelect={() => {
                    onChange(o.value);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn("mr-2 size-4", value === o.value ? "opacity-100" : "opacity-0")}
                    strokeWidth={2}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{o.label}</span>
                    {o.detail && (
                      <span className="block truncate font-mono text-xs text-ink-3">{o.detail}</span>
                    )}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
