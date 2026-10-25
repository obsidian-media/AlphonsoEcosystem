// Limits for one research run (agent phase 1, owner 2026-10-25). Adjustable.
export const HECTOR_LIMITS = {
  /** Sources read (fetched) in one run, over every round. */
  maxSourcesRead: 20,
  /** Sub-questions a question is broken into. */
  maxSubQuestions: 5,
  /** Search queries per sub-question. */
  maxQueriesPerSubQuestion: 3,
  /** Follow-up rounds after the first: a local model under the tool-call size, else larger/paid. */
  followUpRoundsSmall: 2,
  followUpRoundsLarge: 3,
  /** Page text in one write-up, shared by the sources it reads. */
  pageBudgetSmall: 8000,
  pageBudgetLarge: 24000,
  /** Results a search round keeps. */
  resultsPerRound: 8,
  /** Characters of a source kept in the report in app storage; the rest is in a page file. */
  excerptChars: 600,
  /** A query Hector's model writes, and the fallback query from the request's words. */
  queryChars: 120,
  fallbackQueryChars: 150,
  /** Reports kept. */
  maxReports: 200,
};
