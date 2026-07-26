/**
 * Just the page shell. The header used to live here as VaultToolbar, which
 * duplicated the heading the page already renders and blocked the route on a
 * count query to draw it. The page's heading is the contextual one (it reads
 * differently for Business Associates), and the table shows its own count.
 */
export default function DocumentVaultLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
