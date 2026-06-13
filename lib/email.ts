import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY!)

export async function sendInvoiceEmail({
  to,
  customerName,
  tripTitle,
  amountHuf,
  invoiceNumber,
  pdfBuffer,
}: {
  to: string
  customerName: string
  tripTitle: string
  amountHuf: number
  invoiceNumber: string
  pdfBuffer: Buffer
}): Promise<void> {
  const formattedAmount = amountHuf.toLocaleString('hu-HU')
  const firstName = customerName.split(' ').pop() ?? customerName

  await resend.emails.send({
    from: process.env.EMAIL_FROM ?? 'onboarding@resend.dev',
    to: process.env.EMAIL_TO_OVERRIDE ?? to,
    subject: `Számla — ${tripTitle}`,
    attachments: [
      {
        filename: `szamla-${invoiceNumber}.pdf`,
        content: pdfBuffer,
      },
    ],
    html: buildEmailHtml({ customerName, firstName, tripTitle, amountHuf: formattedAmount, invoiceNumber }),
  })
}

function buildEmailHtml({
  customerName,
  firstName,
  tripTitle,
  amountHuf,
  invoiceNumber,
}: {
  customerName: string
  firstName: string
  tripTitle: string
  amountHuf: string
  invoiceNumber: string
}) {
  return `<!DOCTYPE html>
<html lang="hu">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Számlád — VanLife Europe</title>
</head>
<body style="margin:0;padding:0;background:#f7f6f3;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">

  <!-- Wrapper -->
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f7f6f3;padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">

          <!-- Header -->
          <tr>
            <td style="background:#111111;border-radius:16px 16px 0 0;padding:36px 40px;">
              <p style="margin:0 0 4px 0;font-size:11px;letter-spacing:0.2em;text-transform:uppercase;color:#666666;">
                VanLife Europe
              </p>
              <p style="margin:0;font-size:22px;font-weight:900;color:#ffffff;letter-spacing:-0.5px;line-height:1.2;">
                Köszönjük a vásárlást.
              </p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="background:#ffffff;padding:36px 40px;">

              <p style="margin:0 0 24px 0;font-size:15px;color:#555555;line-height:1.6;">
                Szia ${firstName},
              </p>
              <p style="margin:0 0 32px 0;font-size:15px;color:#555555;line-height:1.6;">
                Sikeres vásárlásod számlája mellékelve. Az útvonaltervet a fiókodon
                keresztül bármikor eléred.
              </p>

              <!-- Order box -->
              <table width="100%" cellpadding="0" cellspacing="0" style="background:#f7f6f3;border-radius:12px;margin-bottom:32px;">
                <tr>
                  <td style="padding:24px 24px 0 24px;">
                    <p style="margin:0 0 16px 0;font-size:10px;letter-spacing:0.2em;text-transform:uppercase;color:#999999;">
                      Rendelés részletei
                    </p>
                  </td>
                </tr>
                <tr>
                  <td style="padding:0 24px;">
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="padding:10px 0;border-bottom:1px solid #e6e4df;">
                          <span style="font-size:13px;color:#999999;">Termék</span>
                        </td>
                        <td align="right" style="padding:10px 0;border-bottom:1px solid #e6e4df;">
                          <span style="font-size:13px;font-weight:600;color:#111111;">${tripTitle} — Útvonalterv</span>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:10px 0;border-bottom:1px solid #e6e4df;">
                          <span style="font-size:13px;color:#999999;">Számla</span>
                        </td>
                        <td align="right" style="padding:10px 0;border-bottom:1px solid #e6e4df;">
                          <span style="font-size:13px;color:#555555;">${invoiceNumber}</span>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:10px 0;border-bottom:1px solid #e6e4df;">
                          <span style="font-size:13px;color:#999999;">Vásárló</span>
                        </td>
                        <td align="right" style="padding:10px 0;border-bottom:1px solid #e6e4df;">
                          <span style="font-size:13px;color:#555555;">${customerName}</span>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:14px 0 0 0;">
                          <span style="font-size:14px;font-weight:700;color:#111111;">Összesen (ÁFÁ-val)</span>
                        </td>
                        <td align="right" style="padding:14px 0 0 0;">
                          <span style="font-size:18px;font-weight:900;color:#111111;">${amountHuf} Ft</span>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr><td style="height:24px;"></td></tr>
              </table>

              <!-- PDF note -->
              <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0ede7;border-radius:10px;margin-bottom:32px;">
                <tr>
                  <td style="padding:16px 20px;">
                    <p style="margin:0;font-size:13px;color:#777777;line-height:1.5;">
                      📎 &nbsp;A számla PDF formátumban csatolva érkezett ehhez az emailhez.
                    </p>
                  </td>
                </tr>
              </table>

              <!-- CTA -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:32px;">
                <tr>
                  <td align="center">
                    <a href="https://vanlifeeurope.hu/utazasok"
                       style="display:inline-block;background:#111111;color:#ffffff;font-size:13px;font-weight:700;text-decoration:none;padding:14px 32px;border-radius:100px;letter-spacing:0.02em;">
                      Útvonalak megtekintése →
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin:0;font-size:13px;color:#999999;line-height:1.6;">
                Kérdésed van? Írj nekünk:
                <a href="mailto:info@vanlifeeurope.hu" style="color:#111111;text-decoration:none;font-weight:600;">info@vanlifeeurope.hu</a>
              </p>

            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#f7f6f3;border-radius:0 0 16px 16px;padding:24px 40px;border-top:1px solid #e6e4df;">
              <p style="margin:0;font-size:11px;letter-spacing:0.15em;text-transform:uppercase;color:#bbbbbb;">
                VanLife Europe · vanlifeeurope.hu
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>

</body>
</html>`
}
