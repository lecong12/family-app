const http = require('http');
const fs = require('fs');
const path = require('path');

const server = http.createServer((req, res) => {
    console.log(`Yêu cầu: ${req.url}`); // Theo dõi yêu cầu trong Terminal

    // 1. XỬ LÝ API (Nếu bạn có gọi dữ liệu từ Database)
    if (req.url.startsWith('/api')) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ message: "Dữ liệu API sẽ được xử lý ở đây" }));
        return;
    }

    // 2. XỬ LÝ TỆP TĨNH (HTML, CSS, JS)
    // Xác định đường dẫn file trong thư mục 'public'
    let filePath = req.url === '/' 
        ? path.join(__dirname, '../public/index.html') 
        : path.join(__dirname, '../public', req.url);

    // Xác định loại tệp
    const extname = path.extname(filePath);
    let contentType = 'text/html';
    
    const mimeTypes = {
        '.css': 'text/css',
        '.js': 'text/javascript',
        '.png': 'image/png',
        '.jpg': 'image/jpg',
        '.json': 'application/json'
    };
    contentType = mimeTypes[extname] || 'text/html';

    // Đọc file và gửi về trình duyệt
    fs.readFile(filePath, (err, content) => {
        if (err) {
            if (err.code === 'ENOENT') {
                console.error(`Không tìm thấy: ${filePath}`);
                res.writeHead(404);
                res.end('404: Khong tim thay tep!');
            } else {
                res.writeHead(500);
                res.end(`Loi hệ thống: ${err.code}`);
            }
        } else {
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(content, 'utf-8');
        }
    });
});

const PORT = 3000;
server.listen(PORT, () => {
    console.log(`🚀 Server đang chạy tại http://localhost:${PORT}`);
});
