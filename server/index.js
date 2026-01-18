const http = require('http');
const fs = require('fs');
const path = require('path');

const server = http.createServer((req, res) => {
    // 1. Xác định đường dẫn file thực tế
    // Nếu yêu cầu là '/', ta phục vụ file index.html
    let filePath = req.url === '/' 
        ? path.join(__dirname, '../public/index.html') 
        : path.join(__dirname, '../public', req.url);

    // 2. Kiểm tra đuôi file để đặt Content-Type phù hợp
    const extname = path.extname(filePath);
    let contentType = 'text/html';
    
    if (extname === '.css') contentType = 'text/css';
    if (extname === '.js') contentType = 'text/javascript';

    // 3. Đọc file và gửi về trình duyệt
    fs.readFile(filePath, (err, content) => {
        if (err) {
            if (err.code === 'ENOENT') {
                res.writeHead(404);
                res.end('Không tìm thấy file!');
            } else {
                res.writeHead(500);
                res.end('Lỗi server: ' + err.code);
            }
        } else {
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(content, 'utf-8');
        }
    });
});

const PORT = 3000;
server.listen(PORT, () => {
    console.log(`🚀 Server Node.js thuần đang chạy tại http://localhost:${PORT}`);
});
