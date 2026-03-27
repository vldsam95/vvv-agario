const fs = require("fs");
const path = require("path");

const baseConfig = require("../config");

const ROOT_DIR = path.resolve(__dirname, "../../../../");
const RUNTIME_DIR = path.join(ROOT_DIR, "runtime");

const PHYSICS_FIELDS = Object.freeze([
    "playerMaxCells",
    "playerStartSize",
    "playerSpeed",
    "splitVelocity",
    "ejectVelocity",
    "playerDecayRate",
    "playerRecombineTime",
    "foodAmount",
    "virusAmount",
    "borderWidth",
    "borderHeight",
]);

const INITIAL_PHYSICS_DEFAULTS = Object.freeze({
    playerMaxCells: 16,
    playerStartSize: 20,
    playerSpeed: 1,
    splitVelocity: 780,
    ejectVelocity: 780,
    playerDecayRate: 0.002,
    playerRecombineTime: 30,
    foodAmount: 850,
    virusAmount: 60,
    borderWidth: 14142.135623730952,
    borderHeight: 14142.135623730952,
});

const VANILLA_PHYSICS_DEFAULTS = Object.freeze({
    playerMaxCells: 16,
    playerStartSize: 10,
    playerSpeed: 1,
    splitVelocity: 780,
    ejectVelocity: 780,
    playerDecayRate: 0.002,
    playerRecombineTime: 30,
    foodAmount: 700,
    virusAmount: 50,
    borderWidth: 14142.135623730952,
    borderHeight: 14142.135623730952,
});

const ASTR_PHYSICS_DEFAULTS = Object.freeze({
    playerMaxCells: 16,
    playerStartSize: 20,
    playerSpeed: 0.82,
    playerSpeedBase: 2.0,
    playerSpeedExponent: -0.39,
    splitVelocity: 660,
    ejectVelocity: 640,
    playerDecayRate: 0.0016,
    playerRecombineTime: 36,
    foodAmount: 900,
    virusAmount: 65,
    borderWidth: 14142.135623730952,
    borderHeight: 14142.135623730952,
});

const SAFE_PRESET_CONFIG_KEYS = Object.freeze([
    "serverGamemode",
    "serverName",
    "serverRestart",
    "playerMaxCells",
    "playerSpeed",
    "playerSpeedBase",
    "playerSpeedExponent",
    "splitVelocity",
    "ejectVelocity",
    "playerDecayRate",
    "playerRecombineTime",
    "foodAmount",
    "virusAmount",
    "borderWidth",
    "borderHeight",
    "playerMaxSize",
    "playerStartSize",
    "playerMinSplitSize",
    "playerMinEjectSize",
    "playerDisconnectTime",
    "playerDecayCap",
    "playerBotGrow",
    "mobilePhysics",
    "ejectCooldown",
    "ejectSize",
    "ejectSizeLoss",
    "ejectSpawnPercent",
    "ejectVirus",
    "virusVelocity",
    "virusMaxAmount",
    "virusEqualPopSize",
    "virusMaxCells",
    "foodMinSize",
    "foodMaxSize",
    "foodMassGrow",
    "serverMinScale",
    "serverViewBaseX",
    "serverViewBaseY",
    "serverSpectatorScale",
]);

const DEFAULT_SERVER_SETTINGS = Object.freeze({
    activePreset: "ffa",
    serverEnabled: true,
    serverName: "AgarVVV Arena",
    serverWelcome1: "Welcome to AgarVVV Arena",
    serverWelcome2: "Tab creates or switches multi-cells, Shift+Tab returns to classic control",
    serverPort: 3400,
    serverBind: "127.0.0.1",
    serverStatsPort: -1,
    serverTracker: 0,
    serverMaxConnections: 120,
    serverIpLimit: 3,
    serverResumeGrace: 20,
    serverScrambleLevel: 1,
    serverChat: 1,
    serverChatAscii: 0,
    clientBind: "https://agarvvv.greener-business.com - http://agarvvv.greener-business.com - https://agarvvv.seo4starters.net - http://agarvvv.seo4starters.net - http://127.0.0.1:3100 - http://localhost:3100",
    allowSkinUpload: true,
    skinUploadMaxBytes: 314572,
    dualControlEnabled: true,
    dualControlSwitchCooldown: 8,
    multiControlMaxPilots: 2,
    antiTeamEnabled: false,
    antiTeamApplyToBots: false,
    antiTeamIgnoreLinkedPlayers: true,
    antiTeamIgnoreTeamBots: true,
    antiTeamStateDecayPerTick: 0.997,
    antiTeamMaxMultiplier: 2.8,
    antiTeamApplyBase: 0.3,
    antiTeamDecayScale: 3333,
    antiTeamPairWindowTicks: 125,
    antiTeamMinPairEvents: 2,
    antiTeamMaxPairsPerPlayer: 24,
    antiTeamEjectWeight: 1,
    antiTeamPlayerEatWeight: 0.2,
    antiTeamVirusBurstMultiplier: 1.4,
    antiTeamVirusBurstThreshold: 1.15,
    antiTeamEjectWindowTicks: 25,
    publicWsEndpoint: "/ws",
    publicTitle: "AgarVVV Arena",
    publicSubtitle: "MultiOgarII server with runtime presets, multi-cell control and admin-managed bots.",
    ...INITIAL_PHYSICS_DEFAULTS,
    serverRestart: 120,
});

