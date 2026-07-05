#!/usr/bin/env node
/**
 * Adds your current public IP to a DigitalOcean Managed PostgreSQL "Trusted Sources" list.
 * Run when local dev gets ETIMEDOUT after your home/office IP changes.
 *
 * Required in .env:
 *   DIGITALOCEAN_API_TOKEN=...
 *   DO_DB_CLUSTER_ID=...   (Database cluster UUID from DO dashboard URL)
 *
 * Usage:
 *   npm run db:allow-my-ip
 */
import dotenv from 'dotenv';

dotenv.config();

const token = process.env.DIGITALOCEAN_API_TOKEN;
const clusterId = process.env.DO_DB_CLUSTER_ID;

async function fetchJson(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const text = await res.text();
  let body;
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { raw: text };
  }
  if (!res.ok) {
    const msg = body?.message || body?.id || res.statusText;
    throw new Error(`DigitalOcean API ${res.status}: ${msg}`);
  }
  return body;
}

async function getPublicIp() {
  const providers = [
    'https://api.ipify.org?format=json',
    'https://ifconfig.me/ip',
  ];

  for (const url of providers) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (!res.ok) continue;
      const text = (await res.text()).trim();
      if (url.includes('ipify')) {
        const data = JSON.parse(text);
        return data.ip;
      }
      if (/^\d{1,3}(\.\d{1,3}){3}$/.test(text)) return text;
    } catch {
      // try next provider
    }
  }
  throw new Error('Could not detect your public IP');
}

function normalizeRules(existingRules = []) {
  return existingRules
    .filter((rule) => rule?.type && rule?.value != null)
    .map((rule) => ({
      type: rule.type,
      value: String(rule.value),
    }));
}

async function main() {
  if (!token) {
    console.error('Missing DIGITALOCEAN_API_TOKEN in .env');
    console.error('Create one at: https://cloud.digitalocean.com/account/api/tokens');
    process.exit(1);
  }
  if (!clusterId) {
    console.error('Missing DO_DB_CLUSTER_ID in .env');
    console.error('Find it in DO → Databases → your cluster → URL contains the UUID');
    process.exit(1);
  }

  const myIp = await getPublicIp();
  console.log(`🌐 Your public IP: ${myIp}`);

  const firewall = await fetchJson(
    `https://api.digitalocean.com/v2/databases/${clusterId}/firewall`
  );
  const existing = normalizeRules(firewall?.rules || []);

  const alreadyAllowed = existing.some(
    (rule) => rule.type === 'ip_addr' && rule.value === myIp
  );
  if (alreadyAllowed) {
    console.log('✅ Your IP is already in Trusted Sources. No change needed.');
    return;
  }

  const rules = [
    ...existing,
    { type: 'ip_addr', value: myIp },
  ];

  await fetchJson(`https://api.digitalocean.com/v2/databases/${clusterId}/firewall`, {
    method: 'PUT',
    body: JSON.stringify({ rules }),
  });

  console.log(`✅ Added ${myIp} to DigitalOcean database Trusted Sources`);
  console.log('   Restart backend: npm run dev');
}

main().catch((err) => {
  console.error('❌', err.message);
  process.exit(1);
});
