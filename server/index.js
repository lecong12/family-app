const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const apiRouter = require('./router/api');

const app = express();
const PORT = process.env.PORT || 3000;

// Đường dẫn tuyệt đối đến thư mục public
const publicPath = path.resolve(__dirname, '../public');

// 1. Kết nối MongoDB
// Lưu ý: Đảm bảo MongoDB đang chạy. Nếu dùng Atlas, hãy thay chuỗi kết nối.
// VÍ DỤ ATLAS: 'mongodb+srv://user:pass@cluster0.example.mongodb.net/ten_database'
// VÍ DỤ LOCAL: 'mongodb://127.0.0.1:27017/ten_database_cua_ban'
// Thay 'family-tree' bằng tên database chứa dữ liệu cũ của bạn (ví dụ: 'GiaPha', 'MyFamily'...)
const MONGO_URI = 'mongodb://127.0.0.1:27017/family-tree';
mongoose.connect(MONGO_URI)
    .then(() => console.log('✅ Đã kết nối MongoDB'))
    .catch(err => console.error('❌ Lỗi kết nối MongoDB:', err));

// 2. Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 3. Phục vụ file tĩnh (CSS, JS, Images)
console.log('📂 Đang phục vụ file tĩnh từ:', publicPath);
app.use(express.static(publicPath));

// Fallback: Hỗ trợ nếu file css/js nằm trực tiếp trong public nhưng HTML gọi /css/ hoặc /js/
app.use('/css', express.static(publicPath));
app.use('/js', express.static(publicPath));

// 4. API Routes (Import từ api.js)
app.use('/api', apiRouter);

app.listen(PORT, () => {
    console.log(`🚀 Server đang chạy tại http://localhost:${PORT}`);
});
