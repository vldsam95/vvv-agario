const Packet = require('./packet');
const Vec2 = require('./modules/Vec2');
const BinaryWriter = require("./packet/BinaryWriter");
const {Quad} = require("./modules/QuadNode.js");
const UserRoleEnum = require("./enum/UserRoleEnum");

class Player {
    constructor(server, socket) {
        this.server = server;
        this.socket = socket;
        this.pID = -1;
        this.userAuth = null;
        this.isRemoved = false;
        this.isRestartOrphan = false;
        this.isCloseRequested = false;
        this._name = "";
        this._skin = "";
        this._nameUtf8 = null;
        this._skinUtf8protocol11 = null;
        this._nameUnicode = null;
        this._skinUtf8 = null;
        this._secondarySkin = "";
        this.color = { r: 0, g: 0, b: 0 };
        this.viewNodes = [];
        this.clientNodes = [];
        this.cells = [];
        this.mergeOverride = false; // Triggered by console command
        this._score = 0; // Needed for leaderboard
        this._scale = 1;
        this.borderCounter = 0;
        this.connectedTime = new Date();
        this.tickLeaderboard = 0;
        this.team = 0;
        this.spectate = false;
        this.freeRoam = false; // Free-roam mode enables player to move in spectate mode
        this.spectateTarget = null; // Spectate target, null for largest player
        this.lastKeypressTick = 0;
        this.centerPos = new Vec2(0, 0);
        this.mouse = new Vec2(0, 0);
        this.inputMouse = new Vec2(0, 0);
        this.viewBox = new Quad(0, 0, 0, 0);
        // Scramble the coordinate system for anti-raga
        this.scrambleX = 0;
        this.scrambleY = 0;
        this.scrambleId = 0;
        this.isMinion = false;
        this.isMuted = false;
        // Custom commands
        this.spawnmass = 0;
        this.frozen = false;
        this.customspeed = 0;
        this.rec = false;
        // Minions
        this.isMi = false;
        this.minionSplit = false;
        this.minionEject = false;
        this.minionFrozen = false;
        this.hasMinions = server.config.serverMinions > 0;
        this.lastEject = null;
        this.linkedController = this;
        this.isLinkedAvatar = false;
        this.multiControl = {
            enabled: false,
            activePlayer: this,
            lastActionTick: 0,
            linkedPlayers: [this],
            pendingOwnedRefresh: false,
        };
        // Gamemode function
        if (server) {
            // Player id
            this.pID = server.lastPlayerId++ >> 0;
            // Gamemode function
            server.mode.onPlayerInit(this);
            // Only scramble if enabled in config
            this.scramble();
        }
        this.userRole = UserRoleEnum.GUEST;
    }
    // Setters/Getters
    scramble() {
        if (!this.server.config.serverScrambleLevel) {
            this.scrambleId = 0;
            this.scrambleX = 0;
            this.scrambleY = 0;
        } else {
            this.scrambleId = (Math.random() * 0xFFFFFFFF) >>> 0;
            // avoid mouse packet limitations
            var maxx = Math.max(0, 31767 - this.server.border.width);
            var maxy = Math.max(0, 31767 - this.server.border.height);
            var x = maxx * Math.random();
            var y = maxy * Math.random();
            if (Math.random() >= 0.5) x = -x;
            if (Math.random() >= 0.5) y = -y;
            this.scrambleX = x;
            this.scrambleY = y;
        }
        this.borderCounter = 0;
    }
    setName(name) {
        this._name = name;
        var writer = new BinaryWriter();
        writer.writeStringZeroUnicode(name);
        this._nameUnicode = writer.toBuffer();
        writer = new BinaryWriter();
        writer.writeStringZeroUtf8(name);
        this._nameUtf8 = writer.toBuffer();
    }
    setSkin(skin) {
        this._skin = skin;
        var writer = new BinaryWriter();
        writer.writeStringZeroUtf8(skin);
        this._skinUtf8 = writer.toBuffer();
        var writer1 = new BinaryWriter();
        writer1.writeStringZeroUtf8("%" + skin);
        this._skinUtf8protocol11 = writer1.toBuffer();
    }
    setSecondarySkin(skin) {
        this._secondarySkin = String(skin || "").trim();
    }
    getLivingScale() {
        this._score = 0; // reset to not cause bugs with leaderboard
        let scale = 0; // reset to not cause bugs with viewbox
        for (const cell of this.cells) {
            scale += cell.radius;
            this._score += cell._mass;
        }
        if (scale) scale = Math.pow(Math.min(64 / scale, 1), 0.4);
        return Math.max(scale, this.server.config.serverMinScale)
    }
    joinGame(name, skin) {
        if (this.hasAnyLinkedCells()) return;
        if (skin) this.setSkin(skin);
        if (!name) name = "";
        this.setName(name);
        this.resetMultiControlState();
        this.spectate = false;
        this.freeRoam = false;
        this.spectateTarget = null;
        var client = this.socket.client;
        if (!this.isMi && this.socket.isConnected != null) {
            // some old clients don't understand ClearAll message
            // so we will send update for them
            if (client.protocol < 6) {
                client.sendPacket(new Packet.UpdateNodes(this, [], [], [], this.clientNodes));
            }
            client.sendPacket(new Packet.ClearAll());
            this.clientNodes = [];
            this.scramble();
            if (this.server.config.serverScrambleLevel < 2) {
                // no scramble / lightweight scramble
                client.sendPacket(new Packet.SetBorder(this, this.server.border));
            } else if (this.server.config.serverScrambleLevel == 3) {
                var ran = 10065536 * Math.random();
                // Ruins most known minimaps (no border)
                var border = new Quad(
                    this.server.border.minx - ran,
                    this.server.border.miny - ran,
                    this.server.border.maxx + ran,
                    this.server.border.maxy + ran
                );
                client.sendPacket(new Packet.SetBorder(this, border));
            }
        }
        this.server.mode.onPlayerSpawn(this.server, this);
    }
    getSelectableCells() {
        return this.cells
            .filter((cell) => !cell.isRemoved)
            .sort((left, right) => left.nodeId - right.nodeId);
    }
    getLinkedController() {
        return this.linkedController || this;
    }
    getLinkedPlayers() {
        const controller = this.getLinkedController();
        const linkedPlayers = controller.multiControl?.linkedPlayers || [controller];
        if (!linkedPlayers.includes(controller)) linkedPlayers.unshift(controller);
        return linkedPlayers.filter(Boolean);
    }
    getLivingLinkedPlayers() {
        return this.getLinkedPlayers().filter((player) => !player.isRemoved && player.cells.length);
    }
    hasAnyLinkedCells() {
        return this.getLinkedPlayers().some((player) => player.cells.length);
    }
    pruneLinkedPlayers() {
        const controller = this.getLinkedController();
        if (controller !== this) return controller.pruneLinkedPlayers();
        const survivors = [];
        for (const player of controller.getLinkedPlayers()) {
            if (player === controller || (!player.isRemoved && player.cells.length)) {
                survivors.push(player);
            } else if (player !== controller) {
                player.isRemoved = true;
                player.clientNodes = [];
                player.viewNodes = [];
                player.cells = [];
            }
        }
        controller.multiControl.linkedPlayers = survivors.length ? survivors : [controller];
        controller.multiControl.enabled = controller.multiControl.linkedPlayers.length > 1;
        if (!controller.multiControl.linkedPlayers.includes(controller.multiControl.activePlayer)) {
            controller.multiControl.activePlayer =
                controller.multiControl.linkedPlayers.find((player) => player.cells.length) || controller;
            controller.multiControl.pendingOwnedRefresh = true;
        }
    }
    syncLinkedPlayerState() {
        const controller = this.getLinkedController();
        if (controller !== this) return controller.syncLinkedPlayerState();
        controller.pruneLinkedPlayers();
        for (const player of controller.getLinkedPlayers()) {
            if (!player.cells.length) {
                player._score = 0;
                player._scale = 1;
                continue;
            }
            const centerPos = player.cells.reduce(
                (average, current) => average.add(current.position),
                new Vec2(0, 0)
            ).divide(player.cells.length);
            player.setCenterPos(centerPos);
            player._scale = player.getLivingScale();
        }
        const activePlayer = controller.multiControl.activePlayer;
        if (!activePlayer || activePlayer.isRemoved || !activePlayer.cells.length) {
            const fallback = controller.getLivingLinkedPlayers()[0] || controller;
            if (fallback !== activePlayer) {
                controller.multiControl.activePlayer = fallback;
                controller.multiControl.pendingOwnedRefresh = true;
                if (fallback.mouse && controller.inputMouse) {
                    controller.inputMouse.assign(fallback.mouse);
                    if (fallback === controller && controller.mouse) {
                        controller.mouse.assign(fallback.mouse);
                    }
                }
            }
        }
    }
    resetMultiControlState() {
        const controller = this.getLinkedController();
        for (const player of controller.getLinkedPlayers()) {
            if (player !== controller && player.cells.length) {
                while (player.cells.length) {
                    controller.server.removeNode(player.cells[0]);
                }
            }
            if (player !== controller) {
                player.isRemoved = true;
                player.clientNodes = [];
                player.viewNodes = [];
                player.cells = [];
            }
        }
        controller.linkedController = controller;
        controller.isLinkedAvatar = false;
        controller.multiControl = {
            enabled: false,
            activePlayer: controller,
            lastActionTick: 0,
            linkedPlayers: [controller],
            pendingOwnedRefresh: false,
        };
    }
    attachLinkedPlayer(player) {
        const controller = this.getLinkedController();
        if (controller !== this) return controller.attachLinkedPlayer(player);
        player.linkedController = controller;
        player.isLinkedAvatar = true;
        player.scrambleX = controller.scrambleX;
        player.scrambleY = controller.scrambleY;
        player.scrambleId = controller.scrambleId;
        player.userAuth = controller.userAuth;
        player.userRole = controller.userRole;
        player.team = controller.team;
        player.color = this.server.getLinkedAvatarColor(controller.color, controller.multiControl.linkedPlayers.length);
        player.connectedTime = controller.connectedTime;
        player.mouse.assign(controller.inputMouse || controller.mouse);
        player.inputMouse.assign(controller.inputMouse || controller.mouse);
        player.setName(controller._name);
        player.setSkin(controller._secondarySkin || controller._skin);
        player.setSecondarySkin(controller._secondarySkin);
        controller.multiControl.linkedPlayers.push(player);
        controller.multiControl.enabled = true;
        return player;
    }
    getControlledPlayer() {
        const controller = this.getLinkedController();
        if (controller !== this) return controller.getControlledPlayer();
        controller.syncLinkedPlayerState();
        return controller.multiControl.activePlayer || controller;
    }
    getControlledCells() {
        return this.getControlledPlayer().getSelectableCells();
    }
    syncActiveMouse() {
        const controller = this.getLinkedController();
        if (controller !== this) return controller.syncActiveMouse();
        const activePlayer = controller.getControlledPlayer();
        if (!controller.inputMouse || !activePlayer?.mouse) return;
        activePlayer.mouse.assign(controller.inputMouse);
        if (activePlayer === controller) {
            controller.mouse.assign(controller.inputMouse);
        }
    }
    refreshOwnedCells() {
        const controller = this.getLinkedController();
        if (controller !== this) return controller.refreshOwnedCells();
        if (!controller.socket?.client?.protocol || !controller.socket.isConnected) return;
        controller.socket.client.sendPacket(new Packet.ClearOwned());
        const activePlayer = controller.getControlledPlayer();
        for (const cell of activePlayer.getSelectableCells()) {
            controller.socket.client.sendPacket(new Packet.AddNode(controller, cell));
        }
        controller.multiControl.pendingOwnedRefresh = false;
    }
    notifyOwnedCellAdded(cell) {
        const controller = this.getLinkedController();
        if (!cell || !controller.socket?.client || !controller.socket.isConnected) return;
        if (controller.getControlledPlayer() !== this) return;
        controller.socket.client.sendPacket(new Packet.AddNode(controller, cell));
    }
    setActiveLinkedPlayer(player) {
        const controller = this.getLinkedController();
        if (controller !== this) return controller.setActiveLinkedPlayer(player);
        controller.pruneLinkedPlayers();
        let nextPlayer = player;
        const linkedPlayers = controller.getLinkedPlayers();
        if (!nextPlayer || !linkedPlayers.includes(nextPlayer) || (!nextPlayer.cells.length && nextPlayer !== controller)) {
            nextPlayer = linkedPlayers.find((candidate) => candidate.cells.length) || controller;
        }
        const currentPlayer = controller.multiControl.activePlayer;
        if (currentPlayer && currentPlayer.mouse && controller.inputMouse) {
            currentPlayer.mouse.assign(controller.inputMouse);
        }
        controller.multiControl.activePlayer = nextPlayer;
        if (nextPlayer?.mouse && controller.inputMouse) {
            controller.inputMouse.assign(nextPlayer.mouse);
            if (nextPlayer === controller) {
                controller.mouse.assign(nextPlayer.mouse);
            }
        }
        controller.multiControl.pendingOwnedRefresh = true;
        controller.refreshOwnedCells();
        return nextPlayer;
    }
    getControlTargetForCell(cell) {
        return cell ? this.mouse : this.mouse;
    }
    switchDualCell() {
        const controller = this.getLinkedController();
        if (controller !== this) return controller.switchDualCell();
        if (!this.server.config.dualControlEnabled || !this.server.config.serverEnabled ||
            this.server.ticks - controller.multiControl.lastActionTick < this.server.config.dualControlSwitchCooldown) {
            return;
        }
        controller.syncLinkedPlayerState();
        const activePlayer = controller.getControlledPlayer();
        if (!activePlayer.cells.length) return;
        controller.multiControl.lastActionTick = this.server.ticks;
        const maxPilots = Math.max(1, this.server.config.multiControlMaxPilots || 2);
        if (controller.getLivingLinkedPlayers().length < maxPilots) {
            const avatar = this.server.spawnMultiControlAvatar(controller);
            if (avatar) {
                controller.setActiveLinkedPlayer(avatar);
                return;
            }
        }
        const livingPlayers = controller.getLivingLinkedPlayers();
        if (livingPlayers.length < 2) return;
        const currentIndex = Math.max(livingPlayers.indexOf(controller.getControlledPlayer()), 0);
        const nextPlayer = livingPlayers[(currentIndex + 1) % livingPlayers.length];
        controller.setActiveLinkedPlayer(nextPlayer);
    }
    disableDualControl() {
        const controller = this.getLinkedController();
        if (controller !== this) return controller.disableDualControl();
        controller.syncLinkedPlayerState();
        const primary = controller.cells.length ? controller : (controller.getLivingLinkedPlayers()[0] || controller);
        controller.setActiveLinkedPlayer(primary);
    }
    requestRestart() {
        const controller = this.getLinkedController();
        if (controller !== this) return controller.requestRestart();
        if (controller.isBot || controller.isMinion || controller.isMi ||
            controller.isRemoved || controller.isRestartOrphan ||
            !controller.socket?.isConnected) {
            return false;
        }
        const target = controller.getControlledPlayer();
        if (!target || target.isRemoved || target.isRestartOrphan) {
            return false;
        }
        return controller.server.respawnControlledPlayer(controller, target);
    }
    configureRestartOrphan(sourcePlayer, cells) {
        this.isRestartOrphan = true;
        this.isRemoved = false;
        this.linkedController = this;
        this.isLinkedAvatar = false;
        this.multiControl = {
            enabled: false,
            activePlayer: this,
            lastActionTick: 0,
            linkedPlayers: [this],
            pendingOwnedRefresh: false,
        };
        this.userAuth = sourcePlayer?.userAuth || null;
        this.userRole = sourcePlayer?.userRole || this.userRole;
        this.team = sourcePlayer?.team || 0;
        this.color = sourcePlayer?.color
            ? { r: sourcePlayer.color.r, g: sourcePlayer.color.g, b: sourcePlayer.color.b }
            : { r: 0, g: 0, b: 0 };
        this.connectedTime = sourcePlayer?.connectedTime || new Date();
        this.spawnmass = 0;
        this.frozen = true;
        this.rec = false;
        this.mergeOverride = false;
        this.spectate = false;
        this.freeRoam = false;
        this.spectateTarget = null;
        this.mouse = null;
        this.inputMouse = null;
        this.clientNodes = [];
        this.viewNodes = [];
        this._score = 0;
        this._scale = 1;
        if (sourcePlayer) {
            this.scrambleX = sourcePlayer.scrambleX;
            this.scrambleY = sourcePlayer.scrambleY;
            this.scrambleId = sourcePlayer.scrambleId;
            this.setName(sourcePlayer._name);
            this.setSkin(sourcePlayer._skin);
            this.setSecondarySkin(sourcePlayer._secondarySkin);
        }
        this.cells = Array.isArray(cells) ? cells.filter((cell) => cell && !cell.isRemoved) : [];
        return this;
    }
    disposeRestartOrphan() {
        const controller = this.getLinkedController();
        if (controller !== this) return controller.disposeRestartOrphan();
        if (!controller.isRestartOrphan || controller.hasAnyLinkedCells()) {
            return false;
        }
        for (const player of controller.getLinkedPlayers()) {
            player.isRestartOrphan = false;
            player.isRemoved = true;
            player.cells = [];
            player.clientNodes = [];
            player.viewNodes = [];
            player.mouse = null;
            player.inputMouse = null;
            player.spectate = false;
            player.freeRoam = false;
            player.spectateTarget = null;
            if (player !== controller) {
                player.linkedController = player;
                player.isLinkedAvatar = false;
            }
        }
        controller.linkedController = controller;
        controller.isLinkedAvatar = false;
        controller.multiControl = {
            enabled: false,
            activePlayer: controller,
            lastActionTick: 0,
            linkedPlayers: [controller],
            pendingOwnedRefresh: false,
        };
        return true;
    }
    checkConnection() {
        const controller = this.getLinkedController();
        if (controller !== this) return;
        if (this.isRestartOrphan) return;
        // Handle disconnection
        if (!this.socket.isConnected) {
            // Wait for playerDisconnectTime
            var pt = this.server.config.playerDisconnectTime;
            var dt = (this.server.stepDateTime - this.socket.closeTime) / 1e3;
            const disconnectGrace = pt > 0 ? pt : 0;
            const shouldRemoveLinkedCells = !this.hasAnyLinkedCells() || dt >= disconnectGrace;
            if (shouldRemoveLinkedCells) {
                for (const player of this.getLinkedPlayers()) {
                    while (player.cells.length)
                        this.server.removeNode(player.cells[0]);
                }
                for (const player of this.getLinkedPlayers()) {
                    player.cells = [];
                    if (player !== this) player.isRemoved = true;
                    player.mouse = null;
                    player.inputMouse = null;
                }
                this.isRemoved = true;
                this.mouse = null;
                this.inputMouse = null;
            }
            this.socket.client.splitRequested = false;
            this.socket.client.toggleSpectate = false;
            this.socket.client.ejectRequested = false;
            return;
        }
        // Check timeout
        if (!this.isCloseRequested && this.server.config.serverTimeout) {
            dt = (this.server.stepDateTime - this.socket.lastAliveTime) / 1000;
            if (dt >= this.server.config.serverTimeout) {
                this.socket.close(1000, "Connection timeout");
                this.isCloseRequested = true;
            }
        }
        this.pruneLinkedPlayers();
    }
    updateTick() {
        if (this.isRemoved || this.isMinion || this.isRestartOrphan) return; // do not update
        this.socket.client.process();
        if (this.isMi) return;
        this.syncLinkedPlayerState();
        if (this.multiControl.pendingOwnedRefresh) {
            this.refreshOwnedCells();
        }
        const focusPlayer = this.getControlledPlayer();
        this.updateView(focusPlayer.cells.length);
        const posPacket = new Packet.UpdatePosition(this, this.centerPos.x,
            this.centerPos.y, this._scale)
        this.socket.client.sendPacket(posPacket);
        const halfWidth = (this.server.config.serverViewBaseX + 100) / this._scale / 2;
        const halfHeight = (this.server.config.serverViewBaseY + 100) / this._scale / 2;
        this.viewBox = new Quad(
            this.centerPos.x - halfWidth,
            this.centerPos.y - halfHeight,
            this.centerPos.x + halfWidth,
            this.centerPos.y + halfHeight
        );
        // update visible nodes
        this.viewNodes = this.server.quadTree.allOverlapped(this.viewBox);
        this.viewNodes.sort((a, b) => a.nodeId - b.nodeId);
    }
    isClientOwnedNode(node) {
        return !!node && node.owner === this.getControlledPlayer();
    }
    sendUpdate() {
        // do not send update for disconnected clients
        // also do not send if initialization is not complete yet
        if (this.isRemoved || this.isRestartOrphan || !this.socket.client.protocol ||
            !this.socket.isConnected || this.isMi || this.isMinion ||
            (this.socket._socket.writable != null && !this.socket._socket.writable) ||
            this.socket.readyState != this.socket.OPEN) return;
        const client = this.socket.client;
        if (this.server.config.serverScrambleLevel == 2) {
            if (!this.borderCounter) {
                var b = this.server.border, v = this.viewBox;
                var bound = new Quad(
                    Math.max(b.minx, v.minx - v.halfWidth),
                    Math.max(b.miny, v.miny - v.halfHeight),
                    Math.min(b.maxx, v.maxx + v.halfWidth),
                    Math.min(b.maxy, v.maxy + v.halfHeight)
                );
                client.sendPacket(new Packet.SetBorder(this, bound));
            }
            if (++this.borderCounter >= 20) this.borderCounter = 0;
        }
        const delNodes = [];
        const eatNodes = [];
        const addNodes = [];
        const updNodes = [];
        const ownedPlayer = this.getControlledPlayer();
        const normalizeTrackedNodes = (nodes) => {
            const sorted = (Array.isArray(nodes) ? nodes : [])
                .filter((node) => node && node.nodeId != null && node.nodeId !== 0)
                .sort((left, right) => left.nodeId - right.nodeId);
            const unique = [];
            for (const node of sorted) {
                if (!unique.length || unique[unique.length - 1].nodeId !== node.nodeId) {
                    unique.push(node);
                }
            }
            return unique;
        };
        const nextClientNodes = normalizeTrackedNodes(this.viewNodes);
        const previousClientNodes = normalizeTrackedNodes(this.clientNodes);
        let clientIndex = 0;
        let viewIndex = 0;
        const viewNodesLength = nextClientNodes.length; // don't count nodes added in the loop
        while (viewIndex < viewNodesLength &&
            clientIndex < previousClientNodes.length)
        {
            const viewNode = nextClientNodes[viewIndex];
            const clientNode = previousClientNodes[clientIndex];
            if (viewNode.nodeId < clientNode.nodeId) {
                if (!viewNode.isRemoved) addNodes.push(viewNode);
                ++viewIndex;
            } else if (viewNode.nodeId > clientNode.nodeId) {
                if (clientNode.isRemoved) eatNodes.push(clientNode);
                else if (clientNode.owner != ownedPlayer) delNodes.push(clientNode);
                else {
                    updNodes.push(clientNode);
                    nextClientNodes.push(clientNode);
                }
                ++clientIndex;
            } else {
                if (viewNode.isRemoved) eatNodes.push(viewNode);
                else if (viewNode.isMoving || viewNode.type == 0 ||
                    viewNode.type == 2 ||
                    this.server.config.serverGamemode == 3 &&
                    viewNode.type == 1) updNodes.push(viewNode);
                ++viewIndex;
                ++clientIndex;
            }
        }
        for (; viewIndex < viewNodesLength; viewIndex++)
            addNodes.push(nextClientNodes[viewIndex]);
        for (; clientIndex < previousClientNodes.length; clientIndex++) {
            const node = previousClientNodes[clientIndex];
            if (node.isRemoved) eatNodes.push(node);
            else if (node.owner != ownedPlayer) delNodes.push(node);
            else {
                updNodes.push(node);
                nextClientNodes.push(node);
            }
        }
        this.clientNodes = normalizeTrackedNodes(nextClientNodes.filter((node) => !node.isRemoved));
        client.sendPacket(new Packet.UpdateNodes(this, addNodes, updNodes, eatNodes, delNodes));
        if (++this.tickLeaderboard > 25) { // 1 / 0.040 = 25 (once per second)
            this.tickLeaderboard = 0;
            if (this.server.leaderboardType >= 0)
                client.sendPacket(new Packet.UpdateLeaderboard(this.getControlledPlayer(), this.server.leaderboard, this.server.leaderboardType));
        }
    }
    updateView(len) {
        const focusPlayer = this.getControlledPlayer();
        if (focusPlayer.cells.length) { // in game
            this.centerPos = focusPlayer.centerPos.clone();
            this._scale = focusPlayer._scale;
        } else if (this.spectate) {
            let player = this.getSpecTarget();
            if (player && !this.freeRoam) {
                this.setCenterPos(player.centerPos);
                this._scale = player.getLivingScale();
                this.place = player.place;
                this.viewBox = player.viewBox;
                this.viewNodes = player.viewNodes;
            } else {
                // free roam
                var mouseVec = this.mouse.difference(this.centerPos);
                var mouseDist = mouseVec.dist();
                if (mouseDist != 0)
                    this.setCenterPos(this.centerPos.add(mouseVec.product(32 / mouseDist)));
                this._scale = this.server.config.serverSpectatorScale;
            }
        } else if (len) {
            this.centerPos = this.cells.reduce(
                (average, current) => average.add(current.position),
                new Vec2(0, 0)
            ).divide(len);
            this._scale = this.getLivingScale();
        }
    }
    split() {
        const actor = this.getControlledPlayer();
        if (actor.spectate) {
            // Check for spam first (to prevent too many add/del updates)
            if (this.server.ticks - actor.lastKeypressTick < 40) return;
            actor.lastKeypressTick = this.server.ticks;
            // Space doesn't work for freeRoam mode
            if (actor.freeRoam || this.server.largestClient == null) return;
        } else if (this.server.run) {
            // Disable mergeOverride on the last merging cell
            if (actor.cells.length <= 2) actor.mergeOverride = false;
            // Cant split if merging or frozen
            if (actor.mergeOverride || actor.frozen) return;
            this.server.splitCells(actor);
        }
    }
    eject() {
        const actor = this.getControlledPlayer();
        if (actor.spectate || !this.server.run) return;
        this.server.ejectMass(actor);
    }
    spectateToggle() {
        if (this.spectate) {
            // Check for spam first (to prevent too many add/del updates)
            if (this.server.ticks - this.lastKeypressTick < 40) return;
            this.lastKeypressTick = this.server.ticks;
            this.freeRoam = !this.freeRoam;
        }
    }
    getSpecTarget() {
        if (this.spectateTarget?.isRemoved) this.spectateTarget = null;
        return this.spectateTarget ?? this.server.largestClient;
    }
    setCenterPos(p) {
        p.x = Math.max(p.x, this.server.border.minx);
        p.y = Math.max(p.y, this.server.border.miny);
        p.x = Math.min(p.x, this.server.border.maxx);
        p.y = Math.min(p.y, this.server.border.maxy);
        this.centerPos = p;
    }
}

module.exports = Player;
