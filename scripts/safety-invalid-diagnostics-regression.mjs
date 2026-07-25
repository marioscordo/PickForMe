import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function loadSafetyVerifier() {
  const source = fs.readFileSync("apps/api/src/recommendation/recommendationSafetyVerifier.ts", "utf8").replace(/\r\n/g, "\n");
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022
    }
  }).outputText;
  const sandbox = {
    exports: {},
    require() {
      return {};
    }
  };
  vm.runInNewContext(transpiled, sandbox, { filename: "recommendationSafetyVerifier.js" });
  return sandbox.exports;
}

function baseCandidates(count = 2) {
  return Array.from({ length: count }, (_, index) => ({
    id: `candidate_${index}`,
    nameOriginal: `Candidate ${index}`,
    descriptionOriginal: index === 1 ? "contains lactose" : "plain tomato pasta"
  }));
}

const restrictions = [{ id: "allergen_0", type: "allergen", label: "Lactose" }];
const { filterSafeRecommendationCandidates } = loadSafetyVerifier();

function check({ name, candidates = baseCandidates(), response, callFailure, expected }) {
  const result = filterSafeRecommendationCandidates({
    restrictions,
    candidates,
    response,
    callFailure
  });

  for (const [key, value] of Object.entries(expected.diagnostics ?? {})) {
    assert(
      result.diagnostics[key] === value,
      `${name}: expected diagnostics.${key}=${value}, got ${result.diagnostics[key]}`
    );
  }

  if (expected.safeCount !== undefined) {
    assert(result.candidates.length === expected.safeCount, `${name}: safe candidate count mismatch`);
  }

  if (expected.validationReasons) {
    assert(
      JSON.stringify(result.validation.map((item) => item.reason ?? "safe")) === JSON.stringify(expected.validationReasons),
      `${name}: validation reasons mismatch`
    );
  }
}

check({
  name: "all safe",
  response: {
    candidates: baseCandidates().map((candidate) => ({
      candidateId: candidate.id,
      overallVerdict: "safe",
      checkedRestrictionIds: ["allergen_0"],
      matchedRestrictions: []
    }))
  },
  expected: {
    safeCount: 2,
    validationReasons: ["safe", "safe"],
    diagnostics: {
      safetyRequestedCandidateCount: 2,
      safetyReturnedCandidateIdCount: 2,
      safetyReturnedCheckCount: 0,
      safetyTruncatedOrIncompleteCount: 0
    }
  }
});

check({
  name: "all uncertain",
  response: {
    candidates: baseCandidates().map((candidate) => ({
      candidateId: candidate.id,
      overallVerdict: "uncertain",
      checkedRestrictionIds: ["allergen_0"],
      matchedRestrictions: [{ restrictionId: "allergen_0", verdict: "uncertain", evidence: null, source: null }]
    }))
  },
  expected: {
    safeCount: 0,
    validationReasons: ["uncertain", "uncertain"]
  }
});

check({
  name: "mixed verdicts",
  candidates: baseCandidates(3),
  response: {
    candidates: [
      { candidateId: "candidate_0", overallVerdict: "safe", checkedRestrictionIds: ["allergen_0"], matchedRestrictions: [] },
      { candidateId: "candidate_1", overallVerdict: "conflict", checkedRestrictionIds: ["allergen_0"], matchedRestrictions: [{ restrictionId: "allergen_0", verdict: "conflict", evidence: "lactose", source: "description" }] },
      { candidateId: "candidate_2", overallVerdict: "uncertain", checkedRestrictionIds: ["allergen_0"], matchedRestrictions: [{ restrictionId: "allergen_0", verdict: "uncertain" }] }
    ]
  },
  expected: {
    safeCount: 1,
    validationReasons: ["safe", "conflict", "uncertain"]
  }
});

check({
  name: "fewer checks than requested",
  response: {
    candidates: [
      { candidateId: "candidate_0", overallVerdict: "safe", checkedRestrictionIds: ["allergen_0"], matchedRestrictions: [] }
    ]
  },
  expected: {
    safeCount: 1,
    validationReasons: ["safe", "invalid_response"],
    diagnostics: {
      safetyMissingCandidateCount: 1,
      safetyTruncatedOrIncompleteCount: 1
    }
  }
});

check({
  name: "no checks",
  response: { candidates: [] },
  expected: {
    safeCount: 0,
    validationReasons: ["invalid_response", "invalid_response"],
    diagnostics: {
      safetyEmptyResponseCount: 1,
      safetyMissingCandidateCount: 2,
      safetyTruncatedOrIncompleteCount: 1
    }
  }
});

