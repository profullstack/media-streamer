/**
 * The party's own chat.
 *
 * GET  /api/watch-party/chat?code=XXXXXX[&after=ISO] - lines, oldest first
 * POST /api/watch-party/chat {code, userId?, body}    - say something
 *
 * The room used to have no chat at all unless the host had connected a nixamp account
 * and put the party on nixamp: for everybody else the box read "No room yet" and stayed
 * disabled. This is the chat a party has from the moment it exists. When the host does
 * put the party on nixamp the page switches to that room (../nixamp), which reaches the
 * nixamp apps too.
 *
 * Reading takes the party code, which was the invitation. Writing takes being in the
 * party: the session's user, or the guest id a guest was given at join.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { validateChatMessage, validatePartyCode } from '@/lib/watch-party';
import { addPartyChat, getParty, readPartyChat, touchMember } from '../_store';

const cleanCode = (value: unknown): string | null => {
  const code = typeof value === 'string' ? value.trim().toUpperCase() : '';
  return code && validatePartyCode(code) ? code : null;
};

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const code = cleanCode(searchParams.get('code'));
  if (!code) return NextResponse.json({ error: 'A valid party code is required' }, { status: 400 });
  const party = await getParty(code);
  if (!party) return NextResponse.json({ error: 'Party not found' }, { status: 404 });
  const after = searchParams.get('after') ?? undefined;
  const messages = await readPartyChat(code, after && !Number.isNaN(Date.parse(after)) ? after : undefined);
  return NextResponse.json({ success: true, messages }, { headers: { 'cache-control': 'no-store' } });
}

interface ChatBody {
  code?: string;
  userId?: string;
  body?: string;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: ChatBody;
  try {
    body = (await request.json()) as ChatBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const code = cleanCode(body.code);
  if (!code) return NextResponse.json({ error: 'A valid party code is required' }, { status: 400 });

  const text = typeof body.body === 'string' ? body.body.trim() : '';
  if (!validateChatMessage(text)) {
    return NextResponse.json({ error: text ? 'That message is too long' : 'Say something' }, { status: 400 });
  }

  const user = await getCurrentUser();
  const party = await getParty(code);
  if (!party) return NextResponse.json({ error: 'Party not found' }, { status: 404 });
  if (party.state === 'ended') return NextResponse.json({ error: 'Party has ended' }, { status: 410 });
  if (party.settings.chatEnabled === false) {
    return NextResponse.json({ error: 'Chat is off for this party' }, { status: 403 });
  }

  // A guest id counts only for a guest member, so a signed-in member's name cannot be
  // borrowed by somebody who read their id off the member list.
  const claimed = typeof body.userId === 'string' && body.userId.startsWith('guest_') ? body.userId : undefined;
  const member = party.members.find((m) => m.id === (user?.id ?? claimed));
  if (!member) return NextResponse.json({ error: 'Join the party to chat' }, { status: 403 });

  touchMember(code, member.id);
  // Stored as typed and rendered as text by React, so nothing is escaped twice.
  const message = await addPartyChat(code, member.name, text);
  return NextResponse.json({ success: true, message });
}
