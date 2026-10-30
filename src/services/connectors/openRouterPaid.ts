// OpenRouter (2026-10-30): the paid models offered in Settings → Approvals → Allow paid models.
// Prices come from OpenRouter's own list (USD per token, shown per million tokens), so nothing
// is typed in. Only models that answer in text, are not free, and have both prices listed: a
// model without a price can't be estimated, and a paid step always shows its estimate first.
// OpenRouter doesn't say which models the user's own provider keys serve, so none is marked.
import type { OpenRouterModel } from './openRouterConnector';

export interface PaidModelChoice {
  id: string;
  label: string;
  inputPerMillionUsd: number;
  outputPerMillionUsd: number;
}

const money = (n: number) => (n >= 0.01 || n === 0 ? n.toFixed(2) : String(Number(n.toPrecision(2))));

export function paidModelLabel(name: string, inputPerMillionUsd: number, outputPerMillionUsd: number): string {
  return `${name} ($${money(inputPerMillionUsd)} in, $${money(outputPerMillionUsd)} out per million tokens)`;
}

/** Per million tokens, without floating-point dust (0.000001 × 1e6 = 1). */
const perMillion = (perToken: number) => Math.round(perToken * 1e6 * 1e6) / 1e6;

export function paidModelChoices(models: OpenRouterModel[]): PaidModelChoice[] {
  return models
    // A `:batch` version is listed but can't answer a chat (checked live 2026-10-30).
    .filter((m) => !m.free && m.textOutput && !m.id.endsWith(':batch') && m.promptUsdPerToken !== null && m.completionUsdPerToken !== null)
    .filter((m) => (m.promptUsdPerToken as number) > 0 || (m.completionUsdPerToken as number) > 0)
    .map((m) => {
      const input = perMillion(m.promptUsdPerToken as number);
      const output = perMillion(m.completionUsdPerToken as number);
      return { id: m.id, label: paidModelLabel(m.name, input, output), inputPerMillionUsd: input, outputPerMillionUsd: output };
    })
    .sort((a, b) => a.label.localeCompare(b.label));
}
