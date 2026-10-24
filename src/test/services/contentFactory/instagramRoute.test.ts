// Phase 3c: Instagram through the Facebook Page, or through Instagram Login (the user chooses).
import { describe, it, expect, beforeEach, vi } from 'vitest';

const creds: Record<string, string> = {};
vi.mock('../../../services/connectors/connectorAuth', () => ({
  getConnectorCredential: (_id: string, key: string) => creds[key] || '',
}));

import { getInstagramRoute, setInstagramRoute } from '../../../services/contentFactory/instagramRoute';

beforeEach(() => {
  localStorage.clear();
  for (const k of Object.keys(creds)) delete creds[k];
});

const page = () => Object.assign(creds, { META_ACCESS_TOKEN: 't', INSTAGRAM_BUSINESS_ACCOUNT_ID: 'ig' });
const login = () => Object.assign(creds, { INSTAGRAM_LOGIN_TOKEN: 'lt', INSTAGRAM_LOGIN_USER_ID: 'u' });

it('null when neither is set up', async () => {
  expect(await getInstagramRoute()).toBeNull();
});

it('otherwise whichever is set up, the Page first', async () => {
  login();
  expect(await getInstagramRoute()).toBe('instagram_login');
  page();
  expect(await getInstagramRoute()).toBe('page');
});

it('the saved choice wins', async () => {
  page();
  login();
  setInstagramRoute('instagram_login');
  expect(await getInstagramRoute()).toBe('instagram_login');
  expect(localStorage.getItem('alphonso_instagram_route_v1')).toBe('instagram_login');
});
