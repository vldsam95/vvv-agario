const Cell = require('./Cell');
class PlayerCell extends Cell {
    constructor(server, owner, position, size) {
        super(server, owner, position, size);
        this.type = 0;
        this._canRemerge = false;
    }
    canEat(cell) {
        return true;
    }
    getSpeed(dist) {
        const speedBase = this.server.config.playerSpeedBase ?? 2.2;
        const speedExponent = this.server.config.playerSpeedExponent ?? -0.45;
        let speed = speedBase * Math.pow(this.radius, speedExponent) * 40;
        speed *= this.server.config.playerSpeed;
        speed = Math.min(dist, speed);
        if (dist != 0) speed /= dist;
        return speed;
    }
    onAdd(server) {
        this.color = this.owner.color;
        this.owner.cells.push(this);
        this.owner.notifyOwnedCellAdded?.(this);
        this.server.nodesPlayer.unshift(this);
        server.mode.onCellAdd(this);
    }
    onRemove(server) {
        this.owner.cells.removeUnsorted(this);
        this.server.nodesPlayer.removeUnsorted(this);
        this.owner.disposeRestartOrphan?.();

        server.mode.onCellRemove(this);
    }
}

module.exports = PlayerCell;
