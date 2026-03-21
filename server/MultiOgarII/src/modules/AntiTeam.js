const TEAM_BOT_LOGIC = "team-bots";

const DEFAULTS = Object.freeze({
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
});

class AntiTeam {
    constructor(server) {
        this.server = server;
    }
    getSettings() {
        const config = this.server?.config || {};
        return {
            enabled: config.antiTeamEnabled === true,
            applyToBots: config.antiTeamApplyToBots === true,
            ignoreLinkedPlayers: config.antiTeamIgnoreLinkedPlayers !== false,
            ignoreTeamBots: config.antiTeamIgnoreTeamBots !== false,
            stateDecayPerTick: config.antiTeamStateDecayPerTick ?? DEFAULTS.antiTeamStateDecayPerTick,
            maxMultiplier: config.antiTeamMaxMultiplier ?? DEFAULTS.antiTeamMaxMultiplier,
            applyBase: config.antiTeamApplyBase ?? DEFAULTS.antiTeamApplyBase,
            decayScale: config.antiTeamDecayScale ?? DEFAULTS.antiTeamDecayScale,
            pairWindowTicks: config.antiTeamPairWindowTicks ?? DEFAULTS.antiTeamPairWindowTicks,
            minPairEvents: config.antiTeamMinPairEvents ?? DEFAULTS.antiTeamMinPairEvents,
            maxPairsPerPlayer: config.antiTeamMaxPairsPerPlayer ?? DEFAULTS.antiTeamMaxPairsPerPlayer,
            ejectWeight: config.antiTeamEjectWeight ?? DEFAULTS.antiTeamEjectWeight,
            playerEatWeight: config.antiTeamPlayerEatWeight ?? DEFAULTS.antiTeamPlayerEatWeight,
            virusBurstMultiplier: config.antiTeamVirusBurstMultiplier ?? DEFAULTS.antiTeamVirusBurstMultiplier,
            virusBurstThreshold: config.antiTeamVirusBurstThreshold ?? DEFAULTS.antiTeamVirusBurstThreshold,
            ejectWindowTicks: config.antiTeamEjectWindowTicks ?? DEFAULTS.antiTeamEjectWindowTicks,
        };
    }
    ensurePlayerState(player) {
        if (!player) return null;
        if (!player.antiTeamState) {
            player.antiTeamState = {
                loss: 0,
                gain: 0,
                decayMult: 1,
                pairs: new Map(),
            };
        } else if (!(player.antiTeamState.pairs instanceof Map)) {
            player.antiTeamState.pairs = new Map();
        }
        return player.antiTeamState;
    }
    initPlayer(player) {
        this.resetPlayer(player);
    }
    resetPlayer(player) {
        const state = this.ensurePlayerState(player);
        if (!state) return;
        state.loss = 0;
        state.gain = 0;
        state.decayMult = 1;
        state.pairs.clear();
    }
    getPlayerMass(player) {
        if (!player || !Array.isArray(player.cells)) return 0;
        let total = 0;
        for (const cell of player.cells) {
            if (!cell || cell.isRemoved) continue;
            total += this.getCellMass(cell);
        }
        return total;
    }
    getCellMass(cell) {
        if (!cell) return 0;
        if (typeof cell._mass === "number") return cell._mass;
        if (typeof cell.mass === "number") return cell.mass;
        if (typeof cell._radius2 === "number") return cell._radius2 / 100;
        if (typeof cell.radius === "number") return (cell.radius * cell.radius) / 100;
        return 0;
    }
    isTeamBot(player) {
        return !!player && player.isBot && player.botProfile?.logic === TEAM_BOT_LOGIC;
    }
    isTrackablePlayer(player) {
        return !!player && !player.isRemoved && !player.isMinion && !player.isMi;
    }
    canApplyToPlayer(player, settings) {
        return this.isTrackablePlayer(player) && (settings.applyToBots || !player.isBot);
    }
    sharesLinkedController(left, right) {
        if (!left || !right) return false;
        if (typeof left.getLinkedController !== "function" || typeof right.getLinkedController !== "function") {
            return false;
        }
        return left.getLinkedController() === right.getLinkedController();
    }
    shouldIgnorePair(left, right, settings) {
        if (!this.canApplyToPlayer(left, settings) || !this.canApplyToPlayer(right, settings)) return true;
        if (left === right || left.pID === right.pID) return true;
        if (this.server.mode?.haveTeams && left.team === right.team) return true;
        if (settings.ignoreLinkedPlayers && this.sharesLinkedController(left, right)) return true;
        if (settings.ignoreTeamBots && this.isTeamBot(left) && this.isTeamBot(right)) return true;
        return false;
    }
    getAntiMultiplier(player, settings = this.getSettings()) {
        const state = this.ensurePlayerState(player);
        const score = this.getPlayerMass(player);
        if (!state || score <= 0) return 0;
        const div = (state.loss + state.gain) / (score / 2);
        if (!Number.isFinite(div) || div <= 0) return 0;
        return Math.min(div, settings.maxMultiplier);
    }
    prunePairs(player, settings, nowTick = this.server.ticks) {
        const state = this.ensurePlayerState(player);
        if (!state) return;
        const pairs = state.pairs;
        const window = Math.max(1, settings.pairWindowTicks);
        for (const [id, pair] of pairs) {
            if (!pair || (nowTick - pair.lastTick) > window) pairs.delete(id);
        }
        if (pairs.size <= settings.maxPairsPerPlayer) return;
        const ordered = Array.from(pairs.entries()).sort((left, right) => left[1].lastTick - right[1].lastTick);
        while (pairs.size > settings.maxPairsPerPlayer && ordered.length) {
            const [id] = ordered.shift();
            pairs.delete(id);
        }
    }
    recordPairEvent(player, other, influence, settings) {
        const state = this.ensurePlayerState(player);
        if (!state || !other) return {events: 0, score: 0, lastTick: this.server.ticks};
        const nowTick = this.server.ticks;
        const window = Math.max(1, settings.pairWindowTicks);
        let pair = state.pairs.get(other.pID);
        if (!pair || (nowTick - pair.lastTick) > window) {
            pair = {
                events: 0,
                score: 0,
                lastTick: nowTick,
            };
        } else if (nowTick > pair.lastTick) {
            const decay = Math.max(0, 1 - ((nowTick - pair.lastTick) / window));
            pair.score *= decay;
        }
        pair.events += 1;
        pair.score += influence;
        pair.lastTick = nowTick;
        state.pairs.set(other.pID, pair);
        this.prunePairs(player, settings, nowTick);
        return pair;
    }
    applyPressure(player, influence, type, settings) {
        const state = this.ensurePlayerState(player);
        if (!state || influence <= 0) return;
        const scaled = influence * (settings.applyBase + this.getAntiMultiplier(player, settings));
        if (type < 0) state.loss += scaled;
        else state.gain += scaled;
    }
    registerInteraction(gainer, loser, influence) {
        const settings = this.getSettings();
        if (!settings.enabled || !Number.isFinite(influence) || influence <= 0) return false;
        if (this.shouldIgnorePair(gainer, loser, settings)) return false;
        const gainPair = this.recordPairEvent(gainer, loser, influence, settings);
        const lossPair = this.recordPairEvent(loser, gainer, influence, settings);
        if (gainPair.events < settings.minPairEvents || lossPair.events < settings.minPairEvents) return false;
        this.applyPressure(gainer, influence, 1, settings);
        this.applyPressure(loser, influence, -1, settings);
        return true;
    }
    onPlayerCellConsumed(consumerPlayer, preyPlayer, preyCell) {
        const settings = this.getSettings();
        if (!settings.enabled || settings.playerEatWeight <= 0) return false;
        const mass = this.getCellMass(preyCell);
        if (mass <= 0) return false;
        return this.registerInteraction(consumerPlayer, preyPlayer, mass * settings.playerEatWeight);
    }
    onEjectedMassConsumed(consumerPlayer, sourcePlayer, ejectCell) {
        const settings = this.getSettings();
        if (!settings.enabled || settings.ejectWeight <= 0 || !ejectCell) return false;
        if (ejectCell.antiTeamConsumed) return false;
        if (typeof ejectCell.antiTeamSourceTick !== "number") return false;
        if ((this.server.ticks - ejectCell.antiTeamSourceTick) > settings.ejectWindowTicks) return false;
        const mass = this.getCellMass(ejectCell);
        if (mass <= 0) return false;
        const influence = mass * (Math.log(Math.max(mass, 1.000001)) / Math.sqrt(mass)) * 2 * settings.ejectWeight;
        ejectCell.antiTeamConsumed = true;
        return this.registerInteraction(consumerPlayer, sourcePlayer, influence);
    }
    onVirusConsumed(player) {
        const settings = this.getSettings();
        if (!settings.enabled || settings.virusBurstMultiplier <= 1 || !this.canApplyToPlayer(player, settings)) return false;
        const state = this.ensurePlayerState(player);
        if (!state || state.decayMult < settings.virusBurstThreshold) return false;
        state.loss *= settings.virusBurstMultiplier;
        state.gain *= settings.virusBurstMultiplier;
        const div = this.getAntiMultiplier(player, settings);
        state.decayMult = div > 1 ? div : 1;
        return true;
    }
    tickPlayer(player) {
        const state = this.ensurePlayerState(player);
        if (!state) return;
        const settings = this.getSettings();
        if (!settings.enabled || !this.canApplyToPlayer(player, settings) || !player.cells?.length) {
            this.resetPlayer(player);
            return;
        }
        state.loss *= settings.stateDecayPerTick;
        state.gain *= settings.stateDecayPerTick;
        if (state.loss < 0.001) state.loss = 0;
        if (state.gain < 0.001) state.gain = 0;
        this.prunePairs(player, settings);
        const div = this.getAntiMultiplier(player, settings);
        state.decayMult = div > 1 ? div : 1;
    }
    getPerSecondDecayFactor(player, rate, decayMod = 1) {
        if (!rate) return 1;
        const baseTickDecay = Math.max(0, 1 - (rate * decayMod / 25));
        const settings = this.getSettings();
        if (!settings.enabled || !this.canApplyToPlayer(player, settings)) {
            return Math.pow(baseTickDecay, 25);
        }
        const state = this.ensurePlayerState(player);
        const decayMult = state?.decayMult > 1 ? state.decayMult : 1;
        const teamMult = (decayMult - 1) / settings.decayScale + 1;
        const adjustedTickDecay = Math.max(0, baseTickDecay / teamMult);
        return Math.pow(adjustedTickDecay, 25);
    }
}

module.exports = AntiTeam;
