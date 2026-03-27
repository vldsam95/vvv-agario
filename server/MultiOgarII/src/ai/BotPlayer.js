const Player = require('../Player');
const Vec2 = require('../modules/Vec2');

const TEAM_BOT_LOGIC = "team-bots";
const LOGIC_DEFAULTS = Object.freeze({
    lowPriorityThreatSplitDepth: 3,
    lowPriorityThreatMassRatio: 11,
    lowPriorityThreatEatRatio: 1.15,
    lowPriorityThreatImmediateClearance: 150,
    lowPriorityThreatFarEdgeDistance: 960,
    lowPriorityThreatMinFactor: 0.32,
    lowPriorityThreatMaxFactor: 0.8,
    lowPriorityThreatBlockFactor: 0.72,
    lowPriorityThreatAltSearchDistance: 760,
    lowPriorityThreatAltMassFloor: 0.65,
    lowPriorityThreatAltPriorityRatio: 0.9,
    smartSplitMinTotalMass: 1000,
    smartSplitCaptureMassRatio: 1,
    smartSplitSearchRadius: 300,
    smartSplitChainRadius: 260,
    smartSplitImmediateThreatClearance: 150,
    smartSplitRiskOverrideCeiling: 1.35,
});

const LOGIC_PRESETS = Object.freeze({
    balanced: {
        foodWeight: 1.1,
        ejectedWeight: 1.15,
        threatWeight: 1,
        edibleWeight: 2.5,
        splitCooldown: 15,
        splitDistanceFactor: 1,
        splitCellLimit: 8,
    },
    hunter: {
        foodWeight: 0.45,
        ejectedWeight: 0.7,
        threatWeight: 0.85,
        edibleWeight: 3.6,
        splitCooldown: 10,
        splitDistanceFactor: 1.25,
        splitCellLimit: 12,
    },
    "new-hunter": {
        foodWeight: 0.55,
        ejectedWeight: 0.8,
        threatWeight: 1.1,
        edibleWeight: 3.35,
        splitCooldown: 14,
        splitDistanceFactor: 1.1,
        splitCellLimit: 6,
        splitAdvantageRatio: 1.3,
        splitRequiresPositiveInfluence: true,
        splitOnlyPlayerCells: true,
        splitThreatClearance: 420,
        splitThreatRatio: 1.08,
        postSplitThreatRatio: 1.2,
        escapeVirusBypass: true,
        escapeVirusClearance: 90,
        escapeVirusLookAhead: 720,
        escapeVirusProbeDistance: 420,
        splitMassStages: [
            { minTotalMass: 4000, maxCellsExclusive: 6 },
            { minTotalMass: 1000, maxCellsExclusive: 4 },
            { minTotalMass: 300, maxCellsExclusive: 2 },
        ],
    },
    "new-survivor": {
        foodWeight: 0.8,
        ejectedWeight: 0.9,
        threatWeight: 2,
        edibleWeight: 1.3,
        splitCooldown: 22,
        splitDistanceFactor: 0.75,
        splitCellLimit: 6,
        virusVolleyEnabled: true,
        virusVolleyMinMass: 1500,
        virusVolleyMaxShots: 9,
        virusVolleyCooldownTicks: 250,
        virusVolleyThreatRatio: 1.15,
        virusVolleyThreatLookAhead: 1800,
        virusVolleyPathTolerance: 70,
        virusVolleyThreatDistance: 950,
        virusVolleySelfEdgeSafety: 160,
        virusVolleyAimDistance: 1200,
    },
    [TEAM_BOT_LOGIC]: {
        foodWeight: 0.6,
        ejectedWeight: 0.85,
        threatWeight: 1.15,
        edibleWeight: 3.4,
        splitCooldown: 14,
        splitDistanceFactor: 1.1,
        splitCellLimit: 6,
        splitAdvantageRatio: 1.3,
        splitRequiresPositiveInfluence: true,
        splitOnlyPlayerCells: true,
        splitThreatClearance: 440,
        splitThreatRatio: 1.08,
        postSplitThreatRatio: 1.2,
        escapeVirusBypass: true,
        escapeVirusClearance: 90,
        escapeVirusLookAhead: 720,
        escapeVirusProbeDistance: 420,
        splitMassStages: [
            { minTotalMass: 4000, maxCellsExclusive: 6 },
            { minTotalMass: 1000, maxCellsExclusive: 4 },
            { minTotalMass: 300, maxCellsExclusive: 2 },
        ],
        virusVolleyEnabled: true,
        virusVolleyMinMass: 1500,
        virusVolleyMaxShots: 9,
        virusVolleyCooldownTicks: 250,
        virusVolleyThreatRatio: 1.15,
        virusVolleyThreatLookAhead: 1800,
        virusVolleyPathTolerance: 70,
        virusVolleyThreatDistance: 950,
        virusVolleySelfEdgeSafety: 160,
        virusVolleyAimDistance: 1200,
        teamMode: true,
        teamThreatRatio: 1.1,
        teamThreatClearance: 360,
        teamHighValuePreyRatio: 0.16,
        teamHighValueEdgeDistance: 160,
        teamSupportPreyRatio: 0.08,
        teamSupportPreyDistance: 780,
        teamPairRange: 820,
        teamFeedRange: 420,
        teamFeedTargetMass: 500,
        teamFeedMinMass: 2000,
        teamFeedReserveMass: 1500,
        teamFeedMaxFeeds: 36,
        teamActionLockTicks: 110,
        teamFeedLockTicks: 220,
    },
    collector: {
        foodWeight: 2,
        ejectedWeight: 1.8,
        threatWeight: 1.25,
        edibleWeight: 1.8,
        splitCooldown: 18,
        splitDistanceFactor: 0.9,
        splitCellLimit: 10,
    },
    survivor: {
        foodWeight: 0.8,
        ejectedWeight: 0.9,
        threatWeight: 2,
        edibleWeight: 1.3,
        splitCooldown: 22,
        splitDistanceFactor: 0.75,
        splitCellLimit: 6,
    },
});

