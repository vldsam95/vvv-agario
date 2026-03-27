const BinaryWriter = require("./BinaryWriter");

class DualControlState {
    constructor(player, enabled, activeNodeIds, inactiveNodeIds) {
        this.player = player;
        this.enabled = !!enabled;
        this.activeNodeIds = Array.isArray(activeNodeIds) ? activeNodeIds : [];
        this.inactiveNodeIds = Array.isArray(inactiveNodeIds) ? inactiveNodeIds : [];
    }
    build(protocol) {
        if (!protocol || !this.player) return null;
        const scrambleId = this.player.scrambleId >>> 0;
        const writer = new BinaryWriter();
        writer.writeUInt8(0x72); // Packet ID
        writer.writeUInt8(this.enabled ? 0x01 : 0x00); // Flags
        writer.writeUInt16(this.activeNodeIds.length >>> 0);
        for (const nodeId of this.activeNodeIds) {
            writer.writeUInt32(((nodeId >>> 0) ^ scrambleId) >>> 0);
        }
        writer.writeUInt16(this.inactiveNodeIds.length >>> 0);
        for (const nodeId of this.inactiveNodeIds) {
            writer.writeUInt32(((nodeId >>> 0) ^ scrambleId) >>> 0);
        }
        return writer.toBuffer();
    }
}

module.exports = DualControlState;