const DEFAULT_MODE_PRESETS = Object.freeze({
    presets: {
        ffa: {
            label: "FFA Classic",
            description: "Classic Agar feel with 16 cells and standard pacing.",
            config: Object.assign({
                serverGamemode: 0,
                serverName: "AgarVVV FFA",
            }, INITIAL_PHYSICS_DEFAULTS),
        },
        astr: {
            label: "ASTR",
            description: "Cytos-inspired slow and smooth pacing with softer split/eject momentum.",
            config: Object.assign({
                serverGamemode: 0,
                serverName: "AgarVVV ASTR",
            }, ASTR_PHYSICS_DEFAULTS),
        },
    },
});

const DEFAULT_BOT_SETTINGS = Object.freeze({
    targetCount: 18,
    autoFill: false,
    profiles: [
        {
            id: "balanced-core",
            label: "Balanced Core",
            logic: "balanced",
            skin: "doge",
            randomSkin: false,
            spawnWeight: 3,
            namePrefix: "Core",
        },
        {
            id: "hunters",
            label: "Hunters",
            logic: "new-hunter",
            skin: "pokerface",
            randomSkin: false,
            spawnWeight: 2,
            namePrefix: "HX",
        },
        {
            id: "collectors",
            label: "Collectors",
            logic: "collector",
            skin: "",
            randomSkin: false,
            spawnWeight: 2,
            namePrefix: "CL",
        },
        {
            id: "survivors",
            label: "Survivors",
            logic: "survivor",
            skin: "",
            randomSkin: false,
            spawnWeight: 1,
            namePrefix: "SV",
        },
    ],
});

const RUNTIME_FILES = Object.freeze({
    serverSettings: path.join(RUNTIME_DIR, "server-settings.json"),
    modePresets: path.join(RUNTIME_DIR, "mode-presets.json"),
    botSettings: path.join(RUNTIME_DIR, "bots.json"),
    wsTicketSecret: path.join(RUNTIME_DIR, "ws-ticket-secret.json"),
    control: path.join(RUNTIME_DIR, "control.json"),
    state: path.join(RUNTIME_DIR, "server-state.json"),
});

function clone(value) {
    return JSON.parse(JSON.stringify(value));
}

function clampNumber(value, fallback, min, max) {
    const num = Number(value);
    if (!Number.isFinite(num)) return fallback;
    return Math.min(max, Math.max(min, num));
}

function massToSize(mass) {
    const safeMass = Math.max(0, Number(mass) || 0);
    return Math.sqrt(safeMass * 100);
}

function sizeToMass(size) {
    const safeSize = Math.max(0, Number(size) || 0);
    return safeSize * safeSize / 100;
}

function sanitizeText(value, fallback, maxLength = 140) {
    if (typeof value !== "string") return fallback;
    const text = value.trim();
    if (!text) return fallback;
    return text.slice(0, maxLength);
}

function sanitizePublicEndpoint(value, fallback = DEFAULT_SERVER_SETTINGS.publicWsEndpoint) {
    if (typeof value !== "string") return fallback;
    const text = value.trim();
    if (!text) return fallback;
    if (text.startsWith("/")) return text;
    if (/^[a-z0-9.-]+:\d{2,5}$/i.test(text)) return text;
    return fallback;
}

