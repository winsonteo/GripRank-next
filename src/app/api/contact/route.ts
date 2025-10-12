import type { NextRequest } from "next/server";
import nodemailer from "nodemailer";

export const runtime = "nodejs"; // Ensure Node runtime (not Edge) for nodemailer

export async function POST(req: NextRequest) {
  try {
    const { name, email, message } = await req.json();

    if (!name || !email || !message) {
      return new Response("Missing fields", { status: 400 });
    }

    // Basic email format check
    const emailOk = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email);
    if (!emailOk) return new Response("Invalid email", { status: 400 });

    // Create transporter with Zoho SMTP
    const transporter = nodemailer.createTransport({
      host: process.env.ZOHO_SMTP_HOST,
      port: Number(process.env.ZOHO_SMTP_PORT || 465),
      secure: String(process.env.ZOHO_SMTP_SECURE || "true") === "true",
      auth: {
        user: process.env.ZOHO_SMTP_USER,
        pass: process.env.ZOHO_SMTP_PASS,
      },
    });

    // Prepare email
    const to = process.env.CONTACT_TO || process.env.ZOHO_SMTP_USER!;
    const from = process.env.ZOHO_SMTP_USER!; // Must be your verified Zoho address
    const replyTo = email;

    const subject = `GripRank Contact — ${name}`;
    const text = `Name: ${name}\nEmail: ${email}\n\n${message}`;
    const html = `
      <div style="font-family:Inter,system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;line-height:1.5">
        <h2>New Contact Message</h2>
        <p><strong>Name:</strong> ${escapeHtml(name)}</p>
        <p><strong>Email:</strong> ${escapeHtml(email)}</p>
        <pre style="white-space:pre-wrap;background:#0b0b0b;color:#e5e5e5;padding:12px;border-radius:8px">${escapeHtml(message)}</pre>
      </div>
    `;

    await transporter.sendMail({ to, from, replyTo, subject, text, html });

    return new Response("OK", { status: 200 });
  } catch (err) {
    console.error("Contact API error:", err);
    return new Response("Email failed", { status: 500 });
  }
}

// prevent HTML injection in the email body
function escapeHtml(s: string) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
