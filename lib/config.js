function truthy(value) {
  return ["1", "true", "yes"].includes(String(value || "").toLowerCase());
}

function encodeBasic(user, pass) {
  if (!user || !pass) return null;
  return Buffer.from(`${user}:${pass}`, "utf8").toString("base64");
}

function getConfig() {
  const environment = (process.env.PAYSAFE_ENVIRONMENT || "TEST").toUpperCase();
  const currency = process.env.PAYSAFE_CURRENCY || "USD";
  const port = Number(process.env.PORT || 4000);
  const accountId = process.env.PAYSAFE_ACCOUNT_ID || null;

  const googlePayCountry = process.env.PAYSAFE_GOOGLEPAY_COUNTRY || "GB";
  const applePayCountry = process.env.PAYSAFE_APPLEPAY_COUNTRY || "GB";

  let applePaySupportedCountries = (process.env.PAYSAFE_APPLEPAY_SUPPORTED_COUNTRIES || "")
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
  if (applePaySupportedCountries.length === 0) {
    applePaySupportedCountries = [applePayCountry.toUpperCase()];
  }

  const publicUser = process.env.PAYSAFE_PUBLIC_USERNAME;
  const publicPass = process.env.PAYSAFE_PUBLIC_PASSWORD;
  const privateUser = process.env.PAYSAFE_PRIVATE_USERNAME;
  const privatePass = process.env.PAYSAFE_PRIVATE_PASSWORD;

  const apiKey = encodeBasic(publicUser, publicPass);
  const privateAuth = encodeBasic(privateUser, privatePass)
    ? `Basic ${encodeBasic(privateUser, privatePass)}`
    : null;

  const apiBase =
    environment === "LIVE"
      ? "https://api.paysafe.com"
      : "https://api.test.paysafe.com";

  return {
    port,
    environment,
    currency,
    accountId,
    googlePayAccountCc: process.env.PAYSAFE_GOOGLEPAY_ACCOUNT_CC || accountId,
    googlePayMerchantId:
      process.env.PAYSAFE_GOOGLEPAY_MERCHANT_ID || "012345678987654321",
    googlePayLabel: process.env.PAYSAFE_GOOGLEPAY_LABEL || "Deposit Demo",
    googlePayCountry,
    googlePayEnabled: truthy(process.env.PAYSAFE_GOOGLEPAY_ENABLED),
    applePayAccountId: process.env.PAYSAFE_APPLEPAY_ACCOUNT_ID || accountId,
    applePayLabel: process.env.PAYSAFE_APPLEPAY_LABEL || "Deposit Demo",
    applePayCountry,
    applePayColor: process.env.PAYSAFE_APPLEPAY_COLOR || "white-outline",
    applePayType: process.env.PAYSAFE_APPLEPAY_TYPE || "buy",
    applePaySupportedCountries,
    applePayEnabled: truthy(process.env.PAYSAFE_APPLEPAY_ENABLED),
    maxWithdrawal: Number(process.env.PAYSAFE_MAX_WITHDRAWAL || 50000),
    apiKey,
    privateAuth,
    apiBase,
  };
}

module.exports = { getConfig };
