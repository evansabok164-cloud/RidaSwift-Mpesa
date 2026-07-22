// api/callback.js
//
// Safaricom calls this URL automatically once the customer has entered
// their M-Pesa PIN (or cancelled / let it time out). This updates the
// matching payment record in Firestore, which the RidaSwift booking page
// is watching in real time — so the customer sees "Payment received!"
// without anyone needing to check manually.
//
// This URL must be publicly reachable over HTTPS — Safaricom cannot call
// a URL on your phone or a local computer. That's exactly what deploying
// this to Vercel gives you.

const admin = require('firebase-admin');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
    }),
  });
}

const db = admin.firestore();

module.exports = async (req, res) => {
  try {
    // Log every callback received
    console.log("========== M-Pesa Callback ==========");
    console.log("Time:", new Date().toISOString());
    console.log("Request Body:");
    console.log(JSON.stringify(req.body, null, 2));
    console.log("====================================");

    const callback = req.body && req.body.Body && req.body.Body.stkCallback;

    if (!callback) {
      console.log("Unexpected payload:", req.body);
      return res.status(400).json({ error: 'Unexpected payload shape' });
    }

    const { CheckoutRequestID, ResultCode, ResultDesc } = callback;

    const update = {
      status: ResultCode === 0 ? 'success' : 'failed',
      resultCode: ResultCode,
      resultDesc: ResultDesc,
      completedAt: Date.now(),
    };

    if (ResultCode === 0 && callback.CallbackMetadata) {
      const items = callback.CallbackMetadata.Item || [];

      const get = (name) => {
        const item = items.find(i => i.Name === name);
        return item ? item.Value : null;
      };

      update.mpesaReceipt = get('MpesaReceiptNumber');
      update.amountPaid = get('Amount');
      update.payerPhone = get('PhoneNumber');
      update.transactionDate = get('TransactionDate');
    }

    await db.collection('mpesaPayments')
      .doc(CheckoutRequestID)
      .set(update, { merge: true });

    console.log("Firestore updated successfully.");
    console.log("CheckoutRequestID:", CheckoutRequestID);

    return res.status(200).json({
      ResultCode: 0,
      ResultDesc: 'Accepted'
    });

  } catch (err) {
    console.error("Callback Error:", err);

    return res.status(200).json({
      ResultCode: 0,
      ResultDesc: 'Accepted'
    });
  }
};
