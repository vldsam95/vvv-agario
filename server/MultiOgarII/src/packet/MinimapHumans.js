const BinaryWriter = require("./BinaryWriter");

class MinimapHumans {
    constructor(player, entries) {
        this.player = player;
        this.entries = Array.isArray(entries) ? entries : [];
    }
    build(protocol) {
        if (!protocol || !this.player) return null;
        const scrambleX = this.player.scrambleX | 0;
        const scrambleY = this.player.scrambleY | 0;
        const writer = new BinaryWriter();
        writer.writeUInt8(0x73); // Packet ID
        writer.writeUInt16(this.entries.length >>> 0);
        for (const entry of this.entries) {
            const color = entry?.color || {};
            const x = (Number(entry?.x) || 0) + scrambleX;
            const y = (Number(entry?.y) || 0) + scrambleY;
            writer.writeInt32(x >> 0);
            writer.writeInt32(y >> 0);
            writer.writeUInt8(color.r >>> 0);
            writer.writeUInt8(color.g >>> 0);
            writer.writeUInt8(color.b >>> 0);
            writer.writeUInt8((entry?.flags || 0) >>> 0);
        }
        return writer.toBuffer();
    }
}

module.exports = MinimapHumans;
