import { randomUUID } from "crypto";
import { runRead, runWrite } from "@/lib/neo4j";
import { now } from "@/lib/graph/ingestWriters";

export interface FindingProps {
  status: "compliant" | "partially_compliant" | "non_compliant" | "unclear";
  confidence: number;
  riskScore: number;
  consequenceScore: number;
  triageScore: number;
  summary: string;
}

export interface DeviationInput {
  ruleCode: string;
  explanation: string;
}

export interface AssertFactInput {
  clauseId: string;
  finding: FindingProps;
  citedProvisionIds?: string[];
  deviations?: DeviationInput[];
  /** One or more episodes this finding was derived from (e.g. the analysis run, and the document that triggered it). */
  derivedFromEpisodeId?: string | string[];
  /** When the fact became true in the world. Defaults to `createdAt`. */
  validAt?: number;
  /** When Quinn learned the fact. Defaults to now. */
  createdAt?: number;
}

export interface AssertFactResult {
  findingId: string;
  validAt: number;
  createdAt: number;
}

async function createFindingAndEdges(
  input: AssertFactInput,
  validAt: number,
  createdAt: number
): Promise<string> {
  const findingId = randomUUID();
  const f = input.finding;

  await runWrite(
    `MATCH (c:Clause {id: $clauseId})
     CREATE (nf:Finding {
       id: $findingId, status: $status, confidence: $confidence,
       riskScore: $riskScore, consequenceScore: $consequenceScore,
       triageScore: $triageScore, summary: $summary
     })
     CREATE (c)-[:ASSESSED_AS {validAt: $validAt, invalidAt: null, createdAt: $createdAt, expiredAt: null}]->(nf)`,
    {
      clauseId: input.clauseId,
      findingId,
      status: f.status,
      confidence: f.confidence,
      riskScore: f.riskScore,
      consequenceScore: f.consequenceScore,
      triageScore: f.triageScore,
      summary: f.summary,
      validAt,
      createdAt,
    }
  );

  for (const provisionId of input.citedProvisionIds ?? []) {
    await runWrite(
      `MATCH (f:Finding {id: $findingId}), (p:Provision {id: $provisionId})
       MERGE (f)-[:RELIES_ON]->(p)`,
      { findingId, provisionId }
    );
  }

  for (const deviation of input.deviations ?? []) {
    await runWrite(
      `MATCH (f:Finding {id: $findingId}), (r:PlaybookRule {id: $ruleCode})
       MERGE (f)-[:DEVIATES_FROM {explanation: $explanation}]->(r)`,
      { findingId, ruleCode: deviation.ruleCode, explanation: deviation.explanation }
    );
  }

  const episodeIds = input.derivedFromEpisodeId
    ? Array.isArray(input.derivedFromEpisodeId)
      ? input.derivedFromEpisodeId
      : [input.derivedFromEpisodeId]
    : [];
  for (const episodeId of episodeIds) {
    await runWrite(
      `MATCH (f:Finding {id: $findingId}), (e:Episode {id: $episodeId})
       MERGE (f)-[:DERIVED_FROM]->(e)`,
      { findingId, episodeId }
    );
  }

  return findingId;
}

/** Create the first current fact for a clause. Assumes no current ASSESSED_AS exists. */
export async function assertFact(input: AssertFactInput): Promise<AssertFactResult> {
  const createdAt = input.createdAt ?? now();
  const validAt = input.validAt ?? createdAt;
  const findingId = await createFindingAndEdges(input, validAt, createdAt);
  return { findingId, validAt, createdAt };
}

/**
 * Close whatever ASSESSED_AS edge is currently open for the clause (if any —
 * does not delete it, only closes its validity/belief windows) and assert the
 * successor fact.
 */
export async function supersedeFact(input: AssertFactInput): Promise<AssertFactResult> {
  const createdAt = input.createdAt ?? now();
  const validAt = input.validAt ?? createdAt;

  await runWrite(
    `MATCH (c:Clause {id: $clauseId})-[r:ASSESSED_AS]->(:Finding)
     WHERE r.expiredAt IS NULL
     SET r.expiredAt = $createdAt, r.invalidAt = $validAt`,
    { clauseId: input.clauseId, createdAt, validAt }
  );

  const findingId = await createFindingAndEdges(input, validAt, createdAt);
  return { findingId, validAt, createdAt };
}

export interface CurrentAssessment {
  findingId: string;
  status: string;
  validAt: number;
  createdAt: number;
}

