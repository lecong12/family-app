const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true }, // Lưu ý: Thực tế nên mã hóa password (bcrypt)
    role: { type: String, default: 'user' }
});


// --- QUAN TRỌNG: Xóa model cũ để nạp lại Schema mới ---
if (mongoose.models && mongoose.models.User) delete mongoose.models.User;
module.exports = mongoose.model('User', userSchema);