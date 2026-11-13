import { useState, type ComponentProps } from "react";
import { EyeIcon, EyeOffIcon } from "lucide-react";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";
import { cn } from "@/lib/utils";

/** Password field with a lucide Eye / EyeOff toggle (briefing p.35) */
export default function PasswordInput({
  groupClassName,
  ...props
}: Omit<ComponentProps<"input">, "type"> & {
  /** Classes for the InputGroup wrapper, e.g. "h-10" */
  groupClassName?: string;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <InputGroup className={cn(groupClassName)}>
      <InputGroupInput type={visible ? "text" : "password"} {...props} />
      <InputGroupAddon align="inline-end">
        <InputGroupButton
          size="icon-xs"
          aria-label={visible ? "Hide password" : "Show password"}
          aria-pressed={visible}
          onClick={() => setVisible((v) => !v)}
        >
          {visible ? <EyeOffIcon /> : <EyeIcon />}
        </InputGroupButton>
      </InputGroupAddon>
    </InputGroup>
  );
}
