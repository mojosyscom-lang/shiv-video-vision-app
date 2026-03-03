import webpush from "web-push";

/**
 * ENV secrets:
 * - VAPID_PUBLIC_KEY
 * - VAPID_PRIVATE_KEY
 * - APP_BASE_URL
 *
 * KV bindings:
 * - SUBS_KV (device_id -> subscription JSON)
 * - JOBS_KV (job_id -> job JSON)
 */

function jsonRes(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}

function bad(msg, status = 400) {
  return jsonRes({ error: msg }, status);
}

async function readJson(req) {
  try {
    return await req.json();
  } catch {
    return null;
  }
}

async function sendPush_(env, subscription, payload) {
  webpush.setVapidDetails(
    env.APP_BASE_URL,
    env.VAPID_PUBLIC_KEY,
    env.VAPID_PRIVATE_KEY
  );

  await webpush.sendNotification(subscription, JSON.stringify(payload));
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return jsonRes({ ok: true });

    const url = new URL(request.url);
    const path = url.pathname;

    // Health
    if (request.method === "GET" && path === "/ping") {
      return jsonRes({ ok: true });
    }

    // Save subscription (device-specific)
    if (request.method === "POST" && path === "/subscribe") {
      const body = await readJson(request);
      if (!body) return bad("Invalid JSON");
      const device_id = String(body.device_id || "").trim();
      const subscription = body.subscription;

      if (!device_id) return bad("Missing device_id");
      if (!subscription || !subscription.endpoint) return bad("Missing subscription");

      await env.SUBS_KV.put(`dev:${device_id}`, JSON.stringify(subscription));
      return jsonRes({ ok: true });
    }

    // Test push
    if (request.method === "POST" && path === "/test") {
      const body = await readJson(request);
      if (!body) return bad("Invalid JSON");
      const device_id = String(body.device_id || "").trim();
      if (!device_id) return bad("Missing device_id");

      const subRaw = await env.SUBS_KV.get(`dev:${device_id}`);
      if (!subRaw) return bad("No subscription for this device. Enable notifications first.", 404);

      const subscription = JSON.parse(subRaw);

      const payload = {
        title: "Hotel CRM",
        body: "✅ Test notification working",
        url: "/?n=dashboard",
      };

      try {
        await sendPush_(env, subscription, payload);
        return jsonRes({ ok: true });
      } catch (e) {
        return bad("Push send failed: " + String(e && e.message ? e.message : e), 500);
      }
    }

    return bad("Not found", 404);
  },

  // Cron (we’ll use later for followup/booking reminders)
  async scheduled(event, env) {
    // For now: do nothing. We will add reminder scan in next step.
  },
};
