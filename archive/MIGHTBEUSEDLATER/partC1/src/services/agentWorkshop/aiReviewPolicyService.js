export function evaluateAiReviewRequirement({
  hasHumanReview = false,
  runtimeValidated = false,
  buildVerified = false
} = {}) {
  const blockers = [];
  if (!hasHumanReview) blockers.push('Human review is required.');
  if (!runtimeValidated) blockers.push('Runtime validation is required.');
  if (!buildVerified) blockers.push('Build verification is required.');
  return {
    passes: blockers.length === 0,
    blockers
  };
}