function sanitizeGameplayConfig(raw = {}, fallback = {}) {
    const source = Object.assign({}, fallback, raw && typeof raw === "object" ? raw : {});
    const config = {};
    for (const key of SAFE_PRESET_CONFIG_KEYS) {
        const value = source[key];
        if (value == null) continue;
        switch (key) {
            case "serverName":
                config[key] = sanitizeText(value, fallback[key] || DEFAULT_SERVER_SETTINGS.serverName, 60);
                break;
            case "serverGamemode":
                config[key] = clampNumber(value, fallback[key] ?? 0, 0, 4);
                break;
            case "serverRestart":
                config[key] = clampNumber(value, fallback[key] ?? baseConfig.serverRestart, 0, 1440);
                break;
            case "playerMaxCells":
                config[key] = clampNumber(value, fallback[key] ?? INITIAL_PHYSICS_DEFAULTS.playerMaxCells, 2, 64);
                break;
            case "playerSpeed":
                config[key] = clampNumber(value, fallback[key] ?? INITIAL_PHYSICS_DEFAULTS.playerSpeed, 0.1, 4);
                break;
            case "playerSpeedBase":
                config[key] = clampNumber(value, fallback[key] ?? baseConfig.playerSpeedBase, 0.1, 5);
                break;
            case "playerSpeedExponent":
                config[key] = clampNumber(value, fallback[key] ?? baseConfig.playerSpeedExponent, -1.2, -0.1);
                break;
            case "playerDecayRate":
                config[key] = clampNumber(value, fallback[key] ?? INITIAL_PHYSICS_DEFAULTS.playerDecayRate, 0, 0.02);
                break;
            case "playerRecombineTime":
            case "ejectCooldown":
                config[key] = clampNumber(value, fallback[key] ?? 0, 0, 180);
                break;
            case "splitVelocity":
            case "ejectVelocity":
            case "virusVelocity":
            case "playerMaxSize":
            case "playerMinSplitSize":
            case "playerMinEjectSize":
            case "foodMinSize":
            case "foodMaxSize":
            case "ejectSize":
            case "ejectSizeLoss":
                config[key] = clampNumber(value, fallback[key] ?? 0, 1, 5000);
                break;
            case "playerStartSize":
                config[key] = clampNumber(value, fallback[key] ?? INITIAL_PHYSICS_DEFAULTS.playerStartSize, 1, 5000);
                break;
            case "foodAmount":
                config[key] = clampNumber(value, fallback[key] ?? INITIAL_PHYSICS_DEFAULTS.foodAmount, 0, 10000);
                break;
            case "virusAmount":
            case "virusMaxAmount":
            case "virusMaxCells":
                config[key] = clampNumber(value, fallback[key] ?? INITIAL_PHYSICS_DEFAULTS.virusAmount, 0, 1000);
                break;
            case "borderWidth":
            case "borderHeight":
                config[key] = clampNumber(value, fallback[key] ?? INITIAL_PHYSICS_DEFAULTS.borderWidth, 2000, 50000);
                break;
            case "playerDisconnectTime":
                config[key] = clampNumber(value, fallback[key] ?? -1, -1, 3600);
                break;
            case "playerDecayCap":
                config[key] = clampNumber(value, fallback[key] ?? 0, 0, 1e6);
                break;
            case "serverMinScale":
                config[key] = clampNumber(value, fallback[key] ?? baseConfig.serverMinScale, 0.05, 1);
                break;
            case "serverViewBaseX":
            case "serverViewBaseY":
                config[key] = clampNumber(value, fallback[key] ?? baseConfig.serverViewBaseX, 640, 8000);
                break;
            case "serverSpectatorScale":
            case "ejectSpawnPercent":
                config[key] = clampNumber(value, fallback[key] ?? 0.4, 0, 1);
                break;
            case "foodMassGrow":
            case "mobilePhysics":
            case "ejectVirus":
            case "virusEqualPopSize":
            case "playerBotGrow":
                config[key] = value ? 1 : 0;
                break;
            default:
                config[key] = clampNumber(value, fallback[key] ?? 0, 0, 1e9);
                break;
        }
    }
    return config;
}

function readJson(filePath, fallback) {
    try {
        if (!fs.existsSync(filePath)) return clone(fallback);
        const raw = fs.readFileSync(filePath, "utf8");
        return raw.trim() ? JSON.parse(raw) : clone(fallback);
    } catch (error) {
        return clone(fallback);
    }
}

function writeJson(filePath, value) {
    fs.mkdirSync(path.dirname(filePath), {recursive: true});
    fs.writeFileSync(filePath, JSON.stringify(value, null, 2) + "\n");
}

