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
if(fs.existsSync(botnameFile))
    botnames = fs.readFileSync(botnameFile, "utf-8").split("\n");

function sanitizeSkinName(value) {
    return String(value || "")
        .toLowerCase()
        .replace(/[^a-z0-9_-]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 96);
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
        if (!settings.autoFill) return settings.targetCount | 0;
        return Math.max(0, (settings.targetCount | 0) - this.getHumanCount());
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
    composeName(profile) {
        const suffix = `${++this.botCount}`.padStart(2, "0");
        const prefix = profile.namePrefix || profile.label || "Bot";
        return `${prefix} ${suffix}`;
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
        const skin = this.resolveProfileSkin(socket.player.botProfile);

        let name = botnames ?
            botnames[Math.random() * botnames.length | 0] :
            this.composeName(socket.player.botProfile);
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
