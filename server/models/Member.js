const mongoose = require('mongoose');
const memberSchema = new mongoose.Schema({
    id: { type: String, required: true, unique: true },
    full_name: { type: String, required: true },
    gender: { type: String, enum: ['Nam', 'Nữ'], default: 'Nam' },
    fid: { type: String, default: null },
    mid: { type: String, default: null },
    pid: { type: String, default: null },
    generation: { type: Number, default: 1 },
    order: { type: Number, default: 1 },
    branch: { type: String, default: 'Gốc' }
});
module.exports = mongoose.model('Member', memberSchema);
