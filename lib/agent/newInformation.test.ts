import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { writeFileSync, readFileSync, existsSync, unlinkSync } from "fs";
import { resolve } from "path";
import { runRead, runWrite, closeNeo4j } from "@/lib/neo4j";
import { assertFact, getCurrentAssessment } from "@/lib/graph/temporal";
import { applyNewInformation } from "@/lib/agent/newInformation";

/**
 * Exercises the real Phase 5 flow end-to-end (real Perplexity call, real graph
 * writes) against a namespaced test clause — never the real seed matters.
 * The update document path is fixed by applyNewInformation's design (it looks
 * for data/subprocessor-update.md), so this test backs up and restores
 * whatever is already there rather than risking a real user-provided file.
 */
const NS = "__test_newinfo__";
const clauseId = `${NS}clause-1`;
const UPDATE_PATH = resolve(__dirname, "..", "..", "data", "subprocessor-update.md");

let preExistingContent: string | null = null;

beforeAll(async () => {
  preExistingContent = existsSync(UPDATE_PATH) ? readFileSync(UPDATE_PATH, "utf-8") : null;
  writeFileSync(
    UPDATE_PATH,
    "TEST FIXTURE — not real legal content, written by lib/agent/newInformation.test.ts and removed in afterAll.\n" +
      "The vendor has engaged a new sub-processor in a third country without prior written authorisation from the controller."
  );

  await runWrite(
    `MERGE (c:Clause {id: $clauseId}) SET c.ref = '1', c.heading = 'Test sub-processing clause',
       c.text = 'The processor may engage sub-processors at its discretion.', c.matterId = $NS`,
    { clauseId, NS }
  );

  await assertFact({
    clauseId,
    finding: {
      status: "compliant",
      confidence: 0.8,
      riskScore: 0.2,
      consequenceScore: 0.2,
      triageScore: 0.2,
      summary: "Initial belief before the new sub-processor information arrived",
    },
    validAt: 1_000,
    createdAt: 1_000,
  });
});

afterAll(async () => {
  if (preExistingContent !== null) {
    writeFileSync(UPDATE_PATH, preExistingContent);
  } else if (existsSync(UPDATE_PATH)) {
    unlinkSync(UPDATE_PATH);
  }
  await runWrite(`MATCH (n) WHERE n.id STARTS WITH $ns OR n.matterId = $ns DETACH DELETE n`, { ns: NS });
  await closeNeo4j();
});

describe("applyNewInformation", () => {
  it(
    "ingests the document as an episode, re-analyzes with it in context, and supersedes the prior fact",
    async () => {
      const before = await getCurrentAssessment(clauseId);
      expect(before?.status).toBe("compliant");

      const result = await applyNewInformation(clauseId);

      expect(result.previousStatus).toBe("compliant");
      expect(result.findingId).toBeTruthy();

      const after = await getCurrentAssessment(clauseId);
      expect(after?.findingId).toBe(result.findingId);

      // Old edge closed, not deleted.
      const oldEdge = await runRead(
        `MATCH (:Clause {id: $clauseId})-[r:ASSESSED_AS]->(f:Finding) WHERE r.expiredAt IS NOT NULL
         RETURN count(*) AS n`,
        { clauseId }
      );
      expect(oldEdge[0].get("n").toNumber()).toBe(1);

      // The new finding cites both the document-ingestion episode and the re-analysis episode.
      const episodes = await runRead(
        `MATCH (f:Finding {id: $findingId})-[:DERIVED_FROM]->(e:Episode) RETURN e.id AS id`,
        { findingId: result.findingId }
      );
      const episodeIds = episodes.map((r) => r.get("id"));
      expect(episodeIds).toContain(result.documentEpisodeId);
      expect(episodeIds).toContain(result.agentEpisodeId);

      const docEpisode = await runRead(`MATCH (e:Episode {id: $id}) RETURN e.kind AS kind`, {
        id: result.documentEpisodeId,
      });
      expect(docEpisode[0].get("kind")).toBe("DOCUMENT_INGESTED");
    },
    30000
  );
});
