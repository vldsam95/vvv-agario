const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const ROOT_DIR = path.resolve(__dirname, "../../../../");
const LOG_DIR = path.join(ROOT_DIR, "runtime", "logs");
const EVENTS_LOG_FILE = path.join(LOG_DIR, "connection-events.jsonl");
const IP_LOOKUP_TTL_MS = 24 * 60 * 60 * 1000;
const IP_LOOKUP_TIMEOUT_MS = 2500;
const IP_LOOKUP_CACHE_LIMIT = 2048;
const IP_LOOKUP_FAILURE_TTL_MS = 30 * 60 * 1000;
const NETWORK_LOOKUP_PROVIDERS = [
    {
        name: "api.ip.sb",
        url(ip) {
            return `https://api.ip.sb/geoip/${encodeURIComponent(ip)}`;
        },
        parse(body) {
            return {
                asn: body.asn,
                isp: body.isp,
                org: body.organization || body.asn_organization,
                asName: body.asn_organization,
                country: body.country,
                countryCode: body.country_code,
                source: "api.ip.sb",
            };
        },
    },
    {
        name: "ipapi.co",
        url(ip) {
            return `https://ipapi.co/${encodeURIComponent(ip)}/json/`;
        },
        parse(body) {
            return {
                asn: body.asn,
                isp: body.org,
                org: body.org,
                asName: body.org,
                country: body.country_name,
                countryCode: body.country_code,
                source: "ipapi.co",
            };
        },
    },
];
const networkProfileCache = new Map();
const failedNetworkLookups = new Map();
const pendingNetworkLookups = new Map();

function ensureLogDir() {
    fs.mkdirSync(LOG_DIR, {recursive: true});
    if (!fs.existsSync(EVENTS_LOG_FILE)) {
        fs.closeSync(fs.openSync(EVENTS_LOG_FILE, "a"));
    }
}

function createId(prefix = "diag") {
    return `${prefix}-${Date.now().toString(36)}-${crypto.randomBytes(4).toString("hex")}`;
}

function normalizeRequestId(value) {
    const text = String(value || "").trim();
    return /^[a-zA-Z0-9._:-]{6,128}$/.test(text) ? text : "";
}

function sanitizeText(value, maxLength = 200) {
    return String(value || "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, maxLength);
}

function sanitizeMultilineText(value, maxLength = 2000) {
    return String(value || "")
        .replace(/\r/g, "")
        .trim()
        .slice(0, maxLength);
}

function sanitizeInteger(value, min = 0, max = Number.MAX_SAFE_INTEGER) {
    const number = Number(value);
    if (!Number.isFinite(number)) return undefined;
    return Math.max(min, Math.min(max, Math.round(number)));
}

function shortenId(value, head = 8, tail = 4) {
    const text = sanitizeText(value, 128);
    if (!text) return "";
    if (text.length <= head + tail + 1) return text;
    return `${text.slice(0, head)}...${text.slice(-tail)}`;
}

function sanitizeUrl(value) {
    try {
        const parsed = new URL(String(value || "/"), "http://diagnostics.local");
        const queryFlags = [];
        if (parsed.searchParams.has("resume_id")) queryFlags.push("resume_id=present");
        if (parsed.searchParams.has("ws_ticket")) queryFlags.push("ws_ticket=present");
        return queryFlags.length ? `${parsed.pathname}?${queryFlags.join("&")}` : parsed.pathname;
    } catch (error) {
        return sanitizeText(String(value || "").split("?")[0], 200);
    }
}

function normalizeIp(value) {
    const text = String(value || "").trim();
    if (!text) return "";
    const first = text.split(",")[0].trim();
    if (!first) return "";
    if (first.startsWith("::ffff:")) return first.slice(7);
    if (/^\[.*\]:\d+$/.test(first)) return first.replace(/^\[(.*)\]:\d+$/, "$1");
    if (/^\d+\.\d+\.\d+\.\d+:\d+$/.test(first)) return first.replace(/:\d+$/, "");
    return first;
}

function isPrivateIp(ip) {
    if (!ip) return true;
    if (ip === "unknown") return true;
    if (ip === "::1" || ip === "127.0.0.1") return true;
    if (/^10\./.test(ip)) return true;
    if (/^192\.168\./.test(ip)) return true;
    if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(ip)) return true;
    if (/^169\.254\./.test(ip)) return true;
    if (/^fc/i.test(ip) || /^fd/i.test(ip)) return true;
    return false;
}

function trimCacheIfNeeded() {
    while (networkProfileCache.size > IP_LOOKUP_CACHE_LIMIT) {
        const firstKey = networkProfileCache.keys().next().value;
        if (!firstKey) break;
        networkProfileCache.delete(firstKey);
    }
    while (failedNetworkLookups.size > IP_LOOKUP_CACHE_LIMIT) {
        const firstKey = failedNetworkLookups.keys().next().value;
        if (!firstKey) break;
        failedNetworkLookups.delete(firstKey);
    }
}

