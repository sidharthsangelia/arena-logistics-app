"use client";

/**
 * One end of a lane: a country, a postal code that fills in city and state, and
 * everything it filled staying editable.
 *
 * ── WHY NOT A SINGLE TEXT BOX ───────────────────────────────────────────────
 * It was one, and "what do I type in it" is not a question a form should raise.
 * A city alone cannot be grouped for a lane report, cannot resolve a state, and
 * two admins will spell the same place three ways within a month.
 *
 * So the postal code is the input that carries meaning, and city, state and
 * country are derived from it through utils/postalLookup.ts, the same India Post
 * and Zippopotam path the booking flow uses. Everything derived stays editable,
 * because a lookup that finds nothing is common and expected, not an error: new
 * pincodes exist, and a lane end is sometimes a port or a hub with no postal
 * code at all.
 *
 * ── THE ORDER OF THE QUESTIONS IS THE WHOLE DESIGN ──────────────────────────
 * The country is asked FIRST on an international lane, because a postal code is
 * meaningless without one. "00000" is a valid ZIP somewhere and a typo
 * everywhere else, and the lookup literally cannot run until it knows which
 * country's postal system to ask. Asking for the code first and the country
 * last, which is what this used to do, meant every international destination
 * was typed in the wrong order and then looked up again.
 *
 * On a DOMESTIC invoice there is no country question at all. Both ends are
 * India by definition, so offering a picker would be offering a way to make the
 * invoice wrong. See applyMode in builderState.ts, which enforces the same rule
 * when the invoice type changes underneath a lane that was already filled in.
 */

import * as React from "react";
import { Check, ChevronsUpDown, Loader2, MapPin } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { usePostalLookup } from "@/hooks/usePostalLookup";
import { hasPostalLookup } from "@/utils/postalLookup";
import { COUNTRIES } from "@/utils/data";
import { ShipmentMode } from "@/generated/prisma";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";

import { composeRouteLabel, HOME_COUNTRY, type RouteEnd } from "./builderState";

