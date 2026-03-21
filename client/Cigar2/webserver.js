const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const express = require("express");
const helmet = require("helmet");
const multer = require("multer");
const sharp = require("sharp");

const runtimeStore = require("./app/runtime-store");
const RuntimeDefaults = require("../../server/MultiOgarII/src/modules/runtime");
const WsTicket = require("../../server/MultiOgarII/src/modules/WsTicket");
const ConnectionDiagnostics = require("../../server/MultiOgarII/src/modules/ConnectionDiagnostics");

const app = express();
const sessions = new Map();
const ADMIN_PUBLIC_PATH = "/adminvs/";
const LEGACY_ADMIN_PREFIX = "/admin";
const PUBLIC_SKIN_UPLOAD_DAILY_LIMIT = 3;
const WS_TICKET_PUBLIC_PATH = "/api/public/ws-ticket";
const CONNECTION_REPORT_PUBLIC_PATH = "/api/public/connection-report";
const WS_TICKET_SECRET = WsTicket.ensureSecret(runtimeStore.FILES.wsTicketSecret);
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 1024 * 1024,
        files: 1,
    },
});

runtimeStore.ensureSkinDirectory();
runtimeStore.syncSkinList();

app.disable("x-powered-by");
app.set("trust proxy", 1);
app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: false,
}));
app.use(express.json({limit: "1mb"}));
app.use(express.urlencoded({extended: false}));
app.use((req, res, next) => {
    if (req.path === "/runtime-config.js" || req.path.startsWith("/api/")) {
        res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
        res.setHeader("Pragma", "no-cache");
        res.setHeader("Expires", "0");
    }
    next();
});
app.use((req, res, next) => {
    req.requestId = ConnectionDiagnostics.normalizeRequestId(req.headers["x-request-id"])
        || ConnectionDiagnostics.createId("http");
    res.setHeader("X-Request-ID", req.requestId);
    if (!isConnectionDiagnosticPath(req.path)) {
        next();
        return;
    }
    const startedAt = Date.now();
    res.on("finish", () => {
        ConnectionDiagnostics.logEvent("http_public_request", {
            requestId: req.requestId,
            method: req.method,
            path: ConnectionDiagnostics.sanitizeUrl(req.originalUrl || req.url || req.path),
            status: res.statusCode,
            durationMs: Math.max(0, Date.now() - startedAt),
            ip: getClientIp(req),
            cfCountry: ConnectionDiagnostics.sanitizeText(req.headers["cf-ipcountry"], 16),
            origin: ConnectionDiagnostics.sanitizeText(req.headers.origin, 240),
            referer: ConnectionDiagnostics.sanitizeText(req.headers.referer, 240),
            userAgent: ConnectionDiagnostics.sanitizeText(req.headers["user-agent"], 240),
        });
    });
    next();
});

function readRuntimeBundle() {
    const modePresets = RuntimeDefaults.normalizePresets(
        runtimeStore.readJson(runtimeStore.FILES.modePresets, RuntimeDefaults.DEFAULT_MODE_PRESETS)
    );
    const serverSettings = RuntimeDefaults.ensureActivePreset(
        RuntimeDefaults.normalizeServerSettings(
            runtimeStore.readJson(runtimeStore.FILES.serverSettings, RuntimeDefaults.DEFAULT_SERVER_SETTINGS)
        ),
        modePresets
    );
    const botSettings = RuntimeDefaults.normalizeBotSettings(
        runtimeStore.readJson(runtimeStore.FILES.botSettings, RuntimeDefaults.DEFAULT_BOT_SETTINGS)
    );
    return {
        admin: runtimeStore.readJson(runtimeStore.FILES.admin, {}),
        serverSettings,
        modePresets,
        botSettings,
        serverState: runtimeStore.readJson(runtimeStore.FILES.state, {}),
        skins: runtimeStore.readSkinList(),
    };
}

function buildServerOptions(serverSettings, state, activePreset) {
    const entries = [];
    const seen = new Set();
    const primaryValue = serverSettings.publicWsEndpoint || "/ws";
    const primaryLabel = state.presetLabel || activePreset?.label || serverSettings.serverName || "Arena";
    const fallbackLabel = primaryValue === "/ws" ? primaryLabel : "Direct /ws Fallback";

    function push(label, value) {
        const nextValue = typeof value === "string" ? value.trim() : "";
        if (!nextValue || seen.has(nextValue)) return;
        seen.add(nextValue);
        entries.push({label, value: nextValue});
    }

    push(primaryLabel, primaryValue);
    push(fallbackLabel, "/ws");
    return entries;
}

