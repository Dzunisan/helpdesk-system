import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** A question: "Deactivate Dawid Pretorius?" */
  title: ReactNode;
  /** Exactly what will happen, in one or two sentences */
  description: ReactNode;
  /** The confirm button: "Deactivate", "Delete user" */
  confirmLabel: string;
  /** Keep-it-as-is button text (default "Cancel") */
  cancelLabel?: string;
  /** Red confirm button and icon for actions that remove or block something */
  destructive?: boolean;
  icon?: LucideIcon;
  onConfirm: () => void;
}

/** Confirmation for admin actions (briefing p.61-62, p.67: AlertDialog, never window.confirm) */
export default function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  cancelLabel = "Cancel",
  destructive,
  icon: Icon,
  onConfirm,
}: ConfirmDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="gap-5 p-6 sm:max-w-md data-[size=default]:max-w-[calc(100%-2rem)] data-[size=default]:sm:max-w-md">
        <AlertDialogHeader className="gap-2">
          {Icon && (
            <AlertDialogMedia
              className={cn("size-10 rounded-xl", destructive ? "bg-destructive/10 text-destructive" : "bg-secondary text-primary")}
            >
              <Icon className="size-5" aria-hidden />
            </AlertDialogMedia>
          )}
          <AlertDialogTitle className="text-base font-semibold">{title}</AlertDialogTitle>
          <AlertDialogDescription className="text-sm text-pretty">{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="-mx-6 -mb-6 px-6 py-4">
          <AlertDialogCancel className="h-10 sm:h-9">{cancelLabel}</AlertDialogCancel>
          <AlertDialogAction
            variant={destructive ? "destructive" : "default"}
            className={cn("h-10 sm:h-9", destructive && "bg-destructive text-primary-foreground hover:bg-destructive/90")}
            onClick={onConfirm}
          >
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