function getMtime(filePath) {
    try {
        return fs.statSync(filePath).mtimeMs;
    } catch (error) {
        return 0;
    }
}

function normalizePresets(raw) {
    const presets = clone(DEFAULT_MODE_PRESETS);
    if (!raw || typeof raw !== "object" || !raw.presets || typeof raw.presets !== "object") {
        return presets;
    }
    for (const [key, value] of Object.entries(raw.presets)) {
        if (!value || typeof value !== "object") continue;
        presets.presets[key] = {
            label: typeof value.label === "string" && value.label.trim() ? value.label.trim() : key.toUpperCase(),
            description: typeof value.description === "string" ? value.description.trim() : "",
            config: sanitizeGameplayConfig(
                value.config && typeof value.config === "object" ? value.config : {},
                presets.presets[key]?.config || DEFAULT_MODE_PRESETS.presets.ffa.config
            ),
        };
    }
    return presets;
}

function normalizeServerSettings(raw) {
    const settings = Object.assign({}, clone(DEFAULT_SERVER_SETTINGS), raw && typeof raw === "object" ? raw : {});
    settings.serverRestart = clampNumber(settings.serverRestart, baseConfig.serverRestart, 0, 1440);
    settings.serverPort = clampNumber(settings.serverPort, DEFAULT_SERVER_SETTINGS.serverPort, 1, 65535);
    settings.serverStatsPort = clampNumber(settings.serverStatsPort, DEFAULT_SERVER_SETTINGS.serverStatsPort, -1, 65535);
    settings.serverMaxConnections = clampNumber(settings.serverMaxConnections, DEFAULT_SERVER_SETTINGS.serverMaxConnections, 1, 5000);
    settings.serverIpLimit = clampNumber(settings.serverIpLimit, DEFAULT_SERVER_SETTINGS.serverIpLimit, 0, 100);
    settings.serverScrambleLevel = clampNumber(settings.serverScrambleLevel, DEFAULT_SERVER_SETTINGS.serverScrambleLevel, 0, 3);
    settings.skinUploadMaxBytes = clampNumber(settings.skinUploadMaxBytes, DEFAULT_SERVER_SETTINGS.skinUploadMaxBytes, 65536, 1048576);
    settings.dualControlSwitchCooldown = clampNumber(settings.dualControlSwitchCooldown, DEFAULT_SERVER_SETTINGS.dualControlSwitchCooldown, 0, 100);
    settings.multiControlMaxPilots = 2;
    settings.serverName = sanitizeText(settings.serverName, DEFAULT_SERVER_SETTINGS.serverName, 60);
    settings.serverWelcome1 = typeof settings.serverWelcome1 === "string" ? settings.serverWelcome1.trim().slice(0, 120) : DEFAULT_SERVER_SETTINGS.serverWelcome1;
    settings.serverWelcome2 = typeof settings.serverWelcome2 === "string" ? settings.serverWelcome2.trim().slice(0, 120) : DEFAULT_SERVER_SETTINGS.serverWelcome2;
    settings.publicTitle = sanitizeText(settings.publicTitle, DEFAULT_SERVER_SETTINGS.publicTitle, 60);
    settings.publicSubtitle = typeof settings.publicSubtitle === "string" ? settings.publicSubtitle.trim().slice(0, 180) : DEFAULT_SERVER_SETTINGS.publicSubtitle;
    settings.serverEnabled = settings.serverEnabled !== false;
    settings.allowSkinUpload = !!settings.allowSkinUpload;
    settings.dualControlEnabled = !!settings.dualControlEnabled;
    settings.antiTeamEnabled = !!settings.antiTeamEnabled;
    settings.antiTeamApplyToBots = !!settings.antiTeamApplyToBots;
    settings.antiTeamIgnoreLinkedPlayers = settings.antiTeamIgnoreLinkedPlayers !== false;
    settings.antiTeamIgnoreTeamBots = settings.antiTeamIgnoreTeamBots !== false;
    settings.serverBind = String(settings.serverBind || DEFAULT_SERVER_SETTINGS.serverBind);
    settings.clientBind = String(settings.clientBind || "");
    settings.activePreset = typeof settings.activePreset === "string" && settings.activePreset ? settings.activePreset : DEFAULT_SERVER_SETTINGS.activePreset;
    settings.publicWsEndpoint = sanitizePublicEndpoint(settings.publicWsEndpoint, DEFAULT_SERVER_SETTINGS.publicWsEndpoint);
    settings.playerMaxCells = clampNumber(settings.playerMaxCells, DEFAULT_SERVER_SETTINGS.playerMaxCells, 2, 64);
    settings.playerStartSize = clampNumber(settings.playerStartSize, DEFAULT_SERVER_SETTINGS.playerStartSize, 1, 5000);
    settings.playerSpeed = clampNumber(settings.playerSpeed, DEFAULT_SERVER_SETTINGS.playerSpeed, 0.1, 4);
    settings.splitVelocity = clampNumber(settings.splitVelocity, DEFAULT_SERVER_SETTINGS.splitVelocity, 1, 5000);
    settings.ejectVelocity = clampNumber(settings.ejectVelocity, DEFAULT_SERVER_SETTINGS.ejectVelocity, 1, 5000);
    settings.playerDecayRate = clampNumber(settings.playerDecayRate, DEFAULT_SERVER_SETTINGS.playerDecayRate, 0, 0.02);
    settings.playerRecombineTime = clampNumber(settings.playerRecombineTime, DEFAULT_SERVER_SETTINGS.playerRecombineTime, 0, 180);
    settings.foodAmount = clampNumber(settings.foodAmount, DEFAULT_SERVER_SETTINGS.foodAmount, 0, 10000);
    settings.virusAmount = clampNumber(settings.virusAmount, DEFAULT_SERVER_SETTINGS.virusAmount, 0, 1000);
    settings.borderWidth = clampNumber(settings.borderWidth, DEFAULT_SERVER_SETTINGS.borderWidth, 2000, 50000);
    settings.borderHeight = clampNumber(settings.borderHeight, DEFAULT_SERVER_SETTINGS.borderHeight, 2000, 50000);
    settings.antiTeamStateDecayPerTick = clampNumber(settings.antiTeamStateDecayPerTick, DEFAULT_SERVER_SETTINGS.antiTeamStateDecayPerTick, 0.9, 0.99999);
    settings.antiTeamMaxMultiplier = clampNumber(settings.antiTeamMaxMultiplier, DEFAULT_SERVER_SETTINGS.antiTeamMaxMultiplier, 1, 10);
    settings.antiTeamApplyBase = clampNumber(settings.antiTeamApplyBase, DEFAULT_SERVER_SETTINGS.antiTeamApplyBase, 0, 5);
    settings.antiTeamDecayScale = clampNumber(settings.antiTeamDecayScale, DEFAULT_SERVER_SETTINGS.antiTeamDecayScale, 1, 20000);
    settings.antiTeamPairWindowTicks = clampNumber(settings.antiTeamPairWindowTicks, DEFAULT_SERVER_SETTINGS.antiTeamPairWindowTicks, 1, 1000);
    settings.antiTeamMinPairEvents = clampNumber(settings.antiTeamMinPairEvents, DEFAULT_SERVER_SETTINGS.antiTeamMinPairEvents, 1, 10);
    settings.antiTeamMaxPairsPerPlayer = clampNumber(settings.antiTeamMaxPairsPerPlayer, DEFAULT_SERVER_SETTINGS.antiTeamMaxPairsPerPlayer, 1, 128);
    settings.antiTeamEjectWeight = clampNumber(settings.antiTeamEjectWeight, DEFAULT_SERVER_SETTINGS.antiTeamEjectWeight, 0, 5);
    settings.antiTeamPlayerEatWeight = clampNumber(settings.antiTeamPlayerEatWeight, DEFAULT_SERVER_SETTINGS.antiTeamPlayerEatWeight, 0, 5);
    settings.antiTeamVirusBurstMultiplier = clampNumber(settings.antiTeamVirusBurstMultiplier, DEFAULT_SERVER_SETTINGS.antiTeamVirusBurstMultiplier, 1, 5);
    settings.antiTeamVirusBurstThreshold = clampNumber(settings.antiTeamVirusBurstThreshold, DEFAULT_SERVER_SETTINGS.antiTeamVirusBurstThreshold, 1, 10);
    settings.antiTeamEjectWindowTicks = clampNumber(settings.antiTeamEjectWindowTicks, DEFAULT_SERVER_SETTINGS.antiTeamEjectWindowTicks, 1, 250);
    delete settings.playerSpeedBase;
    delete settings.playerSpeedExponent;
    return settings;
}