async function persistSkinUpload(file, requestedName, maxBytes) {
    if (!file || !file.buffer) {
        return {status: 400, body: {error: "missing_file"}};
    }
    if (file.size > (maxBytes || 314572)) {
        return {status: 400, body: {error: "file_too_large"}};
    }
    const baseName = runtimeStore.sanitizeSkinName(requestedName || path.parse(file.originalname).name) || "skin";
    const slug = `${baseName}-${crypto.randomBytes(3).toString("hex")}`;
    const outputPath = path.join(runtimeStore.SKINS_DIR, `${slug}.png`);
    try {
        const image = sharp(file.buffer, {failOn: "error"});
        const metadata = await image.metadata();
        if (!metadata.format || !["png", "jpeg"].includes(metadata.format)) {
            return {status: 400, body: {error: "png_jpg_jpeg_only"}};
        }
        await image
            .resize(512, 512, {fit: "inside", withoutEnlargement: true})
            .png({compressionLevel: 9})
            .toFile(outputPath);
        runtimeStore.addSkin(slug);
        return {
            status: 201,
            body: {
                skin: slug,
                url: `/skins/${slug}.png`,
            },
        };
    } catch (error) {
        if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
        return {status: 400, body: {error: "invalid_image"}};
    }
}

function parseCookies(req) {
    const raw = req.headers.cookie || "";
    return raw.split(";").reduce((accumulator, part) => {
        const [key, ...value] = part.trim().split("=");
        if (!key) return accumulator;
        accumulator[key] = decodeURIComponent(value.join("="));
        return accumulator;
    }, {});
}

function setSessionCookie(res, token, secure) {
    const flags = [
        `agarvvv_admin=${encodeURIComponent(token)}`,
        "Path=/",
        "HttpOnly",
        "SameSite=Strict",
        "Max-Age=43200",
    ];
    if (secure) flags.push("Secure");
    res.setHeader("Set-Cookie", flags.join("; "));
}

function clearSessionCookie(res) {
    res.setHeader("Set-Cookie", "agarvvv_admin=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0");
}

