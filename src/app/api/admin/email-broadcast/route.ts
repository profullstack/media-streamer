import { createEmailer } from "@profullstack/emailer";
import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { listAuthUserEmails, requireAdminUser } from "@/lib/admin";

function getFromAddress(): string {
  const fromEmail = process.env.EMAIL_FROM || "noreply@bittorrented.com";
  const fromName = process.env.EMAIL_FROM_NAME || "BitTorrented";
  return `${fromName} <${fromEmail}>`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function bodyToHtml(body: string): string {
  const paragraphs = body
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map((paragraph) => `<p>${escapeHtml(paragraph).replaceAll("\n", "<br>")}</p>`)
    .join("");

  return `
<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#0a0a0a;color:#f7f7f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
    <div style="max-width:640px;margin:0 auto;padding:32px 20px;">
      <div style="margin-bottom:24px;font-size:20px;font-weight:700;">BitTorrented</div>
      <div style="background:#171717;border:1px solid #2a2a2a;border-radius:12px;padding:28px;font-size:16px;line-height:1.6;color:#d4d4d4;">
        ${paragraphs}
      </div>
      <p style="margin:24px 0 0;font-size:12px;color:#737373;">You received this because you have a BitTorrented account.</p>
    </div>
  </body>
</html>`;
}

async function assertAdmin(request: NextRequest): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const user = await getAuthenticatedUser(request);
  if (!user) return { ok: false, status: 401, error: "Authentication required" };
  if (!(await requireAdminUser(user.id))) return { ok: false, status: 403, error: "Admin only" };
  return { ok: true };
}

export async function GET(request: NextRequest) {
  const admin = await assertAdmin(request);
  if (!admin.ok) return NextResponse.json({ error: admin.error }, { status: admin.status });

  const emails = await listAuthUserEmails();
  return NextResponse.json({ recipients: emails.length }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: NextRequest) {
  const admin = await assertAdmin(request);
  if (!admin.ok) return NextResponse.json({ error: admin.error }, { status: admin.status });

  const body = (await request.json().catch(() => null)) as {
    subject?: unknown;
    body?: unknown;
  } | null;
  const subject = typeof body?.subject === "string" ? body.subject.trim() : "";
  const text = typeof body?.body === "string" ? body.body.trim() : "";

  if (!subject) return NextResponse.json({ error: "Subject is required" }, { status: 400 });
  if (!text) return NextResponse.json({ error: "Email body is required" }, { status: 400 });

  const resendApiKey = process.env.RESEND_API_KEY;
  if (!resendApiKey) return NextResponse.json({ error: "RESEND_API_KEY is not configured" }, { status: 500 });

  const emails = await listAuthUserEmails();
  if (emails.length === 0) return NextResponse.json({ error: "No recipient emails found" }, { status: 400 });

  const emailer = createEmailer({ resendApiKey, defaultFrom: getFromAddress() });
  const result = await emailer.sendBulk({
    to: emails,
    subject,
    html: bodyToHtml(text),
    text,
    batchSize: 100,
    delayMs: 500,
  });

  return NextResponse.json({
    recipients: emails.length,
    sent: result.sent,
    failed: result.failed,
    errors: result.errors.slice(0, 10),
  });
}
