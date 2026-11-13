import { useState } from "react";
import { Check, Copy, MailWarning } from "lucide-react";
import type { SimulatedWelcomeEmail } from "@/types/api";
import KeyValueList from "@/components/app/KeyValueList";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface SimulatedEmailDialogProps {
  /** The welcome email from POST /api/users; null = closed */
  email: SimulatedWelcomeEmail | null;
  /** "Thabo Nkosi" */
  name: string;
  onClose: () => void;
}

/**
 * Shown once after "Add user" when the server has no email service (the free demo, page 28:
 * "simulated services show a simulated label"): what the welcome email would have said, so the
 * admin can pass the temporary password on. It is never shown again.
 */
export default function SimulatedEmailDialog({ email, name, onClose }: SimulatedEmailDialogProps) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    if (!email) return;
    try {
      await navigator.clipboard.writeText(email.temporary_password);
      setCopied(true);
    } catch {
      // Copying is a convenience; the password stays on screen to read out
    }
  };

  return (
    <Dialog
      open={email !== null}
      onOpenChange={(open) => {
        if (!open) {
          setCopied(false);
          onClose();
        }
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            Welcome email for {name}
            <Badge variant="outline" className="border-warning-border bg-warning-muted text-warning-strong">
              Simulated
            </Badge>
          </DialogTitle>
          <DialogDescription>
            Email isn&apos;t set up on this server, so nothing was sent. Give {name.split(" ")[0]} these details yourself.
          </DialogDescription>
        </DialogHeader>

        <KeyValueList
          items={[
            { label: "To", value: email?.to ?? "" },
            {
              label: "Temporary password",
              value: <span className="font-mono text-sm tracking-wide text-foreground">{email?.temporary_password}</span>,
            },
          ]}
        />

        <Alert>
          <MailWarning />
          <AlertTitle>Shown only this once</AlertTitle>
          <AlertDescription>They choose their own password the first time they sign in.</AlertDescription>
        </Alert>

        <DialogFooter>
          <Button variant="outline" onClick={() => void copy()}>
            {copied ? <Check data-icon="inline-start" /> : <Copy data-icon="inline-start" />}
            {copied ? "Copied" : "Copy password"}
          </Button>
          <Button onClick={onClose}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
