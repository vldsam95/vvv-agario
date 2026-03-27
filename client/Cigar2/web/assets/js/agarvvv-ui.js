(function() {
    "use strict";

    const DEFAULT_SKIN_PREVIEW_SRC = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(
        "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 120 120'>"
        + "<rect width='120' height='120' rx='20' fill='#172234'/>"
        + "<circle cx='60' cy='46' r='22' fill='#4cc9f0'/>"
        + "<text x='60' y='94' font-size='18' text-anchor='middle' fill='#f4f7fb' font-family='Arial,sans-serif'>SKIN</text>"
        + "</svg>"
    )}`;

    function byId(id) {
        return document.getElementById(id);
    }

    function setUploadStatus(message, state) {
        const target = byId("skin-upload-status");
        if (!target) return;
        target.textContent = message;
        target.classList.remove("is-error", "is-success");
        if (state) target.classList.add(state);
    }

    function syncChoicePreview(inputId, previewId, shellId) {
        const input = byId(inputId);
        const preview = byId(previewId);
        const shell = byId(shellId);
        if (!input || !preview || !shell) return;
        const skinName = String(input.value || "").trim();
        if (!skinName) {
            preview.hidden = true;
            preview.removeAttribute("src");
            shell.classList.add("is-empty");
            return;
        }
        preview.hidden = false;
        preview.src = `skins/${skinName}.png`;
        shell.classList.remove("is-empty");
        preview.onerror = () => {
            preview.hidden = true;
            shell.classList.add("is-empty");
        };
        preview.onload = () => {
            preview.hidden = false;
            shell.classList.remove("is-empty");
        };
    }

    function syncSelectedSkinPreviews() {
        syncChoicePreview("skin", "skin-preview-main", "skin-preview-main-shell");
        syncChoicePreview("multiSkin", "skin-preview-multi", "skin-preview-multi-shell");
        const skinInput = byId("skin");
        const uploadPreview = byId("skin-preview");
        if (uploadPreview && skinInput) {
            const skinName = String(skinInput.value || "").trim();
            uploadPreview.src = skinName ? `skins/${skinName}.png` : DEFAULT_SKIN_PREVIEW_SRC;
            uploadPreview.onerror = () => {
                uploadPreview.onerror = null;
                uploadPreview.src = DEFAULT_SKIN_PREVIEW_SRC;
            };
        }
    }

    function formatUploadError(code, details = {}) {
        switch (code) {
            case "png_jpg_jpeg_only":
                return "Only PNG, JPG and JPEG files are supported.";
            case "invalid_image":
                return "The uploaded file could not be decoded as a valid image.";
            case "file_too_large":
                return "The image is too large for the current server upload limit.";
            case "skin_limit_reached":
                return `The server already has the maximum number of skins (${window.AGAR_CONFIG?.maxSkinCount || 500}).`;
            case "daily_skin_quota_reached": {
                const limit = details.limit || window.AGAR_CONFIG?.skinUploadDailyLimit || 3;
                const resetAt = details.resetAt ? new Date(details.resetAt) : null;
                const resetText = resetAt && !Number.isNaN(resetAt.getTime())
                    ? ` Try again after ${resetAt.toLocaleString()}.`
                    : " Try again tomorrow.";
                return `This IP reached the daily upload limit (${limit} skins per day).${resetText}`;
            }
            case "rate_limited":
                return "Too many uploads from this IP. Try again in a few minutes.";
            default:
                return code;
        }
    }

    async function refreshState() {
        try {
            const response = await fetch("/api/public/state", {cache: "no-store"});
            if (!response.ok) return;
            const state = await response.json();
            const serverEnabled = state.serverEnabled !== false;
            byId("runtime-mode").textContent = state.presetLabel || state.mode || "Arena";
            byId("runtime-humans").textContent = state.humans ?? 0;
            byId("runtime-bots").textContent = state.bots ?? 0;
            byId("runtime-leader").textContent = state.scoreLeader || "-";
            byId("runtime-updated").textContent = state.averageUpdateMs != null ? `${state.averageUpdateMs} ms` : "-";
            byId("server-status-badge").textContent = serverEnabled ? "Live" : "Offline";
            if (typeof window.setServerDisabled === "function") {
                window.setServerDisabled(!serverEnabled, serverEnabled ? "" : "The arena is currently offline. The admin can power it back on from the control panel.");
            }
        } catch (error) {
            byId("server-status-badge").textContent = "Offline";
        }
    }

    function populateRuntimeConfig() {
        const config = window.AGAR_CONFIG || {};
        const title = byId("title");
        const subtitle = byId("hero-subtitle");
        if (title && config.publicTitle) title.textContent = config.publicTitle;
        if (subtitle && config.publicSubtitle) subtitle.textContent = config.publicSubtitle;
        if (typeof window.setServerDisabled === "function") {
            window.setServerDisabled(config.serverEnabled === false, config.serverEnabled === false ? "The arena is currently offline. The admin can power it back on from the control panel." : "");
        }

        const select = byId("gamemode");
        if (select && Array.isArray(config.servers) && config.servers.length) {
            select.innerHTML = "";
            for (const server of config.servers) {
                const option = document.createElement("option");
                option.value = server.value;
                option.textContent = server.label;
                select.appendChild(option);
            }
        }

        const uploadForm = byId("skin-upload-form");
        if (uploadForm && !config.allowSkinUpload) {
            uploadForm.style.display = "none";
            setUploadStatus("Skin upload is currently disabled by the server.", "is-error");
        }
    }

    async function uploadSkin(event) {
        event.preventDefault();
        const fileInput = byId("skin-upload-input");
        const nameInput = byId("skin-upload-name");
        const skinInput = byId("skin");
        if (!fileInput.files.length) {
            setUploadStatus("Choose a PNG, JPG or JPEG file first.", "is-error");
            return;
        }
        const formData = new FormData();
        formData.append("skin", fileInput.files[0]);
        formData.append("name", nameInput.value || fileInput.files[0].name);
        setUploadStatus("Uploading skin...", "");
        try {
            const response = await fetch("/api/public/skins", {
                method: "POST",
                body: formData,
            });
            const data = await response.json();
            if (!response.ok) {
                setUploadStatus(`Upload failed: ${formatUploadError(data.error || "upload_failed", data)}`, "is-error");
                return;
            }
            if (skinInput) skinInput.value = data.skin;
            if (typeof window.changeSkin === "function") window.changeSkin(data.skin);
            if (typeof window.refreshSkinList === "function") window.refreshSkinList();
            syncSelectedSkinPreviews();
            const remainingDailyUploads = Number.isFinite(Number(data.remainingDailyUploads))
                ? Number(data.remainingDailyUploads)
                : null;
            const quotaSuffix = remainingDailyUploads === null
                ? ""
                : ` ${remainingDailyUploads} daily upload${remainingDailyUploads === 1 ? "" : "s"} left today.`;
            setUploadStatus(`Skin "${data.skin}" uploaded and selected.${quotaSuffix}`, "is-success");
            fileInput.value = "";
        } catch (error) {
            setUploadStatus(`Upload failed: ${formatUploadError(error.message)}`, "is-error");
        }
    }

    function watchSkinInputs() {
        for (const inputId of ["skin", "multiSkin"]) {
            const input = byId(inputId);
            if (!input) continue;
            input.addEventListener("input", syncSelectedSkinPreviews);
            input.addEventListener("change", syncSelectedSkinPreviews);
        }
    }

    document.addEventListener("DOMContentLoaded", () => {
        populateRuntimeConfig();
        refreshState();
        setInterval(refreshState, 5000);
        watchSkinInputs();
        syncSelectedSkinPreviews();
        window.syncSelectedSkinPreviews = syncSelectedSkinPreviews;
        const uploadForm = byId("skin-upload-form");
        if (uploadForm) uploadForm.addEventListener("submit", uploadSkin);
    });
})();
