import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { runWrite, closeNeo4j } from "@/lib/neo4j";
import { assertFact, supersedeFact, snapshotAt, traceFinding, getCurrentAssessment } from "@/lib/graph/temporal";

/**
 * These run against the real Neo4j instance configured in .env.local (no mocks —
 * the bi-temporal helpers are graph-mutation logic, so the only meaningful test
 * is against the real database). All fixtures are namespaced under
 * `__test_temporal__` and deleted in afterAll so they never leak into the demo graph.
 * Each test gets its own Clause id so tests don't interfere with each other's
 * "current" ASSESSED_AS edge.
 */
const NS = "__test_temporal__";
const provisionId = `${NS}provision-1`;
const ruleId = `${NS}rule-1`;
const episodeId = `${NS}episode-1`;

beforeAll(async () => {
  await runWrite(
    `MERGE (p:Provision {id: $provisionId}) SET p.celex = 'TEST', p.article = '1', p.title = 'Test article', p.text = 'Test', p.source = 'test://source'
     MERGE (r:PlaybookRule {id: $ruleId}) SET r.code = $ruleId, r.title = 'Test rule', r.requirement = 'Test requirement'
     MERGE (e:Episode {id: $episodeId}) SET e.kind = 'AGENT_ACTION', e.label = 'Test episode', e.createdAt = 0`,
    { provisionId, ruleId, episodeId }
  );
});

afterAll(async () => {
  await runWrite(`MATCH (n) WHERE n.id STARTS WITH $ns OR n.matterId = $ns DETACH DELETE n`, { ns: NS });
  await closeNeo4j();
});

async function makeTestClause(id: string): Promise<void> {
  await runWrite(
    `MERGE (c:Clause {id: $id}) SET c.ref = '1', c.heading = 'Test clause', c.text = 'Test clause text', c.matterId = $NS`,
    { id, NS }
  );
}

describe("assertFact", () => {
  const clauseId = `${NS}clause-assert`;

  it("creates an open current fact (expiredAt/invalidAt null)", async () => {
    await makeTestClause(clauseId);

    const { findingId, validAt, createdAt } = await assertFact({
      clauseId,
      finding: {
        status: "compliant",
        confidence: 0.9,
        riskScore: 0.1,
        consequenceScore: 0.1,
        triageScore: 0.1,
        summary: "Initial assessment",
      },
      citedProvisionIds: [provisionId],
      derivedFromEpisodeId: episodeId,
      validAt: 1000,
      createdAt: 1000,
    });

    expect(findingId).toBeTruthy();
    expect(validAt).toBe(1000);
    expect(createdAt).toBe(1000);

    const current = await getCurrentAssessment(clauseId);
    expect(current?.status).toBe("compliant");
    expect(current?.findingId).toBe(findingId);
  });
});

describe("supersedeFact", () => {
  const clauseId = `${NS}clause-supersede`;

  it("closes the old window instead of deleting it, and asserts the successor", async () => {
    await makeTestClause(clauseId);

    const first = await assertFact({
      clauseId,
      finding: {
        status: "compliant",
        confidence: 0.9,
        riskScore: 0.1,
        consequenceScore: 0.1,
        triageScore: 0.1,
        summary: "Believed compliant before the sub-processor update",
      },
      validAt: 2000,
      createdAt: 2000,
    });

    const second = await supersedeFact({
      clauseId,
      finding: {
        status: "non_compliant",
        confidence: 0.85,
        riskScore: 0.8,
        consequenceScore: 0.7,
        triageScore: 0.9,
        summary: "Flips non-compliant once the new sub-processor document lands",
      },
      deviations: [{ ruleCode: ruleId, explanation: "Sub-processor engaged without authorisation" }],
      validAt: 3000,
      createdAt: 3000,
    });

    expect(second.findingId).not.toBe(first.findingId);

    // The old edge must still exist (not deleted) with its window closed.
    const oldEdge = await runWrite(
      `MATCH (:Clause {id: $clauseId})-[r:ASSESSED_AS]->(f:Finding {id: $oldFindingId})
       RETURN r.expiredAt AS expiredAt, r.invalidAt AS invalidAt`,
      { clauseId, oldFindingId: first.findingId }
    );
    expect(oldEdge).toHaveLength(1);
    expect(oldEdge[0].get("expiredAt")).toBe(3000);
    expect(oldEdge[0].get("invalidAt")).toBe(3000);

    // The new edge must be open.
    const current = await getCurrentAssessment(clauseId);
    expect(current?.findingId).toBe(second.findingId);
    expect(current?.status).toBe("non_compliant");
  });
});

describe("snapshotAt", () => {
  const clauseId = `${NS}clause-snapshot`;

  it("returns the pre-supersession belief before T, and the post-supersession belief after T", async () => {
    await makeTestClause(clauseId);

    const before = await assertFact({
      clauseId,
      finding: {
        status: "compliant",
        confidence: 0.9,
        riskScore: 0.1,
        consequenceScore: 0.1,
        triageScore: 0.1,
        summary: "Before snapshot",
      },
      validAt: 1_000_000,
      createdAt: 1_000_000,
    });

    const after = await supersedeFact({
      clauseId,
      finding: {
        status: "non_compliant",
        confidence: 0.9,
        riskScore: 0.8,
        consequenceScore: 0.8,
        triageScore: 0.9,
        summary: "After snapshot",
      },
      validAt: 2_000_000,
      createdAt: 2_000_000,
    });

    const tBefore = await snapshotAt(1_500_000, { matterId: NS });
    const beforeEntry = tBefore.find((e) => e.clauseId === clauseId);
    expect(beforeEntry?.findingId).toBe(before.findingId);
    expect(beforeEntry?.status).toBe("compliant");

    const tAfter = await snapshotAt(2_500_000, { matterId: NS });
    const afterEntry = tAfter.find((e) => e.clauseId === clauseId);
    expect(afterEntry?.findingId).toBe(after.findingId);
    expect(afterEntry?.status).toBe("non_compliant");

    const tWayBefore = await snapshotAt(500_000, { matterId: NS });
    expect(tWayBefore.find((e) => e.clauseId === clauseId)).toBeUndefined();
  });
});

describe("traceFinding", () => {
  const clauseId = `${NS}clause-trace`;

  it("walks finding -> clause, relied-on provisions, deviations, and derived-from episodes", async () => {
    await makeTestClause(clauseId);

    const { findingId } = await assertFact({
      clauseId,
      finding: {
        status: "non_compliant",
        confidence: 0.8,
        riskScore: 0.7,
        consequenceScore: 0.7,
        triageScore: 0.8,
        summary: "Traced finding",
      },
      citedProvisionIds: [provisionId],
      deviations: [{ ruleCode: ruleId, explanation: "Missing audit rights clause" }],
      derivedFromEpisodeId: episodeId,
      validAt: 4000,
      createdAt: 4000,
    });

    const trace = await traceFinding(findingId);

    expect(trace.finding?.id).toBe(findingId);
    expect(trace.clause?.id).toBe(clauseId);
    expect(trace.provisions.map((p) => p.id)).toContain(provisionId);
    expect(trace.deviations.find((d) => d.rule.id === ruleId)?.explanation).toBe(
      "Missing audit rights clause"
    );
    expect(trace.episodes.map((e) => e.id)).toContain(episodeId);
    expect(trace.reviews).toHaveLength(0);
    expect(trace.signOffs).toHaveLength(0);
  });
});
