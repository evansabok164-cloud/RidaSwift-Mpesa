# RidaSwift M-Pesa Backend

Two small serverless functions that let customers pay by M-Pesa directly
in the RidaSwift app (STK Push / "Lipa na M-Pesa Online"), instead of
paying manually to the till number.

- `api/stkpush.js` — triggers the PIN prompt on the customer's phone
- `api/callback.js` — receives the result from Safaricom once they pay

## Deploy steps

1. **Create a new GitHub repo** (separate from your `ridaswift` site repo —
   this is backend code, not the website itself). Upload these files to it.
2. **Create a Vercel account** at vercel.com (free tier), sign in with
   GitHub, then "Add New Project" and import this new repo.
3. **Add environment variables** in Vercel: Project Settings ->
   Environment Variables. Add every variable listed in `.env.example`
   with its real value (see below for where each one comes from).
4. **Deploy.** Vercel gives you a URL like
   `https://ridaswift-mpesa.vercel.app`.
5. **Set the callback URL**: go back to Environment Variables, set
   `MPESA_CALLBACK_URL` to `https://<your-project>.vercel.app/api/callback`,
   then redeploy (Vercel needs a redeploy to pick up env var changes).

## Where each credential comes from

- `MPESA_CONSUMER_KEY` / `MPESA_CONSUMER_SECRET` — your existing RidaSwift
  app on the Daraja portal (My Apps page).
- `MPESA_SHORTCODE` / `MPESA_PASSKEY` — use the sandbox values in
  `.env.example` for testing. Real till credentials come later, once
  Safaricom approves production ("go live") access.
- `FIREBASE_PROJECT_ID` / `FIREBASE_CLIENT_EMAIL` / `FIREBASE_PRIVATE_KEY` —
  Firebase Console -> gear icon -> Project Settings -> Service Accounts ->
  "Generate new private key". This downloads a JSON file containing all
  three values.

## Testing

Once deployed with sandbox credentials, send a test request to
`https://<your-project>.vercel.app/api/stkpush` with a JSON body:

```json
{ "phone": "2547XXXXXXXX", "amount": 1, "bookingId": "test123" }
```

Safaricom's sandbox uses specific test phone numbers that simulate a
successful or failed payment — real phones won't actually receive a
prompt in sandbox mode.

## Next step (not yet done)

The RidaSwift booking form (`index.html`) doesn't call this yet — it
still just displays the till number for manual payment. Wiring the "Pay
Now" button to this backend, and showing a live "Payment received"
status using Firestore, is the next piece once this backend is deployed
and tested.
