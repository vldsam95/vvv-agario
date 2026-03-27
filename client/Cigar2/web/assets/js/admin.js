(function() {
    "use strict";

    const state = {
        serverSettings: null,
        modePresets: null,
        botSettings: null,
        skins: [],
        limits: {
            maxSkins: 200,
        },
        defaults: {
            initialPhysics: {},
            vanillaPhysics: {},
        },
        skinView: {
            page: 1,
            pageSize: 24,
        },
    };

    const PHYSICS_FIELDS = [
        "playerMaxCells",
        "playerStartSize",
        "playerSpeed",
        "splitVelocity",
        "ejectVelocity",
        "ejectCooldown",
        "playerDecayRate",
        "playerRecombineTime",
        "foodAmount",
        "virusAmount",
        "borderWidth",
        "borderHeight",
    ];
    const TICK_MS = 40;

    const SERVER_FIELDS = [
        "serverName",
        "serverWelcome1",
        "serverWelcome2",
        "serverMaxConnections",
        "serverIpLimit",
        "publicWsEndpoint",
        "serverScrambleLevel",
        "serverRestart",
        "multiControlMaxPilots",
    ];

    const ANTI_TEAM_FIELDS = [
        "antiTeamStateDecayPerTick",
        "antiTeamMaxMultiplier",
        "antiTeamApplyBase",
        "antiTeamDecayScale",
        "antiTeamPairWindowTicks",
        "antiTeamMinPairEvents",
        "antiTeamMaxPairsPerPlayer",
        "antiTeamEjectWeight",
        "antiTeamPlayerEatWeight",
        "antiTeamVirusBurstMultiplier",
        "antiTeamVirusBurstThreshold",
        "antiTeamEjectWindowTicks",
    ];

    const ANTI_TEAM_CHECKBOXES = [
        "antiTeamEnabled",
        "antiTeamApplyToBots",
        "antiTeamIgnoreLinkedPlayers",
        "antiTeamIgnoreTeamBots",
    ];

    function parseBulkNicknames(raw) {
        if (typeof raw !== "string") return [];
        const lines = raw.split(/\r?\n/);
        const result = [];
        const seen = new Set();
        for (const line of lines) {
            const nickname = line.trim().replace(/\s+/g, " ").slice(0, 60);
            if (!nickname) continue;
            const key = nickname.toLowerCase();
            if (seen.has(key)) continue;
            seen.add(key);
            result.push(nickname);
            if (result.length >= 300) break;
        }
        return result;
    }

    function massToSize(mass) {
        const value = Number(mass);
        if (!Number.isFinite(value) || value <= 0) return 0;
        return Math.sqrt(value * 100);
    }

    function sizeToMass(size) {
        const value = Number(size);
        if (!Number.isFinite(value) || value <= 0) return 0;
        return value * value / 100;
    }

    function ticksToMs(ticks) {
        const value = Number(ticks);
        if (!Number.isFinite(value) || value <= 0) return 0;
        return Math.round(value * TICK_MS);
    }

    function msToTicks(ms) {
        const value = Number(ms);
        if (!Number.isFinite(value) || value <= 0) return 0;
        return Math.max(0, Math.floor(value / TICK_MS));
    }

    function byId(id) {
        return document.getElementById(id);
    }

    function setMessage(targetId, message) {
        const target = byId(targetId);
        if (target) target.textContent = message;
    }

    function setUploadMessage(targetId, message, stateClass) {
        const target = byId(targetId);
        if (!target) return;
        target.textContent = message;
        target.classList.remove("is-error", "is-success");
        if (stateClass) target.classList.add(stateClass);
    }

    async function request(url, options = {}) {
        const headers = Object.assign({}, options.headers || {});
        if (!(options.body instanceof FormData) && !headers["Content-Type"]) {
            headers["Content-Type"] = "application/json";
        }
        const response = await fetch(url, Object.assign({
            cache: "no-store",
            headers,
        }, options, {headers}));
        const text = await response.text();
        const data = text ? JSON.parse(text) : {};
        if (!response.ok) {
            throw new Error(data.error || response.statusText);
        }
        return data;
    }

    function formatUploadError(code) {
        switch (code) {
            case "png_jpg_jpeg_only":
                return "Only PNG, JPG and JPEG files are supported.";
            case "invalid_image":
                return "The uploaded file could not be decoded as a valid image.";
            case "file_too_large":
                return "The image is too large for the current server upload limit.";
            case "skin_limit_reached":
                return `The server already has the maximum number of skins (${state.limits.maxSkins || 200}).`;
            case "missing_file":
                return "Choose a file first.";
            default:
                return code;
        }
    }

    function showLogin(authenticated) {
        byId("loginView").hidden = authenticated;
        byId("dashboardView").hidden = !authenticated;
        byId("logoutBtn").hidden = !authenticated;
        byId("sessionState").textContent = authenticated ? "Authenticated" : "Login required";
    }

    function renderPresetSelect() {
        const select = byId("activePreset");
        select.innerHTML = "";
        const presets = state.modePresets?.presets || {};
        for (const [key, preset] of Object.entries(presets)) {
            const option = document.createElement("option");
            option.value = key;
            option.textContent = preset.label || key;
            select.appendChild(option);
        }
        select.value = state.serverSettings.activePreset || "ffa";
        if (select.value !== state.serverSettings.activePreset) {
            state.serverSettings.activePreset = select.value;
        }
    }

    function renderProfiles() {
        const wrapper = byId("profilesList");
        const template = byId("profileTemplate");
        wrapper.innerHTML = "";
        for (const profile of state.botSettings.profiles || []) {
            const fragment = template.content.cloneNode(true);
            const article = fragment.querySelector(".profile-card");
            article.dataset.profileId = profile.id;
            article.querySelector("[data-field='label']").value = profile.label || "";
            article.querySelector("[data-field='logic']").value = profile.logic || "balanced";
            article.querySelector("[data-field='skin']").value = profile.skin || "";
            article.querySelector("[data-field='randomSkin']").checked = !!profile.randomSkin;
            article.querySelector("[data-field='spawnWeight']").value = profile.spawnWeight || 1;
            article.querySelector("[data-field='namePrefix']").value = profile.namePrefix || "";
            article.querySelector(".delete-profile").addEventListener("click", () => {
                state.botSettings.profiles = state.botSettings.profiles.filter((item) => item.id !== profile.id);
                renderProfiles();
            });
            wrapper.appendChild(fragment);
        }
    }

    function renderState(serverState) {
        const wrapper = byId("serverState");
        wrapper.innerHTML = "";
        const items = {
            power: serverState.serverEnabled === false ? "Offline" : "Online",
            preset: serverState.presetLabel || "-",
            mode: serverState.mode || "-",
            humans: serverState.humans ?? 0,
            bots: serverState.bots ?? 0,
            leader: serverState.scoreLeader || "-",
            average_update_ms: serverState.averageUpdateMs ?? "-",
        };
        for (const [key, value] of Object.entries(items)) {
            const item = document.createElement("div");
            item.className = "state-item";
            item.innerHTML = `<span>${key.replace(/_/g, " ")}</span><strong>${value}</strong>`;
            wrapper.appendChild(item);
        }
    }

    function renderSkinGallery() {
        const wrapper = byId("skinGallery");
        const summary = byId("skinGallerySummary");
        const pagination = byId("skinGalleryPagination");
        const total = state.skins.length;
        const maxSkins = state.limits.maxSkins || 500;
        const totalPages = Math.max(1, Math.ceil(total / state.skinView.pageSize));
        state.skinView.page = Math.min(totalPages, Math.max(1, state.skinView.page));
        const start = (state.skinView.page - 1) * state.skinView.pageSize;
        const pageSkins = state.skins.slice(start, start + state.skinView.pageSize);
        wrapper.innerHTML = "";
        if (summary) {
            if (!total) summary.textContent = `0 / ${maxSkins} skins`;
            else summary.textContent = `${total} / ${maxSkins} skins, showing ${start + 1}-${start + pageSkins.length}`;
        }
        for (const skin of pageSkins) {
            const item = document.createElement("div");
            item.className = "skin-tile";
            const image = document.createElement("img");
            image.src = `/skins/${skin}.png`;
            image.alt = skin;
            const name = document.createElement("div");
            name.className = "skin-name";
            name.textContent = skin;
            const removeButton = document.createElement("button");
            removeButton.type = "button";
            removeButton.className = "delete-skin";
            removeButton.textContent = "Delete";
            removeButton.addEventListener("click", () => deleteSkin(skin));
            item.appendChild(image);
            item.appendChild(name);
            item.appendChild(removeButton);
            wrapper.appendChild(item);
        }
        if (!pageSkins.length) {
            wrapper.innerHTML = `<div class="message">No skins uploaded yet.</div>`;
        }
        if (pagination) {
            pagination.innerHTML = "";
            const previous = document.createElement("button");
            previous.type = "button";
            previous.className = "pagination-button";
            previous.textContent = "Prev";
            previous.disabled = state.skinView.page <= 1;
            previous.addEventListener("click", () => {
                state.skinView.page--;
                renderSkinGallery();
            });
            const status = document.createElement("span");
            status.className = "pagination-status";
            status.textContent = `${state.skinView.page} / ${totalPages}`;
            const next = document.createElement("button");
            next.type = "button";
            next.className = "pagination-button";
            next.textContent = "Next";
            next.disabled = state.skinView.page >= totalPages;
            next.addEventListener("click", () => {
                state.skinView.page++;
                renderSkinGallery();
            });
            pagination.appendChild(previous);
            pagination.appendChild(status);
            pagination.appendChild(next);
        }
    }

    async function deleteSkin(skin) {
        if (!skin || !window.confirm(`Delete skin "${skin}"?`)) return;
        try {
            await request(`/api/admin/skins/${encodeURIComponent(skin)}`, {
                method: "DELETE",
            });
            state.skins = state.skins.filter((item) => item !== skin);
            renderSkinGallery();
            setMessage("saveMessage", `Skin "${skin}" deleted.`);
        } catch (error) {
            setMessage("saveMessage", `Skin delete failed: ${error.message}`);
        }
    }

    async function uploadAdminSkin(event) {
        event.preventDefault();
        const fileInput = byId("adminSkinUploadInput");
        const nameInput = byId("adminSkinUploadName");
        if (!fileInput?.files?.length) {
            setUploadMessage("adminSkinUploadStatus", "Choose a PNG, JPG or JPEG file first.", "is-error");
            return;
        }
        const formData = new FormData();
        formData.append("skin", fileInput.files[0]);
        formData.append("name", nameInput.value || fileInput.files[0].name);
        setUploadMessage("adminSkinUploadStatus", "Uploading skin...", "");
        try {
            const payload = await request("/api/admin/skins", {
                method: "POST",
                body: formData,
            });
            state.skins = Array.from(new Set([...(state.skins || []), payload.skin])).sort();
            renderSkinGallery();
            fileInput.value = "";
            nameInput.value = "";
            setUploadMessage("adminSkinUploadStatus", `Skin "${payload.skin}" uploaded.`, "is-success");
            setMessage("saveMessage", `Skin "${payload.skin}" uploaded via admin.`);
        } catch (error) {
            setUploadMessage("adminSkinUploadStatus", `Upload failed: ${formatUploadError(error.message)}`, "is-error");
        }
    }

    function updatePowerControls() {
        const enabled = state.serverSettings?.serverEnabled !== false;
        const powerButton = byId("powerToggleBtn");
        const powerLabel = byId("powerStateLabel");
        if (powerButton) {
            powerButton.textContent = enabled ? "Shutdown Server" : "Start Server";
        }
        if (powerLabel) {
            powerLabel.textContent = enabled ? "Server online" : "Server offline";
        }
    }

    function fillServerForm() {
        for (const id of SERVER_FIELDS.concat(PHYSICS_FIELDS, ANTI_TEAM_FIELDS)) {
            const element = byId(id);
            if (element) element.value = state.serverSettings[id] ?? "";
        }
        byId("allowSkinUpload").checked = !!state.serverSettings.allowSkinUpload;
        byId("dualControlEnabled").checked = !!state.serverSettings.dualControlEnabled;
        for (const id of ANTI_TEAM_CHECKBOXES) {
            const element = byId(id);
            if (element) element.checked = !!state.serverSettings[id];
        }
        byId("botTargetCount").value = state.botSettings.targetCount ?? 0;
        byId("botAutoFill").checked = !!state.botSettings.autoFill;
        byId("botBulkNicknames").value = Array.isArray(state.botSettings.bulkNicknames)
            ? state.botSettings.bulkNicknames.join("\n")
            : "";
        byId("ejectCooldown").value = ticksToMs(state.serverSettings.ejectCooldown ?? 3);
        byId("playerMaxMass").value = Math.round(sizeToMass(state.serverSettings.playerMaxSize ?? 1500));
        byId("modePresetsJson").value = JSON.stringify(state.modePresets, null, 2);
        renderPresetSelect();
        renderProfiles();
        renderSkinGallery();
        updatePowerControls();
    }

    function fillPhysicsFields(values) {
        for (const field of PHYSICS_FIELDS) {
            const element = byId(field);
            if (element) element.value = values[field] ?? "";
        }
        byId("ejectCooldown").value = ticksToMs(values.ejectCooldown ?? 3);
        byId("playerMaxMass").value = Math.round(sizeToMass(values.playerMaxSize ?? 1500));
    }

    function applyPhysicsDefaults(kind) {
        const defaults = state.defaults?.[kind];
        if (!defaults) return;
        state.serverSettings = Object.assign({}, state.serverSettings, defaults);
        fillPhysicsFields(state.serverSettings);
        const message = kind === "initialPhysics"
            ? "Launch physics defaults loaded into the form."
            : "Agar-style physics defaults loaded into the form.";
        setMessage("saveMessage", message);
    }

    function applySelectedPreset() {
        const presetKey = byId("activePreset").value;
        const preset = state.modePresets?.presets?.[presetKey];
        if (!preset || !preset.config) return;
        state.serverSettings.activePreset = presetKey;
        if (preset.config.serverName) byId("serverName").value = preset.config.serverName;
        for (const field of PHYSICS_FIELDS) {
            if (preset.config[field] == null) continue;
            const element = byId(field);
            if (element) element.value = preset.config[field];
        }
        if (preset.config.playerMaxSize != null) {
            byId("playerMaxMass").value = Math.round(sizeToMass(preset.config.playerMaxSize));
        }
        if (preset.config.ejectCooldown != null) {
            byId("ejectCooldown").value = ticksToMs(preset.config.ejectCooldown);
        }
        setMessage("saveMessage", `Preset "${preset.label || presetKey}" loaded into the form. Save to apply it live.`);
    }

    function collectProfiles() {
        return Array.from(document.querySelectorAll(".profile-card")).map((card, index) => ({
            id: card.dataset.profileId || `profile-${index + 1}`,
            label: card.querySelector("[data-field='label']").value,
            logic: card.querySelector("[data-field='logic']").value,
            skin: card.querySelector("[data-field='skin']").value,
            randomSkin: card.querySelector("[data-field='randomSkin']").checked,
            spawnWeight: Number(card.querySelector("[data-field='spawnWeight']").value || 1),
            namePrefix: card.querySelector("[data-field='namePrefix']").value,
        }));
    }

    function collectPayload() {
        const playerMaxMassInput = Number(byId("playerMaxMass").value);
        const fallbackPlayerMaxMass = Math.round(sizeToMass(state.serverSettings?.playerMaxSize ?? 1500));
        const playerMaxMass = Number.isFinite(playerMaxMassInput) && playerMaxMassInput > 0
            ? playerMaxMassInput
            : fallbackPlayerMaxMass;
        state.serverSettings = Object.assign({}, state.serverSettings, {
            serverName: byId("serverName").value,
            activePreset: byId("activePreset").value,
            serverWelcome1: byId("serverWelcome1").value,
            serverWelcome2: byId("serverWelcome2").value,
            serverMaxConnections: Number(byId("serverMaxConnections").value || 0),
            serverIpLimit: Number(byId("serverIpLimit").value || 0),
            publicWsEndpoint: byId("publicWsEndpoint").value,
            serverScrambleLevel: Number(byId("serverScrambleLevel").value || 0),
            serverRestart: Number(byId("serverRestart").value || 0),
            multiControlMaxPilots: Number(byId("multiControlMaxPilots").value || 0),
            allowSkinUpload: byId("allowSkinUpload").checked,
            dualControlEnabled: byId("dualControlEnabled").checked,
            antiTeamEnabled: byId("antiTeamEnabled").checked,
            antiTeamApplyToBots: byId("antiTeamApplyToBots").checked,
            antiTeamIgnoreLinkedPlayers: byId("antiTeamIgnoreLinkedPlayers").checked,
            antiTeamIgnoreTeamBots: byId("antiTeamIgnoreTeamBots").checked,
            playerMaxCells: Number(byId("playerMaxCells").value || 0),
            playerStartSize: Number(byId("playerStartSize").value || 0),
            playerSpeed: Number(byId("playerSpeed").value || 0),
            playerMaxSize: massToSize(playerMaxMass),
            splitVelocity: Number(byId("splitVelocity").value || 0),
            ejectVelocity: Number(byId("ejectVelocity").value || 0),
            ejectCooldown: msToTicks(byId("ejectCooldown").value),
            playerDecayRate: Number(byId("playerDecayRate").value || 0),
            playerRecombineTime: Number(byId("playerRecombineTime").value || 0),
            foodAmount: Number(byId("foodAmount").value || 0),
            virusAmount: Number(byId("virusAmount").value || 0),
            borderWidth: Number(byId("borderWidth").value || 0),
            borderHeight: Number(byId("borderHeight").value || 0),
            antiTeamStateDecayPerTick: Number(byId("antiTeamStateDecayPerTick").value || 0),
            antiTeamMaxMultiplier: Number(byId("antiTeamMaxMultiplier").value || 0),
            antiTeamApplyBase: Number(byId("antiTeamApplyBase").value || 0),
            antiTeamDecayScale: Number(byId("antiTeamDecayScale").value || 0),
            antiTeamPairWindowTicks: Number(byId("antiTeamPairWindowTicks").value || 0),
            antiTeamMinPairEvents: Number(byId("antiTeamMinPairEvents").value || 0),
            antiTeamMaxPairsPerPlayer: Number(byId("antiTeamMaxPairsPerPlayer").value || 0),
            antiTeamEjectWeight: Number(byId("antiTeamEjectWeight").value || 0),
            antiTeamPlayerEatWeight: Number(byId("antiTeamPlayerEatWeight").value || 0),
            antiTeamVirusBurstMultiplier: Number(byId("antiTeamVirusBurstMultiplier").value || 0),
            antiTeamVirusBurstThreshold: Number(byId("antiTeamVirusBurstThreshold").value || 0),
            antiTeamEjectWindowTicks: Number(byId("antiTeamEjectWindowTicks").value || 0),
        });
        state.botSettings = Object.assign({}, state.botSettings, {
            targetCount: Number(byId("botTargetCount").value || 0),
            autoFill: byId("botAutoFill").checked,
            bulkNicknames: parseBulkNicknames(byId("botBulkNicknames").value),
            profiles: collectProfiles(),
        });
        try {
            state.modePresets = JSON.parse(byId("modePresetsJson").value);
        } catch (error) {
            throw new Error("invalid_presets_json");
        }
        return {
            serverSettings: state.serverSettings,
            botSettings: state.botSettings,
            modePresets: state.modePresets,
        };
    }

    async function saveSettings(resetWorld) {
        try {
            const payload = collectPayload();
            await request("/api/admin/settings", {
                method: "PUT",
                body: JSON.stringify(payload),
            });
            if (resetWorld) {
                await request("/api/admin/command/reset-world", {
                    method: "POST",
                    body: JSON.stringify({reason: "Reset requested from admin panel"}),
                });
            }
            setMessage("saveMessage", resetWorld ? "Saved and reset command sent." : "Runtime settings saved.");
            await loadDashboard();
        } catch (error) {
            setMessage("saveMessage", `Save failed: ${error.message}`);
        }
    }

    async function broadcast() {
        try {
            const message = byId("broadcastMessage").value.trim();
            if (!message) {
                setMessage("saveMessage", "Broadcast message is empty.");
                return;
            }
            await request("/api/admin/command/broadcast", {
                method: "POST",
                body: JSON.stringify({message}),
            });
            setMessage("saveMessage", "Broadcast command sent.");
            byId("broadcastMessage").value = "";
        } catch (error) {
            setMessage("saveMessage", `Broadcast failed: ${error.message}`);
        }
    }

    async function togglePower() {
        const targetEnabled = state.serverSettings?.serverEnabled === false;
        try {
            await request("/api/admin/power", {
                method: "POST",
                body: JSON.stringify({enabled: targetEnabled}),
            });
            state.serverSettings.serverEnabled = targetEnabled;
            updatePowerControls();
            setMessage("saveMessage", targetEnabled ? "Server start requested." : "Server shutdown requested.");
            await loadDashboard();
        } catch (error) {
            setMessage("saveMessage", `Power change failed: ${error.message}`);
        }
    }

    async function loadDashboard() {
        const payload = await request("/api/admin/settings");
        state.serverSettings = payload.serverSettings;
        state.modePresets = payload.modePresets;
        state.botSettings = payload.botSettings;
        state.skins = payload.skins || [];
        state.limits = payload.limits || state.limits;
        state.defaults = payload.defaults || state.defaults;
        fillServerForm();
        renderState(payload.serverState || {});
    }

    async function checkSession() {
        try {
            const session = await request("/api/admin/session", {
                headers: {},
            });
            showLogin(session.authenticated);
            if (session.authenticated) {
                await loadDashboard();
            }
        } catch (error) {
            showLogin(false);
        }
    }

    async function login(event) {
        event.preventDefault();
        try {
            await request("/api/admin/login", {
                method: "POST",
                body: JSON.stringify({
                    username: byId("loginUsername").value,
                    password: byId("loginPassword").value,
                }),
            });
            setMessage("loginMessage", "Authenticated.");
            byId("loginPassword").value = "";
            await checkSession();
        } catch (error) {
            setMessage("loginMessage", `Login failed: ${error.message}`);
        }
    }

    async function logout() {
        await request("/api/admin/logout", {
            method: "POST",
            headers: {},
        });
        showLogin(false);
    }

    function addProfile() {
        state.botSettings.profiles.push({
            id: `profile-${Date.now()}`,
            label: "New Profile",
            logic: "balanced",
            skin: "",
            randomSkin: false,
            spawnWeight: 1,
            namePrefix: "Bot",
        });
        renderProfiles();
    }

    document.addEventListener("DOMContentLoaded", () => {
        byId("loginForm").addEventListener("submit", login);
        byId("logoutBtn").addEventListener("click", logout);
        byId("saveLiveBtn").addEventListener("click", () => saveSettings(false));
        byId("saveResetBtn").addEventListener("click", () => saveSettings(true));
        byId("powerToggleBtn").addEventListener("click", togglePower);
        byId("broadcastBtn").addEventListener("click", broadcast);
        byId("addProfileBtn").addEventListener("click", addProfile);
        byId("adminSkinUploadForm").addEventListener("submit", uploadAdminSkin);
        byId("physicsProjectDefaultsBtn").addEventListener("click", () => applyPhysicsDefaults("initialPhysics"));
        byId("physicsVanillaDefaultsBtn").addEventListener("click", () => applyPhysicsDefaults("vanillaPhysics"));
        byId("activePreset").addEventListener("change", applySelectedPreset);
        checkSession();
    });
})();
