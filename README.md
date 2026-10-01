# Deposit Demo — Paysafe Checkout

A demo deposit website integrated with [Paysafe Checkout](https://developer.paysafe.com/en/api-docs/paysafe-checkout/overview/), following the [How Checkout Works](https://developer.paysafe.com/en/api-docs/paysafe-checkout/how-checkout-works/) integration guide.

**No Node.js required** — runs on Windows using built-in PowerShell.

## Features

- Landing page with deposit call-to-action
- Deposit page with customer details and amount selection
- Paysafe Checkout SDK (`paysafe.checkout.setup`) for secure hosted payment collection
- Server-side payment processing via the [Payments API](https://developer.paysafe.com/en/api-docs/paysafe-checkout/payments/)
- `resultCallback`, `closeCallback`, and `riskCallback` handlers as documented

## Prerequisites

- Windows with PowerShell 5.1+ (included with Windows)
- Paysafe test account with **public** and **private** API keys from the [Business Portal](https://developer.paysafe.com/en/api-docs/paysafe-checkout/before-you-begin/)

## Setup

1. Copy the environment template and add your API keys (if not already done):

   ```powershell
   copy .env.example .env
   ```

   Edit `.env` with your credentials:

   - `PAYSAFE_PUBLIC_USERNAME` / `PAYSAFE_PUBLIC_PASSWORD` — public API key (used by Checkout)
   - `PAYSAFE_PRIVATE_USERNAME` / `PAYSAFE_PRIVATE_PASSWORD` — private API key (server-side Payments API only)
   - `PAYSAFE_ENVIRONMENT` — `TEST` or `LIVE`
   - `PAYSAFE_CURRENCY` — e.g. `USD`
   - `PORT` — local server port (default `4000`)

2. Start the server — either option works:

   **Double-click** `start.bat`

   **Or from PowerShell:**

   ```powershell
   .\start.ps1
   ```

3. Open [http://localhost:4000](http://localhost:4000) and click **Make a Deposit**.

## How it works

1. **Client** loads the Paysafe Checkout SDK from `https://hosted.paysafe.com/checkout/v2/paysafe.checkout.min.js`
2. **Client** calls `paysafe.checkout.setup()` with your Base64-encoded public API key and checkout options
3. Customer completes payment in the hosted Checkout iframe
4. **resultCallback** receives the `paymentHandleToken` and sends it to your server
5. **Server** calls `POST /paymenthub/v1/payments` with your private API key to process the deposit
6. Checkout shows success or failure via `instance.showSuccessScreen()` / `instance.showFailureScreen()`

## Project structure

```
├── start.ps1           # PowerShell web server + Payments API proxy
├── start.bat           # Double-click launcher
├── public/
│   ├── index.html      # Home page
│   ├── deposit.html    # Deposit / payment page
│   ├── css/style.css
│   └── js/checkout.js  # Paysafe Checkout integration
├── .env                # Your API credentials (not committed)
└── .env.example
```

## Security notes

- Never expose your **private** API key in client-side code
- The public key is Base64-encoded on the server and passed to the client only for Checkout setup
- Use `TEST` environment and test cards until you are ready for production

## Documentation

- [Checkout Overview](https://developer.paysafe.com/en/api-docs/paysafe-checkout/overview/)
- [How Checkout Works](https://developer.paysafe.com/en/api-docs/paysafe-checkout/how-checkout-works/)
- [Process Payments](https://developer.paysafe.com/en/api-docs/paysafe-checkout/payments/)