function normalizeRestartTicks(minutes) {
    const value = clampNumber(minutes, baseConfig.serverRestart, 0, 1440);
    return value === 0 ? 1e999 : value * 1500;
}

function normalizeBotSettings(raw) {
    const settings = Object.assign({}, clone(DEFAULT_BOT_SETTINGS), raw && typeof raw === "object" ? raw : {});
    settings.targetCount = clampNumber(settings.targetCount, DEFAULT_BOT_SETTINGS.targetCount, 0, 500);
    settings.autoFill = !!settings.autoFill;
    const profiles = Array.isArray(settings.profiles) ? settings.profiles : [];
    settings.profiles = profiles
        .map((profile, index) => ({
            id: typeof profile.id === "string" && profile.id ? profile.id : `profile-${index + 1}`,
            label: typeof profile.label === "string" && profile.label ? profile.label : `Profile ${index + 1}`,
            logic: typeof profile.logic === "string" && profile.logic ? profile.logic : "balanced",
            skin: typeof profile.skin === "string" ? profile.skin.trim() : "",
            randomSkin: !!profile.randomSkin,
            spawnWeight: clampNumber(profile.spawnWeight, 1, 1, 100),
            namePrefix: typeof profile.namePrefix === "string" && profile.namePrefix ? profile.namePrefix : "Bot",
        }))
        .filter(Boolean);
    if (!settings.profiles.length) settings.profiles = clone(DEFAULT_BOT_SETTINGS.profiles);
    return settings;
}

