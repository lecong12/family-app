// c:\Users\129\family-app\models\Member.js
const mongoose = require('mongoose');

const memberSchema = new mongoose.Schema({
    id: { type: String, required: true, unique: true },
    full_name: { type: String, required: true },
    gender: { type: String, enum: ['Nam', 'Nữ'], default: 'Nam' },
    birth_date: String,
    death_date: String,
    is_live: { type: Boolean, default: true },
    fid: String, // ID Cha
    mid: String, // ID Mẹ
    pid: String, // ID Vợ/Chồng
    generation: Number, // Đời thứ mấy
    order: Number,      // Thứ tự trong gia đình
    branch: String,     // Chi/Phái
    description: String,
    images: [String]
}, { timestamps: true });

// --- FIX: Kiểm tra xem Model đã tồn tại chưa để tránh lỗi OverwriteModelError khi deploy ---
module.exports = mongoose.models.Member || mongoose.model('Member', memberSchema);
