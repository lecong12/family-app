require('dotenv').config();
const express = require('express');
const path = require('path');
const mongoose = require('mongoose'); // Thêm để kiểm tra trạng thái DB
const cors = require('cors'); // Thêm CORS để tránh lỗi kết nối từ trình duyệt

// Cấu hình kết nối Database trực tiếp (Bỏ qua file config cũ để tránh nhầm lẫn)
const connectDB = async () => {
    // Ưu tiên lấy từ .env, nếu không có thì dùng chuỗi mặc định trỏ vào 'family-app'
    const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://lecong12:Lecong78@cluster0.onrzjrx.mongodb.net/family-app?retryWrites=true&w=majority';
    console.log(`🔌 Đang kết nối tới Database...`);
    try { await mongoose.connect(MONGO_URI); console.log('✅ MongoDB Connected'); }
    catch (e) { console.error('❌ Lỗi kết nối DB:', e.message); process.exit(1); }
};

// Nạp Router an toàn (Tránh crash nếu thiếu file)
let apiRouter, authRouter;
try {
    apiRouter = require('./routes/api');
} catch (error) {
    console.error('❌ Lỗi nạp API Router:', error);
}

try {
    authRouter = require('./routes/auth');
} catch (error) {
    console.error('❌ Lỗi nạp Auth Router:', error);
}

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware xử lý JSON (quan trọng cho Login)
app.use(express.json());
app.use(cors()); // Kích hoạt CORS

const publicPath = path.resolve(__dirname, 'public');
console.log('📂 Đang phục vụ file tĩnh từ:', publicPath); // Log đường dẫn để debug
// Phục vụ file tĩnh chuẩn xác
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
        mongo_uri_configured: !!process.env.MONGO_URI,
        port: PORT
    });
});

// 4. API Routes
if (authRouter) app.use('/api/auth', authRouter);
if (apiRouter) app.use('/api', apiRouter);

// 404 Handler cho API: Trả về JSON thay vì HTML nếu gọi sai đường dẫn API
app.use('/api/*', (req, res) => {
    res.status(404).json({ error: 'API Route not found', path: req.originalUrl });
});

// 1. Khởi động Server NGAY LẬP TỨC (Để Render không bị timeout)
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server đang chạy tại cổng ${PORT}`);
    
    // 2. Sau đó mới thực hiện kết nối Database
    if (!process.env.MONGO_URI) {
        console.warn('⚠️ CẢNH BÁO: Chưa tìm thấy biến MONGO_URI. Server có thể không kết nối được DB trên Cloud.');
    } else {
        console.log('✅ Tìm thấy biến môi trường MONGO_URI');
    }
    connectDB();
});

// Bắt các lỗi không mong muốn để tránh sập server
process.on('uncaughtException', (err) => {
    console.error('❌ Lỗi không mong muốn (Uncaught Exception):', err);
    process.exit(1); // Thoát tiến trình để môi trường (Render) tự khởi động lại
});

// Bắt các Promise bị từ chối nhưng không được xử lý
process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Lỗi không được xử lý (Unhandled Rejection):', reason);
  process.exit(1); // Thoát tiến trình
});