import nodemailer from 'nodemailer'

// Create reusable transporter
function getTransporter() {
  const host = process.env.SMTP_HOST || 'smtp.gmail.com'
  const port = parseInt(process.env.SMTP_PORT || '587')
  const secure = process.env.SMTP_SECURE === 'true' || port === 465
  const user = process.env.SMTP_USER || ''
  const pass = process.env.SMTP_PASS || ''

  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: {
      user,
      pass,
    },
  })
}

interface SendEmailOptions {
  to: string
  subject: string
  html: string
}

export async function sendEmail({ to, subject, html }: SendEmailOptions): Promise<boolean> {
  try {
    const transporter = getTransporter()
    const fromName = process.env.SMTP_FROM_NAME || 'Darrell Soft'
    const fromEmail = process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER || ''

    await transporter.sendMail({
      from: `"${fromName}" <${fromEmail}>`,
      to,
      subject,
      html,
    })

    return true
  } catch (error) {
    console.error('Email sending error:', error)
    return false
  }
}

export function getPasswordResetEmailHtml(resetUrl: string, name: string): string {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f1f5f9;">
      <table role="presentation" style="width: 100%; border-collapse: collapse;">
        <tr>
          <td style="padding: 40px 0; text-align: center;">
            <table role="presentation" style="width: 480px; max-width: 100%; margin: 0 auto; border-collapse: collapse; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);">
              <!-- Header -->
              <tr>
                <td style="background: linear-gradient(135deg, #2563eb, #1d4ed8); padding: 32px 40px; text-align: center;">
                  <h1 style="margin: 0; color: #ffffff; font-size: 24px; font-weight: 700;">🔑 Reset Password</h1>
                </td>
              </tr>
              <!-- Body -->
              <tr>
                <td style="padding: 32px 40px;">
                  <p style="margin: 0 0 8px 0; font-size: 16px; color: #334155;">Halo <strong>${name}</strong>,</p>
                  <p style="margin: 0 0 24px 0; font-size: 14px; color: #64748b; line-height: 1.6;">
                    Kami menerima permintaan untuk mereset password akun Anda. Klik tombol di bawah ini untuk membuat password baru:
                  </p>
                  <table role="presentation" style="width: 100%; border-collapse: collapse;">
                    <tr>
                      <td style="text-align: center; padding: 8px 0;">
                        <a href="${resetUrl}" target="_blank" style="display: inline-block; background: linear-gradient(135deg, #2563eb, #1d4ed8); color: #ffffff; text-decoration: none; padding: 14px 36px; border-radius: 12px; font-size: 16px; font-weight: 600; letter-spacing: 0.3px;">
                          Reset Password
                        </a>
                      </td>
                    </tr>
                  </table>
                  <p style="margin: 24px 0 0 0; font-size: 13px; color: #94a3b8; line-height: 1.6;">
                    Tautan ini akan kedaluwarsa dalam <strong style="color: #475569;">1 jam</strong>. Jika Anda tidak meminta reset password, Anda bisa mengabaikan email ini — password Anda tidak akan berubah.
                  </p>
                </td>
              </tr>
              <!-- Footer -->
              <tr>
                <td style="background-color: #f8fafc; padding: 20px 40px; border-top: 1px solid #e2e8f0;">
                  <p style="margin: 0; font-size: 12px; color: #94a3b8; text-align: center;">
                    &copy; ${new Date().getFullYear()} Darrell Soft. All rights reserved.
                  </p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `
}