function verifyPassword(password, admin) {
    if (!admin || !admin.salt || !admin.passwordHash) return false;
    const expected = Buffer.from(admin.passwordHash, "hex");
    const actual = crypto.scryptSync(String(password || ""), admin.salt, expected.length);
    return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

function createRateLimiter(windowMs, max) {
    const entries = new Map();
    return (req, res, next) => {
        const key = getClientIp(req);
        const now = Date.now();
        const entry = entries.get(key);
        if (!entry || now - entry.windowStart > windowMs) {
            entries.set(key, {windowStart: now, count: 1});
            return next();
        }
        if (entry.count >= max) {
            return res.status(429).json({error: "rate_limited"});
        }
        entry.count++;
        next();
    };
}

function getQuotaDayKey(now = new Date()) {
    return now.toISOString().slice(0, 10);
}

function getQuotaResetAt(dayKey) {
    const reset = new Date(`${dayKey}T00:00:00.000Z`);
    reset.setUTCDate(reset.getUTCDate() + 1);
    return reset.toISOString();
}

function normalizePublicSkinQuotaState(raw, now = new Date()) {
    const dayKey = getQuotaDayKey(now);
    if (!raw || typeof raw !== "object" || raw.dayKey !== dayKey || typeof raw.entries !== "object") {
        return {dayKey, entries: {}};
    }
    const entries = {};
    for (const [ip, value] of Object.entries(raw.entries)) {
        if (!ip) continue;
        const count = Math.max(0, Math.min(PUBLIC_SKIN_UPLOAD_DAILY_LIMIT, Number(value?.count) || 0));
        if (!count) continue;
        entries[ip] = {
            count,
            updatedAt: typeof value?.updatedAt === "string" ? value.updatedAt : now.toISOString(),
        };
    }
    return {dayKey, entries};
}

function readPublicSkinQuotaState(now = new Date()) {
    return normalizePublicSkinQuotaState(
        runtimeStore.readJson(runtimeStore.FILES.publicSkinQuota, null),
        now
    );
}

function writePublicSkinQuotaState(state) {
    runtimeStore.writeJson(runtimeStore.FILES.publicSkinQuota, state);
}

function getClientIp(req) {
    return WsTicket.getClientIp(req.headers, req.ip || req.socket?.remoteAddress || "unknown");
}

function setNoStoreHeaders(res) {
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    res.setHeader("Clear-Site-Data", "\"cache\"");
}

function isConnectionDiagnosticPath(pathname) {
    return pathname === "/runtime-config.js"
        || pathname === "/api/public/config"
        || pathname === "/api/public/state"
        || pathname === "/api/public/skins"
        || pathname === WS_TICKET_PUBLIC_PATH
        || pathname === CONNECTION_REPORT_PUBLIC_PATH;
}

function sanitizeBoolean(value) {
    if (value === true || value === false) return value;
    return undefined;
}

function sanitizePublicConnectionReport(req) {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const ws = body.ws && typeof body.ws === "object" ? body.ws : {};
    const ticket = body.ticket && typeof body.ticket === "object" ? body.ticket : {};
    const client = body.client && typeof body.client === "object" ? body.client : {};
    const network = body.network && typeof body.network === "object" ? body.network : {};
    return {
        diagId: ConnectionDiagnostics.normalizeRequestId(body.diagId)
            || ConnectionDiagnostics.createId("client"),
        reportVersion: ConnectionDiagnostics.sanitizeText(body.reportVersion, 48),
        connectionIntent: ConnectionDiagnostics.sanitizeText(body.connectionIntent, 24),
        stage: ConnectionDiagnostics.sanitizeText(body.stage, 48),
        severity: ConnectionDiagnostics.sanitizeText(body.severity, 24),
        title: ConnectionDiagnostics.sanitizeText(body.title, 120),
        message: ConnectionDiagnostics.sanitizeText(body.message, 240),
        detailsText: ConnectionDiagnostics.sanitizeMultilineText(body.detailsText, 1800),
        page: ConnectionDiagnostics.sanitizeText(body.page, 180),
        sessionId: ConnectionDiagnostics.shortenId(body.sessionId),
        ui: {
            status: ConnectionDiagnostics.sanitizeText(body.ui?.status, 32),
            visibleNotice: sanitizeBoolean(body.ui?.visibleNotice),
        },
        ws: {
            target: ConnectionDiagnostics.sanitizeText(ws.target, 200),
            candidate: ConnectionDiagnostics.sanitizeText(ws.candidate, 200),
            closeCode: ConnectionDiagnostics.sanitizeInteger(ws.closeCode, 0, 4999),
            closeReason: ConnectionDiagnostics.sanitizeText(ws.closeReason, 200),
            opened: sanitizeBoolean(ws.opened),
            stable: sanitizeBoolean(ws.stable),
            readyState: ConnectionDiagnostics.sanitizeInteger(ws.readyState, 0, 4),
            candidateIndex: ConnectionDiagnostics.sanitizeInteger(ws.candidateIndex, 1, 20),
            candidateCount: ConnectionDiagnostics.sanitizeInteger(ws.candidateCount, 1, 20),
        },
        ticket: {
            requestId: ConnectionDiagnostics.normalizeRequestId(ticket.requestId),
            result: ConnectionDiagnostics.sanitizeText(ticket.result, 48),
            attempts: ConnectionDiagnostics.sanitizeInteger(ticket.attempts, 0, 20),
            timeoutMs: ConnectionDiagnostics.sanitizeInteger(ticket.timeoutMs, 0, 120000),
            expiresAt: ConnectionDiagnostics.sanitizeText(ticket.expiresAt, 48),
        },
        client: {
            online: sanitizeBoolean(client.online),
            language: ConnectionDiagnostics.sanitizeText(client.language, 32),
            visibilityState: ConnectionDiagnostics.sanitizeText(client.visibilityState, 24),
            userAgent: ConnectionDiagnostics.sanitizeText(client.userAgent || req.headers["user-agent"], 240),
        },
        network: {
            effectiveType: ConnectionDiagnostics.sanitizeText(network.effectiveType, 24),
            rtt: ConnectionDiagnostics.sanitizeInteger(network.rtt, 0, 60000),
            downlinkMbps: Number.isFinite(Number(network.downlinkMbps))
                ? Math.max(0, Math.min(10000, Number(network.downlinkMbps)))
                : undefined,
        },
    };
}

function getPublicSkinQuotaInfo(req, now = new Date()) {
    const state = readPublicSkinQuotaState(now);
    const ip = getClientIp(req);
    const count = state.entries[ip]?.count || 0;
    return {
        state,
        ip,
        count,
        limit: PUBLIC_SKIN_UPLOAD_DAILY_LIMIT,
        remaining: Math.max(0, PUBLIC_SKIN_UPLOAD_DAILY_LIMIT - count),
        resetAt: getQuotaResetAt(state.dayKey),
    };
}

function incrementPublicSkinQuota(quotaInfo, now = new Date()) {
    const state = quotaInfo?.state || readPublicSkinQuotaState(now);
    const ip = quotaInfo?.ip || "unknown";
    const nextCount = Math.max(0, Math.min(PUBLIC_SKIN_UPLOAD_DAILY_LIMIT, (quotaInfo?.count || 0) + 1));
    state.entries[ip] = {
        count: nextCount,
        updatedAt: now.toISOString(),
    };
    writePublicSkinQuotaState(state);
    return {
        ip,
        count: nextCount,
        limit: PUBLIC_SKIN_UPLOAD_DAILY_LIMIT,
        remaining: Math.max(0, PUBLIC_SKIN_UPLOAD_DAILY_LIMIT - nextCount),
        resetAt: getQuotaResetAt(state.dayKey),
    };
}

function requireAdmin(req, res, next) {
    const token = parseCookies(req).agarvvv_admin;
    if (!token || !sessions.has(token)) {
        return res.status(401).json({error: "unauthorized"});
    }
    const session = sessions.get(token);
    if (session.expiresAt < Date.now()) {
        sessions.delete(token);
        return res.status(401).json({error: "session_expired"});
    }
    session.expiresAt = Date.now() + 12 * 60 * 60 * 1000;
    req.adminSession = session;
    next();
}

function isSecureRequest(req) {
    return req.secure || req.headers["x-forwarded-proto"] === "https";
}

function buildRuntimeConfig(req) {
    const bundle = readRuntimeBundle();
    const serverSettings = bundle.serverSettings || {};
    const state = bundle.serverState || {};
    const activePreset = bundle.modePresets.presets?.[serverSettings.activePreset] || null;
    return {
        defaultWsEndpoint: serverSettings.publicWsEndpoint || "/ws",
        publicTitle: serverSettings.publicTitle || serverSettings.serverName || "AgarVVV Arena",
        publicSubtitle: serverSettings.publicSubtitle || "Custom MultiOgar server",
        allowSkinUpload: !!serverSettings.allowSkinUpload,
        skinUploadMaxBytes: serverSettings.skinUploadMaxBytes || 314572,
        skinUploadDailyLimit: PUBLIC_SKIN_UPLOAD_DAILY_LIMIT,
        maxSkinCount: runtimeStore.MAX_SKINS,
        serverEnabled: serverSettings.serverEnabled !== false,
        serverRestartMinutes: serverSettings.serverRestart || 0,
        multiControlMaxPilots: serverSettings.multiControlMaxPilots || 2,
        wsTicketEndpoint: WS_TICKET_PUBLIC_PATH,
        connectionReportEndpoint: CONNECTION_REPORT_PUBLIC_PATH,
        activePresetLabel: state.presetLabel || activePreset?.label || "Arena",
        servers: buildServerOptions(serverSettings, state, activePreset),
        adminPath: ADMIN_PUBLIC_PATH,
        now: new Date().toISOString(),
    };
}

app.get("/health", (req, res) => {
    res.json({ok: true});
});

app.get("/runtime-config.js", (req, res) => {
    res.type("application/javascript");
    res.send(`window.AGAR_CONFIG = ${JSON.stringify(buildRuntimeConfig(req), null, 2)};`);
});

app.get("/api/public/config", (req, res) => {
    res.json(buildRuntimeConfig(req));
});

app.get("/api/public/state", (req, res) => {
    res.json(readRuntimeBundle().serverState || {});
});

app.get("/api/public/skins", (req, res) => {
    const skins = runtimeStore.readSkinList();
    res.json({
        skins,
        total: skins.length,
        maxSkins: runtimeStore.MAX_SKINS,
    });
});

app.get(WS_TICKET_PUBLIC_PATH, createRateLimiter(60 * 1000, 60), (req, res) => {
    const ticket = WsTicket.issueTicket({
        secret: WS_TICKET_SECRET,
        ip: getClientIp(req),
        userAgent: req.headers["user-agent"] || "",
    });
    ConnectionDiagnostics.logEvent("ws_ticket_issued", {
        requestId: req.requestId,
        ip: getClientIp(req),
        cfCountry: ConnectionDiagnostics.sanitizeText(req.headers["cf-ipcountry"], 16),
        userAgent: ConnectionDiagnostics.sanitizeText(req.headers["user-agent"], 240),
        expiresAt: ticket.expiresAt,
    });
    res.json(ticket);
});

app.post(CONNECTION_REPORT_PUBLIC_PATH, createRateLimiter(60 * 1000, 30), (req, res) => {
    const report = sanitizePublicConnectionReport(req);
    ConnectionDiagnostics.logEvent("client_connection_report", {
        requestId: req.requestId,
        ip: getClientIp(req),
        cfCountry: ConnectionDiagnostics.sanitizeText(req.headers["cf-ipcountry"], 16),
        origin: ConnectionDiagnostics.sanitizeText(req.headers.origin, 240),
        referer: ConnectionDiagnostics.sanitizeText(req.headers.referer, 240),
        report,
    });
    res.json({
        ok: true,
        requestId: req.requestId,
        diagId: report.diagId,
        receivedAt: new Date().toISOString(),
    });
});

app.post("/api/public/skins", createRateLimiter(10 * 60 * 1000, 5), upload.single("skin"), async (req, res) => {
    const bundle = readRuntimeBundle();
    if (!bundle.serverSettings.allowSkinUpload) {
        return res.status(403).json({error: "skin_upload_disabled"});
    }
    const quotaInfo = getPublicSkinQuotaInfo(req);
    if (quotaInfo.remaining <= 0) {
        return res.status(429).json({
            error: "daily_skin_quota_reached",
            limit: quotaInfo.limit,
            remaining: quotaInfo.remaining,
            resetAt: quotaInfo.resetAt,
        });
    }
    if (bundle.skins.length >= runtimeStore.MAX_SKINS) {
        return res.status(409).json({
            error: "skin_limit_reached",
            maxSkins: runtimeStore.MAX_SKINS,
        });
    }
    const result = await persistSkinUpload(
        req.file,
        req.body?.name,
        bundle.serverSettings.skinUploadMaxBytes || 314572
    );
    if (result.status === 201) {
        const updatedQuota = incrementPublicSkinQuota(quotaInfo);
        result.body.dailyUploadLimit = updatedQuota.limit;
        result.body.remainingDailyUploads = updatedQuota.remaining;
        result.body.resetAt = updatedQuota.resetAt;
    }
    return res.status(result.status).json(result.body);
});

app.post("/api/admin/login", createRateLimiter(15 * 60 * 1000, 10), (req, res) => {
    const admin = runtimeStore.readJson(runtimeStore.FILES.admin, {});
    if (req.body.username !== admin.username || !verifyPassword(req.body.password, admin)) {
        return res.status(401).json({error: "invalid_credentials"});
    }
    const token = crypto.randomBytes(32).toString("hex");
    sessions.set(token, {
        username: admin.username,
        expiresAt: Date.now() + 12 * 60 * 60 * 1000,
    });
    setSessionCookie(res, token, isSecureRequest(req));
    res.json({ok: true, username: admin.username});
});

app.post("/api/admin/logout", (req, res) => {
    const token = parseCookies(req).agarvvv_admin;
    if (token) sessions.delete(token);
    clearSessionCookie(res);
    res.json({ok: true});
});

app.get("/api/admin/session", (req, res) => {
    const token = parseCookies(req).agarvvv_admin;
    if (!token || !sessions.has(token)) {
        return res.json({authenticated: false});
    }
    const session = sessions.get(token);
    if (session.expiresAt < Date.now()) {
        sessions.delete(token);
        clearSessionCookie(res);
        return res.json({authenticated: false});
    }
    res.json({authenticated: true, username: session.username});
});

app.get("/api/admin/settings", requireAdmin, (req, res) => {
    const bundle = readRuntimeBundle();
    res.json({
        serverSettings: bundle.serverSettings,
        modePresets: bundle.modePresets,
        botSettings: bundle.botSettings,
        serverState: bundle.serverState,
        skins: bundle.skins,
        defaults: {
            initialPhysics: RuntimeDefaults.INITIAL_PHYSICS_DEFAULTS,
            vanillaPhysics: RuntimeDefaults.VANILLA_PHYSICS_DEFAULTS,
        },
        limits: {
            maxSkins: runtimeStore.MAX_SKINS,
        },
    });
});

app.put("/api/admin/settings", requireAdmin, (req, res) => {
    const {serverSettings, modePresets, botSettings} = req.body || {};
    if (!serverSettings || !modePresets || !botSettings) {
        return res.status(400).json({error: "invalid_payload"});
    }
    const normalizedPresets = RuntimeDefaults.normalizePresets(modePresets);
    const normalizedServerSettings = RuntimeDefaults.ensureActivePreset(
        RuntimeDefaults.normalizeServerSettings(serverSettings),
        normalizedPresets
    );
    const normalizedBotSettings = RuntimeDefaults.normalizeBotSettings(botSettings);
    runtimeStore.writeJson(runtimeStore.FILES.serverSettings, normalizedServerSettings);
    runtimeStore.writeJson(runtimeStore.FILES.modePresets, normalizedPresets);
    runtimeStore.writeJson(runtimeStore.FILES.botSettings, normalizedBotSettings);
    res.json({
        ok: true,
        serverSettings: normalizedServerSettings,
        modePresets: normalizedPresets,
        botSettings: normalizedBotSettings,
    });
});

app.post("/api/admin/power", requireAdmin, (req, res) => {
    const desiredEnabled = req.body?.enabled !== false;
    const currentSettings = RuntimeDefaults.ensureActivePreset(
        RuntimeDefaults.normalizeServerSettings(
            runtimeStore.readJson(runtimeStore.FILES.serverSettings, RuntimeDefaults.DEFAULT_SERVER_SETTINGS)
        ),
        RuntimeDefaults.normalizePresets(
            runtimeStore.readJson(runtimeStore.FILES.modePresets, RuntimeDefaults.DEFAULT_MODE_PRESETS)
        )
    );
    currentSettings.serverEnabled = desiredEnabled;
    runtimeStore.writeJson(runtimeStore.FILES.serverSettings, currentSettings);
    res.json({
        ok: true,
        serverEnabled: currentSettings.serverEnabled,
    });
});

app.post("/api/admin/command/reset-world", requireAdmin, (req, res) => {
    const command = runtimeStore.createControlCommand("reset-world", {
        reason: String(req.body?.reason || "Control panel reset"),
    });
    res.json({ok: true, command});
});

app.post("/api/admin/command/broadcast", requireAdmin, (req, res) => {
    const command = runtimeStore.createControlCommand("broadcast", {
        message: String(req.body?.message || "Admin broadcast"),
    });
    res.json({ok: true, command});
});

app.post("/api/admin/skins", requireAdmin, upload.single("skin"), async (req, res) => {
    const bundle = readRuntimeBundle();
    if (bundle.skins.length >= runtimeStore.MAX_SKINS) {
        return res.status(409).json({
            error: "skin_limit_reached",
            maxSkins: runtimeStore.MAX_SKINS,
        });
    }
    const result = await persistSkinUpload(
        req.file,
        req.body?.name,
        bundle.serverSettings.skinUploadMaxBytes || 314572
    );
    return res.status(result.status).json(result.body);
});

app.delete("/api/admin/skins/:skin", requireAdmin, (req, res) => {
    const skin = runtimeStore.sanitizeSkinName(req.params.skin);
    const filePath = path.join(runtimeStore.SKINS_DIR, `${skin}.png`);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    runtimeStore.removeSkin(skin);
    res.json({ok: true});
});

app.get(/^\/adminvs$/, (req, res) => {
    res.redirect(ADMIN_PUBLIC_PATH);
});

app.use((req, res, next) => {
    if (req.path === LEGACY_ADMIN_PREFIX || req.path.startsWith(`${LEGACY_ADMIN_PREFIX}/`)) {
        return res.status(404).end();
    }
    next();
});

app.use("/adminvs", express.static(path.join(runtimeStore.WEB_DIR, "admin"), {
    setHeaders(res, filePath) {
        if (filePath.endsWith(".html")) setNoStoreHeaders(res);
    },
}));

app.use(express.static(runtimeStore.WEB_DIR, {
    setHeaders(res, filePath) {
        if (
            filePath.endsWith(".html")
            || filePath.endsWith(path.join("assets", "js", "main_out.js"))
            || filePath.endsWith(path.join("assets", "js", "agarvvv-ui.js"))
        ) {
            setNoStoreHeaders(res);
        }
    },
}));

const port = process.env.PORT ? Number(process.env.PORT) : 3100;
const host = process.env.HOST || "127.0.0.1";
app.listen(port, host, () => {
    console.log(`AgarVVV web/admin server listening on http://${host}:${port}`);
});
