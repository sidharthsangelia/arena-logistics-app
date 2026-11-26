/**
 * Theme for Clerk's prebuilt SignIn and SignUp, so the form reads as part of
 * the app: our font, our tokens (light and dark follow globals.css), our
 * button style. Clerk keeps its own single card; nothing wraps it.
 *
 * Values are our CSS variables rather than copied colours, so a change to the
 * palette in globals.css reaches the form too.
 */
export const clerkAppearance = {
  variables: {
    colorPrimary: "var(--primary)",
    colorPrimaryForeground: "var(--primary-foreground)",
    colorForeground: "var(--foreground)",
    colorMutedForeground: "var(--muted-foreground)",
    colorMuted: "var(--muted)",
    colorBackground: "var(--card)",
    colorInput: "var(--background)",
    colorInputForeground: "var(--foreground)",
    colorBorder: "var(--border)",
    colorRing: "var(--ring)",
    colorDanger: "var(--destructive)",
    colorNeutral: "var(--foreground)",
    fontFamily: "inherit",
    borderRadius: "var(--radius)",
  },
  elements: {
    rootBox: "w-full",
    cardBox: "w-full shadow-sm",
    // Our page already shows the emblem; a second logo in the card is noise.
    logoBox: "hidden",
    headerTitle: "text-xl font-semibold tracking-tight",
    formButtonPrimary: "shadow-none",
  },
} as const;
