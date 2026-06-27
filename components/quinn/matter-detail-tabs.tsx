"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EntityList } from "@/components/quinn/entity-list";
import { MatterBoard } from "@/components/quinn/matter-board";
import type { ClauseWithFinding, MatterTimeRange } from "@/lib/graph/queries";

const BackendGraph = dynamic(
  () => import("@/components/quinn/backend-graph").then((m) => m.BackendGraph),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-96 items-center justify-center text-sm text-muted-foreground">
        Loading graph...
      </div>
    ),
  }
);

type Tab = "entities" | "graph" | "clauses";

export function MatterDetailTabs({
  matterId,
  initialClauses,
  timeRange,
}: {
  matterId: string;
  initialClauses: ClauseWithFinding[];
  timeRange: MatterTimeRange;
}) {
  const [tab, setTab] = useState<Tab>("entities");
  const hasClauses = initialClauses.length > 0;

  return (
    <div className="space-y-4">
      <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
        <TabsList>
          <TabsTrigger value="entities">Entities</TabsTrigger>
          <TabsTrigger value="graph">Graph</TabsTrigger>
          {hasClauses && <TabsTrigger value="clauses">Clauses</TabsTrigger>}
        </TabsList>
      </Tabs>

      {tab === "entities" && <EntityList matterId={matterId} />}

      {tab === "graph" && (
        <div className="h-[600px] rounded-lg border">
          <BackendGraph matterId={matterId} />
        </div>
      )}

      {tab === "clauses" && hasClauses && (
        <MatterBoard matterId={matterId} initialClauses={initialClauses} timeRange={timeRange} />
      )}
    </div>
  );
}