class BotPlayer extends Player {
    constructor(server, socket) {
        super(server, socket);
        this.isBot = true;
        this.splitCooldown = 0;
        this.botProfile = null;
        this.virusVolley = {
            remainingShots: 0,
            cooldownUntilTick: 0,
            virus: null,
            threat: null,
            aimPoint: null,
        };
        this.teamAction = this.createEmptyTeamAction();
    }
    getLogicConfig() {
        const logic = this.botProfile?.logic;
        return Object.assign({}, LOGIC_DEFAULTS, LOGIC_PRESETS[logic] || LOGIC_PRESETS.balanced);
    }
    getTotalMass() {
        return this.cells.reduce((sum, current) => sum + (current?._mass || 0), 0);
    }
    getNodeMass(node) {
        if (!node) return 0;
        if (typeof node._mass === "number") return node._mass;
        if (typeof node._radius2 === "number") return node._radius2 / 100;
        if (typeof node.radius === "number") return (node.radius * node.radius) / 100;
        return 0;
    }
    canConsumeByRadius(hunterRadius, preyRadius, ratio = 1.15) {
        return hunterRadius > preyRadius * ratio;
    }
    getEdgeDistance(left, right, leftRadius = left?.radius || 0, rightRadius = right?.radius || 0) {
        if (!left?.position || !right?.position) return Infinity;
        return left.position.difference(right.position).dist() - leftRadius - rightRadius;
    }
    canThreatConsumeAfterSplits(threat, cell, splitCount = 3, ratio = 1.15) {
        if (!threat || !cell) return false;
        const projectedRadius = threat.radius / Math.pow(Math.SQRT2, splitCount);
        return this.canConsumeByRadius(projectedRadius, cell.radius, ratio);
    }
    getThreatAlternativeTargets(threat, cell, logic) {
        const targetMass = this.getNodeMass(cell);
        if (!targetMass) {
            return {
                hasMeaningfulAlternative: false,
                qualifyingCount: 0,
                qualifyingMass: 0,
                bestPriority: 0,
                targetPriority: 0,
            };
        }
        const targetEdgeDistance = Math.max(1, this.getEdgeDistance(threat, cell));
        const targetPriority = targetMass / Math.max(80, targetEdgeDistance + 80);
        const searchDistance = Math.max(
            logic.lowPriorityThreatAltSearchDistance || 760,
            Math.min(targetEdgeDistance + 160, (logic.lowPriorityThreatAltSearchDistance || 760) * 1.35)
        );
        let qualifyingCount = 0;
        let qualifyingMass = 0;
        let bestPriority = 0;
        for (const node of this.viewNodes) {
            if (!node || node === threat || node === cell || node.type !== 0) continue;
            if (node.owner === threat.owner) continue;
            if (this.areFriendlyPlayers(threat.owner, node.owner)) continue;
            if (!this.canConsumeByRadius(threat.radius, node.radius, logic.lowPriorityThreatEatRatio || 1.15)) continue;
            const edgeDistance = this.getEdgeDistance(threat, node);
            if (edgeDistance > searchDistance) continue;
            const nodeMass = this.getNodeMass(node);
            if (nodeMass < targetMass * (logic.lowPriorityThreatAltMassFloor || 0.65)) continue;
            const priority = nodeMass / Math.max(80, Math.max(1, edgeDistance) + 80);
            if (priority < targetPriority * (logic.lowPriorityThreatAltPriorityRatio || 0.9)) continue;
            qualifyingCount++;
            qualifyingMass += nodeMass;
            if (priority > bestPriority) bestPriority = priority;
        }
        return {
            hasMeaningfulAlternative: qualifyingCount > 0,
            qualifyingCount,
            qualifyingMass,
            bestPriority,
            targetPriority,
        };
    }
    getThreatResponseFactor(threat, cell, logic) {
        if (!threat || !cell) return 1;
        const edgeDistance = this.getEdgeDistance(threat, cell);
        if (edgeDistance < (logic.lowPriorityThreatImmediateClearance || 150)) return 1;
        const threatMass = this.getNodeMass(threat);
        const cellMass = this.getNodeMass(cell);
        const massRatio = threatMass / Math.max(1, cellMass);
        if (massRatio < (logic.lowPriorityThreatMassRatio || 11)) return 1;
        if (!this.canThreatConsumeAfterSplits(
            threat,
            cell,
            logic.lowPriorityThreatSplitDepth || 3,
            logic.lowPriorityThreatEatRatio || 1.15
        )) return 1;
        const alternatives = this.getThreatAlternativeTargets(threat, cell, logic);
        if (!alternatives.hasMeaningfulAlternative) return 1;
        const closeDistance = logic.lowPriorityThreatImmediateClearance || 150;
        const farDistance = logic.lowPriorityThreatFarEdgeDistance || 960;
        const distanceWeight = Math.max(
            0,
            Math.min(1, (edgeDistance - closeDistance) / Math.max(1, farDistance - closeDistance))
        );
        const overmatchWeight = Math.min(
            1,
            Math.max(0, massRatio - (logic.lowPriorityThreatMassRatio || 11)) /
                Math.max(1, (logic.lowPriorityThreatMassRatio || 11) * 1.5)
        );
        const alternativeWeight = Math.min(
            1,
            Math.max(
                0,
                alternatives.bestPriority /
                    Math.max(0.01, alternatives.targetPriority || 0.01) -
                    (logic.lowPriorityThreatAltPriorityRatio || 0.9)
            )
        );
        let factor = (logic.lowPriorityThreatMaxFactor || 0.8) -
            distanceWeight * ((logic.lowPriorityThreatMaxFactor || 0.8) - (logic.lowPriorityThreatMinFactor || 0.32));
        factor -= overmatchWeight * 0.12;
        factor -= alternativeWeight * 0.08;
        return Math.max(logic.lowPriorityThreatMinFactor || 0.32, Math.min(1, factor));
    }
    isMaterialThreat(node, cell, logic, minFactor = logic.lowPriorityThreatBlockFactor) {
        return this.getThreatResponseFactor(node, cell, logic) >= minFactor;
    }
    buildProjectedSplitCell(cell, target) {
        if (!cell || !target?.position) return null;
        const radius = cell.radius / Math.SQRT2;
        return {
            owner: cell.owner,
            position: target.position,
            radius,
            _radius2: radius * radius,
            _mass: (radius * radius) / 100,
        };
    }
    createEmptyTeamAction() {
        return {
            mode: null,
            partner: null,
            untilTick: 0,
            remainingFeeds: 0,
            targetMass: 0,
        };
    }
    getPlayerTotalMass(player = this) {
        if (player === this) return this.getTotalMass();
        const cells = Array.isArray(player?.cells) ? player.cells : [];
        return cells.reduce((sum, current) => sum + (current?._mass || 0), 0);
    }
    getEjectMassGain() {
        return this.server.config.ejectSize * this.server.config.ejectSize / 100;
    }
    getEjectMassLoss() {
        return this.server.config.ejectSizeLoss * this.server.config.ejectSizeLoss / 100;
    }
    getEjectActionStats(player = this) {
        const cells = typeof player?.getControlledCells === "function"
            ? player.getControlledCells()
            : Array.isArray(player?.cells)
                ? player.cells.filter((cell) => cell && !cell.isRemoved)
                : [];
        const minRadius = this.server.config.playerMinSize;
        const loss = this.server.config.ejectSizeLoss;
        let pelletsPerAction = 0;
        for (const cell of cells) {
            if (!cell || cell.isRemoved || cell.radius < this.server.config.playerMinEjectSize) continue;
            const newSize = cell._radius2 - loss * loss;
            if (newSize < 0 || newSize < minRadius * minRadius) continue;
            pelletsPerAction++;
        }
        return {
            pelletsPerAction,
            gainMass: pelletsPerAction * this.getEjectMassGain(),
            lossMass: pelletsPerAction * this.getEjectMassLoss(),
        };
    }
    isTeamBotPlayer(player) {
        return !!player && player.isBot && player.botProfile?.logic === TEAM_BOT_LOGIC;
    }
    areFriendlyPlayers(left, right) {
        if (!left || !right || left === right) return false;
        if (this.server.mode.haveTeams && left.team == right.team) return true;
        return this.isTeamBotPlayer(left) && this.isTeamBotPlayer(right);
    }
    clearTeamAction(syncPartner = true) {
        const partner = this.teamAction?.partner;
        this.teamAction = this.createEmptyTeamAction();
        if (
            syncPartner &&
            partner &&
            typeof partner.clearTeamAction === "function" &&
            partner.teamAction?.partner === this
        ) {
            partner.clearTeamAction(false);
        }
    }
    isBusyWithOtherTeamAction(player, partner = this) {
        const action = player?.teamAction;
        if (!action?.mode) return false;
        if (action.untilTick <= this.server.ticks) {
            if (typeof player.clearTeamAction === "function") player.clearTeamAction(false);
            return false;
        }
        return !!action.partner && action.partner !== partner;
    }
    setTeamPairAction(left, leftState, right, rightState) {
        if (!left || !right || left === right) return null;
        const untilTick = Math.max(
            leftState?.untilTick || 0,
            rightState?.untilTick || 0,
            this.server.ticks + 45
        );
        if (typeof left.clearTeamAction === "function") left.clearTeamAction(false);
        if (typeof right.clearTeamAction === "function") right.clearTeamAction(false);
        left.teamAction = Object.assign(left.createEmptyTeamAction(), leftState, {
            partner: right,
            untilTick,
        });
        right.teamAction = Object.assign(right.createEmptyTeamAction(), rightState, {
            partner: left,
            untilTick,
        });
        if (this === left) return left.teamAction;
        if (this === right) return right.teamAction;
        return null;
    }
    hasSplitCapacity(logic, totalMass) {
        if (Array.isArray(logic.splitMassStages) && logic.splitMassStages.length) {
            for (const stage of logic.splitMassStages) {
                if (totalMass >= stage.minTotalMass) {
                    return this.cells.length < stage.maxCellsExclusive;
                }
            }
            return false;
        }
        return this.cells.length < (logic.splitCellLimit || this.server.config.playerMaxCells);
    }
    evaluateSplitThreats(cell, target, logic) {
        if (!logic.splitThreatClearance) {
            return {
                blocked: false,
                immediateDanger: false,
                riskScore: 0,
            };
        }
        const postSplitCell = this.buildProjectedSplitCell(cell, target);
        if (!postSplitCell) {
            return {
                blocked: false,
                immediateDanger: false,
                riskScore: 0,
            };
        }
        const currentClearance = logic.splitThreatClearance;
        const postClearance = currentClearance * 0.8;
        const immediateClearance = logic.smartSplitImmediateThreatClearance || 150;
        let riskScore = 0;
        let immediateDanger = false;
        for (const node of this.viewNodes) {
            if (!node || node === target || node.owner == this || node.type !== 0) continue;
            if (this.areFriendlyPlayers(cell.owner, node.owner)) continue;
            const cellEdgeDistance = this.getEdgeDistance(node, cell);
            if (node.radius > cell.radius * (logic.splitThreatRatio || 1.15) &&
                cellEdgeDistance < currentClearance) {
                const threatFactor = this.getThreatResponseFactor(node, cell, logic);
                const normalizedDistance = 1 - Math.max(0, cellEdgeDistance) / Math.max(1, currentClearance);
                riskScore += threatFactor * (0.3 + normalizedDistance * 0.85);
                if (cellEdgeDistance < immediateClearance &&
                    threatFactor >= (logic.lowPriorityThreatBlockFactor || 0.72)) {
                    immediateDanger = true;
                }
            }
            const targetEdgeDistance = this.getEdgeDistance(node, postSplitCell);
            if (node.radius > postSplitCell.radius * (logic.postSplitThreatRatio || 1.15) &&
                targetEdgeDistance < postClearance) {
                const threatFactor = this.getThreatResponseFactor(node, postSplitCell, logic);
                const normalizedDistance = 1 - Math.max(0, targetEdgeDistance) / Math.max(1, postClearance);
                riskScore += threatFactor * (0.45 + normalizedDistance);
                if (targetEdgeDistance < immediateClearance &&
                    threatFactor >= (logic.lowPriorityThreatBlockFactor || 0.72) * 0.92) {
                    immediateDanger = true;
                }
            }
        }
        return {
            blocked: immediateDanger || riskScore >= 1,
            immediateDanger,
            riskScore,
        };
    }
    estimateSplitCaptureMass(cell, primaryTarget, logic) {
        if (!cell || !primaryTarget || primaryTarget.type !== 0 || !primaryTarget.position) return null;
        const projectedSplitCell = this.buildProjectedSplitCell(cell, primaryTarget);
        if (!projectedSplitCell) return null;
        let projectedMass = projectedSplitCell._mass;
        let projectedRadius = projectedSplitCell.radius;
        let capturableMass = 0;
        let capturedCount = 0;
        const anchorPosition = primaryTarget.position;
        const searchRadius = Math.max(
            logic.smartSplitSearchRadius || 300,
            projectedRadius * 3.2,
            primaryTarget.radius * 4.2
        );
        const chainRadius = Math.max(logic.smartSplitChainRadius || 260, projectedRadius * 1.8);
        const candidates = [];
        for (const node of this.viewNodes) {
            if (!node || node.owner == this || node.type !== 0) continue;
            if (this.areFriendlyPlayers(cell.owner, node.owner)) continue;
            const edgeDistance = node.position.difference(anchorPosition).dist() - node.radius;
            if (node !== primaryTarget && edgeDistance > searchRadius) continue;
            candidates.push({
                node,
                edgeDistance,
                isPrimary: node === primaryTarget,
            });
        }
        candidates.sort((left, right) => {
            if (left.isPrimary && !right.isPrimary) return -1;
            if (!left.isPrimary && right.isPrimary) return 1;
            return left.edgeDistance - right.edgeDistance;
        });
        for (const candidate of candidates) {
            const node = candidate.node;
            const edgeDistance = node.position.difference(anchorPosition).dist() - node.radius;
            const dynamicReach = Math.max(searchRadius, projectedRadius * 3.4, chainRadius + capturedCount * 24);
            if (!candidate.isPrimary && edgeDistance > dynamicReach) continue;
            if (!this.canConsumeByRadius(projectedRadius, node.radius, logic.lowPriorityThreatEatRatio || 1.15)) continue;
            const nodeMass = this.getNodeMass(node);
            capturableMass += nodeMass;
            capturedCount++;
            projectedMass += nodeMass;
            projectedRadius = Math.sqrt(projectedMass * 100);
        }
        return {
            capturableMass,
            capturedCount,
            projectedMass,
            projectedRadius,
        };
    }
    canJustifyAggressiveSplit(node, cell, logic, totalMass, splitThreatState) {
        if (!splitThreatState || splitThreatState.immediateDanger) return false;
        if (this.cells.length !== 1) return false;
        if (totalMass < (logic.smartSplitMinTotalMass || 1000)) return false;
        if (!node || node.type !== 0 || this.areFriendlyPlayers(cell.owner, node.owner)) return false;
        const captureEstimate = this.estimateSplitCaptureMass(cell, node, logic);
        if (!captureEstimate || captureEstimate.capturedCount < 1) return false;
        if (captureEstimate.capturableMass < totalMass * (logic.smartSplitCaptureMassRatio || 1)) return false;
        return splitThreatState.riskScore <= (logic.smartSplitRiskOverrideCeiling || 1.35);
    }
    canSplitOnNode(node, cell, logic, influence, distance, totalMass) {
        if (node.type == 1 || this.splitCooldown) return false;
        if (logic.splitOnlyPlayerCells && node.type !== 0) return false;
        if (logic.splitRequiresPositiveInfluence && influence <= 0) return false;
        if (node.type == 0 && this.areFriendlyPlayers(cell.owner, node.owner)) return false;
        if (!this.hasSplitCapacity(logic, totalMass)) return false;
        const splitRatio = logic.splitAdvantageRatio || 1.15;
        if (cell.radius <= node.radius * splitRatio) return false;
        if (400 * logic.splitDistanceFactor - cell.radius / 2 - node.radius < distance) return false;
        const splitThreatState = this.evaluateSplitThreats(cell, node, logic);
        if (splitThreatState.blocked &&
            !this.canJustifyAggressiveSplit(node, cell, logic, totalMass, splitThreatState)) {
            return false;
        }
        return true;
    }
    isEnemyThreatNode(node, cell, ratio = 1.15) {
        if (!node || node.type !== 0 || node.owner == this) return false;
        if (this.areFriendlyPlayers(cell.owner, node.owner)) return false;
        return node.radius > cell.radius * ratio;
    }
    clearVirusVolley(preserveCooldown = true) {
        this.virusVolley = {
            remainingShots: 0,
            cooldownUntilTick: preserveCooldown ? (this.virusVolley?.cooldownUntilTick || 0) : 0,
            virus: null,
            threat: null,
            aimPoint: null,
        };
    }
    getVirusVolleyFeedsNeeded(virus, logic) {
        const maxShots = Math.max(1, logic.virusVolleyMaxShots || 9);
        const gainPerFeed = this.server.config.ejectSize * this.server.config.ejectSize;
        const remainingRadius2 = Math.max(
            0,
            this.server.config.virusMaxSize * this.server.config.virusMaxSize - virus._radius2
        );
        return Math.max(1, Math.min(maxShots, Math.ceil(remainingRadius2 / gainPerFeed)));
    }
    getAlignedVirusShotOpportunity(cell, threat, viruses, logic) {
        const toThreat = threat.position.difference(cell.position);
        const threatDistance = toThreat.dist();
        if (threatDistance < 1 || threatDistance > logic.virusVolleyThreatLookAhead) return null;
        const pathDirection = toThreat.clone().normalize();
        const pathTolerance = logic.virusVolleyPathTolerance || 0;
        const selfEdgeSafety = Math.max(logic.virusVolleySelfEdgeSafety || 0, cell.radius * 0.18);
        for (const virus of viruses) {
            const toVirus = virus.position.difference(cell.position);
            const forward = toVirus.x * pathDirection.x + toVirus.y * pathDirection.y;
            if (forward <= 0 || forward >= threatDistance) continue;
            const lateral = Math.abs(toVirus.x * pathDirection.y - toVirus.y * pathDirection.x);
            if (lateral > virus.radius + pathTolerance) continue;
            const selfVirusEdgeDistance = toVirus.dist() - cell.radius - virus.radius;
            if (selfVirusEdgeDistance <= selfEdgeSafety) continue;
            const virusToThreat = threat.position.difference(virus.position);
            const threatVirusEdgeDistance = virusToThreat.dist() - threat.radius - virus.radius;
            if (threatVirusEdgeDistance > logic.virusVolleyThreatDistance) continue;
            const shotDirection = virusToThreat.distSquared() > 1
                ? virusToThreat.clone().normalize()
                : pathDirection;
            return {
                virus,
                threatVirusEdgeDistance,
                selfVirusEdgeDistance,
                aimPoint: virus.position.sum(shotDirection.product(logic.virusVolleyAimDistance || 1200)),
            };
        }
        return null;
    }
    findVirusVolleyOpportunity(cell, logic, totalMass) {
        if (!logic.virusVolleyEnabled || this.cells.length !== 1 || totalMass < (logic.virusVolleyMinMass || 0)) {
            return null;
        }
        if (this.server.ticks < (this.virusVolley?.cooldownUntilTick || 0)) return null;
        const viruses = [];
        const threats = [];
        for (const node of this.viewNodes) {
            if (!node || node.owner == this) continue;
            if (node.type === 2 && !node.isMotherCell) {
                viruses.push(node);
            } else if (this.isEnemyThreatNode(node, cell, logic.virusVolleyThreatRatio || 1.15)) {
                threats.push(node);
            }
        }
        if (!viruses.length || !threats.length) return null;
        threats.sort((left, right) =>
            left.position.difference(cell.position).dist() - right.position.difference(cell.position).dist()
        );
        let best = null;
        for (const threat of threats) {
            const aligned = this.getAlignedVirusShotOpportunity(cell, threat, viruses, logic);
            if (!aligned) continue;
            const score = aligned.selfVirusEdgeDistance - aligned.threatVirusEdgeDistance;
            if (!best || score > best.score) {
                best = {
                    score,
                    threat,
                    virus: aligned.virus,
                    aimPoint: aligned.aimPoint,
                };
            }
        }
        if (!best) return null;
        return {
            threat: best.threat,
            virus: best.virus,
            aimPoint: best.aimPoint,
            shots: this.getVirusVolleyFeedsNeeded(best.virus, logic),
        };
    }
    shouldContinueVirusVolley(cell, logic, totalMass) {
        const state = this.virusVolley;
        if (!state || state.remainingShots <= 0 || !state.virus || !state.threat) return false;
        if (this.cells.length !== 1 || totalMass < (logic.virusVolleyMinMass || 0) || state.virus.isRemoved || state.threat.isRemoved) {
            return false;
        }
        if (!this.isEnemyThreatNode(state.threat, cell, logic.virusVolleyThreatRatio || 1.15)) return false;
        return !!this.getAlignedVirusShotOpportunity(cell, state.threat, [state.virus], logic);
    }
    handleVirusVolley(cell, logic, totalMass) {
        if (!logic.virusVolleyEnabled) {
            this.clearVirusVolley(false);
            return false;
        }
        if (!this.shouldContinueVirusVolley(cell, logic, totalMass)) {
            this.clearVirusVolley(true);
            const opportunity = this.findVirusVolleyOpportunity(cell, logic, totalMass);
            if (!opportunity) return false;
            this.virusVolley = {
                remainingShots: opportunity.shots,
                cooldownUntilTick: this.server.ticks + (logic.virusVolleyCooldownTicks || 250),
                virus: opportunity.virus,
                threat: opportunity.threat,
                aimPoint: opportunity.aimPoint,
            };
        }
        if (!this.virusVolley.remainingShots) return false;
        if (this.lastEject !== null && this.server.ticks - this.lastEject < this.server.config.ejectCooldown) return false;
        const didEject = this.server.ejectMass(this, this.virusVolley.aimPoint);
        if (!didEject) {
            this.clearVirusVolley(true);
            return false;
        }
        this.virusVolley.remainingShots--;
        if (this.virusVolley.remainingShots <= 0) {
            this.clearVirusVolley(true);
        }
        return true;
    }
    isDangerousVirus(node, cell) {
        return !!node &&
            node.type === 2 &&
            !node.isMotherCell &&
            this.cells.length < this.server.config.playerMaxCells &&
            cell.radius > node.radius * 1.15;
    }
    findBlockingVirus(cell, escapeDirection, logic) {
        const lookAhead = logic.escapeVirusLookAhead || 0;
        const clearance = logic.escapeVirusClearance || 0;
        let best = null;
        for (const node of this.viewNodes) {
            if (!this.isDangerousVirus(node, cell)) continue;
            const toVirus = node.position.difference(cell.position);
            const forward = toVirus.x * escapeDirection.x + toVirus.y * escapeDirection.y;
            if (forward <= 0 || forward > lookAhead) continue;
            const lateral = Math.abs(toVirus.x * escapeDirection.y - toVirus.y * escapeDirection.x);
            const corridor = cell.radius + node.radius + clearance;
            if (lateral >= corridor) continue;
            if (!best || forward < best.forward || (forward === best.forward && lateral < best.lateral)) {
                best = { node, toVirus, forward, lateral };
            }
        }
        return best;
    }
    scoreEscapeProbe(cell, probePoint, threatNodes) {
        let nearestThreat = Infinity;
        let nearestVirus = Infinity;
        for (const node of threatNodes) {
            const distance = probePoint.difference(node.position).dist() - node.radius - cell.radius;
            if (distance < nearestThreat) nearestThreat = distance;
        }
        for (const node of this.viewNodes) {
            if (!this.isDangerousVirus(node, cell)) continue;
            const distance = probePoint.difference(node.position).dist() - node.radius - cell.radius;
            if (distance < nearestVirus) nearestVirus = distance;
        }
        if (!Number.isFinite(nearestThreat)) nearestThreat = 0;
        if (!Number.isFinite(nearestVirus)) nearestVirus = 0;
        return {
            nearestThreat,
            nearestVirus,
        };
    }
    buildEscapeBypassVector(cell, result, threatNodes, threatVector, logic) {
        if (!logic.escapeVirusBypass || this.cells.length !== 1 || !threatNodes.length) return null;
        if (result.distSquared() === 0 || threatVector.distSquared() === 0) return null;
        const escapeDirection = result.clone().normalize();
        const blockingVirus = this.findBlockingVirus(cell, escapeDirection, logic);
        if (!blockingVirus) return null;
        const toVirus = blockingVirus.toVirus.clone().normalize();
        const tangents = [
            new Vec2(-toVirus.y, toVirus.x),
            new Vec2(toVirus.y, -toVirus.x),
        ];
        let best = null;
        const probeDistance = logic.escapeVirusProbeDistance || 0;
        for (const tangent of tangents) {
            const candidate = escapeDirection.clone().multiply(0.7).add(tangent.product(0.95));
            if (candidate.distSquared() === 0) continue;
            candidate.normalize();
            const probePoint = cell.position.sum(candidate.product(probeDistance));
            const probe = this.scoreEscapeProbe(cell, probePoint, threatNodes);
            const forwardScore = candidate.x * escapeDirection.x + candidate.y * escapeDirection.y;
            const score = probe.nearestThreat * 1.6 + probe.nearestVirus * 2.2 + forwardScore * 180;
            if (!best || score > best.score) {
                best = {
                    direction: candidate,
                    score,
                };
            }
        }
        return best ? best.direction.multiply(Math.max(1, result.dist())) : null;
    }
    smallest(list) {
        let smallest = null;
        for (const current of Array.isArray(list) ? list : []) {
            if (!current || current.isRemoved) continue;
            if (!smallest || current.radius < smallest.radius) {
                smallest = current;
            }
        }
        return smallest;
    }
    getPlayerDistance(left, right) {
        const leftCell = this.largest(left?.cells);
        const rightCell = this.largest(right?.cells);
        const leftPos = leftCell?.position || left?.centerPos;
        const rightPos = rightCell?.position || right?.centerPos;
        if (!leftPos || !rightPos) return Infinity;
        return rightPos.difference(leftPos).dist();
    }
    hasThreatNearPlayer(player, logic) {
        const cell = this.largest(player?.cells);
        if (!cell) return false;
        for (const node of this.viewNodes) {
            if (!this.isEnemyThreatNode(node, cell, logic.teamThreatRatio || 1.1)) continue;
            const edgeDistance = node.position.difference(cell.position).dist() - cell.radius - node.radius;
            if (edgeDistance < (logic.teamThreatClearance || 0) &&
                this.isMaterialThreat(node, cell, logic)) return true;
        }
        return false;
    }
    getVisibleTeamPlayers(logic) {
        if (!logic.teamMode) return [];
        const seen = new Set();
        const players = [];
        for (const node of this.viewNodes) {
            const owner = node?.owner;
            if (!node || node.type !== 0 || !owner || owner === this) continue;
            if (!this.isTeamBotPlayer(owner) || !owner.cells?.length) continue;
            if (seen.has(owner.pID)) continue;
            seen.add(owner.pID);
            players.push(owner);
        }
        players.sort((left, right) => this.getPlayerDistance(this, left) - this.getPlayerDistance(this, right));
        return players;
    }
    getClosestFeedCount(donor, receiverMass, logic) {
        const targetMass = logic.teamFeedTargetMass || 500;
        const stats = this.getEjectActionStats(donor);
        if (!stats.pelletsPerAction || stats.gainMass <= 0 || stats.lossMass <= 0) return 0;
        const deficit = targetMass - receiverMass;
        if (deficit <= Math.max(8, stats.gainMass * 0.35)) return 0;
        const reserveBudget = this.getPlayerTotalMass(donor) - (logic.teamFeedReserveMass || 0);
        if (reserveBudget <= stats.lossMass) return 0;
        const maxFeeds = Math.min(
            logic.teamFeedMaxFeeds || 24,
            Math.max(0, Math.floor(reserveBudget / stats.lossMass))
        );
        if (!maxFeeds) return 0;
        let bestCount = 0;
        let bestGap = Infinity;
        for (let count = 1; count <= maxFeeds; count++) {
            const gap = Math.abs(deficit - stats.gainMass * count);
            if (gap < bestGap) {
                bestGap = gap;
                bestCount = count;
            }
        }
        return bestCount;
    }
    isHighValuePrey(bestPrey, logic) {
        return !!bestPrey && (
            bestPrey.massRatio >= (logic.teamHighValuePreyRatio || 0.15) ||
            bestPrey.edgeDistance <= (logic.teamHighValueEdgeDistance || 150)
        );
    }
    shouldPreferTeamPlay(bestPrey, logic) {
        if (!bestPrey) return true;
        return (
            bestPrey.massRatio <= (logic.teamSupportPreyRatio || 0.08) ||
            bestPrey.edgeDistance > (logic.teamSupportPreyDistance || 800)
        );
    }
    getActiveTeamAction(logic) {
        const action = this.teamAction;
        if (!logic.teamMode || !action?.mode) {
            if (!logic.teamMode) this.clearTeamAction(false);
            return null;
        }
        if (action.untilTick <= this.server.ticks || !this.isTeamBotPlayer(action.partner) || !action.partner?.cells?.length) {
            this.clearTeamAction();
            return null;
        }
        if (this.isBusyWithOtherTeamAction(action.partner, this)) {
            this.clearTeamAction();
            return null;
        }
        if (action.mode === "boost-feed" || action.mode === "receive-feed") {
            const donor = action.mode === "boost-feed" ? this : action.partner;
            const receiver = action.mode === "receive-feed" ? this : action.partner;
            const receiverMass = this.getPlayerTotalMass(receiver);
            const targetMass = action.targetMass || logic.teamFeedTargetMass || 500;
            const stats = this.getEjectActionStats(donor);
            if (!stats.pelletsPerAction ||
                receiverMass >= targetMass - Math.max(10, stats.gainMass * 0.35) ||
                this.getPlayerDistance(donor, receiver) > (logic.teamFeedRange || 0) * 1.6 ||
                this.getPlayerTotalMass(donor) <= (logic.teamFeedReserveMass || 0) + stats.lossMass ||
                (action.mode === "boost-feed" && action.remainingFeeds <= 0)) {
                this.clearTeamAction();
                return null;
            }
            return this.teamAction;
        }
        if (action.mode === "integrate-donor" || action.mode === "integrate-receiver") {
            const donor = action.mode === "integrate-donor" ? this : action.partner;
            const receiver = action.mode === "integrate-receiver" ? this : action.partner;
            const donorSmallest = this.smallest(donor?.cells);
            const receiverLargest = this.largest(receiver?.cells);
            if (!donorSmallest ||
                !receiverLargest ||
                donor.cells.length < 2 ||
                donor.cells.length <= receiver.cells.length ||
                receiverLargest.radius <= donorSmallest.radius * 1.15 ||
                this.getPlayerDistance(donor, receiver) > (logic.teamPairRange || 0) * 1.4) {
                this.clearTeamAction();
                return null;
            }
            return this.teamAction;
        }
        this.clearTeamAction();
        return null;
    }
    findTeamFeedAction(logic, totalMass) {
        if (!logic.teamMode) return null;
        const targetMass = logic.teamFeedTargetMass || 500;
        for (const ally of this.getVisibleTeamPlayers(logic)) {
            if (this.isBusyWithOtherTeamAction(ally)) continue;
            if (this.getPlayerDistance(this, ally) > (logic.teamFeedRange || 0)) continue;
            if (this.hasThreatNearPlayer(this, logic) || this.hasThreatNearPlayer(ally, logic)) continue;

            const allyMass = this.getPlayerTotalMass(ally);
            if (totalMass >= (logic.teamFeedMinMass || 0) && allyMass < targetMass) {
                const feeds = this.getClosestFeedCount(this, allyMass, logic);
                if (feeds > 0) {
                    const untilTick = this.server.ticks + Math.max(
                        logic.teamFeedLockTicks || 0,
                        feeds * ((this.server.config.ejectCooldown || 1) + 2) + 40
                    );
                    return this.setTeamPairAction(
                        this,
                        { mode: "boost-feed", remainingFeeds: feeds, targetMass, untilTick },
                        ally,
                        { mode: "receive-feed", targetMass, untilTick }
                    );
                }
            }
            if (allyMass >= (logic.teamFeedMinMass || 0) && totalMass < targetMass) {
                const feeds = this.getClosestFeedCount(ally, totalMass, logic);
                if (feeds > 0) {
                    const untilTick = this.server.ticks + Math.max(
                        logic.teamFeedLockTicks || 0,
                        feeds * ((this.server.config.ejectCooldown || 1) + 2) + 40
                    );
                    return this.setTeamPairAction(
                        ally,
                        { mode: "boost-feed", remainingFeeds: feeds, targetMass, untilTick },
                        this,
                        { mode: "receive-feed", targetMass, untilTick }
                    );
                }
            }
        }
        return null;
    }
    findTeamIntegrationAction(logic, bestPrey) {
        if (!logic.teamMode) return null;
        const preferTeamPlay = this.shouldPreferTeamPlay(bestPrey, logic);
        let best = null;
        for (const ally of this.getVisibleTeamPlayers(logic)) {
            if (this.isBusyWithOtherTeamAction(ally)) continue;

            let donor = null;
            let receiver = null;
            if (this.cells.length > ally.cells.length) {
                donor = this;
                receiver = ally;
            } else if (ally.cells.length > this.cells.length) {
                donor = ally;
                receiver = this;
            } else {
                continue;
            }

            if (donor.cells.length - receiver.cells.length < 1) continue;
            if (!preferTeamPlay && donor.cells.length < 3) continue;
            if (this.getPlayerDistance(donor, receiver) > (logic.teamPairRange || 0)) continue;
            if (this.hasThreatNearPlayer(donor, logic) || this.hasThreatNearPlayer(receiver, logic)) continue;

            const donorSmallest = this.smallest(donor.cells);
            const receiverLargest = this.largest(receiver.cells);
            if (!donorSmallest || !receiverLargest) continue;
            if (receiverLargest.radius <= donorSmallest.radius * 1.15) continue;

            const preyPressure = bestPrey
                ? Math.max(0, (logic.teamSupportPreyDistance || 0) - Math.min(logic.teamSupportPreyDistance || 0, bestPrey.edgeDistance))
                : 0;
            const score =
                (donor.cells.length - receiver.cells.length) * 260 +
                preyPressure * 0.35 -
                this.getPlayerDistance(donor, receiver) +
                Math.max(0, receiverLargest.radius - donorSmallest.radius);

            if (!best || score > best.score) {
                best = { donor, receiver, score };
            }
        }
        if (!best) return null;
        const untilTick = this.server.ticks + (logic.teamActionLockTicks || 110);
        return this.setTeamPairAction(
            best.donor,
            { mode: "integrate-donor", untilTick },
            best.receiver,
            { mode: "integrate-receiver", untilTick }
        );
    }
    getTeamActionTargetPoint(action) {
        const partner = action?.partner;
        if (!partner) return null;
        if (action.mode === "boost-feed" || action.mode === "receive-feed") {
            return this.largest(partner.cells)?.position?.clone() || partner.centerPos?.clone() || null;
        }
        if (action.mode === "integrate-donor") {
            return this.largest(partner.cells)?.position?.clone() || partner.centerPos?.clone() || null;
        }
        if (action.mode === "integrate-receiver") {
            return this.smallest(partner.cells)?.position?.clone() ||
                this.largest(partner.cells)?.position?.clone() ||
                partner.centerPos?.clone() ||
                null;
        }
        return null;
    }
    getTeamMovementVector(cell, logic, bestPrey, urgentThreat, result) {
        if (!logic.teamMode) {
            this.clearTeamAction();
            return null;
        }
        if (urgentThreat || this.isHighValuePrey(bestPrey, logic)) {
            this.clearTeamAction();
            return null;
        }
        const action = this.getActiveTeamAction(logic) ||
            this.findTeamFeedAction(logic, this.getPlayerTotalMass(this)) ||
            this.findTeamIntegrationAction(logic, bestPrey);
        if (!action) return null;
        const targetPoint = this.getTeamActionTargetPoint(action);
        if (!targetPoint) {
            this.clearTeamAction();
            return null;
        }
        const vector = targetPoint.difference(cell.position);
        if (vector.distSquared() === 0) return null;
        if (result.distSquared() > 0) {
            vector.add(result.clone().multiply(0.18));
        }
        return vector;
    }
    handleTeamSupport(logic, totalMass, didVirusVolley = false) {
        if (!logic.teamMode) {
            this.clearTeamAction(false);
            return false;
        }
        if (didVirusVolley || this.virusVolley.remainingShots > 0) return false;
        const action = this.getActiveTeamAction(logic);
        if (!action || action.mode !== "boost-feed") return false;
        const partnerCell = this.largest(action.partner?.cells);
        if (!partnerCell) {
            this.clearTeamAction();
            return false;
        }
        const stats = this.getEjectActionStats(this);
        if (!stats.pelletsPerAction ||
            totalMass <= (logic.teamFeedReserveMass || 0) + stats.lossMass ||
            this.getPlayerDistance(this, action.partner) > (logic.teamFeedRange || 0) * 1.6) {
            this.clearTeamAction();
            return false;
        }
        const receiverMass = this.getPlayerTotalMass(action.partner);
        const targetMass = action.targetMass || logic.teamFeedTargetMass || 500;
        if (receiverMass >= targetMass - Math.max(10, stats.gainMass * 0.35)) {
            this.clearTeamAction();
            return false;
        }
        if (this.lastEject !== null && this.server.ticks - this.lastEject < this.server.config.ejectCooldown) {
            return false;
        }
        const didEject = this.server.ejectMass(this, partnerCell.position);
        if (!didEject) {
            this.clearTeamAction();
            return false;
        }
        this.teamAction.remainingFeeds--;
        if (this.teamAction.remainingFeeds <= 0) {
            this.clearTeamAction();
        }
        return true;
    }
    largest(list) {
        let largest = null;
        for (const current of Array.isArray(list) ? list : []) {
            if (!current || current.isRemoved) continue;
            if (!largest || current.radius > largest.radius) {
                largest = current;
            }
        }
        return largest;
    }
    checkConnection() {
        this.cells = Array.isArray(this.cells)
            ? this.cells.filter((cell) => cell && !cell.isRemoved)
            : [];
        // Respawn if bot is dead
        if (!this.cells.length) {
            this.clearVirusVolley(true);
            this.clearTeamAction(true);
            const nextSkin = this.server.bots?.resolveProfileSkin(this.botProfile, this._skin) || "";
            this.setSkin(nextSkin);
            this.server.mode.onPlayerSpawn(this.server, this);
        }
    }
    sendUpdate() {
        if (this.splitCooldown) --this.splitCooldown;
        const cell = this.largest(this.cells);
        if (!cell) return;
        const loadControl = this.server.getBotLoadControl?.();
        const aiTickStride = Math.max(1, (loadControl?.aiTickStride | 0) || 1);
        if (aiTickStride > 1 && ((this.server.ticks + this.pID) % aiTickStride) !== 0) {
            return;
        }
        const logic = this.getLogicConfig();
        const totalMass = this.getTotalMass();
        this.decide(cell, logic, totalMass);
        const didVirusVolley = this.handleVirusVolley(cell, logic, totalMass);
        this.handleTeamSupport(logic, totalMass, didVirusVolley);
    }
    decide(cell, logic = this.getLogicConfig(), totalMass = this.getTotalMass()) {
        if (!cell) return;
        const result = new Vec2(0, 0);
        const threatVector = new Vec2(0, 0);
        const threatNodes = [];
        let bestPrey = null;
        let urgentThreat = false;
        for (const node of this.viewNodes) {
            if (node.owner == this) continue;

            const displacement = node.position.difference(cell.position);
            const nodeDistance = displacement.dist();
            if (node.type === 0 && !this.areFriendlyPlayers(cell.owner, node.owner)) {
                const edgeDistance = nodeDistance - cell.radius - node.radius;
                if (cell.radius > node.radius * 1.15) {
                    const prey = {
                        node,
                        edgeDistance,
                        massRatio: node._mass / Math.max(1, totalMass),
                        score: node._mass / Math.max(40, edgeDistance + 120),
                    };
                    if (!bestPrey || prey.score > bestPrey.score) {
                        bestPrey = prey;
                    }
                } else if (node.radius > cell.radius * (logic.teamThreatRatio || 1.1) &&
                    edgeDistance < (logic.teamThreatClearance || 0) &&
                    this.isMaterialThreat(node, cell, logic)) {
                    urgentThreat = true;
                }
            }

            // Make decisions
            let influence = this.getInfluence(node, cell, logic);

            // Conclude decisions
            // Apply influence if it isn't 0
            if (influence == 0) continue;

            // Figure out distance between cells
            let distance = nodeDistance;

            if (influence < 0)
                distance -= cell.radius + node.radius; // Get edge distance

            // The farther they are the smaller influence it is
            if (distance < 1) distance = 1;
            influence /= distance;
            const contribution = displacement.clone().normalize().product(influence);
            if (node.type === 0 && influence < 0) {
                threatVector.add(contribution);
                threatNodes.push(node);
            }

            // Splitting conditions
            if (this.canSplitOnNode(node, cell, logic, influence, distance, totalMass))
            {
                // Splitkill the target
                this.splitCooldown = logic.splitCooldown;
                this.mouse.assign(node.position);
                this.socket.client.splitRequested = true;
                return;
            } else {
                // Produce force vector exerted by this entity on the cell
                result.add(contribution);
            }
        }
        const teamVector = this.getTeamMovementVector(cell, logic, bestPrey, urgentThreat, result);
        if (teamVector) {
            const bypassVector = this.buildEscapeBypassVector(cell, teamVector, threatNodes, threatVector, logic);
            const steering = bypassVector || teamVector;
            this.mouse.assign(cell.position.sum(steering));
            return;
        }
        const bypassVector = this.buildEscapeBypassVector(cell, result, threatNodes, threatVector, logic);
        const steering = bypassVector || result;
        this.mouse.assign(cell.position.sum(steering.multiply(900)));
    }
    getInfluence(node, cell, logic) {
        switch (node.type) {
            case 0:
                if (this.areFriendlyPlayers(cell.owner, node.owner)) {
                    return 0;
                }
                if (cell.radius > node.radius * 1.15) return node.radius * logic.edibleWeight;
                if (node.radius > cell.radius * 1.15) {
                    return -node.radius * logic.threatWeight * this.getThreatResponseFactor(node, cell, logic);
                }
                return -((node.radius / cell.radius) / 3) * logic.threatWeight *
                    this.getThreatResponseFactor(node, cell, logic);
            case 1:
                return logic.foodWeight;
            case 2:
                if (cell.radius > node.radius * 1.15) {
                    if (this.cells.length == this.server.config.playerMaxCells) {
                        return node.radius * logic.edibleWeight;
                    }
                    return -logic.threatWeight;
                }
                return (node.isMotherCell && node.radius > cell.radius * 1.15) ? -logic.threatWeight : 0;
            case 3:
                return (cell.radius > node.radius * 1.15) ? node.radius * logic.ejectedWeight : 0;
            default:
                return 0;
        }
    }
}
module.exports = BotPlayer;
