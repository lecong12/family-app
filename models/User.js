const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true }, // Lưu ý: Thực tế nên mã hóa password (bcrypt)
    role: { type: String, default: 'user' }
});

// --- FIX: Kiểm tra model tồn tại để tránh lỗi OverwriteModelError ---
module.exports = mongoose.models.User || mongoose.model('User', userSchema);