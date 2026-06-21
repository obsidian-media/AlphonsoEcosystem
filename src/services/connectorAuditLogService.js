import { invoke } from '@tauri-apps/api/core';
import { AGENTS, createAgentPacket, requestPacketRetry, sendPacketToDeadLetter, updatePacketStatus } from '../agentBusService';
import { appendSessionEvent } from '../sessionIntelligenceService';
import { TRUST_STATES, timestampMs } from '../trustModel';
import { createJoseCommandRoute } from '../joseCommandRouterService';
import { browserPollTelegram } from '../telegramBrowserConnector';
import { browserPollWhatsAppGateway } from '../whatsappBrowserConnector';
import {
  appendConnectorAudit,
  requireConnectorReady,
  verifyConnectorEnvironment
} from './connectorRegistry.js';
import {
  readAuthProfiles
} from './connectorAuth.js';

// ... rest of the file as originally provided
