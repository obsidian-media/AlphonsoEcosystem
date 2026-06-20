function readText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

export function normalizeInboundPayload(payload = {}) {
  const entries = payload?.entry || [];
  const messages = [];

  for (const entry of entries) {
    for (const change of entry?.changes || []) {
      const value = change?.value || {};
      const contacts = Array.isArray(value.contacts) ? value.contacts : [];
      const metaMessages = Array.isArray(value.messages) ? value.messages : [];
      for (const item of metaMessages) {
        messages.push({
          provider: 'whatsapp_cloud',
          messageId: readText(item?.id),
          from: readText(item?.from),
          to: readText(value?.metadata?.display_phone_number),
          text: readText(item?.text?.body || item?.caption || item?.button?.text),
          type: readText(item?.type) || 'text',
          timestamp: readText(item?.timestamp),
          contactName: readText(contacts[0]?.profile?.name),
          rawType: readText(item?.type)
        });
      }
    }
  }

  return messages;
}
