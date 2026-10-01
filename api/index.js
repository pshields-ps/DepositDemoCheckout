/**
 * Zero-dependency Node / Vercel serverless entry.
 * - Vercel: exports the request handler (no permanent listen()).
 * - Local: `node api/index.js` starts an HTTP server on PORT (default 4000).
 *
 * Loads .env from project root when present (same keys as start.ps1).
 */
const http = require("http");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");
const { getConfig } = require("../lib/config");
const {
  getCustomerProfile,
  saveCustomerProfile,
} = require("../lib/customers");
const { invokePaysafeApi } = require("../lib/paysafe");

loadEnvFile(path.join(__dirname, "..", ".env"));

const config = getConfig();
const publicDir = path.join(__dirname, "..", "public");

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx < 1) continue;
    const key = trimmed.slice(0, idx).trim();
    const val = trimmed.slice(idx + 1).trim();
    if (process.env[key] === undefined) process.env[key] = val;
  }
}

function sendJson(res, statusCode, body) {
  const json = JSON.stringify(body);
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(json);
}

function getMimeType(filePath) {
  switch (path.extname(filePath).toLowerCase()) {
    case ".html":
      return "text/html; charset=utf-8";
    case ".css":
      return "text/css; charset=utf-8";
    case ".js":
      return "application/javascript; charset=utf-8";
    case ".json":
      return "application/json; charset=utf-8";
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".svg":
      return "image/svg+xml";
    default:
      return "application/octet-stream";
  }
}

