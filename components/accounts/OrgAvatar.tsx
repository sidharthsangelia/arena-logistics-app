// Requires the shadcn "avatar" primitive. If it isn't in your project yet:
// npx shadcn@latest add avatar
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { getInitials } from "@/lib/utils";

type Props = {
  name: string;
  logoUrl?: string | null;
  className?: string;
};

export default function OrgAvatar({ name, logoUrl, className }: Props) {
  return (
    <Avatar className={className}>
      {logoUrl ? <AvatarImage src={logoUrl} alt={name} /> : null}
      <AvatarFallback className="text-xs font-medium">
        {getInitials(name)}
      </AvatarFallback>
    </Avatar>
  );
}