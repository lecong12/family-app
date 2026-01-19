require('dotenv').config();
const express = require('express');
const path = require('path');
const mongoose = require('mongoose'); // Thêm để kiểm tra trạng thái DB
const connectDB = require('./config/database');

// Nạp Router an toàn (Tránh crash nếu thiếu file)
let apiRouter, authRouter;
try {
    apiRouter = require('./router/api');
} catch (error) {
    console.error('❌ Lỗi nạp API Router:', error.message);
}

try {
    authRouter = require('./router/auth');
} catch (error) {
    console.error('❌ Lỗi nạp Auth Router:', error.message);
}

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware xử lý JSON (quan trọng cho Login)
app.use(express.json());

const publicPath = path.resolve(__dirname, '../public');
// Fallback: Hỗ trợ nếu file css/js nằm trực tiếp trong public nhưng HTML gọi /css/ hoặc /js/
app.use('/css', express.static(publicPath));
app.use('/js', express.static(publicPath));
app.use(express.static(publicPath)); 

// Route gốc: Đảm bảo luôn trả về index.html khi truy cập trang chủ
app.get('/', (req, res) => {
    res.sendFile(path.join(publicPath, 'index.html'));
});

// Health Check: Để Render biết server vẫn đang chạy tốt
app.get('/health', (req, res) => {
    res.status(200).send('OK');
});

// DEBUG: Trang kiểm tra trạng thái hệ thống
app.get('/status', (req, res) => {
    const dbState = mongoose.connection.readyState;
    const states = { 0: 'Disconnected', 1: 'Connected', 2: 'Connecting', 3: 'Disconnecting' };
    
    res.json({
        database: states[dbState] || 'Unknown',
        routers: {
            auth: !!authRouter ? 'OK' : 'FAILED (Check logs)',
            api: !!apiRouter ? 'OK' : 'FAILED (Check logs)'
        },
        mongo_uri_configured: !!process.env.MONGO_URI
    });
});

// 4. API Routes
if (authRouter) app.use('/api/auth', authRouter);
if (apiRouter) app.use('/api', apiRouter);

// 1. Khởi động Server NGAY LẬP TỨC (Để Render không bị timeout)
app.listen(PORT, () => {
    console.log(`🚀 Server đang chạy tại cổng ${PORT}`);
    
    // 2. Sau đó mới thực hiện kết nối Database
    if (!process.env.MONGO_URI) {
        console.warn('⚠️ CẢNH BÁO: Chưa tìm thấy biến MONGO_URI. Server có thể không kết nối được DB trên Cloud.');
    }
    connectDB();
});

// Bắt các lỗi không mong muốn để tránh sập server
process.on('uncaughtException', (err) => {
    console.error('❌ Lỗi không mong muốn (Uncaught Exception):', err);
    // Không exit process để giữ server sống
});
