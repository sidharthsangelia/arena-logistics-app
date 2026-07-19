import { getCurrentOrg } from "@/actions/book/getOrgs";
import { AddressBookView } from "@/components/address/AddressBookView";

export const metadata = {
  title: "Address book",
};

export default async function AddressBookPage() {
  const org = await getCurrentOrg();

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6">
      <div className="mb-6">
        <h1 className="text-xl font-semibold tracking-tight">Address book</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Save the places you ship from and to. Then fill any booking in one tap
          instead of typing the same details again.
        </p>
      </div>

      <AddressBookView orgId={org.id} isBusinessAssociate={org.isBusinessAssociate} />
    </div>
  );
}
