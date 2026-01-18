const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// Tự động tạo thư mục uploads để tránh lỗi khi deploy
const uploadDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);

mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/family_db')
    .then(() => console.log("✅ Kết nối DB thành công"))
    .catch(err => console.error("❌ Lỗi DB:", err));

app.use('/api', require('./router/api'));

// Đảm bảo truy cập trang chủ sẽ trả về file index.html
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Chạy tại http://localhost:${PORT}`));