function ensureActivePreset(serverSettings, modePresets) {
    const presets = modePresets && modePresets.presets && typeof modePresets.presets === "object"
        ? modePresets.presets
        : {};
    const presetKeys = Object.keys(presets);
    if (!presetKeys.length) {
        serverSettings.activePreset = DEFAULT_SERVER_SETTINGS.activePreset;
        return serverSettings;
    }
    if (!presets[serverSettings.activePreset]) {
        serverSettings.activePreset = presetKeys[0];
    }
    return serverSettings;
}

function loadRuntimeSnapshot() {
    const modePresets = normalizePresets(readJson(RUNTIME_FILES.modePresets, DEFAULT_MODE_PRESETS));
    const serverSettings = ensureActivePreset(
        normalizeServerSettings(readJson(RUNTIME_FILES.serverSettings, DEFAULT_SERVER_SETTINGS)),
        modePresets
    );
    const botSettings = normalizeBotSettings(readJson(RUNTIME_FILES.botSettings, DEFAULT_BOT_SETTINGS));
    const selectedPreset = modePresets.presets[serverSettings.activePreset] || modePresets.presets.ffa || Object.values(modePresets.presets)[0] || {config: {}};
    const config = Object.assign({}, clone(baseConfig), selectedPreset.config || {}, serverSettings);
    config.playerStartMass = clampNumber(config.playerStartSize, DEFAULT_SERVER_SETTINGS.playerStartSize, 1, 5000);
    config.playerStartSize = massToSize(config.playerStartMass);
    config.minionStartSize = config.playerStartSize;
    config.minionMaxStartSize = config.playerStartSize;
    config.serverRestart = normalizeRestartTicks(config.serverRestart);
    config.serverBots = serverSettings.serverEnabled === false ? 0 : botSettings.targetCount;
    return {
        rootDir: ROOT_DIR,
        runtimeDir: RUNTIME_DIR,
        files: RUNTIME_FILES,
        modePresets,
        serverSettings,
        botSettings,
        selectedPresetKey: serverSettings.activePreset,
        selectedPreset,
        config,
    };
}

module.exports = {
    ROOT_DIR,
    RUNTIME_DIR,
    RUNTIME_FILES,
    DEFAULT_SERVER_SETTINGS,
    DEFAULT_MODE_PRESETS,
    DEFAULT_BOT_SETTINGS,
    PHYSICS_FIELDS,
    INITIAL_PHYSICS_DEFAULTS,
    VANILLA_PHYSICS_DEFAULTS,
    ASTR_PHYSICS_DEFAULTS,
    SAFE_PRESET_CONFIG_KEYS,
    clone,
    readJson,
    writeJson,
    getMtime,
    sanitizeGameplayConfig,
    normalizeServerSettings,
    normalizePresets,
    normalizeBotSettings,
    normalizeRestartTicks,
    ensureActivePreset,
    loadRuntimeSnapshot,
    massToSize,
    sizeToMass,
};