export function RouteEndPicker({
  label,
  value,
  mode,
  disabled,
  onChange,
}: {
  label: string;
  value: RouteEnd;
  /** Decides whether the country is asked at all. */
  mode: ShipmentMode;
  disabled?: boolean;
  onChange: (next: RouteEnd) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const domestic = mode === ShipmentMode.DOMESTIC;

  // The label is auto-composed until somebody edits it by hand, after which it
  // is theirs and the lookup stops rewriting it. Without this, typing a lane
  // name and then correcting the postal code would silently discard the name.
  const [labelEdited, setLabelEdited] = React.useState(
    () => value.label.trim() !== "" && value.label !== composeRouteLabel(value),
  );

  const set = React.useCallback(
    (patch: Partial<RouteEnd>) => {
      const next = { ...value, ...patch };
      if (!labelEdited) next.label = composeRouteLabel(next);
      onChange(next);
    },
    [value, labelEdited, onChange],
  );

  // usePostalLookup fires on a debounce and discards stale responses. Passing
  // an empty country keeps it idle, which is exactly right while the country
  // question is still unanswered.
  const country = domestic ? HOME_COUNTRY : value.country;
  const lookupState = usePostalLookup(country, value.postalCode, (city, state) => {
    // Never overwrite something already typed: the lookup is a convenience,
    // and an admin who corrected a city knows better than India Post does
    // about which of two districts a customer calls home.
    set({ city: value.city.trim() || city, state: value.state.trim() || state });
  });

  const display = value.label.trim() || composeRouteLabel(value);

  // Everything below the country is unanswerable until the country is known, so
  // it is disabled rather than merely empty. A ZIP typed into a form that does
  // not yet know the country cannot be looked up and will not be re-looked-up
  // later, so accepting it would be accepting a dead value.
  const awaitingCountry = !domestic && !value.country.trim();
  const lookupAvailable = hasPostalLookup(country);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          disabled={disabled}
          className={cn(
            "h-8 w-full justify-between px-2 font-normal",
            !display && "text-muted-foreground",
          )}
        >
          <span className="flex min-w-0 items-center gap-1.5">
            <MapPin className="h-3.5 w-3.5 shrink-0 opacity-50" />
            <span className="truncate">
              {display || `Set ${label.toLowerCase()}`}
            </span>
          </span>
          <ChevronsUpDown className="ml-1 h-3.5 w-3.5 shrink-0 opacity-40" />
        </Button>
      </PopoverTrigger>

      <PopoverContent className="w-80 p-3" align="start">
        <div className="grid gap-3">
          {/* ── the country, first, and only when it is a real question ── */}
          {domestic ? (
            <p className="text-xs text-muted-foreground">
              Domestic invoice, so this is somewhere in India.
            </p>
          ) : (
            <div className="grid gap-1.5">
              <Label className="text-xs">Country</Label>
              <CountryPicker
                value={value.country}
                autoFocus={awaitingCountry}
                onChange={(next) =>
                  // A country change invalidates whatever the previous
                  // country's postal code resolved to, so the derived fields
                  // are cleared rather than left describing somewhere else.
                  set({ country: next, city: "", state: "", postalCode: "" })
                }
              />
            </div>
          )}

          <div className="grid gap-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs">
                {country === HOME_COUNTRY ? "Pincode" : "Postal code or ZIP"}
              </Label>
              <LookupHint
                state={lookupState}
                length={value.postalCode.trim().length}
                available={lookupAvailable}
                awaitingCountry={awaitingCountry}
              />
            </div>
            <Input
              className="h-8"
              autoFocus={!awaitingCountry}
              inputMode={country === HOME_COUNTRY ? "numeric" : "text"}
              value={value.postalCode}
              disabled={awaitingCountry}
              placeholder={
                awaitingCountry
                  ? "Choose a country first"
                  : country === HOME_COUNTRY
                    ? "122018"
                    : lookupAvailable
                      ? "Fills the city in"
                      : "Optional here"
              }
              onChange={(e) => set({ postalCode: e.target.value })}
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="grid gap-1.5">
              <Label className="text-xs">City</Label>
              <Input
                className="h-8"
                value={value.city}
                disabled={awaitingCountry}
                onChange={(e) => set({ city: e.target.value })}
              />
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs">
                {country === HOME_COUNTRY ? "State" : "State or region"}
              </Label>
              <Input
                className="h-8"
                value={value.state}
                disabled={awaitingCountry}
                onChange={(e) => set({ state: e.target.value })}
              />
            </div>
          </div>

          {/* The airport or seaport code belongs beside the place it describes,
              not in a disclosure three sections down. */}
          <div className="grid gap-1.5">
            <Label className="text-xs">Airport or port code</Label>
            <Input
              className="h-8 font-mono uppercase"
              value={value.port}
              maxLength={12}
              placeholder={label === "Origin" ? "DEL" : "DXB"}
              onChange={(e) => onChange({ ...value, port: e.target.value.toUpperCase() })}
            />
          </div>

          <div className="grid gap-1.5 border-t pt-3">
            <Label className="text-xs">What prints on the invoice</Label>
            <Input
              className="h-8"
              value={value.label}
              placeholder={composeRouteLabel(value) || "Gurugram, Haryana"}
              onChange={(e) => {
                setLabelEdited(e.target.value.trim() !== "");
                onChange({ ...value, label: e.target.value });
              }}
            />
            <p className="text-xs text-muted-foreground">
              Left blank, it follows the city and state above.
            </p>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

/**
 * "Not found" is a normal outcome, so it reads as information rather than as an
 * error: nothing is blocked, and the fields below are already editable.
 *
 * "No lookup here" is a different outcome and says so. Telling somebody their
 * Dubai postal code was not found invites them to check it, and there is
 * nothing to check: the UAE has no postal codes and no service covers it.
 */
function LookupHint({
  state,
  length,
  available,
  awaitingCountry,
}: {
  state: "idle" | "loading" | "found" | "not_found";
  length: number;
  available: boolean;
  awaitingCountry: boolean;
}) {
  if (awaitingCountry) return null;

  if (!available) {
    return (
      <span className="text-xs text-muted-foreground">
        No lookup here, type the city
      </span>
    );
  }
  if (state === "loading") {
    return (
      <span className="flex items-center gap-1 text-xs text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" />
        Looking up
      </span>
    );
  }
  if (state === "found") {
    return (
      <span className="flex items-center gap-1 text-xs text-muted-foreground">
        <Check className="h-3 w-3" />
        Found
      </span>
    );
  }
  if (state === "not_found" && length >= 3) {
    return (
      <span className="text-xs text-muted-foreground">
        Not found, type it below
      </span>
    );
  }
  return null;
}

function CountryPicker({
  value,
  autoFocus,
  onChange,
}: {
  value: string;
  autoFocus?: boolean;
  onChange: (country: string) => void;
}) {
  const [open, setOpen] = React.useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          autoFocus={autoFocus}
          className={cn(
            "h-8 w-full justify-between px-2 font-normal",
            !value && "text-muted-foreground",
          )}
        >
          <span className="truncate">{value || "Select a country"}</span>
          <ChevronsUpDown className="ml-1 h-3.5 w-3.5 shrink-0 opacity-40" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-0" align="start">
        <Command>
          <CommandInput placeholder="Search countries" />
          <CommandList>
            <CommandEmpty>No country matches.</CommandEmpty>
            <CommandGroup>
              {COUNTRIES.map((country) => (
                <CommandItem
                  key={country.code}
                  value={country.name}
                  onSelect={() => {
                    onChange(country.name);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value === country.name ? "opacity-100" : "opacity-0",
                    )}
                  />
                  {country.name}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
