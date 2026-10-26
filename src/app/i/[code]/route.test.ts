import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from './route';

const go = async (path: string) => {
  const code = path.split('/i/')[1].split('?')[0];
  const res = await GET(new NextRequest(`https://bittorrented.com${path}`), { params: Promise.resolve({ code }) });
  return { status: res.status, location: res.headers.get('location') };
};

describe('/i/<code>', () => {
  it('sends a stranger to sign up with the invite filled in', async () => {
    expect(await go('/i/abcde-fghjk')).toEqual({
      status: 307,
      location: 'https://bittorrented.com/signup?invite=ABCDE-FGHJK',
    });
  });

  it('carries a ?ref= along', async () => {
    expect((await go('/i/ABCDEFGHJK?ref=E6KETYBK')).location).toBe(
      'https://bittorrented.com/signup?invite=ABCDE-FGHJK&ref=E6KETYBK'
    );
  });

  it('sends a malformed code to the invite-only screen', async () => {
    expect((await go('/i/nope')).location).toBe('https://bittorrented.com/invite-only');
  });
});
