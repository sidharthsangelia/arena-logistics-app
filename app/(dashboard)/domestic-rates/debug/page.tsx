import { prisma } from "@/utils/db";

export default async function DebugPage() {
  const versions = await prisma.rateVersion.findMany({
    orderBy: {
      uploadedAt: "desc",
    },
    include: {
      _count: {
        select: {
          rateCards: true,
          awbCharges: true,
        },
      },
    },
  });

  return (
    <div className="p-6">
      <h1 className="text-2xl font-semibold mb-6">
        Uploaded Versions
      </h1>

      <div className="space-y-4">
        {versions.map((v) => (
          <div
            key={v.id}
            className="border rounded-lg p-4"
          >
            <div>{v.vendor}</div>

            <div>{v.sourceFilename}</div>

            <div>
              Cards: {v._count.rateCards}
            </div>

            <div>
              AWB Charges: {v._count.awbCharges}
            </div>

            <div>
              Active: {v.isActive ? "YES" : "NO"}
            </div>

            <div>
              Staged: {v.isStaged ? "YES" : "NO"}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}