check({
  name: "duplicate candidate id",
  candidates: baseCandidates(1),
  response: {
    candidates: [
      { candidateId: "candidate_0", overallVerdict: "safe", checkedRestrictionIds: ["allergen_0"], matchedRestrictions: [] },
      { candidateId: "candidate_0", overallVerdict: "safe", checkedRestrictionIds: ["allergen_0"], matchedRestrictions: [] }
    ]
  },
  expected: {
    safeCount: 0,
    validationReasons: ["invalid_response"],
    diagnostics: {
      safetyDuplicateCandidateIdCount: 1,
      safetyUniqueReturnedCandidateIdCount: 1
    }
  }
});

check({
  name: "unknown candidate id",
  candidates: baseCandidates(1),
  response: {
    candidates: [
      { candidateId: "candidate_x", overallVerdict: "safe", checkedRestrictionIds: ["allergen_0"], matchedRestrictions: [] }
    ]
  },
  expected: {
    safeCount: 0,
    validationReasons: ["invalid_response"],
    diagnostics: {
      safetyUnknownCandidateIdCount: 1,
      safetyMissingCandidateCount: 1
    }
  }
});

check({
  name: "missing verdict",
  candidates: baseCandidates(1),
  response: {
    candidates: [
      { candidateId: "candidate_0", overallVerdict: "conflict", checkedRestrictionIds: ["allergen_0"], matchedRestrictions: [{ restrictionId: "allergen_0" }] }
    ]
  },
  expected: {
    safeCount: 0,
    validationReasons: ["invalid_response"],
    diagnostics: {
      safetyMissingVerdictCount: 1
    }
  }
});

check({
  name: "invalid verdict",
  candidates: baseCandidates(1),
  response: {
    candidates: [
      { candidateId: "candidate_0", overallVerdict: "conflict", checkedRestrictionIds: ["allergen_0"], matchedRestrictions: [{ restrictionId: "allergen_0", verdict: "maybe" }] }
    ]
  },
  expected: {
    safeCount: 0,
    validationReasons: ["invalid_response"],
    diagnostics: {
      safetyInvalidVerdictCount: 1
    }
  }
});

check({
  name: "invalid schema",
  candidates: baseCandidates(1),
  response: {
    candidates: [
      { candidateId: "candidate_0", overallVerdict: "safe", checkedRestrictionIds: null, matchedRestrictions: [] }
    ]
  },
  expected: {
    safeCount: 0,
    validationReasons: ["invalid_response"],
    diagnostics: {
      safetyInvalidSchemaCount: 1
    }
  }
});

check({
  name: "parse failure fallback",
  candidates: baseCandidates(1),
  response: { candidates: [] },
  callFailure: { safetyParseFailureCount: 1 },
  expected: {
    safeCount: 0,
    diagnostics: {
      safetyParseFailureCount: 1,
      safetyEmptyResponseCount: 1
    }
  }
});

check({
  name: "exception fallback",
  candidates: baseCandidates(1),
  response: { candidates: [] },
  callFailure: { safetyExceptionCount: 1 },
  expected: {
    safeCount: 0,
    diagnostics: {
      safetyExceptionCount: 1,
      safetyEmptyResponseCount: 1
    }
  }
});

check({
  name: "timeout fallback",
  candidates: baseCandidates(1),
  response: { candidates: [] },
  callFailure: { safetyTimeoutCount: 1 },
  expected: {
    safeCount: 0,
    diagnostics: {
      safetyTimeoutCount: 1,
      safetyEmptyResponseCount: 1
    }
  }
});

check({
  name: "structurally incomplete answer",
  candidates: baseCandidates(1),
  response: {
    candidates: [
      { candidateId: "candidate_0", overallVerdict: "safe", checkedRestrictionIds: [], matchedRestrictions: [] }
    ]
  },
  expected: {
    safeCount: 0,
    validationReasons: ["invalid_response"],
    diagnostics: {
      safetyInvalidSchemaCount: 1
    }
  }
});

const route = fs.readFileSync("apps/api/app/api/analyze-menu/route.ts", "utf8").replace(/\r\n/g, "\n");
const traceTypeStart = route.indexOf("type ProductionRequestTraceFields = {");
const traceTypeEnd = route.indexOf("};", traceTypeStart);
const traceType = route.slice(traceTypeStart, traceTypeEnd);
for (const forbidden of ["candidateId", "nameOriginal", "descriptionOriginal", "menuText", "sourceUrl", "userId", "email"]) {
  assert(!traceType.includes(`${forbidden}:`), `Trace type must not expose ${forbidden}`);
}
assert(route.includes("buildProductionSafetyTraceFields"), "Route must map safety diagnostics into the trace line");

const mainAi = fs.readFileSync("apps/api/src/ai/recommendMainDishesAI.ts", "utf8").replace(/\r\n/g, "\n");
assert((mainAi.match(/verifyRecommendationSafetyAI\(/g) ?? []).length === 1, "Must not add Safety-AI calls");
assert((mainAi.match(/client\.responses\.create\(/g) ?? []).length === 2, "Must keep exactly the Main-AI request and description repair request");

console.log("safety-invalid-diagnostics-regression: passed");
