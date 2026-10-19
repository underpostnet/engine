/**
 * The public endpoint a game server reports to the registry: only a public https address passes,
 * and a loopback http address passes outside production. The engine dials the registry endpoints
 * for hot reloads, so a report never names an internal or unsafe destination.
 */
import { describe, expect, it } from 'vitest';
import { normalizePublicUrl } from '../../../src/api/cyberia-server-registry/cyberia-server-registry.service.js';

const production = { production: true };
const development = { production: false };

describe('a reported public endpoint', () => {
  it.each([
    ['https://server.cyberiaonline.com', 'https://server.cyberiaonline.com'],
    ['https://server.cyberiaonline.com/', 'https://server.cyberiaonline.com'],
    ['https://server.cyberiaonline.com/test', 'https://server.cyberiaonline.com/test'],
    ['https://server.cyberiaonline.com/test/', 'https://server.cyberiaonline.com/test'],
    [' https://SERVER.cyberiaonline.com:443/test ', 'https://server.cyberiaonline.com/test'],
  ])('keeps %s as %s', (raw, url) => {
    expect(normalizePublicUrl(raw, production)).toBe(url);
  });

  it.each([
    ['', 'empty'],
    ['not a url', 'malformed'],
    ['http://server.cyberiaonline.com', 'plain http'],
    ['ftp://server.cyberiaonline.com', 'another scheme'],
    ['https://user:pass@server.cyberiaonline.com', 'credentials'],
    ['https://server.cyberiaonline.com/test?x=1', 'a query'],
    ['https://server.cyberiaonline.com/test#x', 'a fragment'],
    ['https://server.cyberiaonline.com/a/b', 'a nested path'],
    ['https://10.0.0.7', 'an IP literal'],
    ['https://[fd00::1]', 'an IPv6 literal'],
    ['https://cyberia-server', 'a single-label name'],
    ['https://cyberia-server.default.svc', 'a cluster service name'],
    ['https://cyberia-server.default.svc.cluster.local', 'a cluster domain name'],
    ['https://localhost:8083', 'loopback in production'],
    [`https://server.cyberiaonline.com/${'x'.repeat(600)}`, 'an oversized value'],
  ])('refuses %s (%s)', (raw) => {
    expect(normalizePublicUrl(raw, production)).toBe('');
  });

  it('takes a loopback http endpoint outside production only', () => {
    expect(normalizePublicUrl('http://localhost:8083/test', development)).toBe('http://localhost:8083/test');
    expect(normalizePublicUrl('http://127.0.0.1:8083', development)).toBe('http://127.0.0.1:8083');
    expect(normalizePublicUrl('http://localhost:8083', production)).toBe('');
    expect(normalizePublicUrl('http://10.0.0.7:8083', development)).toBe('');
  });
});
