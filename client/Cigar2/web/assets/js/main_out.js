(function() {
    'use strict';

    window.__AGAR_MAIN_SCRIPT_LOADED = true;

    if (typeof WebSocket === 'undefined' || typeof DataView === 'undefined' ||
        typeof ArrayBuffer === 'undefined' || typeof Uint8Array === 'undefined') {
        alert('Your browser does not support required features, please update your browser or get a new one.');
        window.stop();
    }

    function byId(id) {
        return document.getElementById(id);
    }
    /*
    function byClass(clss, parent) {
        return (parent || document).getElementsByClassName(clss);
    }
    */

    class Sound {
        constructor(src, volume, maximum) {
            this.src = src;
            this.volume = typeof volume === 'number' ? volume : 0.5;
            this.maximum = typeof maximum === 'number' ? maximum : Infinity;
            this.elms = [];
        }
        play(vol) {
            if (typeof vol === 'number') this.volume = vol;
            const toPlay = this.elms.find((elm) => elm.paused) ?? this.add();
            toPlay.volume = this.volume;
            toPlay.play();
        }
        add() {
            if (this.elms.length >= this.maximum) return this.elms[0];
            const elm = new Audio(this.src);
            this.elms.push(elm);
            return elm;
        }
    }

    const LOAD_START = Date.now();

    Array.prototype.remove = function (a) {
        const i = this.indexOf(a);
        return i !== -1 && this.splice(i, 1);
    }

    Element.prototype.hide = function () {
        this.style.display = 'none';
        if (this.style.opacity === 1) this.style.opacity = 0;
    }

    Element.prototype.show = function (seconds) {
        this.style.display = '';
        if (!seconds) return;
        this.style.transition = `opacity ${seconds}s ease 0s`;
        this.style.opacity = 1;
    }

    class Color {
        static fromHex(color) {
            let hex = color;
            if (color.startsWith('#')) hex = color.slice(1);
            if (hex.length === 3) hex = hex.split('').map((c) => c + c).join('');
            if (hex.length !== 6) throw new Error(`Invalid color ${color}`);
            const v = parseInt(hex, 16);
            return new Color(v >>> 16 & 255, v >>> 8 & 255, v & 255, `#${hex}`);
        }
        constructor(r, g, b, hex) {
            this.r = r;
            this.g = g;
            this.b = b;
            this.hexCache = hex;
        }
        clone() {
            return new Color(this.r, this.g, this.b);
        }
        toHex() {
            if (this.hexCache) return this.hexCache;
            return this.hexCache = `#${(1 << 24 | this.r << 16 | this.g << 8 | this.b).toString(16).slice(1)}`;
        }
        darken(grade = 1) {
            grade /= 10;
            this.r *= 1 - grade;
            this.g *= 1 - grade;
            this.b *= 1 - grade;
            return this;
        }
        darker(grade = 1) {
            return this.clone().darken(grade);
        }
    }

    function cleanupObject(object) {
        for (const i in object) delete object[i];
    }

    class Writer {
        constructor(littleEndian) {
            this.writer = true;
            this.tmpBuf = new DataView(new ArrayBuffer(8));
            this._e = littleEndian;
            this.reset();
            return this;
        }
        reset(littleEndian = this._e) {
            this._e = littleEndian;
            this._b = [];
            this._o = 0;
        }
        setUint8(a) {
            if (a >= 0 && a < 256) this._b.push(a);
            return this;
        }
        setInt8(a) {
            if (a >= -128 && a < 128) this._b.push(a);
            return this;
        }
        setUint16(a) {
            this.tmpBuf.setUint16(0, a, this._e);
            this._move(2);
            return this;
        }
        setInt16(a) {
            this.tmpBuf.setInt16(0, a, this._e);
            this._move(2);
            return this;
        }
        setUint32(a) {
            this.tmpBuf.setUint32(0, a, this._e);
            this._move(4);
            return this;
        }
        setInt32(a) {
            this.tmpBuf.setInt32(0, a, this._e);
            this._move(4);
            return this;
        }
        setFloat32(a) {
            this.tmpBuf.setFloat32(0, a, this._e);
            this._move(4);
            return this;
        }
        setFloat64(a) {
            this.tmpBuf.setFloat64(0, a, this._e);
            this._move(8);
            return this;
        }
        _move(b) {
            for (let i = 0; i < b; i++) this._b.push(this.tmpBuf.getUint8(i));
        }
        setStringUTF8(s) {
            const bytesStr = unescape(encodeURIComponent(s));
            for (let i = 0, l = bytesStr.length; i < l; i++) this._b.push(bytesStr.charCodeAt(i));
            this._b.push(0);
            return this;
        }
        build() {
            return new Uint8Array(this._b);
        }
    }

    class Reader {
        constructor(view, offset, littleEndian) {
            this.reader = true;
            this._e = littleEndian;
            if (view) this.repurpose(view, offset);
        }
        repurpose(view, offset) {
            this.view = view;
            this._o = offset || 0;
        }
        getUint8() {
            return this.view.getUint8(this._o++, this._e);
        }
        getInt8() {
            return this.view.getInt8(this._o++, this._e);
        }
        getUint16() {
            return this.view.getUint16((this._o += 2) - 2, this._e);
        }
        getInt16() {
            return this.view.getInt16((this._o += 2) - 2, this._e);
        }
        getUint32() {
            return this.view.getUint32((this._o += 4) - 4, this._e);
        }
        getInt32() {
            return this.view.getInt32((this._o += 4) - 4, this._e);
        }
        getFloat32() {
            return this.view.getFloat32((this._o += 4) - 4, this._e);
        }
        getFloat64() {
            return this.view.getFloat64((this._o += 8) - 8, this._e);
        }
        getStringUTF8() {
            let s = '', b;
            while ((b = this.view.getUint8(this._o++)) !== 0) s += String.fromCharCode(b);
            return decodeURIComponent(escape(s));
        }
    }

    class Logger {
        static get verbosity() {
            return 2;
        }
        static error() {
            if (Logger.verbosity > 0) console.error.apply(null, arguments);
        }
        static warn() {
            if (Logger.verbosity > 1) console.warn.apply(null, arguments);
        }
        static info() {
            if (Logger.verbosity > 2) console.info.apply(null, arguments);
        }
        static debug() {
            if (Logger.verbosity > 3) console.debug.apply(null, arguments);
        }
    }

    const WEBSOCKET_URL = window.AGAR_CONFIG?.defaultWsEndpoint || null;
    const FALLBACK_WS_URL = '/ws';
    const WS_TICKET_ENDPOINT = window.AGAR_CONFIG?.wsTicketEndpoint || '/api/public/ws-ticket';
    const CONNECTION_REPORT_ENDPOINT = window.AGAR_CONFIG?.connectionReportEndpoint || '/api/public/connection-report';
    const SKIN_URL = './skins/';
    const USE_HTTPS = 'https:' === window.location.protocol;
    const RESUME_SESSION_STORAGE_KEY = 'agarvvv_resume_id';
    const EMPTY_NAME = 'An unnamed cell';
    const DEFAULT_CONNECTING_TITLE = 'Connecting';
    const DEFAULT_CONNECTING_MESSAGE = 'Establishing a secure connection to the arena.';
    const CONNECTION_REPORT_VERSION = '2025-03-connection-diagnostics-v1';
    const CLIENT_BOOTSTRAP_REPORT_VERSION = '2026-03-client-bootstrap-v1';
    const WS_TICKET_TIMEOUT_MS = 12000;
    const WS_TICKET_REFRESH_BUFFER_MS = 5000;
    const WS_TICKET_RETRY_ATTEMPTS = 2;
    const WS_TICKET_RETRY_DELAY_MS = 1200;
    const RECONNECT_RECOVERY_DELAY_MS = 1800;
    const RECONNECT_RECOVERY_MAX_ATTEMPTS = 8;
    const QUADTREE_MAX_POINTS = 32;
    const CELL_POINTS_MIN = 5;
    const CELL_POINTS_MAX = 120;
    const VIRUS_POINTS = 100;
    const PI_2 = Math.PI * 2;
    const SEND_254 = new Uint8Array([254, 6, 0, 0, 0]);
    const SEND_255 = new Uint8Array([255, 1, 0, 0, 0]);
    const UINT8_CACHE = {
        1: new Uint8Array([1]),
        17: new Uint8Array([17]),
        21: new Uint8Array([21]),
        18: new Uint8Array([18]),
        19: new Uint8Array([19]),
        22: new Uint8Array([22]),
        23: new Uint8Array([23]),
        24: new Uint8Array([24]),
        25: new Uint8Array([25]),
        26: new Uint8Array([26]),
        27: new Uint8Array([27]),
        29: new Uint8Array([29]),
        30: new Uint8Array([30]),
        31: new Uint8Array([31]),
        254: new Uint8Array([254]),
    };
    const KEY_TO_OPCODE = {
        e: UINT8_CACHE[22],
        t: UINT8_CACHE[24],
        p: UINT8_CACHE[25],
    };
    const IE_KEYS = {
        spacebar: ' ',
        esc: 'escape',
    };
    const CODE_TO_KEY = {
        Space: ' ',
        KeyW: 'w',
        KeyQ: 'q',
        KeyD: 'd',
        KeyZ: 'z',
        KeyE: 'e',
        KeyR: 'r',
        KeyT: 't',
        KeyP: 'p',
        Tab: 'tab',
    };

    function resolveWsUrl(url) {
        if (/^wss?:\/\//.test(url)) return url;
        if (/^https?:\/\//.test(url)) return url.replace(/^http/i, 'ws');
        if (url.startsWith('/')) return `ws${USE_HTTPS ? 's' : ''}://${window.location.host}${url}`;
        return `ws${USE_HTTPS ? 's' : ''}://${url}`;
    }

    function buildSocketUrl(url, ticket) {
        const socketUrl = new URL(resolveWsUrl(url), window.location.href);
        if (ticket) socketUrl.searchParams.set('ws_ticket', ticket);
        else socketUrl.searchParams.delete('ws_ticket');
        if (wsResumeId) socketUrl.searchParams.set('resume_id', wsResumeId);
        return socketUrl.toString();
    }

    function createResumeSessionId() {
        try {
            if (window.crypto && typeof window.crypto.getRandomValues === 'function') {
                const bytes = new Uint8Array(16);
                window.crypto.getRandomValues(bytes);
                return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
            }
        } catch (error) {
            Logger.warn(error);
        }
        return `${Date.now().toString(16)}${Math.random().toString(16).slice(2, 18)}`;
    }

    function getResumeSessionId() {
        try {
            const stored = window.sessionStorage?.getItem(RESUME_SESSION_STORAGE_KEY);
            if (stored && /^[a-f0-9]{24,64}$/i.test(stored)) return stored;
            const created = createResumeSessionId();
            window.sessionStorage?.setItem(RESUME_SESSION_STORAGE_KEY, created);
            return created;
        } catch (error) {
            Logger.warn(error);
            return createResumeSessionId();
        }
    }

    function createDiagnosticId() {
        return `diag-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    }

    function sanitizeDiagnosticValue(value, maxLength = 180) {
        return String(value || '').replace(/\s+/g, ' ').trim().slice(0, maxLength);
    }

    function shortenDiagnosticValue(value, head = 8, tail = 4) {
        const text = sanitizeDiagnosticValue(value, 128);
        if (!text) return '-';
        if (text.length <= head + tail + 1) return text;
        return `${text.slice(0, head)}...${text.slice(-tail)}`;
    }

    function getOnlineStateText(value) {
        if (value === true) return 'true';
        if (value === false) return 'false';
        return 'unknown';
    }

    function getClientNetworkSnapshot() {
        const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
        return {
            effectiveType: sanitizeDiagnosticValue(connection?.effectiveType, 24),
            rtt: Number.isFinite(connection?.rtt) ? Math.max(0, Math.round(connection.rtt)) : 0,
            downlinkMbps: Number.isFinite(connection?.downlink)
                ? Math.max(0, Math.round(connection.downlink * 100) / 100)
                : 0,
        };
    }

    function buildClientBootstrapDetails(state) {
        const lines = [
            `diag_id=${sanitizeDiagnosticValue(state.diagId || '-', 64)}`,
            `time_utc=${sanitizeDiagnosticValue(state.time || new Date().toISOString(), 48)}`,
            `stage=${sanitizeDiagnosticValue(state.stage || 'bootstrap', 48)}`,
            `severity=${sanitizeDiagnosticValue(state.severity || 'error', 24)}`,
            `context=${sanitizeDiagnosticValue(state.context || '-', 48)}`,
            `title=${sanitizeDiagnosticValue(state.title || '-', 120)}`,
            `message=${sanitizeDiagnosticValue(state.message || '-', 220)}`,
            `error_name=${sanitizeDiagnosticValue(state.errorName || '-', 80)}`,
            `error_message=${sanitizeDiagnosticValue(state.errorMessage || '-', 220)}`,
            `page=${sanitizeDiagnosticValue(window.location.pathname || '/', 180)}`,
            `browser_lang=${sanitizeDiagnosticValue(navigator.language || '-', 32)}`,
            `browser_ua=${sanitizeDiagnosticValue(navigator.userAgent || '-', 160)}`,
            `visibility=${sanitizeDiagnosticValue(document.visibilityState || '-', 24)}`,
            `online=${getOnlineStateText(typeof navigator.onLine === 'boolean' ? navigator.onLine : undefined)}`,
            `resume_session=${shortenDiagnosticValue(wsResumeId)}`,
        ];
        const stack = sanitizeDiagnosticValue(state.stack || '', 900);
        if (stack) lines.push(`stack=${stack}`);
        return lines.join('\n');
    }

    function sendClientBootstrapReport(state) {
        if (!CONNECTION_REPORT_ENDPOINT || typeof fetch !== 'function' || !state) {
            return Promise.resolve();
        }
        const signature = [
            state.stage || '-',
            state.context || '-',
            state.errorName || '-',
            state.errorMessage || '-',
        ].join('|');
        if (bootstrapReportSignatures.has(signature)) {
            return Promise.resolve();
        }
        bootstrapReportSignatures.add(signature);
        const diagId = state.diagId || createDiagnosticId();
        const detailsText = buildClientBootstrapDetails(Object.assign({}, state, {diagId}));
        const network = getClientNetworkSnapshot();
        return fetch(CONNECTION_REPORT_ENDPOINT, {
            method: 'POST',
            cache: 'no-store',
            credentials: 'same-origin',
            keepalive: true,
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                diagId,
                reportVersion: CLIENT_BOOTSTRAP_REPORT_VERSION,
                connectionIntent: 'bootstrap',
                stage: sanitizeDiagnosticValue(state.stage || 'bootstrap', 48),
                severity: sanitizeDiagnosticValue(state.severity || 'error', 24),
                title: sanitizeDiagnosticValue(state.title || 'Client bootstrap issue', 120),
                message: sanitizeDiagnosticValue(state.message || 'The page hit a startup error.', 240),
                detailsText,
                page: window.location.pathname,
                sessionId: wsResumeId,
                ui: {
                    status: sanitizeDiagnosticValue(state.title || 'Client bootstrap issue', 32),
                    visibleNotice: !!state.visibleNotice,
                },
                ws: {
                    target: '',
                    candidate: '',
                    closeCode: 0,
                    closeReason: '',
                    opened: false,
                    stable: false,
                    readyState: 0,
                    candidateIndex: 1,
                    candidateCount: 1,
                },
                ticket: {
                    requestId: '',
                    result: state.stage || 'bootstrap',
                    attempts: 0,
                    timeoutMs: 0,
                    expiresAt: '',
                },
                client: {
                    online: typeof navigator.onLine === 'boolean' ? navigator.onLine : null,
                    language: navigator.language || '',
                    visibilityState: document.visibilityState || '',
                    userAgent: navigator.userAgent || '',
                },
                network,
            }),
        }).catch((error) => {
            Logger.warn(error);
        });
    }

    function readStoredSettings() {
        let text = null;
        try {
            text = localStorage.getItem('settings');
        } catch (error) {
            Logger.warn('Failed to read persisted settings:', error);
            void sendClientBootstrapReport({
                stage: 'settings_storage_unavailable',
                severity: 'warning',
                title: 'Client settings unavailable',
                message: 'Local browser storage could not be read. Defaults were used instead.',
                context: 'load_settings',
                errorName: error?.name || 'StorageError',
                errorMessage: error?.message || 'localStorage.getItem failed',
                stack: error?.stack || '',
                time: new Date().toISOString(),
                visibleNotice: false,
            });
            return null;
        }
        if (!text) return null;
        try {
            const parsed = JSON.parse(text);
            if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
                throw new Error('Stored settings must be a JSON object.');
            }
            return parsed;
        } catch (error) {
            Logger.warn('Failed to parse persisted settings, clearing saved value.', error);
            try {
                localStorage.removeItem('settings');
            } catch (storageError) {
                Logger.warn('Failed to clear persisted settings:', storageError);
            }
            void sendClientBootstrapReport({
                stage: 'settings_storage_reset',
                severity: 'warning',
                title: 'Corrupted client settings reset',
                message: 'The browser had invalid saved settings. They were cleared and replaced with defaults.',
                context: 'load_settings',
                errorName: error?.name || 'SyntaxError',
                errorMessage: error?.message || 'Invalid JSON in localStorage settings',
                stack: error?.stack || '',
                time: new Date().toISOString(),
                visibleNotice: false,
            });
            return null;
        }
    }

    function coerceStoredSettingValue(defaultValue, value) {
        if (typeof defaultValue === 'boolean') {
            return value === true || value === false ? value : defaultValue;
        }
        if (typeof defaultValue === 'number') {
            const numericValue = Number(value);
            return Number.isFinite(numericValue) ? numericValue : defaultValue;
        }
        if (typeof defaultValue === 'string') {
            return typeof value === 'string' ? value : defaultValue;
        }
        return value;
    }

    function showBootstrapFailureUi(state) {
        const overlays = byId('overlays');
        if (overlays) {
            overlays.style.display = '';
            overlays.style.opacity = 1;
        }
        const connecting = byId('connecting');
        if (connecting) connecting.style.display = 'none';
        const title = byId('connection-notice-title');
        const message = byId('connection-notice-message');
        const details = byId('connection-notice-details');
        const copyButton = byId('connection-notice-copy');
        const hint = byId('connection-notice-hint');
        const notice = byId('connection-notice');
        const detailText = state.detailsText || '';
        if (title) title.textContent = state.title || 'Client startup failed';
        if (message) message.textContent = state.message || 'The page hit a startup error. Refresh and try again.';
        if (details) {
            details.textContent = detailText;
            details.hidden = !detailText;
        }
        if (copyButton) {
            copyButton.hidden = !detailText;
            copyButton.textContent = 'Copy diagnostic text';
            copyButton.onclick = !detailText ? null : () => {
                if (typeof navigator.clipboard?.writeText === 'function') {
                    navigator.clipboard.writeText(detailText).then(() => {
                        copyButton.textContent = 'Copied';
                        window.setTimeout(() => {
                            copyButton.textContent = 'Copy diagnostic text';
                        }, 1600);
                    }).catch((error) => {
                        Logger.warn(error);
                    });
                }
            };
        }
        if (hint) {
            hint.hidden = !detailText;
            hint.textContent = detailText
                ? 'If this happens again, send the diagnostic text below to support.'
                : '';
        }
        if (notice) notice.hidden = false;
        const badge = byId('server-status-badge');
        if (badge) badge.textContent = 'Error';
        setPlayButtonsDisabled(true);
    }

    function handleBootstrapFailure(error, context) {
        if (bootstrapFailureHandled) return;
        bootstrapFailureHandled = true;
        Logger.error(error);
        const state = {
            diagId: createDiagnosticId(),
            stage: 'bootstrap_error',
            severity: 'error',
            title: 'Client startup failed',
            message: 'This browser hit a startup error before the arena UI finished loading. Refresh the page and try again.',
            context: sanitizeDiagnosticValue(context || 'bootstrap', 48),
            errorName: sanitizeDiagnosticValue(error?.name || 'Error', 80),
            errorMessage: sanitizeDiagnosticValue(error?.message || String(error || 'Unknown startup error'), 220),
            stack: sanitizeDiagnosticValue(error?.stack || '', 900),
            time: new Date().toISOString(),
            visibleNotice: true,
        };
        state.detailsText = buildClientBootstrapDetails(state);
        showBootstrapFailureUi(state);
        if (window.__AGAR_BOOT_GUARD && typeof window.__AGAR_BOOT_GUARD.markInitDone === 'function') {
            window.__AGAR_BOOT_GUARD.markInitDone();
        }
        void sendClientBootstrapReport(state);
    }

    function summarizeWsTarget(url) {
        try {
            const parsed = new URL(resolveWsUrl(url || FALLBACK_WS_URL), window.location.href);
            return `${parsed.origin}${parsed.pathname}`;
        } catch (error) {
            return sanitizeDiagnosticValue(url || FALLBACK_WS_URL, 200);
        }
    }

    function createConnectionDiagnostic(url) {
        return {
            diagId: createDiagnosticId(),
            createdAt: new Date().toISOString(),
            reportVersion: CONNECTION_REPORT_VERSION,
            connectionIntent,
            stage: 'initializing',
            severity: 'info',
            title: '',
            message: '',
            target: summarizeWsTarget(url),
            candidate: sanitizeDiagnosticValue(url || FALLBACK_WS_URL, 200),
            candidateIndex: wsCandidateIndex + 1,
            candidateCount: wsCandidates.length,
            sessionId: wsResumeId,
            ticketRequestId: '',
            ticketResult: 'not_requested',
            ticketAttempts: 0,
            ticketTimeoutMs: 0,
            ticketExpiresAt: '',
            wsOpened: false,
            wsStable: false,
            wsCloseCode: 0,
            wsCloseReason: '',
            wsReadyState: 0,
            reportStatus: 'not_sent',
            reportRequestId: '',
            final: false,
        };
    }

    function ensureConnectionDiagnostic(url, reset) {
        if (
            reset ||
            !activeConnectionDiagnostic ||
            activeConnectionDiagnostic.final === true ||
            activeConnectionDiagnostic.connectionIntent !== connectionIntent
        ) {
            activeConnectionDiagnostic = createConnectionDiagnostic(url || wsUrl || FALLBACK_WS_URL);
        }
        activeConnectionDiagnostic.connectionIntent = connectionIntent;
        activeConnectionDiagnostic.target = summarizeWsTarget(url || wsUrl || FALLBACK_WS_URL);
        activeConnectionDiagnostic.candidate = sanitizeDiagnosticValue(url || wsUrl || FALLBACK_WS_URL, 200);
        activeConnectionDiagnostic.candidateIndex = wsCandidateIndex + 1;
        activeConnectionDiagnostic.candidateCount = wsCandidates.length;
        activeConnectionDiagnostic.wsReadyState = ws ? ws.readyState : 0;
        return activeConnectionDiagnostic;
    }

    function updateConnectionDiagnostic(patch, reset) {
        const diagnostic = ensureConnectionDiagnostic(wsUrl || FALLBACK_WS_URL, reset);
        Object.assign(diagnostic, patch || {});
        return diagnostic;
    }

    function buildConnectionSupportText(state) {
        const diagnostic = ensureConnectionDiagnostic(wsUrl || FALLBACK_WS_URL);
        return [
            `diag_id=${diagnostic.diagId}`,
            `time_utc=${diagnostic.createdAt}`,
            `ui_title=${sanitizeDiagnosticValue(state?.title || diagnostic.title || '-', 120)}`,
            `ui_message=${sanitizeDiagnosticValue(state?.message || diagnostic.message || '-', 220)}`,
            `stage=${sanitizeDiagnosticValue(diagnostic.stage || '-', 48)}`,
            `intent=${sanitizeDiagnosticValue(diagnostic.connectionIntent || '-', 24)}`,
            `ws_target=${sanitizeDiagnosticValue(diagnostic.target || '-', 200)}`,
            `ws_candidate=${diagnostic.candidateIndex || 1}/${diagnostic.candidateCount || 1}`,
            `ws_opened=${diagnostic.wsOpened ? 'true' : 'false'}`,
            `ws_stable=${diagnostic.wsStable ? 'true' : 'false'}`,
            `ws_ready_state=${Number.isFinite(diagnostic.wsReadyState) ? diagnostic.wsReadyState : 0}`,
            `ws_close_code=${Number.isFinite(diagnostic.wsCloseCode) ? diagnostic.wsCloseCode : 0}`,
            `ws_close_reason=${sanitizeDiagnosticValue(diagnostic.wsCloseReason || '-', 180)}`,
            `ticket_request_id=${sanitizeDiagnosticValue(diagnostic.ticketRequestId || '-', 128)}`,
            `ticket_result=${sanitizeDiagnosticValue(diagnostic.ticketResult || '-', 48)}`,
            `ticket_attempts=${Number.isFinite(diagnostic.ticketAttempts) ? diagnostic.ticketAttempts : 0}`,
            `ticket_timeout_ms=${Number.isFinite(diagnostic.ticketTimeoutMs) ? diagnostic.ticketTimeoutMs : 0}`,
            `ticket_expires_at=${sanitizeDiagnosticValue(diagnostic.ticketExpiresAt || '-', 48)}`,
            `pointer_source=${sanitizeDiagnosticValue(pointerSource || '-', 48)}`,
            `pointer_age_ms=${pointerSeenAt ? Math.max(0, Date.now() - pointerSeenAt) : -1}`,
            `network_online=${getOnlineStateText(typeof navigator.onLine === 'boolean' ? navigator.onLine : null)}`,
            `browser_lang=${sanitizeDiagnosticValue(navigator.language || '-', 32)}`,
            `browser_ua=${sanitizeDiagnosticValue(navigator.userAgent || '-', 160)}`,
            `visibility=${sanitizeDiagnosticValue(document.visibilityState || '-', 24)}`,
            `resume_session=${shortenDiagnosticValue(diagnostic.sessionId || wsResumeId)}`,
            `report_status=${sanitizeDiagnosticValue(diagnostic.reportStatus || 'not_sent', 48)}${diagnostic.reportRequestId ? ` (${sanitizeDiagnosticValue(diagnostic.reportRequestId, 128)})` : ''}`,
        ].join('\n');
    }

    function normalizeServerValue(url) {
        if (typeof url !== 'string') return null;
        const value = url.trim();
        return value || null;
    }

    function buildServerCandidates(primary) {
        const seen = new Set();
        const candidates = [];
        function push(url) {
            const value = normalizeServerValue(url);
            if (!value || seen.has(value)) return;
            seen.add(value);
            candidates.push(value);
        }
        push(primary);
        const configServers = Array.isArray(window.AGAR_CONFIG?.servers) ? window.AGAR_CONFIG.servers : [];
        for (const server of configServers) push(server && server.value);
        push(FALLBACK_WS_URL);
        return candidates.length ? candidates : [FALLBACK_WS_URL];
    }

    function getCachedWsTicket() {
        if (!wsTicketCache || !wsTicketCache.ticket) return null;
        if ((wsTicketCache.expiresAt || 0) - Date.now() <= WS_TICKET_REFRESH_BUFFER_MS) return null;
        return wsTicketCache.ticket;
    }

    async function requestWsTicketOnce(timeoutMs, attemptNumber) {
        updateConnectionDiagnostic({
            stage: 'requesting_ticket',
            ticketResult: 'requesting',
            ticketAttempts: attemptNumber,
            ticketTimeoutMs: timeoutMs,
        });
        const controller = typeof AbortController === 'function' ? new AbortController() : null;
        const timeoutId = controller
            ? window.setTimeout(() => controller.abort(), timeoutMs)
            : 0;
        return fetch(WS_TICKET_ENDPOINT, {
            method: 'GET',
            cache: 'no-store',
            credentials: 'same-origin',
            headers: {Accept: 'application/json'},
            signal: controller ? controller.signal : undefined,
        }).then(async (response) => {
            const requestId = sanitizeDiagnosticValue(response.headers.get('X-Request-ID'), 128);
            updateConnectionDiagnostic({
                ticketRequestId: requestId || ensureConnectionDiagnostic().ticketRequestId,
                ticketResult: response.ok ? 'http_ok' : `http_${response.status}`,
                ticketAttempts: attemptNumber,
                ticketTimeoutMs: timeoutMs,
            });
            if (!response.ok) return null;
            const body = await response.json();
            const ticket = typeof body?.ticket === 'string' ? body.ticket.trim() : '';
            const expiresAt = Date.parse(body?.expiresAt || '');
            if (!ticket || !Number.isFinite(expiresAt)) return null;
            wsTicketCache = {
                ticket,
                expiresAt,
            };
            updateConnectionDiagnostic({
                stage: 'ticket_ready',
                ticketRequestId: requestId || ensureConnectionDiagnostic().ticketRequestId,
                ticketResult: 'ok',
                ticketAttempts: attemptNumber,
                ticketTimeoutMs: timeoutMs,
                ticketExpiresAt: sanitizeDiagnosticValue(body?.expiresAt, 48),
            });
            return ticket;
        }).catch((error) => {
            Logger.warn(error);
            updateConnectionDiagnostic({
                ticketResult: error?.name === 'AbortError' ? 'timeout' : 'fetch_failed',
                ticketAttempts: attemptNumber,
                ticketTimeoutMs: timeoutMs,
            });
            return null;
        }).finally(() => {
            if (timeoutId) window.clearTimeout(timeoutId);
        });
    }

    async function fetchWsTicket() {
        if (!WS_TICKET_ENDPOINT || typeof fetch !== 'function') return null;
        const cached = getCachedWsTicket();
        if (cached) {
            updateConnectionDiagnostic({
                stage: 'ticket_cached',
                ticketResult: 'cache_hit',
                ticketExpiresAt: wsTicketCache?.expiresAt ? new Date(wsTicketCache.expiresAt).toISOString() : '',
            });
            return cached;
        }
        if (wsTicketRequest) return wsTicketRequest;
        wsTicketRequest = (async () => {
            for (let attempt = 0; attempt < WS_TICKET_RETRY_ATTEMPTS; attempt++) {
                const timeoutMs = WS_TICKET_TIMEOUT_MS + attempt * 4000;
                const ticket = await requestWsTicketOnce(timeoutMs, attempt + 1);
                if (ticket) return ticket;
                if (attempt < WS_TICKET_RETRY_ATTEMPTS - 1) {
                    await new Promise((resolve) => window.setTimeout(resolve, WS_TICKET_RETRY_DELAY_MS));
                }
            }
            updateConnectionDiagnostic({
                stage: 'ticket_unavailable',
                ticketResult: 'unavailable',
            });
            return null;
        })().finally(() => {
            wsTicketRequest = null;
        });
        return wsTicketRequest;
    }

    function clonePlayProfile(profile) {
        if (!profile) return null;
        return {
            name: String(profile.name || ''),
            multiSkin: String(profile.multiSkin || '').trim(),
        };
    }

    function createPendingPlayProfile(profile) {
        const next = clonePlayProfile(profile);
        if (!next) return null;
        next.sentSocketId = 0;
        return next;
    }

    function wsCleanup() {
        if (!ws) return;
        Logger.debug('WebSocket cleanup');
        ws.onopen = null;
        ws.onmessage = null;
        ws.close();
        ws = null;
    }

    async function wsInit(url) {
        if (serverDisabled) {
            byId('connecting').hide();
            return;
        }
        const initId = ++wsInitSequence;
        if (ws) {
            Logger.debug('WebSocket init on existing connection');
            wsCleanup();
        }
        resetConnectingStatus();
        byId('connecting').show(0.5);
        wsUrl = url;
        ensureConnectionDiagnostic(url, connectionDiagnosticResetPending);
        connectionDiagnosticResetPending = false;
        updateConnectionDiagnostic({
            stage: 'opening_connection',
            wsOpened: false,
            wsStable: false,
            wsCloseCode: 0,
            wsCloseReason: '',
            wsReadyState: 0,
            final: false,
        });
        const ticket = await fetchWsTicket();
        if (initId !== wsInitSequence || serverDisabled) return;
        ws = new WebSocket(buildSocketUrl(url, ticket));
        ws._agarUrl = url;
        ws._agarId = ++wsSocketSequence;
        ws._agarDiagId = ensureConnectionDiagnostic(url).diagId;
        ws._agarOpened = false;
        ws._agarStable = false;
        ws.binaryType = 'arraybuffer';
        updateConnectionDiagnostic({
            stage: 'socket_created',
            wsReadyState: ws.readyState,
        });
        ws.onopen = wsOpen;
        ws.onmessage = wsMessage;
        ws.onerror = wsError;
        ws.onclose = wsClose;
    }

    function wsOpen() {
        if (!ws) return;
        ws._agarOpened = true;
        reconnectDelay = 1000;
        clearConnectionNotice();
        updateConnectionDiagnostic({
            stage: 'authorizing',
            wsOpened: true,
            wsReadyState: ws.readyState,
        });
        setConnectingStatus({
            title: 'Authorizing',
            message: 'Secure connection established. Waiting for the arena to respond...',
        });
        byId('connecting').show(0.5);
        wsSend(SEND_254);
        wsSend(SEND_255);
        flushPendingPlayProfile();
    }

    function wsError(error) {
        Logger.warn(error);
        updateConnectionDiagnostic({
            stage: 'socket_error',
            wsReadyState: ws ? ws.readyState : 0,
        });
    }

    function wsClose(e) {
        if (e.currentTarget !== ws) return;
        const socketId = ws._agarId;
        const failedBeforeStable = !ws._agarStable;
        const hadOwnedCells = cells.mine.length > 0;
        const closeState = describeWsClose(e, failedBeforeStable);
        updateConnectionDiagnostic({
            stage: closeState.terminal ? 'terminal_close' : (failedBeforeStable ? 'connect_retry' : 'reconnect_retry'),
            severity: closeState.isError ? 'error' : 'info',
            title: closeState.title || '',
            message: closeState.message || '',
            wsCloseCode: typeof e.code === 'number' ? e.code : 0,
            wsCloseReason: sanitizeDiagnosticValue(e.reason, 180),
            wsReadyState: typeof e.target?.readyState === 'number' ? e.target.readyState : (ws ? ws.readyState : 0),
        });
        Logger.debug(`WebSocket disconnected ${e.code} (${e.reason})`);
        if (failedBeforeStable) restorePendingPlayProfile(socketId);
        cancelReconnectRecovery();
        reconnectRecoveryAttempts = 0;
        if (!failedBeforeStable && connectionIntent === 'play' && hadOwnedCells && reconnectRecoveryProfile) {
            playOverlayDismissPending = true;
        }
        wsCleanup();
        gameReset();
        if (closeState.terminal) {
            clearConnectionNotice();
            resetConnectingStatus();
            byId('connecting').hide();
            playOverlayDismissPending = false;
            reconnectRecoveryProfile = null;
            reconnectRecoveryAttempts = 0;
            showESCOverlay();
            const noticeState = withDetailedConnectionNotice(closeState, true);
            showConnectionNotice(noticeState);
            void sendConnectionDiagnosticReport(noticeState, 'terminal_notice');
            return;
        }
        void sendConnectionDiagnosticReport(closeState, failedBeforeStable ? 'connect_retry' : 'reconnect_retry');
        clearConnectionNotice();
        setConnectingStatus(closeState);
        byId('connecting').show(0.5);
        if (failedBeforeStable && wsCandidateIndex < wsCandidates.length - 1) {
            wsCandidateIndex += 1;
            setTimeout(() => wsInit(wsCandidates[wsCandidateIndex]), 250);
            return;
        }
        setTimeout(() => wsInit(wsCandidates[wsCandidateIndex] || wsUrl || FALLBACK_WS_URL), reconnectDelay);
        reconnectDelay = Math.min(reconnectDelay * 1.5, 10000);
    }

    function wsSend(data) {
        if (!ws) return;
        if (ws.readyState !== 1) return;
        if (data.build) ws.send(data.build());
        else ws.send(data);
    }

    function wsMessage(data) {
        if (data.currentTarget && data.currentTarget !== ws) return;
        markWsStable();
        syncUpdStamp = Date.now();
        const reader = new Reader(new DataView(data.data), 0, true);
        const packetId = reader.getUint8();
        switch (packetId) {
            case 0x10: {// update nodes
                // consume records
                const addedCount = reader.getUint16();
                for (let i = 0; i < addedCount; i++) {
                    const killer = reader.getUint32();
                    const killed = reader.getUint32();
                    if (!cells.byId.has(killer) || !cells.byId.has(killed))
                        continue;
                    if (settings.playSounds && cells.mine.includes(killer)) {
                        (cells.byId.get(killed).s < 20 ? pelletSound : eatSound).play(parseFloat(soundsVolume.value));
                    }
                    cells.byId.get(killed).destroy(killer);
                }

                // update records
                // eslint-disable-next-line no-constant-condition
                while (true) {
                    const id = reader.getUint32();
                    if (id === 0) break;

                    const x = reader.getInt32();
                    const y = reader.getInt32();
                    const s = reader.getUint16();

                    const flagMask = reader.getUint8();
                    const flags = {
                        updColor: !!(flagMask & 0x02),
                        updSkin: !!(flagMask & 0x04),
                        updName: !!(flagMask & 0x08),
                        jagged: !!(flagMask & 0x01) || !!(flagMask & 0x10),
                        ejected: !!(flagMask & 0x20),
                    };

                    const color = flags.updColor ? new Color(reader.getUint8(), reader.getUint8(), reader.getUint8()) : null;
                    const skin = flags.updSkin ? reader.getStringUTF8() : null;
                    const name = flags.updName ? reader.getStringUTF8() : null;

                    if (cells.byId.has(id)) {
                        const cell = cells.byId.get(id);
                        cell.update(syncUpdStamp);
                        cell.updated = syncUpdStamp;
                        cell.ox = cell.x;
                        cell.oy = cell.y;
                        cell.os = cell.s;
                        cell.nx = x;
                        cell.ny = y;
                        cell.ns = s;
                        if (color) cell.setColor(color);
                        if (name) cell.setName(name);
                        if (skin) cell.setSkin(skin);
                    } else {
                        const cell = new Cell(id, x, y, s, name, color, skin, flags);
                        cells.byId.set(id, cell);
                        cells.list.push(cell);
                    }
                }
                // dissapear records
                const removedCount = reader.getUint16();
                for (let i = 0; i < removedCount; i++) {
                    const killed = reader.getUint32();
                    if (cells.byId.has(killed) && !cells.byId.get(killed).destroyed) {
                        cells.byId.get(killed).destroy(null);
                    }
                }
                break;
            }
            case 0x11: { // update pos
                camera.serverTarget.x = reader.getFloat32();
                camera.serverTarget.y = reader.getFloat32();
                camera.serverTarget.scale = reader.getFloat32();
                camera.serverTarget.scale *= camera.viewportScale;
                camera.serverTarget.scale *= camera.userZoom;
                camera.target.x = camera.serverTarget.x;
                camera.target.y = camera.serverTarget.y;
                camera.target.scale = camera.serverTarget.scale;
                break;
            }
            case 0x12: { // clear all
                for (const cell of cells.byId.values()) {
                    cell.destroy(null);
                }
                cells.mine = [];
                break;
            }
            case 0x14: { // clear my cells
                cells.mine = [];
                break;
            }
            case 0x15: { // draw line
                Logger.warn('got packet 0x15 (draw line) which is unsupported');
                break;
            }
            case 0x20: { // new cell
                cells.mine.push(reader.getUint32());
                finalizePendingSpawn();
                break;
            }
            case 0x30: { // text list
                leaderboard.items = [];
                leaderboard.type = 'text';

                const lbCount = reader.getUint32();
                for (let i = 0; i < lbCount; ++i) {
                    leaderboard.items.push(reader.getStringUTF8());
                }
                drawLeaderboard();
                break;
            }
            case 0x31: { // ffa list
                leaderboard.items = [];
                leaderboard.type = 'ffa';

                const count = reader.getUint32();
                for (let i = 0; i < count; ++i) {
                    const isMe = !!reader.getUint32();
                    const lbName = reader.getStringUTF8();
                    leaderboard.items.push({
                        me: isMe,
                        name: Cell.parseName(lbName).name || EMPTY_NAME
                    });
                }
                drawLeaderboard();
                break;
            }
            case 0x32: { // pie chart
                leaderboard.items = [];
                leaderboard.type = 'pie';

                const teamsCount = reader.getUint32();
                for (let i = 0; i < teamsCount; ++i) {
                    leaderboard.items.push(reader.getFloat32());
                }
                drawLeaderboard();
                break;
            }
            case 0x40: { // set border
                border.left = reader.getFloat64();
                border.top = reader.getFloat64();
                border.right = reader.getFloat64();
                border.bottom = reader.getFloat64();
                border.width = border.right - border.left;
                border.height = border.bottom - border.top;
                border.centerX = (border.left + border.right) / 2;
                border.centerY = (border.top + border.bottom) / 2;
                if (data.data.byteLength === 33) break;
                if (!mapCenterSet) {
                    mapCenterSet = true;
                    camera.x = camera.target.x = border.centerX;
                    camera.y = camera.target.y = border.centerY;
                    camera.scale = camera.target.scale = 1;
                }
                reader.getUint32(); // game type
                if (!/MultiOgar|OgarII/.test(reader.getStringUTF8()) || stats.pingLoopId) break;
                stats.pingLoopId = setInterval(() => {
                    wsSend(UINT8_CACHE[254]);
                    stats.pingLoopStamp = Date.now();
                }, 2000);
                break;
            }
            case 0x63: { // chat message
                const flagMask = reader.getUint8();
                const flags = {
                    server: !!(flagMask & 0x80),
                    admin: !!(flagMask & 0x40),
                    mod: !!(flagMask & 0x20),
                };
                const color = new Color(reader.getUint8(), reader.getUint8(), reader.getUint8());
                const rawName = reader.getStringUTF8();
                const message = reader.getStringUTF8();

                let name = Cell.parseName(rawName).name || EMPTY_NAME;

                if (flags.server && name !== 'SERVER') name = `[SERVER] ${name}`;
                if (flags.admin) name = `[ADMIN] ${name}`;
                if (flags.mod) name = `[MOD] ${name}`;

                const wait = Math.max(3000, 1000 + message.length * 150);
                chat.waitUntil = syncUpdStamp - chat.waitUntil > 1000 ? syncUpdStamp + wait : chat.waitUntil + wait;
                chat.messages.push({
                    color,
                    name,
                    message,
                    time: syncUpdStamp,
                    server: flags.server,
                    admin: flags.admin,
                    mod: flags.mod,
                });
                if (settings.showChat) drawChat();
                break;
            }
            case 0xFE: { // server stat
                stats.info = JSON.parse(reader.getStringUTF8());
                stats.latency = syncUpdStamp - stats.pingLoopStamp;
                drawStats();
                break;
            }
            default: { // invalid packet
                wsCleanup();
                break;
            }
        }
    }
    function sendMouseMove(x, y) {
        const writer = new Writer(true);
        writer.setUint8(0x10);
        writer.setUint32(x);
        writer.setUint32(y);
        writer._b.push(0, 0, 0, 0);
        wsSend(writer);
    }
    function updatePointerPosition(clientX, clientY, source = 'pointer') {
        if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) return false;
        mouseX = clientX;
        mouseY = clientY;
        pointerSeenAt = Date.now();
        pointerSource = source;
        return true;
    }
    function updatePointerFromEvent(event, source = 'pointer') {
        if (!event) return false;
        return updatePointerPosition(Number(event.clientX), Number(event.clientY), source);
    }
    function ensurePointerPosition() {
        if (Number.isFinite(mouseX) && Number.isFinite(mouseY)) return;
        if (mainCanvas) {
            updatePointerPosition(mainCanvas.width / 2, mainCanvas.height / 2, 'canvas_center');
            return;
        }
        updatePointerPosition(window.innerWidth / 2, window.innerHeight / 2, 'viewport_center');
    }
    function getCurrentMouseTarget() {
        ensurePointerPosition();
        const width = mainCanvas?.width || window.innerWidth || 0;
        const height = mainCanvas?.height || window.innerHeight || 0;
        const scale = Number.isFinite(camera.scale) && camera.scale > 0 ? camera.scale : 1;
        const centerX = Number.isFinite(camera.x) ? camera.x : 0;
        const centerY = Number.isFinite(camera.y) ? camera.y : 0;
        return {
            x: (mouseX - width / 2) / scale + centerX,
            y: (mouseY - height / 2) / scale + centerY,
        };
    }
    function sendCurrentMouseTarget() {
        if (!ws || ws.readyState !== WebSocket.OPEN) return false;
        const target = getCurrentMouseTarget();
        if (!Number.isFinite(target.x) || !Number.isFinite(target.y)) return false;
        sendMouseMove(Math.round(target.x), Math.round(target.y));
        return true;
    }
    function scheduleMouseTargetRefresh(delay = 0) {
        window.setTimeout(() => {
            sendCurrentMouseTarget();
        }, Math.max(0, delay | 0));
    }
    function sendPlay(name) {
        const writer = new Writer(true);
        writer.setUint8(0x00);
        writer.setStringUTF8(name);
        wsSend(writer);
    }
    function buildPlayName() {
        const skin = settings.skin;
        return (skin ? `<${skin}>` : '') + settings.nick;
    }
    function sendSecondarySkin(skin) {
        const writer = new Writer(true);
        writer.setUint8(0x1C);
        writer.setStringUTF8(String(skin || '').trim());
        wsSend(writer);
    }
    function sendRestart() {
        wsSend(UINT8_CACHE[31]);
    }
    function queuePlayProfile() {
        const nextProfile = {
            name: buildPlayName(),
            multiSkin: String(settings.multiSkin || '').trim(),
        };
        pendingPlayProfile = createPendingPlayProfile(nextProfile);
        reconnectRecoveryProfile = clonePlayProfile(nextProfile);
        if (!ws || ws.readyState !== WebSocket.OPEN || !ws._agarStable) {
            byId('connecting').show(0.5);
        }
    }
    function flushPendingPlayProfile() {
        if (!pendingPlayProfile || !ws || ws.readyState !== WebSocket.OPEN) return false;
        if (pendingPlayProfile.sentSocketId === ws._agarId) return true;
        sendSecondarySkin(pendingPlayProfile.multiSkin);
        sendPlay(pendingPlayProfile.name);
        sendCurrentMouseTarget();
        pendingPlayProfile.sentSocketId = ws._agarId;
        return true;
    }
    function restorePendingPlayProfile(socketId) {
        if (!pendingPlayProfile || pendingPlayProfile.sentSocketId !== socketId) return;
        pendingPlayProfile.sentSocketId = 0;
    }
    function cancelReconnectRecovery() {
        if (reconnectRecoveryTimer) {
            window.clearTimeout(reconnectRecoveryTimer);
            reconnectRecoveryTimer = 0;
        }
    }
    function scheduleReconnectRecovery() {
        cancelReconnectRecovery();
        if (
            connectionIntent !== 'play' ||
            !reconnectRecoveryProfile ||
            !ws ||
            !ws._agarStable ||
            cells.mine.length ||
            reconnectRecoveryAttempts >= RECONNECT_RECOVERY_MAX_ATTEMPTS
        ) return;
        reconnectRecoveryTimer = window.setTimeout(() => {
            reconnectRecoveryTimer = 0;
            if (
                connectionIntent !== 'play' ||
                !reconnectRecoveryProfile ||
                !ws ||
                !ws._agarStable ||
                cells.mine.length ||
                reconnectRecoveryAttempts >= RECONNECT_RECOVERY_MAX_ATTEMPTS
            ) return;
            reconnectRecoveryAttempts += 1;
            pendingPlayProfile = createPendingPlayProfile(reconnectRecoveryProfile);
            setConnectingStatus({
                title: 'Rejoining Arena',
                message: reconnectRecoveryAttempts < RECONNECT_RECOVERY_MAX_ATTEMPTS
                    ? 'Connection restored. Trying to spawn your cell again...'
                    : 'Connection restored, but spawning is still delayed. Trying one last time...',
            });
            byId('connecting').show(0.5);
            flushPendingPlayProfile();
            scheduleReconnectRecovery();
        }, RECONNECT_RECOVERY_DELAY_MS);
    }
    function sendPlayProfile() {
        if (serverDisabled) return false;
        connectionIntent = 'play';
        ensureConnectionDiagnostic(wsCandidates[wsCandidateIndex] || wsUrl || FALLBACK_WS_URL, !ws || ws.readyState !== WebSocket.OPEN);
        updateConnectionDiagnostic({
            connectionIntent: 'play',
            stage: 'play_requested',
            final: false,
        });
        playOverlayDismissPending = true;
        cancelReconnectRecovery();
        reconnectRecoveryAttempts = 0;
        queuePlayProfile();
        if (!ws || ws.readyState !== WebSocket.OPEN) {
            ensureWsConnection();
            return false;
        }
        const sent = flushPendingPlayProfile();
        if (ws._agarStable && !cells.mine.length) {
            setConnectingStatus({
                title: 'Joining Arena',
                message: 'Connected. Waiting for your cell to spawn...',
            });
            byId('connecting').show(0.5);
            scheduleReconnectRecovery();
        }
        return sent;
    }
    function requestSoftRestart() {
        if (serverDisabled || !ws || ws.readyState !== WebSocket.OPEN) return;
        stats.maxScore = 0;
        sendRestart();
    }
    function sendChat(text) {
        const writer = new Writer();
        writer.setUint8(0x63);
        writer.setUint8(0);
        writer.setStringUTF8(text);
        wsSend(writer);
    }

    function gameReset() {
        cleanupObject(cells);
        cleanupObject(border);
        cleanupObject(leaderboard);
        cleanupObject(chat);
        cleanupObject(stats);
        chat.messages = [];
        leaderboard.items = [];
        cells.mine = [];
        cells.byId = new Map();
        cells.list = [];
        camera.x = camera.y = camera.target.x = camera.target.y = 0;
        camera.serverTarget.x = camera.serverTarget.y = 0;
        camera.scale = camera.target.scale = 1;
        camera.serverTarget.scale = 1;
        mapCenterSet = false;
    }

    const cells = {
        mine: [],
        byId: new Map(),
        list: [],
    };
    const border = {
        left: -2000,
        right: 2000,
        top: -2000,
        bottom: 2000,
        width: 4000,
        height: 4000,
        centerX: -1,
        centerY: -1
    };
    const leaderboard = Object.create({
        type: null,
        items: null,
        canvas: document.createElement('canvas'),
        teams: ['#F33', '#3F3', '#33F']
    });
    const chat = Object.create({
        messages: [],
        waitUntil: 0,
        canvas: document.createElement('canvas'),
        visible: false,
    });
    const stats = Object.create({
        fps: 0,
        latency: NaN,
        supports: null,
        info: null,
        pingLoopId: NaN,
        pingLoopStamp: null,
        canvas: document.createElement('canvas'),
        visible: false,
        score: NaN,
        maxScore: 0
    });

    const knownSkins = new Map();
    const loadedSkins = new Map();
    const galleryView = {
        page: 1,
        pageSize: 48,
    };
    const macroCooldown = 1000 / 7;
    const camera = {
        x: 0,
        y: 0,
        target: {
            x: 0,
            y: 0,
            scale: 1
        },
        serverTarget: {
            x: 0,
            y: 0,
            scale: 1
        },
        viewportScale: 1,
        userZoom: 1,
        sizeScale: 1,
        scale: 1
    };

    let wsCandidates = buildServerCandidates(WEBSOCKET_URL);
    let wsCandidateIndex = 0;
    let wsUrl = wsCandidates[0];
    const wsResumeId = getResumeSessionId();
    let ws = null;
    let wsInitSequence = 0;
    let wsSocketSequence = 0;
    let wsTicketCache = null;
    let wsTicketRequest = null;
    let activeConnectionDiagnostic = null;
    let activeConnectionNoticeState = null;
    let lastConnectionReportSignature = '';
    let bootstrapFailureHandled = false;
    const bootstrapReportSignatures = new Set();
    let connectionDiagnosticResetPending = true;
    let pendingPlayProfile = null;
    let playOverlayDismissPending = false;
    let reconnectRecoveryProfile = null;
    let reconnectRecoveryTimer = 0;
    let reconnectRecoveryAttempts = 0;
    let connectionIntent = 'idle';
    let galleryTargetInputId = 'skin';
    let reconnectDelay = 1000;
    let serverDisabled = window.AGAR_CONFIG?.serverEnabled === false;

    let syncUpdStamp = Date.now();
    let syncAppStamp = Date.now();

    let mainCanvas = null;
    let mainCtx = null;
    let soundsVolume;
    let escOverlayShown = false;
    let isTyping = false;
    let chatBox = null;
    let mapCenterSet = false;
    let minionControlled = false;
    let dualControlActive = false;
    let mouseX = NaN;
    let mouseY = NaN;
    let pointerSeenAt = 0;
    let pointerSource = '';
    let macroIntervalID;
    let quadtree;

    const settings = {
        nick: '',
        skin: '',
        multiSkin: '',
        gamemode: '',
        showSkins: true,
        showNames: true,
        darkTheme: false,
        showColor: true,
        showMass: false,
        _showChat: true,
        get showChat() {
            return this._showChat;
        },
        set showChat(a) {
            this._showChat = a;
            if (!chatBox) return;
            a ? chatBox.show() : chatBox.hide();
        },
        showMinimap: true,
        showPosition: false,
        showBorder: false,
        showGrid: true,
        playSounds: false,
        soundsVolume: 0.5,
        moreZoom: false,
        fillSkin: true,
        backgroundSectors: false,
        jellyPhysics: true,
    };
    const pressed = {
        ' ': false,
        w: false,
        d: false,
        z: false,
        e: false,
        r: false,
        t: false,
        p: false,
        q: false,
        tab: false,
        enter: false,
        escape: false,
    };

    const eatSound = new Sound('./assets/sound/eat.mp3', 0.5, 10);
    const pelletSound = new Sound('./assets/sound/pellet.mp3', 0.5, 10);

    function setPlayButtonsDisabled(disabled) {
        for (const id of ['play-btn', 'spectate-btn', 'gallery-btn']) {
            const element = byId(id);
            if (element) element.disabled = !!disabled;
        }
    }

    function updateOfflineOverlay(message) {
        const badge = byId('server-status-badge');
        const subtitle = byId('hero-subtitle');
        if (badge) badge.textContent = serverDisabled ? 'Offline' : 'Live';
        if (subtitle && message) subtitle.textContent = message;
    }

    function setConnectingStatus(state) {
        const panel = byId('connecting-content');
        const title = byId('connecting-title');
        const message = byId('connecting-message');
        const details = byId('connecting-details');
        const next = state || {};
        if (title) title.textContent = next.title || DEFAULT_CONNECTING_TITLE;
        if (message) message.textContent = next.message || DEFAULT_CONNECTING_MESSAGE;
        if (details) {
            const text = String(next.details || '').trim();
            details.textContent = text;
            details.hidden = !text;
        }
        if (panel) panel.classList.toggle('is-error', !!next.isError);
    }

    function resetConnectingStatus() {
        setConnectingStatus();
    }

    function renderConnectionNotice(state) {
        const notice = byId('connection-notice');
        const title = byId('connection-notice-title');
        const message = byId('connection-notice-message');
        const details = byId('connection-notice-details');
        const copyButton = byId('connection-notice-copy');
        const hint = byId('connection-notice-hint');
        if (!notice || !title || !message || !details) return;
        title.textContent = state.title || 'Connection issue';
        message.textContent = state.message || DEFAULT_CONNECTING_MESSAGE;
        const detailText = String(state.details || '').trim();
        details.textContent = detailText;
        details.hidden = !detailText;
        if (copyButton) {
            copyButton.textContent = 'Copy diagnostic text';
            copyButton.hidden = !detailText || !state.allowCopy;
            copyButton.onclick = detailText ? copyConnectionNoticeDetails : null;
        }
        if (hint) {
            hint.hidden = !detailText;
            hint.textContent = detailText
                ? 'If you contact support, send the exact diagnostic text below.'
                : '';
        }
        notice.dataset.diagId = state.diagId || '';
        notice.hidden = false;
    }

    function showConnectionNotice(state) {
        activeConnectionNoticeState = Object.assign({}, state);
        renderConnectionNotice(activeConnectionNoticeState);
    }

    function clearConnectionNotice() {
        const notice = byId('connection-notice');
        const details = byId('connection-notice-details');
        const copyButton = byId('connection-notice-copy');
        const hint = byId('connection-notice-hint');
        activeConnectionNoticeState = null;
        if (notice) {
            notice.hidden = true;
            notice.dataset.diagId = '';
        }
        if (details) {
            details.hidden = true;
            details.textContent = '';
        }
        if (copyButton) {
            copyButton.hidden = true;
            copyButton.textContent = 'Copy diagnostic text';
            copyButton.onclick = null;
        }
        if (hint) {
            hint.hidden = true;
            hint.textContent = '';
        }
    }

    function refreshVisibleConnectionNotice() {
        if (!activeConnectionNoticeState) return;
        activeConnectionNoticeState.details = buildConnectionSupportText(activeConnectionNoticeState);
        renderConnectionNotice(activeConnectionNoticeState);
    }

    function copyConnectionNoticeDetails() {
        if (!activeConnectionNoticeState?.details) return;
        const text = activeConnectionNoticeState.details;
        const button = byId('connection-notice-copy');
        const restoreButtonText = () => {
            if (button) button.textContent = 'Copy diagnostic text';
        };
        if (typeof navigator.clipboard?.writeText === 'function') {
            navigator.clipboard.writeText(text).then(() => {
                if (button) button.textContent = 'Copied';
                window.setTimeout(restoreButtonText, 1600);
            }).catch((error) => {
                Logger.warn(error);
                restoreButtonText();
            });
            return;
        }
        const fallback = document.createElement('textarea');
        fallback.value = text;
        fallback.setAttribute('readonly', 'readonly');
        fallback.style.position = 'absolute';
        fallback.style.left = '-9999px';
        document.body.appendChild(fallback);
        fallback.select();
        try {
            document.execCommand('copy');
            if (button) button.textContent = 'Copied';
            window.setTimeout(restoreButtonText, 1600);
        } catch (error) {
            Logger.warn(error);
            restoreButtonText();
        }
        document.body.removeChild(fallback);
    }

    function withDetailedConnectionNotice(state, markFinal) {
        const diagnostic = updateConnectionDiagnostic({
            final: !!markFinal,
            stage: markFinal ? 'terminal_notice' : (state.terminal ? 'terminal' : 'notice'),
            severity: state.isError ? 'error' : 'info',
            title: state.title || '',
            message: state.message || '',
        });
        const baseMessage = state.message || DEFAULT_CONNECTING_MESSAGE;
        return Object.assign({}, state, {
            diagId: diagnostic.diagId,
            allowCopy: true,
            message: baseMessage.includes('Send the exact diagnostic text below')
                ? baseMessage
                : `${baseMessage} Send the exact diagnostic text below if you contact support.`,
            details: buildConnectionSupportText(state),
        });
    }

    function sendConnectionDiagnosticReport(state, stage) {
        if (!CONNECTION_REPORT_ENDPOINT || typeof fetch !== 'function') {
            return Promise.resolve();
        }
        const diagnostic = updateConnectionDiagnostic({
            stage: sanitizeDiagnosticValue(stage || state?.stage || 'notice', 48),
            severity: state?.isError ? 'error' : 'info',
            title: state?.title || '',
            message: state?.message || '',
        });
        const signature = [
            diagnostic.diagId,
            diagnostic.stage,
            diagnostic.wsCloseCode || 0,
            sanitizeDiagnosticValue(diagnostic.wsCloseReason, 120),
            diagnostic.ticketResult || '-',
        ].join('|');
        if (lastConnectionReportSignature === signature) {
            return Promise.resolve();
        }
        lastConnectionReportSignature = signature;
        diagnostic.reportStatus = 'sending';
        refreshVisibleConnectionNotice();
        const network = getClientNetworkSnapshot();
        return fetch(CONNECTION_REPORT_ENDPOINT, {
            method: 'POST',
            cache: 'no-store',
            credentials: 'same-origin',
            keepalive: true,
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                diagId: diagnostic.diagId,
                reportVersion: diagnostic.reportVersion,
                connectionIntent: diagnostic.connectionIntent,
                stage: diagnostic.stage,
                severity: diagnostic.severity,
                title: diagnostic.title,
                message: diagnostic.message,
                detailsText: buildConnectionSupportText(state),
                page: window.location.pathname,
                sessionId: diagnostic.sessionId,
                ui: {
                    status: state?.title || diagnostic.title || '',
                    visibleNotice: !!activeConnectionNoticeState,
                },
                ws: {
                    target: diagnostic.target,
                    candidate: diagnostic.candidate,
                    closeCode: diagnostic.wsCloseCode,
                    closeReason: diagnostic.wsCloseReason,
                    opened: diagnostic.wsOpened,
                    stable: diagnostic.wsStable,
                    readyState: diagnostic.wsReadyState,
                    candidateIndex: diagnostic.candidateIndex,
                    candidateCount: diagnostic.candidateCount,
                },
                ticket: {
                    requestId: diagnostic.ticketRequestId,
                    result: diagnostic.ticketResult,
                    attempts: diagnostic.ticketAttempts,
                    timeoutMs: diagnostic.ticketTimeoutMs,
                    expiresAt: diagnostic.ticketExpiresAt,
                },
                client: {
                    online: typeof navigator.onLine === 'boolean' ? navigator.onLine : null,
                    language: navigator.language || '',
                    visibilityState: document.visibilityState || '',
                    userAgent: navigator.userAgent || '',
                },
                network,
            }),
        }).then(async (response) => {
            let body = null;
            try {
                body = await response.json();
            } catch (error) {
                body = null;
            }
            diagnostic.reportStatus = response.ok ? 'accepted' : `http_${response.status}`;
            diagnostic.reportRequestId = sanitizeDiagnosticValue(body?.requestId, 128);
            refreshVisibleConnectionNotice();
        }).catch((error) => {
            Logger.warn(error);
            diagnostic.reportStatus = 'failed';
            refreshVisibleConnectionNotice();
        });
    }

    function sanitizeCloseReason(reason) {
        return String(reason || '').replace(/\s+/g, ' ').trim().slice(0, 160);
    }

    function formatWsCloseDetails(code, reason) {
        const parts = [];
        if (reason) parts.push(`Server response: ${reason}`);
        if (code) parts.push(`WebSocket code ${code}`);
        return parts.join(' | ');
    }

    function markWsStable() {
        if (!ws || ws._agarStable) return;
        ws._agarStable = true;
        updateConnectionDiagnostic({
            stage: 'stable',
            wsOpened: true,
            wsStable: true,
            wsReadyState: ws.readyState,
            final: false,
        });
        sendCurrentMouseTarget();
        clearConnectionNotice();
        resetConnectingStatus();
        if (playOverlayDismissPending && !cells.mine.length) {
            setConnectingStatus({
                title: 'Joining Arena',
                message: 'Connected. Waiting for your cell to spawn...',
            });
            byId('connecting').show(0.5);
            scheduleReconnectRecovery();
            return;
        }
        byId('connecting').hide();
        cancelReconnectRecovery();
    }

    function finalizePendingSpawn() {
        if (pendingPlayProfile && ws && pendingPlayProfile.sentSocketId === ws._agarId) {
            reconnectRecoveryProfile = clonePlayProfile(pendingPlayProfile);
            pendingPlayProfile = null;
        }
        updateConnectionDiagnostic({
            stage: 'spawned',
            final: false,
        });
        sendCurrentMouseTarget();
        scheduleMouseTargetRefresh(80);
        cancelReconnectRecovery();
        reconnectRecoveryAttempts = 0;
        if (!playOverlayDismissPending) return;
        byId('connecting').hide();
        hideESCOverlay();
        playOverlayDismissPending = false;
    }

    function describeWsClose(event, failedBeforeStable) {
        const code = event && typeof event.code === 'number' ? event.code : 0;
        const reason = sanitizeCloseReason(event && event.reason);
        const details = formatWsCloseDetails(code, reason);
        const reasonLower = reason.toLowerCase();
        if (serverDisabled || /server disabled/i.test(reasonLower)) {
            return {
                terminal: true,
                isError: true,
                title: 'Server Offline',
                message: 'The arena is currently offline. Try again after the admin powers it back on.',
                details,
            };
        }
        if (reasonLower.includes('client not allowed')) {
            return {
                terminal: true,
                isError: true,
                title: 'Connection Blocked',
                message: 'This browser or network removed a required WebSocket origin header. Disable VPN, privacy filtering, extensions, antivirus web shields, or try another browser/network.',
                details,
            };
        }
        if (reasonLower.includes('ip banned')) {
            return {
                terminal: true,
                isError: true,
                title: 'Connection Rejected',
                message: 'This IP address is banned from the arena.',
                details,
            };
        }
        if (reasonLower.includes('ip limit reached')) {
            return {
                terminal: true,
                isError: true,
                title: 'Too Many Connections',
                message: 'Too many arena connections are already open from this IP address.',
                details,
            };
        }
        if (reasonLower.includes('no slots')) {
            return {
                terminal: true,
                isError: true,
                title: 'Server Full',
                message: 'The arena is full right now. Try again in a moment.',
                details,
            };
        }
        if (reasonLower.includes('not supported protocol') || code === 1002) {
            return {
                terminal: true,
                isError: true,
                title: 'Browser Unsupported',
                message: 'This browser did not complete the game protocol correctly. Refresh the page or try a modern browser.',
                details,
            };
        }
        if (reasonLower.includes('spam') || code === 1008 || code === 1009) {
            return {
                terminal: true,
                isError: true,
                title: 'Connection Limited',
                message: 'The server rejected this connection after invalid or excessive requests. Refresh the page and try again.',
                details,
            };
        }
        if (failedBeforeStable) {
            return {
                terminal: false,
                isError: true,
                title: 'Connecting',
                message: 'The secure game session did not finish opening. Retrying automatically...',
                details,
            };
        }
        return {
            terminal: false,
            isError: true,
            title: 'Reconnecting',
            message: 'The connection to the arena was interrupted. Retrying automatically...',
            details,
        };
    }

    function forgetBrokenSkin(skin) {
        if (!skin || !knownSkins.has(skin)) return;
        knownSkins.delete(skin);
        loadedSkins.delete(skin);
        if (byId('gallery').style.display !== 'none') buildGallery();
    }

    function refreshSkinList() {
        return fetch(`skinList.txt?ts=${Date.now()}`, {cache: 'no-store'}).then(resp => resp.text()).then(data => {
        const skins = data.split(',').filter(name => name.length > 0);
        byId('gallery-btn').style.display = skins.length ? 'inline-block' : 'none';
        const stamp = Date.now();
        for (const skin of skins) knownSkins.set(skin, stamp);
        for (const i of knownSkins.keys()) {
            if (knownSkins.get(i) !== stamp) knownSkins.delete(i);
        }
        if (byId('gallery').style.display !== 'none') buildGallery();
        });
    }
    refreshSkinList();
    resetConnectingStatus();
    clearConnectionNotice();

    function hideESCOverlay() {
        escOverlayShown = false;
        byId('overlays').hide();
    }
    function showESCOverlay() {
        escOverlayShown = true;
        byId('overlays').show(0.5);
    }

    function toCamera(ctx) {
        ctx.translate(mainCanvas.width / 2, mainCanvas.height / 2);
        scaleForth(ctx);
        ctx.translate(-camera.x, -camera.y);
    }
    function scaleForth(ctx) {
        ctx.scale(camera.scale, camera.scale);
    }
    function scaleBack(ctx) {
        ctx.scale(1 / camera.scale, 1 / camera.scale);
    }
    function fromCamera(ctx) {
        ctx.translate(camera.x, camera.y);
        scaleBack(ctx);
        ctx.translate(-mainCanvas.width / 2, -mainCanvas.height / 2);
    }

    function initSetting(id, elm) {
        function simpleAssignListen(id, elm, prop) {
            if (settings[id] !== '') elm[prop] = settings[id];
            elm.addEventListener('change', () => {
                settings[id] = elm[prop];
            });
        }
        switch (elm.tagName.toLowerCase()) {
            case 'input':
                switch (elm.type.toLowerCase()) {
                    case 'range':
                    case 'text':
                        simpleAssignListen(id, elm, 'value');
                        break;
                    case 'checkbox':
                        simpleAssignListen(id, elm, 'checked');
                        break;
                }
                break;
            case 'select':
                simpleAssignListen(id, elm, 'value');
                break;
        }
    }
    function loadSettings() {
        const obj = readStoredSettings() || settings;
        for (const prop in settings) {
            const elm = byId(prop.charAt(0) === '_' ? prop.slice(1) : prop);
            if (elm) {
                if (Object.hasOwnProperty.call(obj, prop)) {
                    settings[prop] = coerceStoredSettingValue(settings[prop], obj[prop]);
                }
                initSetting(prop, elm);
            } else Logger.info(`setting ${prop} not loaded because there is no element for it.`);
        }
    }
    function storeSettings() {
        localStorage.setItem('settings', JSON.stringify(settings));
    }

    function buildGallery() {
        const sortedSkins = Array.from(knownSkins.keys()).sort();
        const totalPages = Math.max(1, Math.ceil(sortedSkins.length / galleryView.pageSize));
        galleryView.page = Math.min(totalPages, Math.max(1, galleryView.page));
        const start = (galleryView.page - 1) * galleryView.pageSize;
        const visibleSkins = sortedSkins.slice(start, start + galleryView.pageSize);
        const galleryHeader = byId('gallery-header');
        if (galleryHeader) {
            galleryHeader.textContent = galleryTargetInputId === 'multiSkin' ? 'Select Multi Skin' : 'Select Main Skin';
        }
        let c = '';
        for (const skin of visibleSkins) {
            c += `<li class="skin" onclick="changeSkin('${skin}')">`;
            c += `<img class="circular" src="./skins/${skin}.png" onerror="reportBrokenSkin('${skin}')">`;
            c += `<h4 class="skinName">${skin}</h4>`;
            c += '</li>';
        }
        const meta = sortedSkins.length
            ? `<div class="gallery-meta"><span>Showing ${start + 1}-${start + visibleSkins.length} of ${sortedSkins.length} skins</span></div>`
            : `<div class="gallery-meta"><span>No skins uploaded yet.</span></div>`;
        const pagination = `<div class="gallery-pagination">
            <button class="gallery-page-button" onclick="changeGalleryPage(-1)" ${galleryView.page <= 1 ? "disabled" : ""}>Prev</button>
            <span class="gallery-page-status">${galleryView.page} / ${totalPages}</span>
            <button class="gallery-page-button" onclick="changeGalleryPage(1)" ${galleryView.page >= totalPages ? "disabled" : ""}>Next</button>
        </div>`;
        byId('gallery-body').innerHTML = `${meta}<ul id="skinsUL">${c}</ul>${pagination}`;
    }

    function drawChat() {
        if (chat.messages.length === 0 && settings.showChat)
            return chat.visible = false;
        chat.visible = true;
        const canvas = chat.canvas;
        const ctx = canvas.getContext('2d');
        const latestMessages = chat.messages.slice(-15);
        const lines = [];
        for (let i = 0; i < latestMessages.length; i++) {
            lines.push([
                {
                    text: latestMessages[i].name,
                    color: latestMessages[i].color
                }, {
                    text: ` ${latestMessages[i].message}`,
                    color: Color.fromHex(settings.darkTheme ? '#FFF' : '#000')
                }
            ]);
        }
        window.lines = lines;
        let width = 0;
        let height = 20 * lines.length + 2;
        for (let i = 0; i < lines.length; i++) {
            let thisLineWidth = 10;
            let complexes = lines[i];
            for (let j = 0; j < complexes.length; j++) {
                ctx.font = '18px Ubuntu';
                complexes[j].width = ctx.measureText(complexes[j].text).width;
                thisLineWidth += complexes[j].width;
            }
            width = Math.max(thisLineWidth, width);
        }
        canvas.width = width;
        canvas.height = height;
        for (let i = 0; i < lines.length; i++) {
            let width = 0;
            let complexes = lines[i];
            for (let j = 0; j < complexes.length; j++) {
                ctx.font = '18px Ubuntu';
                ctx.fillStyle = complexes[j].color.toHex();
                ctx.fillText(complexes[j].text, width, 20 * (1 + i));
                width += complexes[j].width;
            }
        }
    }

    function drawStats() {
        if (!stats.info) return stats.visible = false;
        stats.visible = true;

        const canvas = stats.canvas;
        const ctx = canvas.getContext('2d');
        ctx.font = '14px Ubuntu';
        const uptime = prettyPrintTime(stats.info.uptime);
        const rows = [
            `${stats.info.name} (${stats.info.mode})`,
            `${stats.info.playersTotal} / ${stats.info.playersLimit} players`,
            `${stats.info.playersAlive} playing`,
            `${stats.info.playersSpect} spectating`,
            `${(stats.info.update * 2.5).toFixed(1)}% load @ ${uptime}`,
        ];
        let width = 0;
        for (const row of rows) {
            width = Math.max(width, 2 + ctx.measureText(row).width + 2);
        }
        canvas.width = width;
        canvas.height = rows.length * (14 + 2);
        ctx.font = '14px Ubuntu';
        ctx.fillStyle = settings.darkTheme ? '#AAA' : '#555';
        ctx.textBaseline = 'top';
        for (let i = 0; i < rows.length; i++) {
            ctx.fillText(rows[i], 2, -1 + i * (14 + 2));
        }
    }

    function drawPosition() {
        if (!settings.showPosition || !border.width || !border.height) return;
        const width = 200 * (border.width / border.height);
        const height = 40 * (border.height / border.width);
        const relativeX = Math.max(0, Math.min(border.width, camera.x - border.left));
        const relativeY = Math.max(0, Math.min(border.height, camera.y - border.top));
        const label = `X: ${~~relativeX}, Y: ${~~relativeY}`;

        let beginX = mainCanvas.width / camera.viewportScale - width;
        let beginY = mainCanvas.height / camera.viewportScale - height;

        if (settings.showMinimap) {
            mainCtx.font = '15px Ubuntu';
            beginX += width / 2 - 1;
            beginY = beginY - 194 * border.height / border.width;
            mainCtx.textAlign = 'right';
            mainCtx.fillStyle = settings.darkTheme ? '#AAA' : '#555';
            mainCtx.fillText(label, beginX + width / 2, beginY + height / 2);
        } else {
            mainCtx.fillStyle = '#000';
            mainCtx.globalAlpha = 0.4;
            mainCtx.fillRect(beginX, beginY, width, height);
            mainCtx.globalAlpha = 1;
            drawRaw(mainCtx, beginX + width / 2, beginY + height / 2, label);
        }
    }

    function prettyPrintTime(seconds) {
        const minutes = ~~(seconds / 60);
        if (minutes < 1) return '<1 min';
        const hours = ~~(minutes / 60);
        if (hours < 1) return `${minutes}min`;
        const days = ~~(hours / 24);
        if (days < 1) return `${hours}h`;
        return `${days}d`;
    }

    function drawLeaderboard() {
        if (leaderboard.type === null) return leaderboard.visible = false;
        if (!settings.showNames || leaderboard.items.length === 0) {
            return leaderboard.visible = false;
        }
        leaderboard.visible = true;
        const canvas = leaderboard.canvas;
        const ctx = canvas.getContext('2d');

        canvas.width = 200;
        canvas.height = leaderboard.type !== 'pie' ? 60 + 24 * leaderboard.items.length : 240;

        ctx.globalAlpha = .4;
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, 200, canvas.height);

        ctx.globalAlpha = 1;
        ctx.fillStyle = '#FFF';
        ctx.font = '30px Ubuntu';
        ctx.fillText('Leaderboard', 100 - ctx.measureText('Leaderboard').width / 2, 40);

        if (leaderboard.type === 'pie') {
            let last = 0;
            for (let i = 0; i < leaderboard.items.length; i++) {
                ctx.fillStyle = leaderboard.teams[i];
                ctx.beginPath();
                ctx.moveTo(100, 140);
                ctx.arc(100, 140, 80, last, (last += leaderboard.items[i] * PI_2), false);
                ctx.closePath();
                ctx.fill();
            }
        } else {
            ctx.font = '20px Ubuntu';
            for (let i = 0; i < leaderboard.items.length; i++) {
                let isMe = false;
                let text;
                if (leaderboard.type === "text") {
                    text = leaderboard.items[i];
                } else {
                    text = leaderboard.items[i].name,
                    isMe = leaderboard.items[i].me;
                }
                if (leaderboard.type === 'ffa') text = `${i + 1}. ${text}`;
                ctx.fillStyle = isMe ? '#FAA' : '#FFF';
                const width = ctx.measureText(text).width;
                const start = width > 200 ? 2 : 100 - width * 0.5;
                ctx.fillText(text, start, 70 + 24 * i);
            }
        }
    }
    function drawGrid() {
        mainCtx.save();
        mainCtx.lineWidth = 1;
        mainCtx.strokeStyle = settings.darkTheme ? '#AAA' : '#000';
        mainCtx.globalAlpha = 0.2;
        const step = 50;
        const cW = mainCanvas.width / camera.scale;
        const cH = mainCanvas.height / camera.scale;
        const startLeft = (-camera.x + cW / 2) % step;
        const startTop = (-camera.y + cH / 2) % step;

        scaleForth(mainCtx);
        mainCtx.beginPath();
        for (let i = startLeft; i < cW; i += step) {
            mainCtx.moveTo(i, 0);
            mainCtx.lineTo(i, cH);
        }
        for (let i = startTop; i < cH; i += step) {
            mainCtx.moveTo(0, i);
            mainCtx.lineTo(cW, i);
        }
        mainCtx.stroke();
        mainCtx.restore();
    }
    function drawBackgroundSectors() {
        if (border === undefined || border.width === undefined) return;
        mainCtx.save();

        const sectorCount = 5;
        const sectorNames = ['ABCDE', '12345'];
        const w = border.width / sectorCount;
        const h = border.height / sectorCount;

        toCamera(mainCtx);
        mainCtx.fillStyle = settings.darkTheme ? '#666' : '#DDD';
        mainCtx.textBaseline = 'middle';
        mainCtx.textAlign = 'center';
        mainCtx.font = `${w / 3 | 0}px Ubuntu`;

        for (let y = 0; y < sectorCount; ++y) {
            for (let x = 0; x < sectorCount; ++x) {
                const str = sectorNames[0][x] + sectorNames[1][y];
                const dx = (x + 0.5) * w + border.left;
                const dy = (y + 0.5) * h + border.top;
                mainCtx.fillText(str, dx, dy);
            }
        }
        mainCtx.restore();
    }
    function drawMinimap() {
        if (!settings.showMinimap || !border.width || !border.height) return;
        mainCtx.save();
        mainCtx.resetTransform();
        const targetSize = 200;
        const borderAR = border.width / border.height; // aspect ratio
        const width = targetSize * borderAR * camera.viewportScale;
        const height = targetSize / borderAR * camera.viewportScale;
        const beginX = mainCanvas.width - width;
        const beginY = mainCanvas.height - height;

        mainCtx.fillStyle = '#000';
        mainCtx.globalAlpha = 0.4;
        mainCtx.fillRect(beginX, beginY, width, height);
        mainCtx.globalAlpha = 1;

        const sectorCount = 5;
        const sectorNames = ['ABCDE', '12345'];
        const sectorWidth = width / sectorCount;
        const sectorHeight = height / sectorCount;
        const sectorNameSize = Math.min(sectorWidth, sectorHeight) / 3;

        mainCtx.fillStyle = settings.darkTheme ? '#666' : '#DDD';
        mainCtx.textBaseline = 'middle';
        mainCtx.textAlign = 'center';
        mainCtx.font = `${sectorNameSize}px Ubuntu`;

        for (let i = 0; i < sectorCount; i++) {
            const x = (i + 0.5) * sectorWidth;
            for (let j = 0; j < sectorCount; j++) {
                const y = (j + 0.5) * sectorHeight;
                mainCtx.fillText(sectorNames[0][i] + sectorNames[1][j], beginX + x, beginY + y);
            }
        }

        const xScale = width / border.width;
        const yScale = height / border.height;
        const relativeX = Math.max(0, Math.min(border.width, camera.x - border.left));
        const relativeY = Math.max(0, Math.min(border.height, camera.y - border.top));
        const myPosX = beginX + relativeX * xScale;
        const myPosY = beginY + relativeY * yScale;

        const xIndex = Math.max(0, Math.min(sectorCount - 1, (relativeX / border.width * sectorCount) | 0));
        const yIndex = Math.max(0, Math.min(sectorCount - 1, (relativeY / border.height * sectorCount) | 0));
        const lightX = beginX + xIndex * sectorWidth;
        const lightY = beginY + yIndex * sectorHeight;
        mainCtx.fillStyle = 'yellow';
        mainCtx.globalAlpha = 0.3;
        mainCtx.fillRect(lightX, lightY, sectorWidth, sectorHeight);
        mainCtx.globalAlpha = 1;

        mainCtx.beginPath();
        if (cells.mine.length) {
            for (const id of cells.mine) {
                const cell = cells.byId.get(id);
                if (!cell) continue;
                mainCtx.fillStyle = cell.color.toHex(); // repeat assignment of same color is OK
                const x = beginX + Math.max(0, Math.min(border.width, cell.x - border.left)) * xScale;
                const y = beginY + Math.max(0, Math.min(border.height, cell.y - border.top)) * yScale;
                const r = Math.max(cell.s, 200) * (xScale + yScale) / 2;
                mainCtx.moveTo(x + r, y);
                mainCtx.arc(x, y, r, 0, PI_2);
            }
        } else {
            mainCtx.fillStyle = '#FAA';
            mainCtx.arc(myPosX, myPosY, 5, 0, PI_2);
        }
        mainCtx.fill();

        // draw name above user's pos if they have a cell on the screen
        const cell = cells.byId.get(cells.mine.find(id => cells.byId.has(id)));
        if (cell) {
            mainCtx.fillStyle = settings.darkTheme ? '#DDD' : '#222';
            mainCtx.font = `${sectorNameSize}px Ubuntu`;
            mainCtx.fillText(cell.name || EMPTY_NAME, myPosX, myPosY - 7 - sectorNameSize / 2);
        }

        mainCtx.restore();
    }

    function drawBorders() {
        if (!settings.showBorder) return;
        mainCtx.strokeStyle = '#0000ff';
        mainCtx.lineWidth = 20;
        mainCtx.lineCap = 'round';
        mainCtx.lineJoin = 'round';
        mainCtx.beginPath();
        mainCtx.moveTo(border.left, border.top);
        mainCtx.lineTo(border.right, border.top);
        mainCtx.lineTo(border.right, border.bottom);
        mainCtx.lineTo(border.left, border.bottom);
        mainCtx.closePath();
        mainCtx.stroke();
    }
    function getFocusedMineCell() {
        let focusedCell = null;
        let bestDistance = Infinity;
        for (const id of cells.mine) {
            const cell = cells.byId.get(id);
            if (!cell) continue;
            const dx = cell.x - camera.x;
            const dy = cell.y - camera.y;
            const distance = dx * dx + dy * dy;
            if (distance < bestDistance) {
                bestDistance = distance;
                focusedCell = cell;
            }
        }
        return focusedCell;
    }
    function drawDualIndicator() {
        return;
    }

    function drawGame() {
        stats.fps += (1000 / Math.max(Date.now() - syncAppStamp, 1) - stats.fps) / 10;
        syncAppStamp = Date.now();

        const drawList = cells.list.slice(0).sort(cellSort);
        for (const cell of drawList) cell.update(syncAppStamp);
        cameraUpdate();
        if (settings.jellyPhysics) {
            updateQuadtree();
            for (const cell of drawList) {
                cell.updateNumPoints();
                cell.movePoints();
            }
        }

        mainCtx.save();
        mainCtx.resetTransform();

        mainCtx.fillStyle = settings.darkTheme ? '#111' : '#F2FBFF';
        mainCtx.fillRect(0, 0, mainCanvas.width, mainCanvas.height);
        if (settings.showGrid) drawGrid();
        if (settings.backgroundSectors) drawBackgroundSectors();

        toCamera(mainCtx);
        drawBorders();

        for (const cell of drawList) cell.draw(mainCtx);
        drawDualIndicator();

        fromCamera(mainCtx);
        quadtree = null;
        mainCtx.scale(camera.viewportScale, camera.viewportScale);

        let height = 2;
        mainCtx.fillStyle = settings.darkTheme ? '#FFF' : '#000';
        mainCtx.textBaseline = 'top';
        if (!isNaN(stats.score)) {
            mainCtx.font = '30px Ubuntu';
            mainCtx.fillText(`Score: ${stats.score}`, 2, height);
            height += 30;
        }
        mainCtx.font = '20px Ubuntu';
        const gameStatsText = `${~~stats.fps} FPS` + (isNaN(stats.latency) ? '' : ` ${stats.latency}ms ping`);
        mainCtx.fillText(gameStatsText, 2, height);
        height += 24;

        if (stats.visible) {
            mainCtx.drawImage(stats.canvas, 2, height);
        }
        if (leaderboard.visible) {
            mainCtx.drawImage(
                leaderboard.canvas,
                mainCanvas.width / camera.viewportScale - 10 - leaderboard.canvas.width,
                10);
        }
        if (settings.showChat && (chat.visible || isTyping)) {
            mainCtx.globalAlpha = isTyping ? 1 : Math.max(1000 - syncAppStamp + chat.waitUntil, 0) / 1000;
            mainCtx.drawImage(
                chat.canvas,
                10 / camera.viewportScale,
                (mainCanvas.height - 55) / camera.viewportScale - chat.canvas.height
            );
            mainCtx.globalAlpha = 1;
        }
        drawMinimap();
        drawPosition();

        mainCtx.restore();

        if (minionControlled) {
            mainCtx.save();
            mainCtx.font = '18px Ubuntu';
            mainCtx.textAlign = 'center';
            mainCtx.textBaseline = 'hanging';
            mainCtx.fillStyle = '#eea236';
            const text = 'You are controlling a minion, press Q to switch back.';
            mainCtx.fillText(text, mainCanvas.width / 2, 5);
            mainCtx.restore();
        }
        if (dualControlActive && cells.mine.length > 0) {
            mainCtx.save();
            mainCtx.font = '18px Ubuntu';
            mainCtx.textAlign = 'center';
            mainCtx.textBaseline = 'hanging';
            mainCtx.fillStyle = '#54d2ff';
            mainCtx.fillText('Multi-control active. Tab spawns or switches players, Shift+Tab returns to the primary player.', mainCanvas.width / 2, minionControlled ? 28 : 5);
            mainCtx.restore();
        } else if (cells.mine.length < 1) {
            dualControlActive = false;
        }

        cacheCleanup();
        window.requestAnimationFrame(drawGame);
    }

    function cellSort(a, b) {
        return a.s === b.s ? a.id - b.id : a.s - b.s;
    }

    function cameraUpdate() {
        const myCells = [];
        for (const id of cells.mine) {
            const cell = cells.byId.get(id);
            if (cell) myCells.push(cell);
        }
        if (myCells.length > 0) {
            let x = 0;
            let y = 0;
            let s = 0;
            let score = 0;
            for (const cell of myCells) {
                score += ~~(cell.ns * cell.ns / 100);
                x += cell.x;
                y += cell.y;
                s += cell.s;
            }
            camera.target.x = x / myCells.length;
            camera.target.y = y / myCells.length;
            camera.sizeScale = Math.pow(Math.min(64 / s, 1), 0.4);
            camera.target.scale = camera.sizeScale;
            camera.target.scale *= camera.viewportScale * camera.userZoom;
            camera.x = (camera.target.x + camera.x) / 2;
            camera.y = (camera.target.y + camera.y) / 2;
            stats.score = score;
            stats.maxScore = Math.max(stats.maxScore, score);
        } else {
            stats.score = NaN;
            stats.maxScore = 0;
            camera.x += (camera.target.x - camera.x) / 20;
            camera.y += (camera.target.y - camera.y) / 20;
        }
        camera.scale += (camera.target.scale - camera.scale) / 9;
    }
    function sqDist(a, b) {
        return (a.x - b.x) * (a.x - b.x) + (a.y - b.y) * (a.y - b.y);
    }
    function updateQuadtree() {
        const w = 1920 / camera.sizeScale;
        const h = 1080 / camera.sizeScale;
        const x = (camera.x - w / 2);
        const y = (camera.y - h / 2);
        quadtree = new window.PointQuadTree(x, y, w, h, QUADTREE_MAX_POINTS);
        for (const cell of cells.list) {
            for (const point of cell.points) quadtree.insert(point);
        }
    }

    class Cell {
        static parseName(value) { // static method
            let [, skin, name] = /^(?:<([^}]*)>)?([^]*)/.exec(value || '');
            name = name.trim();
            return {
                name: name,
                skin: (skin || '').trim() || name,
            };
        }
        constructor(id, x, y, s, name, color, skin, flags) {
            this.destroyed = false;
            this.diedBy = 0;
            this.nameSize = 0;
            this.drawNameSize = 0;
            this.updated = null;
            this.dead = null;
            this.id = id;
            this.ox = x;
            this.x = x;
            this.nx = x;
            this.oy = y;
            this.y = y;
            this.ny = y;
            this.os = s;
            this.s = s;
            this.ns = s;
            this.setColor(color);
            this.setName(name);
            this.setSkin(skin);
            this.jagged = flags.jagged;
            this.ejected = flags.ejected;
            this.born = syncUpdStamp;
            this.points = [];
            this.pointsVel = [];
        }
        destroy(killerId) {
            cells.byId.delete(this.id);
            if (cells.mine.remove(this.id) && cells.mine.length === 0) showESCOverlay();
            this.destroyed = true;
            this.dead = syncUpdStamp;
            if (killerId && !this.diedBy) {
                this.diedBy = killerId;
                this.updated = syncUpdStamp;
            }
        }
        update(relativeTime) {
            const prevFrameSize = this.s;
            const dt = Math.max(Math.min((relativeTime - this.updated) / 120, 1), 0);
            let diedBy;
            if (this.destroyed && Date.now() > this.dead + 200) {
                cells.list.remove(this);
            } else if (this.diedBy && (diedBy = cells.byId.get(this.diedBy))) {
                this.nx = diedBy.x;
                this.ny = diedBy.y;
            }
            this.x = this.ox + (this.nx - this.ox) * dt;
            this.y = this.oy + (this.ny - this.oy) * dt;
            this.s = this.os + (this.ns - this.os) * dt;
            this.nameSize = ~~(~~(Math.max(~~(0.3 * this.ns), 24)) / 3) * 3;
            this.drawNameSize = ~~(~~(Math.max(~~(0.3 * this.s), 24)) / 3) * 3;

            if (settings.jellyPhysics && this.points.length) {
                const ratio = this.s / prevFrameSize;
                if (this.ns != this.os && ratio != 1) {
                    for (const point of this.points) point.rl *= ratio;
                }
            }
        }
        updateNumPoints() {
            let numPoints = Math.min(Math.max(this.s * camera.scale | 0, CELL_POINTS_MIN), CELL_POINTS_MAX);
            if (this.jagged) numPoints = VIRUS_POINTS;
            while (this.points.length > numPoints) {
                const i = Math.random() * this.points.length | 0;
                this.points.splice(i, 1);
                this.pointsVel.splice(i, 1);
            }
            if (this.points.length === 0 && numPoints !== 0) {
                this.points.push({
                    x: this.x,
                    y: this.y,
                    rl: this.s,
                    parent: this,
                });
                this.pointsVel.push(Math.random() - 0.5);
            }
            while (this.points.length < numPoints) {
                const i = Math.random() * this.points.length | 0;
                const point = this.points[i];
                const vel = this.pointsVel[i];
                this.points.splice(i, 0, {
                    x: point.x,
                    y: point.y,
                    rl: point.rl,
                    parent: this
                });
                this.pointsVel.splice(i, 0, vel);
            }
        }
        movePoints() {
            const pointsVel = this.pointsVel.slice();
            for (let i = 0; i < this.points.length; ++i) {
                const prevVel = pointsVel[(i - 1 + this.points.length) % this.points.length];
                const nextVel = pointsVel[(i + 1) % this.points.length];
                const newVel = Math.max(Math.min((this.pointsVel[i] + Math.random() - 0.5) * 0.7, 10), -10);
                this.pointsVel[i] = (prevVel + nextVel + 8 * newVel) / 10;
            }
            for (let i = 0; i < this.points.length; ++i) {
                const curP = this.points[i];
                const prevRl = this.points[(i - 1 + this.points.length) % this.points.length].rl;
                const nextRl = this.points[(i + 1) % this.points.length].rl; // here
                let curRl = curP.rl;
                let affected = quadtree.some({
                    x: curP.x - 5,
                    y: curP.y - 5,
                    w: 10,
                    h: 10
                }, (item) => item.parent !== this && sqDist(item, curP) <= 25);
                if (!affected &&
                    (curP.x < border.left || curP.y < border.top ||
                    curP.x > border.right || curP.y > border.bottom))
                {
                    affected = true;
                }
                if (affected) {
                    this.pointsVel[i] = Math.min(this.pointsVel[i], 0) - 1;
                }
                curRl += this.pointsVel[i];
                curRl = Math.max(curRl, 0);
                curRl = (9 * curRl + this.s) / 10;
                curP.rl = (prevRl + nextRl + 8 * curRl) / 10;

                const angle = 2 * Math.PI * i / this.points.length;
                let rl = curP.rl;
                if (this.jagged && i % 2 === 0) {
                    rl += 5;
                }
                curP.x = this.x + Math.cos(angle) * rl;
                curP.y = this.y + Math.sin(angle) * rl;
            }
        }
        setName(rawName) {
            const {name, skin} = Cell.parseName(rawName);
            this.name = name;
            this.setSkin(skin);
        }
        setSkin(value) {
            this.skin = (value && value[0] === '%' ? value.slice(1) : value) || this.skin;
            if (this.skin === null || !knownSkins.has(this.skin) || loadedSkins.has(this.skin)) {
                return;
            }
            const skin = new Image();
            skin.onerror = () => forgetBrokenSkin(this.skin);
            skin.src = `${SKIN_URL}${this.skin}.png`;
            loadedSkins.set(this.skin, skin);
        }
        setColor(value) {
            if (!value) {
                Logger.warn('Got no color');
                return;
            }
            this.color = value;
            this.sColor = value.darker();
        }
        draw(ctx) {
            ctx.save();
            this.drawShape(ctx);
            this.drawText(ctx);
            ctx.restore();
        }
        drawShape(ctx) {
            ctx.fillStyle = settings.showColor ? this.color.toHex() : '#FFFFFF';
            ctx.strokeStyle = settings.showColor ? this.sColor.toHex() : '#E5E5E5';
            const skinImage = loadedSkins.get(this.skin);
            const hasSkin = settings.showSkins && this.skin && skinImage &&
                skinImage.complete && skinImage.width && skinImage.height;
            const fullSkin = hasSkin && settings.fillSkin;
            ctx.lineWidth = Math.max(~~(this.s / 50), 10);
            const drawRadius = this.s > 20 && !fullSkin
                ? this.s - ctx.lineWidth / 2
                : this.s;

            ctx.beginPath();
            if (this.jagged) ctx.lineJoin = 'miter';
            if (settings.jellyPhysics && this.points.length) {
                const point = this.points[0];
                ctx.moveTo(point.x, point.y);
                for (const point of this.points) ctx.lineTo(point.x, point.y);
            } else if (this.jagged) {
                const pointCount = 120;
                const incremental = PI_2 / pointCount;
                ctx.moveTo(this.x, this.y + this.s + 3);
                for (let i = 1; i < pointCount; i++) {
                    const angle = i * incremental;
                    const dist = this.s - 3 + (i % 2 === 0) * 6;
                    ctx.lineTo(
                        this.x + dist * Math.sin(angle),
                        this.y + dist * Math.cos(angle)
                    )
                }
                ctx.lineTo(this.x, this.y + this.s + 3);
            } else {
                ctx.arc(this.x, this.y, drawRadius, 0, PI_2, false);
            }
            ctx.closePath();

            if (this.destroyed) {
                ctx.globalAlpha = Math.max(120 - Date.now() + this.dead, 0) / 120;
            } else {
                ctx.globalAlpha = Math.min(Date.now() - this.born, 120) / 120;
            }

            if (hasSkin) {
                if (!fullSkin) ctx.fill();
                ctx.save(); // for the clip
                ctx.clip();
                const skinBleed = fullSkin ? Math.max(ctx.lineWidth, 2) : 0;
                const imageRadius = drawRadius + skinBleed / 2;
                ctx.drawImage(skinImage, this.x - imageRadius, this.y - imageRadius,
                    imageRadius * 2, imageRadius * 2);
                ctx.restore();
            } else {
                ctx.fill();
            }
            if (this.s > 20 && !fullSkin) {
                ctx.stroke();
            }
        }
        drawText(ctx) {
            if (this.s < 20 || this.jagged) return;
            if (this.name && settings.showNames) {
                drawText(ctx, false, this.x, this.y, this.nameSize, this.drawNameSize, this.name);
            }
            if (settings.showMass && (cells.mine.indexOf(this.id) !== -1 || cells.mine.length === 0)) {
                const mass = (~~(this.s * this.s / 100)).toString();
                let y = this.y;
                if (this.name && settings.showNames)
                    y += Math.max(this.s / 4.5, this.nameSize / 1.5);
                drawText(ctx, true, this.x, y, this.nameSize / 2, this.drawNameSize / 2, mass);
            }
        }
    }

    function cacheCleanup() {
        for (const i of cachedNames.keys()) {
            for (const j of cachedNames.get(i).keys()) {
                if (syncAppStamp - cachedNames.get(i).get(j).accessTime >= 5000) {
                    cachedNames.get(i).delete(j);
                }
            }
        }
        for (const i of cachedMass.keys()) {
            if (syncAppStamp - cachedMass.get(i).accessTime >= 5000) {
                cachedMass.delete(i);
            }
        }
    }

    // 2-var draw-stay cache
    const cachedNames = new Map();
    const cachedMass  = new Map();
    window.cachedNames = cachedNames;
    window.cachedMass = cachedMass;

    function drawTextOnto(canvas, ctx, text, size) {
        ctx.font = size + 'px Ubuntu';
        ctx.lineWidth = Math.max(~~(size / 10), 2);
        canvas.width = ctx.measureText(text).width + 2 * ctx.lineWidth;
        canvas.height = 4 * size;
        ctx.font = size + 'px Ubuntu';
        ctx.lineWidth = Math.max(~~(size / 10), 2);
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#FFF'
        ctx.strokeStyle = '#000';
        ctx.translate(canvas.width / 2, 2 * size);
        (ctx.lineWidth !== 1) && ctx.strokeText(text, 0, 0);
        ctx.fillText(text, 0, 0);
    }
    function drawRaw(ctx, x, y, text, size) {
        ctx.font = size + 'px Ubuntu';
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'center';
        ctx.lineWidth = Math.max(~~(size / 10), 2);
        ctx.fillStyle = '#FFF'
        ctx.strokeStyle = '#000';
        (ctx.lineWidth !== 1) && ctx.strokeText(text, x, y);
        ctx.fillText(text, x, y);
        ctx.restore();
    }
    function newNameCache(value, size) {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        drawTextOnto(canvas, ctx, value, size);
        if (!cachedNames.has(value)) cachedNames.set(value, new Map());
        const cache = {
            width: canvas.width,
            height: canvas.height,
            canvas: canvas,
            value: value,
            size: size,
            accessTime: syncAppStamp
        };
        cachedNames.get(value).set(size, cache);
        return cache;
    }
    function newMassCache(size) {
        const canvases = {
            0: { }, 1: { }, 2: { }, 3: { }, 4: { },
            5: { }, 6: { }, 7: { }, 8: { }, 9: { }
        };
        for (const i in canvases) {
            const canvas = canvases[i].canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            drawTextOnto(canvas, ctx, i, size);
            canvases[i].canvas = canvas;
            canvases[i].width = canvas.width;
            canvases[i].height = canvas.height;
        }
        const cache = {
            canvases: canvases,
            size: size,
            lineWidth: Math.max(~~(size / 10), 2),
            accessTime: syncAppStamp
        };
        cachedMass.set(size, cache);
        return cache;
    }
    function toleranceTest(a, b, tolerance) {
        return (a - tolerance) <= b && b <= (a + tolerance);
    }
    function getNameCache(value, size) {
        if (!cachedNames.has(value)) return newNameCache(value, size);
        const sizes = Array.from(cachedNames.get(value).keys());
        for (let i = 0, l = sizes.length; i < l; i++) {
            if (toleranceTest(size, sizes[i], size / 4)) {
                return cachedNames.get(value).get(sizes[i]);
            }
        }
        return newNameCache(value, size);
    }
    function getMassCache(size) {
        const sizes = Array.from(cachedMass.keys());
        for (let i = 0, l = sizes.length; i < l; i++) {
            if (toleranceTest(size, sizes[i], size / 4)) {
                return cachedMass.get(sizes[i]);
            }
        }
        return newMassCache(size);
    }

    function drawText(ctx, isMass, x, y, size, drawSize, value) {
        ctx.save();
        if (size > 500) return drawRaw(ctx, x, y, value, drawSize);
        ctx.imageSmoothingQuality = 'high';
        if (isMass) {
            const cache = getMassCache(size);
            cache.accessTime = syncAppStamp;
            const canvases = cache.canvases;
            const correctionScale = drawSize / cache.size;

            // calculate width
            let width = 0;
            for (let i = 0; i < value.length; i++) {
                width += canvases[value[i]].width - 2 * cache.lineWidth;
            }

            ctx.scale(correctionScale, correctionScale);
            x /= correctionScale;
            y /= correctionScale;
            x -= width / 2;
            for (let i = 0; i < value.length; i++) {
                const item = canvases[value[i]];
                ctx.drawImage(item.canvas, x, y - item.height / 2);
                x += item.width - 2 * cache.lineWidth;
            }
        } else {
            const cache = getNameCache(value, size);
            cache.accessTime = syncAppStamp;
            const canvas = cache.canvas;
            const correctionScale = drawSize / cache.size;
            ctx.scale(correctionScale, correctionScale);
            x /= correctionScale;
            y /= correctionScale;
            ctx.drawImage(canvas, x - canvas.width / 2, y - canvas.height / 2);
        }
        ctx.restore();
    }
    function processKey(event) {
        let key = CODE_TO_KEY[event.code] || event.key.toLowerCase();
        if (Object.hasOwnProperty.call(IE_KEYS, key)) key = IE_KEYS[key]; // IE fix
        return key;
    }
    function keydown(event) {
        const key = processKey(event);
        if (pressed[key]) return;
        if (Object.hasOwnProperty.call(pressed, key)) pressed[key] = true;
        if (key === 'enter') {
            if (escOverlayShown || !settings.showChat) return;
            if (isTyping) {
                chatBox.blur();
                if (chatBox.value.length > 0) sendChat(chatBox.value);
                chatBox.value = '';
            } else {
                chatBox.focus();
            }
        } else if (key === 'escape') {
            escOverlayShown ? hideESCOverlay() : showESCOverlay();
        } else if (key === 'tab') {
            event.preventDefault();
            if (isTyping || escOverlayShown) return;
            if (event.shiftKey) {
                dualControlActive = false;
                wsSend(UINT8_CACHE[27]);
            } else {
                dualControlActive = true;
                wsSend(UINT8_CACHE[26]);
            }
        } else {
            if (isTyping || escOverlayShown) return;
            let code = KEY_TO_OPCODE[key];
            if (code !== undefined) wsSend(code);
            if (key === 'w') {
                code = UINT8_CACHE[minionControlled ? 23 : 21];
                macroIntervalID = setInterval(() => wsSend(code), macroCooldown);
                wsSend(code);
            }
            if (key === 'r') {
                requestSoftRestart();
            }
            if (key === 'd' && !minionControlled)
                wsSend(UINT8_CACHE[29]);
            if (key === 'z' && !minionControlled)
                wsSend(UINT8_CACHE[30]);
            if (key === ' ')
                wsSend(UINT8_CACHE[minionControlled ? 22 : 17]);
            if (key === 'q') {
                wsSend(UINT8_CACHE[18]);
                minionControlled = !minionControlled;
            }
        }
    }
    function keyup(event) {
        const key = processKey(event);
        if (Object.hasOwnProperty.call(pressed, key)) pressed[key] = false;
        if (key === 'w') clearInterval(macroIntervalID);
    }
    function handleScroll(event) {
        if (event.target !== mainCanvas) return;
        camera.userZoom *= event.deltaY > 0 ? 0.8 : 1.2;
        camera.userZoom = Math.max(camera.userZoom, settings.moreZoom ? 0.1 : 1);
        camera.userZoom = Math.min(camera.userZoom, 4);
    }

    function init() {
        mainCanvas = document.getElementById('canvas');
        mainCtx = mainCanvas.getContext('2d');
        chatBox = byId('chat_textbox');
        soundsVolume = byId('soundsVolume');
        mainCanvas.focus();
        setPlayButtonsDisabled(serverDisabled);

        loadSettings();
        window.addEventListener('beforeunload', storeSettings);
        document.addEventListener('wheel', handleScroll, {passive: true});
        const capturePointerEvent = (event, source) => {
            if (updatePointerFromEvent(event, source) && cells.mine.length && ws && ws.readyState === WebSocket.OPEN) {
                sendCurrentMouseTarget();
            }
        };
        window.addEventListener('pointermove', (event) => {
            updatePointerFromEvent(event, 'pointermove');
        }, {passive: true});
        window.addEventListener('mousemove', (event) => {
            updatePointerFromEvent(event, 'mousemove');
        }, {passive: true});
        window.addEventListener('pointerdown', (event) => {
            capturePointerEvent(event, 'pointerdown');
        }, {passive: true});
        window.addEventListener('mousedown', (event) => {
            capturePointerEvent(event, 'mousedown');
        }, {passive: true});
        window.addEventListener('focus', () => {
            sendCurrentMouseTarget();
        });
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') sendCurrentMouseTarget();
        });
        byId('play-btn').addEventListener('click', (event) => {
            updatePointerFromEvent(event, 'play_click');
            sendPlayProfile();
        });
        window.onkeydown = keydown;
        window.onkeyup = keyup;
        chatBox.onblur = () => {
            isTyping = false;
            drawChat();
        };
        chatBox.onfocus = () => {
            isTyping = true;
            drawChat();
        };
        mainCanvas.onmousemove = (event) => {
            updatePointerFromEvent(event, 'canvas_mousemove');
        };
        setInterval(() => {
            sendCurrentMouseTarget();
        }, 40);
        window.onresize = () => {
            const width = mainCanvas.width = window.innerWidth;
            const height = mainCanvas.height = window.innerHeight;
            camera.viewportScale = Math.max(width / 1920, height / 1080);
            ensurePointerPosition();
        };
        window.onresize();
        const mobileStuff = byId('mobileStuff');
        // eslint-disable-next-line
        const touchpad = byId('touchpad');
        const touchCircle = byId('touchCircle');
        const touchSize = .2;
        let touched = false;
        const touchmove = (event) => {
            const touch = event.touches[0];
            const width = innerWidth * touchSize;
            const height = innerHeight * touchSize;
            if (touch.pageX < width && touch.pageY > innerHeight - height) {
                updatePointerPosition(
                    innerWidth / 2 + (touch.pageX - width / 2) * innerWidth / width,
                    innerHeight / 2 + (touch.pageY - (innerHeight - height / 2)) * innerHeight / height,
                    'touchpad'
                );
            } else {
                updatePointerPosition(touch.pageX, touch.pageY, 'touch');
            }
            const r = innerWidth * .02;
            touchCircle.style.left = mouseX - r + 'px';
            touchCircle.style.top = mouseY - r + 'px';
        };
        window.addEventListener('touchmove', touchmove);
        window.addEventListener('touchstart', (event) => {
            if (!touched) {
                touched = true;
                mobileStuff.show();
            }
            if (event.target.id === 'splitBtn') {
                wsSend(UINT8_CACHE[17]);
            } else if (event.target.id === 'ejectBtn') {
                wsSend(UINT8_CACHE[21]);
            } else {
                touchmove(event);
            }
            touchCircle.show();
        });
        window.addEventListener('touchend', (event) => {
            if (event.touches.length === 0) {
                touchCircle.hide();
            }
        });

        gameReset();
        showESCOverlay();

        const regex = /ip=([\w\W]+:[0-9]+)/;
        const args = window.location.search;
        const div = args ? regex.exec(args.slice(1)) : null;
        if (div && !serverDisabled) {
            window.setserver(div[1]);
        } else if (!serverDisabled) {
            window.setserver(byId('gamemode').value);
        } else {
            byId('connecting').hide();
            updateOfflineOverlay('The arena is currently offline. Try again after the admin powers it back on.');
        }
        drawGame();
        if (window.__AGAR_BOOT_GUARD && typeof window.__AGAR_BOOT_GUARD.markInitDone === 'function') {
            window.__AGAR_BOOT_GUARD.markInitDone();
        }
        Logger.info(`Init done in ${Date.now() - LOAD_START}ms`);
    }
    window.setserver = (url) => {
        wsCandidates = buildServerCandidates(url);
        wsCandidateIndex = 0;
        connectionDiagnosticResetPending = true;
        if (serverDisabled) {
            byId('connecting').hide();
            return;
        }
        clearConnectionNotice();
        if (wsCandidates[0] === wsUrl && ws && ws.readyState <= WebSocket.OPEN) return;
        reconnectDelay = 1000;
        wsInit(wsCandidates[0]);
    };
    window.spectate = (/* a */) => {
        connectionIntent = 'spectate';
        ensureConnectionDiagnostic(wsCandidates[wsCandidateIndex] || wsUrl || FALLBACK_WS_URL, !ws || ws.readyState !== WebSocket.OPEN);
        updateConnectionDiagnostic({
            connectionIntent: 'spectate',
            stage: 'spectate_requested',
            final: false,
        });
        cancelReconnectRecovery();
        playOverlayDismissPending = false;
        pendingPlayProfile = null;
        reconnectRecoveryAttempts = 0;
        wsSend(UINT8_CACHE[1]);
        stats.maxScore = 0;
        hideESCOverlay();
    };
    window.changeSkin = (a) => {
        const targetId = galleryTargetInputId === 'multiSkin' ? 'multiSkin' : 'skin';
        const input = byId(targetId);
        if (!input) return;
        input.value = a;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
        if (targetId === 'multiSkin') settings.multiSkin = a;
        else settings.skin = a;
        if (typeof window.syncSelectedSkinPreviews === 'function') {
            window.syncSelectedSkinPreviews();
        }
        byId('gallery').hide();
    };
    window.openSkinsList = (target = 'skin') => {
        galleryTargetInputId = target === 'multiSkin' ? 'multiSkin' : 'skin';
        buildGallery();
        byId('gallery').show(0.5);
    };
    window.changeGalleryPage = (delta) => {
        galleryView.page += delta;
        buildGallery();
    };
    window.reportBrokenSkin = forgetBrokenSkin;
    window.refreshSkinList = refreshSkinList;
    window.setServerDisabled = (disabled, reason) => {
        serverDisabled = !!disabled;
        setPlayButtonsDisabled(serverDisabled);
        if (serverDisabled) {
            dualControlActive = false;
            playOverlayDismissPending = false;
            connectionIntent = 'idle';
            reconnectRecoveryProfile = null;
            cancelReconnectRecovery();
            reconnectRecoveryAttempts = 0;
            wsCleanup();
            clearConnectionNotice();
            resetConnectingStatus();
            byId('connecting').hide();
            showESCOverlay();
            updateOfflineOverlay(reason || 'The arena is currently offline.');
            return;
        }
        updateOfflineOverlay(window.AGAR_CONFIG?.publicSubtitle || '');
        if (!ws && !activeConnectionNoticeState) {
            const selector = byId('gamemode');
            window.setserver(selector ? selector.value : (wsCandidates[0] || FALLBACK_WS_URL));
        }
    };

    function ensureWsConnection() {
        if (serverDisabled) return false;
        if (ws && ws.readyState <= WebSocket.OPEN) return true;
        const selector = byId('gamemode');
        const target = selector ? selector.value : (wsCandidates[0] || wsUrl || FALLBACK_WS_URL);
        wsCandidates = buildServerCandidates(target);
        wsCandidateIndex = 0;
        connectionDiagnosticResetPending = true;
        reconnectDelay = 1000;
        wsInit(wsCandidates[0]);
        return true;
    }
    window.addEventListener('DOMContentLoaded', () => {
        try {
            init();
        } catch (error) {
            handleBootstrapFailure(error, 'dom_content_loaded');
        }
    });
})();
