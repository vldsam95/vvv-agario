const fs = require("fs");
const path = require("path");

const ROOT_DIR = path.resolve(__dirname, "../../..");
const RUNTIME_DIR = path.join(ROOT_DIR, "runtime");
const WEB_DIR = path.join(ROOT_DIR, "client", "Cigar2", "web");
const SKINS_DIR = path.join(WEB_DIR, "skins");
const SKIN_LIST_FILE = path.join(WEB_DIR, "skinList.txt");
const MAX_SKINS = 200;
const MAX_SKIN_NAME_LENGTH = 96;
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const FILES = Object.freeze({
    admin: path.join(RUNTIME_DIR, "admin.json"),
    publicSkinQuota: path.join(RUNTIME_DIR, "public-skin-quota.json"),
    wsTicketSecret: path.join(RUNTIME_DIR, "ws-ticket-secret.json"),
    serverSettings: path.join(RUNTIME_DIR, "server-settings.json"),
    modePresets: path.join(RUNTIME_DIR, "mode-presets.json"),
    botSettings: path.join(RUNTIME_DIR, "bots.json"),
    control: path.join(RUNTIME_DIR, "control.json"),
    state: path.join(RUNTIME_DIR, "server-state.json"),
});

function readJson(filePath, fallback) {
    try {
        if (!fs.existsSync(filePath)) return fallback;
        const raw = fs.readFileSync(filePath, "utf8");
        return raw.trim() ? JSON.parse(raw) : fallback;
    } catch (error) {
        return fallback;
    }
}

function writeJson(filePath, value) {
    fs.mkdirSync(path.dirname(filePath), {recursive: true});
    fs.writeFileSync(filePath, JSON.stringify(value, null, 2) + "\n");
}

function ensureSkinDirectory() {
    fs.mkdirSync(SKINS_DIR, {recursive: true});
    if (!fs.existsSync(SKIN_LIST_FILE)) {
        fs.writeFileSync(SKIN_LIST_FILE, "");
    }
}

function isValidSkinFile(filePath) {
    try {
        const stat = fs.statSync(filePath);
        if (!stat.isFile() || stat.size < PNG_SIGNATURE.length) return false;
        const fd = fs.openSync(filePath, "r");
        const header = Buffer.alloc(PNG_SIGNATURE.length);
        fs.readSync(fd, header, 0, PNG_SIGNATURE.length, 0);
        fs.closeSync(fd);
        return header.equals(PNG_SIGNATURE);
    } catch (error) {
        return false;
    }
}

function listValidSkinFiles() {
    ensureSkinDirectory();
    const files = fs.readdirSync(SKINS_DIR, {withFileTypes: true});
    const skins = [];
    for (const entry of files) {
        if (!entry.isFile() || !entry.name.toLowerCase().endsWith(".png")) continue;
        const filePath = path.join(SKINS_DIR, entry.name);
        if (!isValidSkinFile(filePath)) {
            try {
                fs.unlinkSync(filePath);
            } catch (error) {
                // Ignore files we cannot prune here; they will simply stay out of the list.
            }
            continue;
        }
        skins.push(sanitizeSkinName(path.parse(entry.name).name));
    }
    return skins;
}

function normalizeSkinList(list) {
    return Array.from(new Set((Array.isArray(list) ? list : [])
        .map((value) => sanitizeSkinName(value))
        .filter(Boolean)))
        .sort()
        .slice(0, MAX_SKINS);
}

function syncSkinList() {
    ensureSkinDirectory();
    const listedSkins = fs.readFileSync(SKIN_LIST_FILE, "utf8")
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean);
    const validFiles = listValidSkinFiles();
    const listed = normalizeSkinList(listedSkins);
    const validSet = new Set(validFiles);
    const normalized = normalizeSkinList([
        ...listed.filter((skin) => validSet.has(skin)),
        ...validFiles,
    ]);
    if (normalized.join(",") !== listedSkins.join(",")) {
        fs.writeFileSync(SKIN_LIST_FILE, normalized.join(","));
    }
    return normalized;
}

function readSkinList() {
    return syncSkinList();
}

function writeSkinList(list) {
    ensureSkinDirectory();
    const validSet = new Set(listValidSkinFiles());
    const requested = (Array.isArray(list) ? list : [])
        .map((skin) => sanitizeSkinName(skin))
        .filter((skin) => validSet.has(skin));
    const uniq = normalizeSkinList(requested);
    fs.writeFileSync(SKIN_LIST_FILE, uniq.join(","));
    return uniq;
}

function addSkin(name) {
    const skins = readSkinList();
    skins.push(name);
    return writeSkinList(skins);
}

function removeSkin(name) {
    const next = readSkinList().filter((skin) => skin !== name);
    return writeSkinList(next);
}

function sanitizeSkinName(name) {
    return String(name || "")
        .toLowerCase()
        .replace(/[^a-z0-9_-]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, MAX_SKIN_NAME_LENGTH);
}

function createControlCommand(action, payload = {}) {
    const current = readJson(FILES.control, {nonce: 0, action: "noop"});
    const next = Object.assign({}, payload, {
        nonce: (current.nonce | 0) + 1,
        action,
    });
    writeJson(FILES.control, next);
    return next;
}

module.exports = {
    MAX_SKINS,
    ROOT_DIR,
    RUNTIME_DIR,
    WEB_DIR,
    SKINS_DIR,
    SKIN_LIST_FILE,
    FILES,
    readJson,
    writeJson,
    ensureSkinDirectory,
    syncSkinList,
    readSkinList,
    writeSkinList,
    addSkin,
    removeSkin,
    sanitizeSkinName,
    createControlCommand,
};
