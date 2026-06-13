import { sendInvoiceEmail } from './email'

const BASE = 'https://api.billingo.hu/v3'

function apiHeaders() {
  return {
    'X-API-KEY': process.env.BILLINGO_API_KEY!,
    'Content-Type': 'application/json',
  }
}

async function createPartner(
  name: string,
  email: string,
  postCode?: string,
  city?: string,
  address?: string,
): Promise<number | null> {
  const res = await fetch(`${BASE}/partners`, {
    method: 'POST',
    headers: apiHeaders(),
    body: JSON.stringify({
      name,
      address: {
        country_code: 'HU',
        post_code: postCode || '0000',
        city: city || 'Magyarország',
        address: address || '–',
      },
      emails: [email],
    }),
  })
  if (!res.ok) return null
  const data = await res.json()
  return (data.id as number) ?? null
}

async function downloadInvoicePdf(documentId: number): Promise<Buffer | null> {
  // Billingo needs a moment to generate the PDF after document creation
  for (let attempt = 0; attempt < 4; attempt++) {
    await new Promise(r => setTimeout(r, 2000))
    const res = await fetch(`${BASE}/documents/${documentId}/download`, {
      headers: { 'X-API-KEY': process.env.BILLINGO_API_KEY! },
    })
    if (!res.ok) continue
    const arrayBuffer = await res.arrayBuffer()
    const buf = Buffer.from(arrayBuffer)
    // Verify it's a real, complete PDF (must start with %PDF-)
    if (buf.length > 1000 && buf.slice(0, 5).toString('ascii') === '%PDF-') return buf
  }
  return null
}

export async function createAndSendInvoice({
  customerName,
  customerEmail,
  tripTitle,
  amountHuf,
  billingPostCode,
  billingCity,
  billingAddress,
}: {
  customerName: string
  customerEmail: string
  tripTitle: string
  amountHuf: number
  billingPostCode?: string
  billingCity?: string
  billingAddress?: string
}): Promise<void> {
  if (!process.env.BILLINGO_API_KEY || !process.env.BILLINGO_BLOCK_ID) return

  try {
    const partnerId = await createPartner(customerName, customerEmail, billingPostCode, billingCity, billingAddress)
    if (!partnerId) return

    const today = new Date().toISOString().split('T')[0]
    const netPrice = Math.round((amountHuf / 1.27) * 100) / 100

    const docRes = await fetch(`${BASE}/documents`, {
      method: 'POST',
      headers: apiHeaders(),
      body: JSON.stringify({
        partner_id: partnerId,
        block_id: parseInt(process.env.BILLINGO_BLOCK_ID),
        type: 'invoice',
        fulfillment_date: today,
        due_date: today,
        payment_method: 'online_bankcard',
        language: 'hu',
        currency: 'HUF',
        paid: true,
        items: [
          {
            name: `${tripTitle} – Útvonalterv (PDF + interaktív térkép)`,
            unit_price: netPrice,
            unit_price_type: 'net',
            quantity: 1,
            unit: 'db',
            vat: '27%',
          },
        ],
      }),
    })

    if (!docRes.ok) return
    const doc = await docRes.json()
    const documentId = doc.id as number
    const invoiceNumber = (doc.invoice_number as string) ?? String(documentId)

    // Download PDF from Billingo, send via Resend (own domain, branded email)
    const pdfBuffer = await downloadInvoicePdf(documentId)
    if (!pdfBuffer || !process.env.RESEND_API_KEY) return

    await sendInvoiceEmail({
      to: customerEmail,
      customerName,
      tripTitle,
      amountHuf,
      invoiceNumber,
      pdfBuffer,
    })
  } catch {
    // Non-blocking — invoice failure never breaks the purchase flow
  }
}