function sendFile(res, filePath) {
  const bytes = fs.readFileSync(filePath);
  res.statusCode = 200;
  res.setHeader("Content-Type", getMimeType(filePath));
  res.end(bytes);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    if (req.body !== undefined && req.body !== null) {
      if (typeof req.body === "string") return resolve(req.body);
      return resolve(JSON.stringify(req.body));
    }

    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

async function parseJsonBody(req) {
  const raw = await readBody(req);
  if (!raw) return {};
  return JSON.parse(raw);
}

async function handleApi(req, res, pathname, searchParams) {
  const method = req.method || "GET";

  if (pathname === "/api/health" && method === "GET") {
    return sendJson(res, 200, {
      status: "ok",
      environment: config.environment,
      configured: Boolean(config.apiKey && config.privateAuth),
    });
  }

  if (pathname === "/api/config" && method === "GET") {
    if (!config.apiKey) {
      return sendJson(res, 503, {
        error:
          "Paysafe public API credentials are not configured. Set env vars or copy .env.example to .env.",
      });
    }
    return sendJson(res, 200, {
      apiKey: config.apiKey,
      environment: config.environment,
      currency: config.currency,
      accountId: config.accountId,
      maxWithdrawalAmount: config.maxWithdrawal,
      googlePay: {
        enabled: config.googlePayEnabled,
        merchantId: config.googlePayMerchantId,
        label: config.googlePayLabel,
        country: config.googlePayCountry,
        accountCc: config.googlePayAccountCc,
        color: "black",
        type: "pay",
      },
      applePay: {
        enabled: config.applePayEnabled,
        accountId: config.applePayAccountId,
        label: config.applePayLabel,
        country: config.applePayCountry,
        color: config.applePayColor,
        type: config.applePayType,
        supportedCountries: config.applePaySupportedCountries,
      },
    });
  }

  if (pathname === "/api/customer-profile" && method === "GET") {
    const merchantCustomerId = searchParams.get("merchantCustomerId");
    if (!merchantCustomerId) {
      return sendJson(res, 400, {
        error: "merchantCustomerId query parameter is required.",
      });
    }
    const profile = getCustomerProfile(merchantCustomerId);
    return sendJson(res, 200, {
      merchantCustomerId,
      hasProfile: Boolean(profile),
      customerId: profile ? profile.customerId : null,
    });
  }

  if (pathname === "/api/single-use-customer-token" && method === "POST") {
    if (!config.privateAuth) {
      return sendJson(res, 503, {
        error: "Paysafe private API credentials are not configured.",
      });
    }

    let body;
    try {
      body = await parseJsonBody(req);
    } catch {
      return sendJson(res, 400, { error: "Invalid JSON body." });
    }

    if (!body.merchantCustomerId) {
      return sendJson(res, 400, { error: "merchantCustomerId is required." });
    }

    const profile = getCustomerProfile(String(body.merchantCustomerId));
    if (!profile?.customerId) {
      return sendJson(res, 404, {
        error:
          "No Paysafe customer profile found for this merchant customer ID.",
      });
    }

    try {
      const result = await invokePaysafeApi(
        config,
        "POST",
        `/paymenthub/v1/customers/${profile.customerId}/singleusecustomertokens`,
        {}
      );
      return sendJson(res, 200, {
        singleUseCustomerToken: result.singleUseCustomerToken,
        customerId: profile.customerId,
      });
    } catch (err) {
      return sendJson(res, err.status || 500, {
        error: err.message || "Failed to create single-use customer token.",
      });
    }
  }

  if (pathname === "/api/process-payment" && method === "POST") {
    if (!config.privateAuth) {
      return sendJson(res, 503, {
        error: "Paysafe private API credentials are not configured.",
      });
    }

    let body;
    try {
      body = await parseJsonBody(req);
    } catch {
      return sendJson(res, 400, { error: "Invalid JSON body." });
    }

    if (!body.paymentHandleToken || !body.amount || !body.merchantRefNum) {
      return sendJson(res, 400, {
        error: "paymentHandleToken, amount, and merchantRefNum are required.",
      });
    }

    const payload = {
      merchantRefNum: String(body.merchantRefNum),
      amount: Number(body.amount),
      currencyCode: config.currency,
      paymentHandleToken: String(body.paymentHandleToken),
      settleWithAuth: true,
      dupCheck: true,
      description: "Deposit Demo - Checkout payment",
    };

    if (body.customerOperation === "ADD" && body.merchantCustomerId) {
      const existingProfile = getCustomerProfile(String(body.merchantCustomerId));
      if (!existingProfile) {
        payload.merchantCustomerId = String(body.merchantCustomerId);
      }
    }

    try {
      const result = await invokePaysafeApi(
        config,
        "POST",
        "/paymenthub/v1/payments",
        payload
      );

      if (result.customerId && body.merchantCustomerId) {
        saveCustomerProfile(String(body.merchantCustomerId), result.customerId);
      }

      return sendJson(res, 200, {
        success: true,
        payment: result,
        paymentMethod: body.paymentMethod,
        customerId: result.customerId,
        multiUsePaymentHandleToken: result.multiUsePaymentHandleToken,
        cardSaved: body.customerOperation === "ADD",
      });
    } catch (err) {
      return sendJson(res, err.status || 500, {
        error: err.message || "Payment processing failed.",
        details: err.details || null,
        paymentMethod: body.paymentMethod,
      });
    }
  }

  if (pathname === "/api/process-withdrawal" && method === "POST") {
    if (!config.privateAuth) {
      return sendJson(res, 503, {
        error: "Paysafe private API credentials are not configured.",
      });
    }

    let body;
    try {
      body = await parseJsonBody(req);
    } catch {
      return sendJson(res, 400, { error: "Invalid JSON body." });
    }

    if (!body.paymentHandleToken || !body.amount || !body.merchantRefNum) {
      return sendJson(res, 400, {
        error: "paymentHandleToken, amount, and merchantRefNum are required.",
      });
    }

    const payload = {
      merchantRefNum: String(body.merchantRefNum),
      amount: Number(body.amount),
      currencyCode: config.currency,
      paymentHandleToken: String(body.paymentHandleToken),
      dupCheck: true,
      description: "Deposit Demo - Checkout withdrawal",
    };

    const apiPath =
      body.transactionType === "ORIGINAL_CREDIT"
        ? "/paymenthub/v1/originalcredits"
        : "/paymenthub/v1/standalonecredits";

    try {
      const result = await invokePaysafeApi(config, "POST", apiPath, payload);
      return sendJson(res, 200, {
        success: true,
        withdrawal: result,
        paymentMethod: body.paymentMethod,
        transactionType: body.transactionType,
      });
    } catch (err) {
      return sendJson(res, err.status || 500, {
        error: err.message || "Withdrawal processing failed.",
        details: err.details || null,
        paymentMethod: body.paymentMethod,
      });
    }
  }

  return sendJson(res, 404, { error: "Not Found" });
}

function serveStatic(res, pathname) {
  let relative = pathname === "/" ? "/index.html" : pathname;
  relative = decodeURIComponent(relative).replace(/^\/+/, "");
  const filePath = path.normalize(path.join(publicDir, relative));
  const resolvedPublic = path.resolve(publicDir);

  if (!filePath.startsWith(resolvedPublic) || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    res.statusCode = 404;
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.end("Not Found");
    return;
  }

  sendFile(res, filePath);
}

async function handler(req, res) {
  try {
    const host = req.headers.host || "localhost";
    const url = new URL(req.url || "/", `http://${host}`);
    const pathname = url.pathname;

    if (pathname.startsWith("/api/")) {
      await handleApi(req, res, pathname, url.searchParams);
      return;
    }

    serveStatic(res, pathname);
  } catch (err) {
    console.error(err);
    if (!res.headersSent) {
      sendJson(res, 500, { error: "Internal server error." });
    }
  }
}

module.exports = handler;

if (require.main === module) {
  const port = config.port;
  http.createServer((req, res) => {
    handler(req, res);
  }).listen(port, () => {
    console.log(`Deposit Demo running at http://localhost:${port}/`);
    console.log(`Paysafe environment: ${config.environment}`);
    if (!config.apiKey || !config.privateAuth) {
      console.warn(
        "Warning: Paysafe API credentials not set. Copy .env.example to .env"
      );
    }
  });
}
