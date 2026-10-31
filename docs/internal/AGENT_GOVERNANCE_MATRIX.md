# Agent Governance Matrix

## Core rule
You -> Jose (answer, or plan the request as steps) -> each step's agent does its work -> steps that ask wait for you -> Jose reports back (in Chat, on the Requests board, and on Telegram if paired).

## Agents and permission boundaries

One table decides what each agent may do: `src/services/jose/agentPermissionTable.ts` (Jose redesign phase 1, 2026-10-23). Every plan is checked against it before anything runs (`src/services/jose/stepGraph.ts`), and `src/services/agentContractService.ts` checks each packet's declared effects against it.

| Agent | Role | Effects allowed | Never |
|---|---|---|---|
| Jose | Orchestrator | read, write its own work, spend (only on a paid-model step) | run code, change project files, publish or send |
| Alphonso | Operator | read, write its own work, change project files, run code | spend, publish or send |
| Miya | Creator | read, write its own work; her paid media steps may spend | run code, change project files, publish or send |
| Hector | Research | read, write its own work | run code, change project files, spend, publish |
| Maria | Governance & Risk Lead (governance, risk and quality reviews) | read, write its own work | run code, change project files, spend, publish |
| Marcus | Distribution & Release Manager | read, write its own work, publish or send, spend | run code, change project files |
| Echo | Memory Historian | read, write its own work | run code, change project files, spend, publish |
| Sentinel | Security only | read, write its own work | run code, change project files, spend, publish |
| Nova | Analysis | read, write its own work | run code, change project files, spend, publish |

Each agent also has a list of task types it may take and ones it may never take (in the same table).

## Approval policy (by effect)
- Each step declares what it does; Jose adds whatever its action type implies, so a step can't dodge approval by under-declaring (`src/services/jose/joseEffects.ts`).
- **Spend, publish or send, and delete always ask**, even with Approval Mode off.
- Changing project files and running code ask according to Settings → General → What asks first; running code is asked per command, and commands that only read never ask.
- Zero-Cost Mode blocks paid/metered connectors.
- Connector allowlist/auth profile gates route/send permissions; Telegram and WhatsApp pairing need their allowlists.

## Where it runs
- Planning: `src/services/jose/josePlanner.ts`, checked by `stepGraph.ts`
- Routing into packets: `src/services/joseCommandRouterService.ts` (only Jose's own code calls it)
- Execution, approvals and carrying on: `src/services/joseExecutionEngineService.ts`
