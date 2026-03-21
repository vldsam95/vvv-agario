const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const DEFAULT_TTL_MS = 45 * 1000;
const SECRET_BYTES = 32;

function normalizeIp(ip) {
    const value = String(ip || "").trim();
    if (!value) return "unknown";
    const first = value.split(",")[0].trim();
    if (!first) return "unknown";
    if (first.startsWith("::ffff:")) return first.slice(7);
    if (/^\[.*\]:\d+$/.test(first)) {
        return first.replace(/^\[(.*)\]:\d+$/, "$1");
    }
    if (/^\d+\.\d+\.\d+\.\d+:\d+$/.test(first)) {
        return first.replace(/:\d+$/, "");
    }
    return first;
}

function getClientIp(headers = {}, fallback) {
    const forwarded = headers["x-forwarded-for"];
    if (typeof forwarded === "string" && forwarded.trim()) {
        return normalizeIp(forwarded);
    }
    return normalizeIp(fallback);
}

function hashUserAgent(userAgent) {
    return crypto
        .createHash("sha256")
        .update(String(userAgent || ""))
        .digest("hex");
}

function ensureSecret(filePath) {
    const target = path.resolve(filePath);
    const fallback = crypto.randomBytes(SECRET_BYTES).toString("hex");
    try {
        if (fs.existsSync(target)) {
            const raw = JSON.parse(fs.readFileSync(target, "utf8"));
            if (raw && typeof raw.secret === "string" && raw.secret.length >= SECRET_BYTES * 2) {
                return raw.secret;
            }
        }
    } catch (error) {
        // Regenerate below if the secret file is unreadable.
    }
    const value = {
        secret: fallback,
        createdAt: new Date().toISOString(),
    };
    fs.mkdirSync(path.dirname(target), {recursive: true});
    try {
        fs.writeFileSync(target, JSON.stringify(value, null, 2) + "\n", {flag: "wx"});
    } catch (error) {
        if (error.code !== "EEXIST") throw error;
    }
    try {
        const raw = JSON.parse(fs.readFileSync(target, "utf8"));
        if (raw && typeof raw.secret === "string" && raw.secret.length >= SECRET_BYTES * 2) {
            return raw.secret;
        }
    } catch (error) {
        // Fall back to the freshly generated in-memory secret only for this process.
    }
    return fallback;
}

function signPayload(secret, payload) {
    return crypto
        .createHmac("sha256", secret)
        .update(payload)
        .digest("base64url");
}

function issueTicket(options = {}) {
    const secret = String(options.secret || "");
    const now = Number(options.now || Date.now());
    const ttlMs = Math.max(1000, Number(options.ttlMs || DEFAULT_TTL_MS));
    const payload = JSON.stringify({
        exp: now + ttlMs,
        ip: normalizeIp(options.ip),
        ua: hashUserAgent(options.userAgent),
        nonce: crypto.randomBytes(8).toString("base64url"),
    });
    const payloadEncoded = Buffer.from(payload).toString("base64url");
    const signature = signPayload(secret, payloadEncoded);
    return {
        ticket: `${payloadEncoded}.${signature}`,
        expiresAt: new Date(now + ttlMs).toISOString(),
    };
}

function verifyTicket(options = {}) {
    const secret = String(options.secret || "");
    const token = String(options.ticket || "");
    const allowIpMismatch = options.allowIpMismatch === true;
    const parts = token.split(".");
    if (parts.length !== 2 || !parts[0] || !parts[1]) return false;
    const expected = signPayload(secret, parts[0]);
    const actual = parts[1];
    const expectedBuffer = Buffer.from(expected);
    const actualBuffer = Buffer.from(actual);
    if (expectedBuffer.length !== actualBuffer.length) return false;
    if (!crypto.timingSafeEqual(expectedBuffer, actualBuffer)) return false;
    let payload;
    try {
        payload = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8"));
    } catch (error) {
        return false;
    }
    if (!payload || typeof payload !== "object") return false;
    if (!Number.isFinite(payload.exp) || payload.exp <= Number(options.now || Date.now())) return false;
    if (!allowIpMismatch && payload.ip !== normalizeIp(options.ip)) return false;
    if (payload.ua !== hashUserAgent(options.userAgent)) return false;
    return true;
}

module.exports = {
    DEFAULT_TTL_MS,
    ensureSecret,
    getClientIp,
    hashUserAgent,
    issueTicket,
    normalizeIp,
    verifyTicket,
};
