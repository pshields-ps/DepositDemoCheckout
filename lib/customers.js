const fs = require("fs");
const path = require("path");

/**
 * On Vercel the filesystem is read-only except /tmp, and /tmp is ephemeral.
 * Locally we keep the same data/customers.json behavior as start.ps1.
 */
function getCustomersFile() {
  if (process.env.VERCEL) {
    return path.join("/tmp", "customers.json");
  }
  return path.join(__dirname, "..", "data", "customers.json");
}

function getCustomerProfiles() {
  const file = getCustomersFile();
  if (!fs.existsSync(file)) return {};
  try {
    return JSON.parse(fs.readFileSync(file, "utf8") || "{}");
  } catch {
    return {};
  }
}

function saveCustomerProfile(merchantCustomerId, customerId) {
  const file = getCustomersFile();
  const dir = path.dirname(file);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const profiles = getCustomerProfiles();
  profiles[merchantCustomerId] = {
    customerId,
    updatedAt: new Date().toISOString(),
  };
  fs.writeFileSync(file, JSON.stringify(profiles, null, 2), "utf8");
}

function getCustomerProfile(merchantCustomerId) {
  const profiles = getCustomerProfiles();
  return profiles[merchantCustomerId] || null;
}

module.exports = {
  getCustomerProfile,
  saveCustomerProfile,
};
