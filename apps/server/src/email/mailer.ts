import nodemailer, { type Transporter } from "nodemailer";
import type { FastifyBaseLogger } from "fastify";
import type { Env } from "../env.js";

// Password-reset email delivery (accounts plan). Provider-agnostic SMTP via
// nodemailer; deliberately NOT a general notification system -- email
// notifications remain an explicit non-goal (docs plan §14.2) and this
// module sends exactly one kind of message.

export interface Mailer {
  /** Sends the reset link, or performs the configured fallback. Never
   * throws for delivery problems -- the reset endpoint's response must stay
   * a generic 200 regardless (no account/email oracle). */
  sendPasswordResetEmail(input: { to: string; resetUrl: string }): Promise<void>;
}

export function isSmtpConfigured(env: Env): boolean {
  return env.SMTP_HOST !== undefined && env.EMAIL_FROM !== undefined;
}

/** Origin for links in outgoing email. The Vite dev origin fallback keeps
 * local flows working with zero configuration. */
export function appBaseUrl(env: Env): string {
  return env.APP_BASE_URL ?? "http://localhost:5173";
}

export function createMailer(env: Env, log: FastifyBaseLogger): Mailer {
  let transporter: Transporter | undefined;

  return {
    async sendPasswordResetEmail({ to, resetUrl }) {
      if (!isSmtpConfigured(env)) {
        if (env.NODE_ENV === "production") {
          // The user asked for a reset and nothing will arrive -- that is
          // an operational misconfiguration worth alarming on, not a
          // silent no-op. The URL itself is a credential: never log it in
          // production.
          log.error({ to }, "SMTP not configured; password reset email dropped");
        } else {
          // Dev/test convenience: the reset link IS the deliverable.
          log.info({ to, resetUrl }, "SMTP not configured; password reset link (dev only)");
        }
        return;
      }

      transporter ??= nodemailer.createTransport({
        host: env.SMTP_HOST,
        port: env.SMTP_PORT ?? 587,
        secure: (env.SMTP_PORT ?? 587) === 465,
        auth:
          env.SMTP_USER !== undefined
            ? { user: env.SMTP_USER, pass: env.SMTP_PASS ?? "" }
            : undefined,
      });

      try {
        await transporter.sendMail({
          from: env.EMAIL_FROM,
          to,
          subject: "Meld Masters password reset",
          text:
            "Someone (hopefully you) asked to reset the password for your " +
            "Meld Masters account.\n\n" +
            `Reset it here (link expires in 30 minutes):\n${resetUrl}\n\n` +
            "If you didn't ask for this, you can ignore this email -- your " +
            "password is unchanged.",
        });
      } catch (err) {
        log.error({ err, to }, "password reset email failed to send");
      }
    },
  };
}
