const Cell = require('./Cell');

class EjectedMass extends Cell {
    constructor(server, owner, position, size) {
        super(server, owner, position, size);
        this.type = 3;
        this.antiTeamSourcePlayer = null;
        this.antiTeamSourceTick = -1;
        this.antiTeamConsumed = false;
    }
    onAdd(server) {
        server.nodesEjected.push(this);
    }
    onRemove(server) {
        server.nodesEjected.removeUnsorted(this);
    }
}

module.exports = EjectedMass;