function sanitizeNetworkProfile(rawProfile = {}) {
    return {
        asn: sanitizeText(rawProfile.asn, 32),
        isp: sanitizeText(rawProfile.isp, 120),
        org: sanitizeText(rawProfile.org, 120),
        asName: sanitizeText(rawProfile.asName, 120),
        country: sanitizeText(rawProfile.country, 64),
        countryCode: sanitizeText(rawProfile.countryCode, 16),
        source: sanitizeText(rawProfile.source, 32),
    };
}

function getCachedNetworkProfile(ip) {
    const normalizedIp = normalizeIp(ip);
    if (!normalizedIp || isPrivateIp(normalizedIp)) return null;
    const cached = networkProfileCache.get(normalizedIp);
    if (!cached) return null;
    if ((Date.now() - cached.updatedAt) > IP_LOOKUP_TTL_MS) {
        networkProfileCache.delete(normalizedIp);
        return null;
    }
    networkProfileCache.delete(normalizedIp);
    networkProfileCache.set(normalizedIp, cached);
    return cached.profile;
}

function hasRecentFailedLookup(ip) {
    const normalizedIp = normalizeIp(ip);
    if (!normalizedIp) return false;
    const failedAt = failedNetworkLookups.get(normalizedIp);
    if (!failedAt) return false;
    if ((Date.now() - failedAt) > IP_LOOKUP_FAILURE_TTL_MS) {
        failedNetworkLookups.delete(normalizedIp);
        return false;
    }
    return true;
}

async function fetchNetworkProfile(ip) {
    const normalizedIp = normalizeIp(ip);
    if (!normalizedIp || isPrivateIp(normalizedIp)) return null;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), IP_LOOKUP_TIMEOUT_MS);
    try {
        let lastError = "lookup_failed";
        for (const provider of NETWORK_LOOKUP_PROVIDERS) {
            const response = await fetch(provider.url(normalizedIp), {
                cache: "no-store",
                signal: controller.signal,
                headers: {
                    "Accept": "application/json",
                    "User-Agent": "AgarVVV-ConnectionDiagnostics/1.0",
                },
            });
            if (!response.ok) {
                lastError = `${provider.name}:http_${response.status}`;
                continue;
            }
            const body = await response.json();
            const profile = sanitizeNetworkProfile(provider.parse(body || {}));
            if (!profile.asn && !profile.isp && !profile.org) {
                lastError = `${provider.name}:empty_profile`;
                continue;
            }
            networkProfileCache.set(normalizedIp, {
                profile,
                updatedAt: Date.now(),
            });
            trimCacheIfNeeded();
            return profile;
        }
        throw new Error(lastError);
    } finally {
        clearTimeout(timeoutId);
    }
}

function enrichPayloadWithNetworkProfile(payload = {}) {
    const normalizedIp = normalizeIp(payload.ip);
    if (!normalizedIp) return payload;
    const profile = getCachedNetworkProfile(normalizedIp);
    if (!profile) return payload;
    return Object.assign({}, payload, {
        ip: normalizedIp,
        networkProfile: profile,
    });
}

function scheduleNetworkProfileLookup(payload = {}) {
    const normalizedIp = normalizeIp(payload.ip);
    if (!normalizedIp || isPrivateIp(normalizedIp)) return;
    if (getCachedNetworkProfile(normalizedIp) || pendingNetworkLookups.has(normalizedIp) || hasRecentFailedLookup(normalizedIp)) return;
    const startedAt = Date.now();
    const lookup = fetchNetworkProfile(normalizedIp).then((profile) => {
        if (!profile) return;
        failedNetworkLookups.delete(normalizedIp);
        logEvent("network_profile_resolved", {
            ip: normalizedIp,
            lookupMs: Math.max(0, Date.now() - startedAt),
            networkProfile: profile,
        });
    }).catch((error) => {
        failedNetworkLookups.set(normalizedIp, Date.now());
        trimCacheIfNeeded();
        logEvent("network_profile_lookup_failed", {
            ip: normalizedIp,
            lookupMs: Math.max(0, Date.now() - startedAt),
            error: sanitizeText(error?.message || error, 120),
        });
    }).finally(() => {
        pendingNetworkLookups.delete(normalizedIp);
    });
    pendingNetworkLookups.set(normalizedIp, lookup);
}

function logEvent(type, payload = {}) {
    ensureLogDir();
    const enrichedPayload = enrichPayloadWithNetworkProfile(payload);
    const line = JSON.stringify(Object.assign({
        ts: new Date().toISOString(),
        type: sanitizeText(type, 64) || "unknown",
    }, enrichedPayload)) + "\n";
    fs.appendFile(EVENTS_LOG_FILE, line, (error) => {
        if (error) {
            console.error("[ConnectionDiagnostics] Failed to write log:", error.message);
        }
    });
    scheduleNetworkProfileLookup(enrichedPayload);
}

module.exports = {
    LOG_DIR,
    EVENTS_LOG_FILE,
    createId,
    ensureLogDir,
    getCachedNetworkProfile,
    logEvent,
    normalizeRequestId,
    normalizeIp,
    sanitizeInteger,
    sanitizeMultilineText,
    sanitizeNetworkProfile,
    sanitizeText,
    sanitizeUrl,
    shortenId,
};
