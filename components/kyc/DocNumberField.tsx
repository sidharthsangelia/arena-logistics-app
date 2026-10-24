"use client";

import { useId, useState } from "react";

import { Input } from "@/components/ui/input";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import type { KycNumberSpec } from "@/lib/kyc/idNumbers";

/**
 * The number printed on a PAN, Aadhaar or GST document, typed in before its
 * file is uploaded. The upload zones keep the drop target disabled until this
 * is valid, so a document never lands in the vault without its number.
 *
 * Errors show once the field has been left, not on the first keystroke.
 */
export function DocNumberField({
  spec,
  value,
  onChange,
  disabled,
}: {
  spec: KycNumberSpec;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const id = useId();
  const [touched, setTouched] = useState(false);
  const error = touched ? spec.validate(spec.normalise(value)) : null;

  return (
    <Field data-invalid={!!error}>
      <FieldLabel htmlFor={id}>{spec.label}</FieldLabel>
      <Input
        id={id}
        value={value}
        onChange={(e) =>
          onChange(spec.kind === "aadhaar" ? e.target.value : e.target.value.toUpperCase())
        }
        onBlur={() => setTouched(true)}
        placeholder={spec.placeholder}
        maxLength={spec.maxLength}
        autoComplete="off"
        className="font-mono"
        disabled={disabled}
        aria-invalid={!!error}
      />
      {spec.kind === "aadhaar" && !error && (
        <FieldDescription>Stored encrypted. Only the last 4 digits are ever shown.</FieldDescription>
      )}
      {error && <FieldError>{error}</FieldError>}
    </Field>
  );
}

/** True when the zone may accept a file: no number needed, or a valid one given. */
export function docNumberReady(spec: KycNumberSpec | null, value: string): boolean {
  return !spec || spec.validate(spec.normalise(value)) === null;
}
