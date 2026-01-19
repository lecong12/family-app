const mongoose = require('mongoose');

const memberSchema = new mongoose.Schema({
    id: { type: String, required: true }, // ID từ Excel (ví dụ: 1, 2, 3...)
    full_name: { type: String, required: true },
    gender: { type: String, enum: ['Nam', 'Nữ'], default: 'Nam' },
    // Dùng String cho fid, mid, pid để khớp với Excel khi import
    fid: { type: String, default: null },
    mid: { type: String, default: null },
    pid: { type: String, default: null },
    
    // Các trường bổ sung để khớp với dữ liệu thực tế
    generation: { type: Number, default: 1 },
    order: { type: Number, default: 1 },
    branch: { type: String, default: 'Gốc' },
    is_live: { type: Boolean, default: true }, // Sẽ nhận 0/1 từ logic import
    birth_date: { type: String, default: "" },
    death_date: { type: String, default: "" },
    address: { type: String, default: "" },
    notes: { type: String, default: "" },

    // Quan hệ kiểu MongoDB để vẽ cây (Array)
    parent_id: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Member' }],
    spouse_id: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Member' }]
}, { timestamps: true });

module.exports = mongoose.model('Member', memberSchema);
