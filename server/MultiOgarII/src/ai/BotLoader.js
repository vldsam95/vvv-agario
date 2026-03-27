// Library imports
const fs = require("fs");
const path = require("path");

// Project imports
const FakeSocket = require('./FakeSocket');
const Client = require('../Client');
const BotPlayer = require('./BotPlayer');
const MinionPlayer = require('./MinionPlayer');

const botnameFile = "./ai/botnames.txt";
const gallerySkinListFile = path.resolve(__dirname, "../../../../client/Cigar2/web/skinList.txt");
const gallerySkinsDir = path.resolve(__dirname, "../../../../client/Cigar2/web/skins");
let botnames = null;
if (fs.existsSync(botnameFile)) {
    botnames = fs.readFileSync(botnameFile, "utf-8")
        .split(/\r?\n/)
        .map((value) => String(value || "").trim())
        .filter(Boolean);
    if (!botnames.length) botnames = null;
}

function sanitizeSkinName(value) {
    return String(value || "")
        .toLowerCase()
        .replace(/[^a-z0-9_-]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 96);
}

function normalizeBotNamePart(value, maxLength = 32) {
    return String(value || "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, maxLength);
}

class BotLoader {
    constructor(server) {
        this.server = server;
        this.botCount = 0;
        this.profileCursor = 0;
    }
    getBotSockets() {
        return this.server.clients.filter((socket) =>
            socket?.player?.isBot &&
            socket.isConnected !== false &&
            !socket.isCloseRequest
        );
    }
    getHumanCount() {
        return this.server.clients.reduce((count, socket) => {
            if (!socket || !socket.player || socket.player.isBot || socket.player.isMinion || socket.player.isMi) {
                return count;
            }
            return count + (socket.isConnected === false || socket.isCloseRequest ? 0 : 1);
        }, 0);
    }
    getTargetPopulation() {
        const settings = this.server.botSettings || {targetCount: 0, autoFill: false};
        const configuredTarget = settings.targetCount | 0;
        const baseTarget = settings.autoFill
            ? Math.max(0, configuredTarget - this.getHumanCount())
            : configuredTarget;
        const loadControl = this.server.getBotLoadControl?.();
        const populationFactor = Number(loadControl?.populationFactor);
        const factor = Number.isFinite(populationFactor) ? Math.max(0.35, Math.min(1, populationFactor)) : 1;
        return Math.max(0, Math.round(baseTarget * factor));
    }
    pickProfile() {
        const settings = this.server.botSettings || {};
        const profiles = Array.isArray(settings.profiles) ? settings.profiles : [];
        if (!profiles.length) {
            return {
                id: "default",
                label: "Balanced",
                logic: "balanced",
                skin: "",
                randomSkin: false,
                spawnWeight: 1,
                namePrefix: "Bot",
            };
        }
        const weightedProfiles = [];
        for (const profile of profiles) {
            const weight = Math.max(1, profile.spawnWeight | 0);
            for (let i = 0; i < weight; i++) weightedProfiles.push(profile);
        }
        const profile = weightedProfiles[this.profileCursor % weightedProfiles.length];
        this.profileCursor++;
        return profile;
    }
    getNicknameLimit() {
        const configured = Number(this.server?.config?.playerMaxNickLength);
        if (!Number.isFinite(configured) || configured < 3) return 30;
        return Math.max(3, Math.min(64, Math.floor(configured)));
    }
    formatBotName(prefix, suffix) {
        const limit = this.getNicknameLimit();
        const safePrefix = normalizeBotNamePart(prefix, limit);
        const safeSuffix = normalizeBotNamePart(suffix, limit);
        if (!safePrefix && !safeSuffix) return "Bot".slice(0, limit);
        if (!safePrefix) return safeSuffix.slice(0, limit) || "Bot";
        if (!safeSuffix) return safePrefix.slice(0, limit) || "Bot";
        const suffixPart = safeSuffix.slice(0, Math.max(1, Math.min(safeSuffix.length, limit - 1)));
        let prefixRoom = limit - suffixPart.length - 1;
        if (prefixRoom < 1) {
            return suffixPart.slice(0, limit) || "Bot";
        }
        const prefixPart = safePrefix.slice(0, prefixRoom).trim();
        if (!prefixPart) return suffixPart.slice(0, limit) || "Bot";
        const name = `${prefixPart} ${suffixPart}`;
        return name.slice(0, limit).trim() || "Bot";
    }
    getUsedBotDisplayNames() {
        const used = new Set();
        for (const socket of this.getBotSockets()) {
            const name = normalizeBotNamePart(socket?.player?._name, this.getNicknameLimit());
            if (name) used.add(name.toLowerCase());
        }
        return used;
    }
    getConfiguredBulkNicknames() {
        const settings = this.server.botSettings || {};
        const configured = Array.isArray(settings.bulkNicknames) ? settings.bulkNicknames : [];
        const seen = new Set();
        const nicknames = [];
        for (const value of configured) {
            const nickname = normalizeBotNamePart(value, 60);
            if (!nickname) continue;
            const key = nickname.toLowerCase();
            if (seen.has(key)) continue;
            seen.add(key);
            nicknames.push({nickname, key});
        }
        return nicknames;
    }
    getUsedBulkNicknameKeys() {
        const used = new Set();
        for (const socket of this.getBotSockets()) {
            const key = normalizeBotNamePart(socket?.player?.botNicknameKey, 60).toLowerCase();
            if (key) used.add(key);
        }
        return used;
    }
    composeNumericName(profile, usedDisplayNames) {
        const prefix = profile?.namePrefix || profile?.label || "Bot";
        for (let attempts = 0; attempts < 5000; attempts++) {
            const suffix = `${++this.botCount}`.padStart(2, "0");
            const candidate = this.formatBotName(prefix, suffix);
            if (!usedDisplayNames.has(candidate.toLowerCase())) {
                return candidate;
            }
        }
        return this.formatBotName(prefix, `${Date.now() % 100000}`);
    }
    pickLegacyBotName(usedDisplayNames) {
        if (!Array.isArray(botnames) || !botnames.length) return "";
        for (let attempts = 0; attempts < botnames.length * 2; attempts++) {
            const raw = botnames[Math.random() * botnames.length | 0];
            const candidate = normalizeBotNamePart(raw, this.getNicknameLimit());
            if (!candidate) continue;
            if (usedDisplayNames.has(candidate.toLowerCase())) continue;
            return candidate;
        }
        return "";
    }
    pickBulkBotName(profile, usedDisplayNames, configuredBulkNicknames) {
        if (!configuredBulkNicknames.length) return null;
        const usedKeys = this.getUsedBulkNicknameKeys();
        const pool = configuredBulkNicknames.filter((entry) => !usedKeys.has(entry.key));
        while (pool.length) {
            const index = Math.random() * pool.length | 0;
            const choice = pool.splice(index, 1)[0];
            const candidate = this.formatBotName(profile?.namePrefix || profile?.label || "Bot", choice.nickname);
            if (usedDisplayNames.has(candidate.toLowerCase())) continue;
            return {
                name: candidate,
                nicknameKey: choice.key,
            };
        }
        return null;
    }
    resolveSpawnName(profile) {
        const usedDisplayNames = this.getUsedBotDisplayNames();
        const configuredBulkNicknames = this.getConfiguredBulkNicknames();
        if (configuredBulkNicknames.length) {
            const bulk = this.pickBulkBotName(profile, usedDisplayNames, configuredBulkNicknames);
            if (bulk) return bulk;
            return {
                name: this.composeNumericName(profile, usedDisplayNames),
                nicknameKey: null,
            };
        }
        const legacyName = this.pickLegacyBotName(usedDisplayNames);
        if (legacyName) {
            return {
                name: legacyName,
                nicknameKey: null,
            };
        }
        return {
            name: this.composeNumericName(profile, usedDisplayNames),
            nicknameKey: null,
        };
    }
    getGallerySkins() {
        const skins = new Set();
        if (fs.existsSync(gallerySkinListFile)) {
            const listed = fs.readFileSync(gallerySkinListFile, "utf-8")
                .split(",")
                .map((value) => sanitizeSkinName(value))
                .filter(Boolean);
            for (const skin of listed) skins.add(skin);
        }
        if (!skins.size && fs.existsSync(gallerySkinsDir)) {
            for (const fileName of fs.readdirSync(gallerySkinsDir)) {
                if (!fileName.toLowerCase().endsWith(".png")) continue;
                const skin = sanitizeSkinName(path.parse(fileName).name);
                if (skin) skins.add(skin);
            }
        }
        return Array.from(skins);
    }
    getReservedHumanSkins() {
        const reserved = new Set();
        const players = typeof this.server.getLeaderboardPlayers === "function"
            ? this.server.getLeaderboardPlayers()
            : this.server.clients.map((socket) => socket?.player).filter(Boolean);
        for (const player of players) {
            if (!player || player.isBot || player.isMinion || player.isMi) continue;
            if (player.isRemoved || !player.cells?.length) continue;
            const skin = sanitizeSkinName(player._skin);
            if (skin) reserved.add(skin);
        }
        return reserved;
    }
    resolveProfileSkin(profile, currentSkin = "") {
        if (profile?.randomSkin) {
            const gallerySkins = this.getGallerySkins();
            const reservedHumanSkins = this.getReservedHumanSkins();
            const availableSkins = gallerySkins.filter((skin) => !reservedHumanSkins.has(skin));
            const pool = availableSkins.length ? availableSkins : gallerySkins;
            if (pool.length) {
                const index = Math.random() * pool.length | 0;
                return pool[index];
            }
        }
        const profileSkin = typeof profile?.skin === "string" ? profile.skin.trim() : "";
        return profileSkin || currentSkin || "";
    }
    addBot(profileOverride) {
        // Create a FakeSocket instance and assign its properties.
        const socket = new FakeSocket(this.server);
        socket.player = new BotPlayer(this.server, socket);
        socket.client = new Client(this.server, socket);
        socket.player.botProfile = profileOverride || this.pickProfile();
        const spawnName = this.resolveSpawnName(socket.player.botProfile);
        socket.player.botNicknameKey = spawnName.nicknameKey;
        const skin = this.resolveProfileSkin(socket.player.botProfile);

        let name = spawnName.name;
        if (skin) {
            name = `<${skin}>${name}`;
        }

        // Add to client list and spawn.
        this.server.clients.push(socket);
        socket.client.setNickname(name);
        return socket;
    }
    removeBot(socket) {
        if (!socket || !socket.player || !socket.player.isBot) return;
        while (socket.player.cells.length) {
            this.server.removeNode(socket.player.cells[0]);
        }
        socket.player.isRemoved = true;
        socket.close();
        this.server.clients.removeUnsorted(socket);
    }
    syncPopulation() {
        for (const socket of this.server.clients.slice()) {
            if (socket?.player?.isBot && (socket.isConnected === false || socket.isCloseRequest)) {
                this.server.clients.removeUnsorted(socket);
            }
        }
        const bots = this.getBotSockets();
        const target = this.getTargetPopulation();
        while (bots.length > target) {
            this.removeBot(bots.pop());
        }
        while (this.getBotSockets().length < target) {
            this.addBot();
        }
    }
    addMinion(owner, name, mass) {
        // Aliases
        const maxSize = this.server.config.minionMaxStartSize;
        const defaultSize = this.server.config.minionStartSize;

        // Create a FakeSocket instance and assign its properties.
        const socket = new FakeSocket(this.server);
        socket.player = new MinionPlayer(this.server, socket, owner);
        socket.client = new Client(this.server, socket);

        // Set minion spawn size
        socket.player.spawnmass = mass || maxSize > defaultSize ? Math.floor(Math.random() * (maxSize - defaultSize) + defaultSize) : defaultSize;

        // Add to client list
        this.server.clients.push(socket);

        // Add to world
        socket.client.setNickname(name == "" || !name ? this.server.config.defaultName : name);
    }
}

module.exports = BotLoader;