/** The fact Quinn currently believes for a clause, or null if none asserted yet. */
export async function getCurrentAssessment(clauseId: string): Promise<CurrentAssessment | null> {
  const records = await runRead(
    `MATCH (c:Clause {id: $clauseId})-[r:ASSESSED_AS]->(f:Finding)
     WHERE r.expiredAt IS NULL
     RETURN f.id AS findingId, f.status AS status, r.validAt AS validAt, r.createdAt AS createdAt`,
    { clauseId }
  );
  if (records.length === 0) return null;
  const rec = records[0];
  return {
    findingId: rec.get("findingId"),
    status: rec.get("status"),
    validAt: rec.get("validAt"),
    createdAt: rec.get("createdAt"),
  };
}

export interface SnapshotEntry {
  clauseId: string;
  findingId: string;
  status: string;
  summary: string;
  triageScore: number;
  validAt: number;
  createdAt: number;
}

/** What Quinn believed — and knew — about every clause at instant T. */
export async function snapshotAt(t: number, opts: { matterId?: string } = {}): Promise<SnapshotEntry[]> {
  const records = await runRead(
    `MATCH (c:Clause)-[r:ASSESSED_AS]->(f:Finding)
     WHERE r.validAt <= $t AND (r.invalidAt IS NULL OR r.invalidAt > $t)
       AND r.createdAt <= $t AND (r.expiredAt IS NULL OR r.expiredAt > $t)
       AND ($matterId IS NULL OR c.matterId = $matterId)
     RETURN c.id AS clauseId, f.id AS findingId, f.status AS status, f.summary AS summary,
            f.triageScore AS triageScore, r.validAt AS validAt, r.createdAt AS createdAt`,
    { t, matterId: opts.matterId ?? null }
  );
  return records.map((rec) => ({
    clauseId: rec.get("clauseId"),
    findingId: rec.get("findingId"),
    status: rec.get("status"),
    summary: rec.get("summary"),
    triageScore: rec.get("triageScore"),
    validAt: rec.get("validAt"),
    createdAt: rec.get("createdAt"),
  }));
}

export interface FindingTrace {
  finding: Record<string, unknown> | null;
  clause: Record<string, unknown> | null;
  provisions: Record<string, unknown>[];
  deviations: { rule: Record<string, unknown>; explanation: string }[];
  episodes: Record<string, unknown>[];
  reviews: Record<string, unknown>[];
  signOffs: Record<string, unknown>[];
}

/** Finding -> relied-on provisions, deviations, derived-from episodes, reviews/sign-offs. */
export async function traceFinding(findingId: string): Promise<FindingTrace> {
  const records = await runRead(
    `MATCH (f:Finding {id: $findingId})
     OPTIONAL MATCH (c:Clause)-[:ASSESSED_AS]->(f)
     OPTIONAL MATCH (f)-[:RELIES_ON]->(p:Provision)
     OPTIONAL MATCH (f)-[dev:DEVIATES_FROM]->(rule:PlaybookRule)
     OPTIONAL MATCH (f)-[:DERIVED_FROM]->(e:Episode)
     OPTIONAL MATCH (rev:Review)-[:OF]->(f)
     OPTIONAL MATCH (so:SignOff)-[:ATTESTS]->(f)
     RETURN f AS finding, c AS clause,
            collect(DISTINCT p) AS provisions,
            collect(DISTINCT {rule: rule, explanation: dev.explanation}) AS deviations,
            collect(DISTINCT e) AS episodes,
            collect(DISTINCT rev) AS reviews,
            collect(DISTINCT so) AS signOffs`,
    { findingId }
  );

  if (records.length === 0) {
    return { finding: null, clause: null, provisions: [], deviations: [], episodes: [], reviews: [], signOffs: [] };
  }

  const rec = records[0];
  const finding = rec.get("finding");
  const clause = rec.get("clause");

  return {
    finding: finding ? finding.properties : null,
    clause: clause ? clause.properties : null,
    provisions: (rec.get("provisions") as { properties: Record<string, unknown> }[])
      .filter(Boolean)
      .map((n) => n.properties),
    deviations: (rec.get("deviations") as { rule: { properties: Record<string, unknown> } | null; explanation: string }[])
      .filter((d) => d.rule)
      .map((d) => ({ rule: d.rule!.properties, explanation: d.explanation })),
    episodes: (rec.get("episodes") as { properties: Record<string, unknown> }[])
      .filter(Boolean)
      .map((n) => n.properties),
    reviews: (rec.get("reviews") as { properties: Record<string, unknown> }[])
      .filter(Boolean)
      .map((n) => n.properties),
    signOffs: (rec.get("signOffs") as { properties: Record<string, unknown> }[])
      .filter(Boolean)
      .map((n) => n.properties),
  };
}
