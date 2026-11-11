"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

interface ModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  description?: string;
  children: React.ReactNode;
  maxWidth?: string;
  /** On screens ≤479 px, anchor to bottom of screen instead of centering */
  fullScreenMobile?: boolean;
}

export function Modal({
  open,
  onOpenChange,
  title,
  description,
  children,
  maxWidth = "max-w-md",
  fullScreenMobile = false,
}: ModalProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60" />
        <Dialog.Content
          className={cn(
            "fixed z-50 bg-surface border border-border-subtle shadow-2xl",
            "focus:outline-none max-h-[90vh] overflow-y-auto",
            fullScreenMobile
              ? [
                  // Mobile (<480px): full-width bottom sheet
                  "max-[479px]:left-0 max-[479px]:right-0 max-[479px]:bottom-0 max-[479px]:top-auto",
                  "max-[479px]:w-full max-[479px]:translate-x-0 max-[479px]:translate-y-0",
                  "max-[479px]:rounded-t-[20px] max-[479px]:rounded-b-none max-[479px]:max-h-[85vh]",
                  // Desktop (≥480px): centered
                  "min-[480px]:left-1/2 min-[480px]:top-1/2",
                  "min-[480px]:-translate-x-1/2 min-[480px]:-translate-y-1/2",
                  `min-[480px]:w-[calc(100vw-2rem)] min-[480px]:${maxWidth}`,
                  "min-[480px]:rounded-[var(--radius-xl)]",
                ]
              : [
                  "left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2",
                  `w-[calc(100vw-2rem)] ${maxWidth}`,
                  "rounded-[var(--radius-xl)]",
                ],
          )}
        >
          {/* Close button — always present, floats top-right */}
          <div className="sticky top-0 flex items-start justify-between p-6 pb-0">
            <div className="flex-1 min-w-0">
              {/* Hidden title for a11y — always required by Radix */}
              {title ? (
                <Dialog.Title className="text-base font-semibold text-text-primary">
                  {title}
                </Dialog.Title>
              ) : (
                <Dialog.Title className="sr-only">Dialog</Dialog.Title>
              )}
              {description && (
                <Dialog.Description className="mt-1 text-sm text-text-secondary">
                  {description}
                </Dialog.Description>
              )}
            </div>
            <Dialog.Close asChild>
              <button
                className="ml-4 shrink-0 p-1 text-text-tertiary hover:text-text-primary transition-colors rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-start"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </Dialog.Close>
          </div>

          {/* Body — separated from sticky header */}
          <div className={cn("p-6", title ? "pt-4" : "pt-3")}>
            {children}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
