import { describe, expect, it } from 'vitest';

import { authHeaders } from './config';

describe('authHeaders', () => {
  it('none → no headers', () => {
    expect(authHeaders({ kind: 'none' })).toEqual({});
  });
  it('bearer → Authorization Bearer', () => {
    expect(authHeaders({ kind: 'bearer', token: 'tok' })).toEqual({ Authorization: 'Bearer tok' });
  });
  it('header → custom header', () => {
    expect(authHeaders({ kind: 'header', header: 'X-Api-Key', token: 'k' })).toEqual({ 'X-Api-Key': 'k' });
  });
  it('basic → base64 Authorization', () => {
    const h = authHeaders({ kind: 'basic', user: 'u', pass: 'p' });
    expect(h.Authorization).toBe(`Basic ${Buffer.from('u:p').toString('base64')}`);
  });
});
