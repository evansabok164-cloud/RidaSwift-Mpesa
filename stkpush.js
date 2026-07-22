// api/stkpush.js
//
// Called by the RidaSwift booking form when a customer taps "Pay Now".
// Talks to Safaricom's Daraja API to trigger the M-Pesa PIN prompt on the
// customer's phone, then records a "pending" payment in Firestore so the
// callback (api/callback.js) has something to update once the customer
// finishes entering their PIN.

const admin = require('firebase-admin');

// ── Firebase Admin setup (server-side, uses a service account — not the
// public client key used in the browser) ──
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      // Vercel env vars store newlines as literal "\n" — convert back.
      privateKey: (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
    }),
  });
}
const db = admin.firestore();

const MPESA_ENV = process.env.MPESA_ENV || 'sandbox'; // 'sandbox' or 'production'
const BASE_URL = MPESA_ENV === 'production'
  ? 'https://api.safaricom.co.ke'
  : 'https://sandbox.safaricom.co.ke';

function normalizePhone(phone) {
  let p = (phone || '').replace(/[^0-9]/g, '');
  if (p.startsWith('0')) p = '254' + p.slice(1);
  if (p.startsWith('7') || p.startsWith('1')) p = '254' + p; // e.g. 712345678
  return p;
}

async function getAccessToken() {
  const key = process.env.MPESA_CONSUMER_KEY;
  const secret = process.env.MPESA_CONSUMER_SECRET;
  const auth = Buffer.from(`${key}:${secret}`).toString('base64');
  const res = await fetch(`${BASE_URL}/oauth/v1/generate?grant_type=client_credentials`, {
    headers: { Authorization: `Basic ${auth}` },
  });
  if (!res.ok) throw new Error('Failed to get Safaricom access token: ' + (await res.text()));
  const data = await res.json();
  return data.access_token;
}

function timestampNow() {
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  return (
    d.getFullYear().toString() +
    pad(d.getMonth() + 1) +
    pad(d.getDate()) +
    pad(d.getHours()) +
    pad(d.getMinutes()) +
    pad(d.getSeconds())
  );
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const { phone, amount, bookingId, accountRef } = req.body || {};
    if (!phone || !amount) {
      res.status(400).json({ error: 'phone and amount are required' });
      return;
    }

    const shortcode = process.env.MPESA_SHORTCODE;
    const passkey = process.env.MPESA_PASSKEY;
    const timestamp = timestampNow();
    const password = Buffer.from(shortcode + passkey + timestamp).toString('base64');
    const normalizedPhone = normalizePhone(phone);

    const accessToken = await getAccessToken();

    // Till (Buy Goods) numbers use CustomerBuyGoodsOnline in production.
    // The shared public sandbox shortcode (174379) only works with
    // CustomerPayBillOnline, so this is switchable via env var.
    const transactionType = process.env.MPESA_TRANSACTION_TYPE || 'CustomerPayBillOnline';

    const stkRes = await fetch(`${BASE_URL}/mpesa/stkpush/v1/processrequest`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        BusinessShortCode: shortcode,
        Password: password,
        Timestamp: timestamp,
        TransactionType: transactionType,
        Amount: Math.round(amount),
        PartyA: normalizedPhone,
        PartyB: shortcode,
        PhoneNumber: normalizedPhone,
        CallBackURL: process.env.MPESA_CALLBACK_URL,
        AccountReference: accountRef || 'RidaSwift',
        TransactionDesc: 'RidaSwift booking payment',
      }),
    });

    const stkData = await stkRes.json();

    if (!stkRes.ok || stkData.ResponseCode !== '0') {
      res.status(502).json({ error: 'STK push failed', detail: stkData });
      return;
    }

    // Record a pending payment so the callback can find and update it.
    await db.collection('mpesaPayments').doc(stkData.CheckoutRequestID).set({
      status: 'pending',
      bookingId: bookingId || null,
      phone: normalizedPhone,
      amount: Math.round(amount),
      merchantRequestId: stkData.MerchantRequestID,
      checkoutRequestId: stkData.CheckoutRequestID,
      createdAt: Date.now(),
    });

    res.status(200).json({
      success: true,
      checkoutRequestId: stkData.CheckoutRequestID,
      merchantRequestId: stkData.MerchantRequestID,
    });
  } catch (err) {
    console.error('stkpush error:', err);
    res.status(500).json({ error: 'Internal error', detail: String(err) });
  }
};
