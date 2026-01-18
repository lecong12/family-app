const API_URL = '/api/members';

document.addEventListener('DOMContentLoaded', loadMembers);

async function loadMembers() {
    const container = document.getElementById('members-container');
    if (!container) return;

    try {
        const res = await fetch(API_URL);
        const members = await res.json();
        
        if (!members || members.length === 0) {
            container.innerHTML = '<p style="padding:10px;">Chưa có dữ liệu thành viên.</p>';
            return;
        }

        // Cập nhật số lượng
        const countEl = document.getElementById('member-count');
        if (countEl) countEl.innerText = members.length;

        // Vẽ biểu đồ cây (gọi hàm từ renderer.js)
        if (typeof drawTree === 'function') {
            drawTree(members);
        }

        // Tạo danh sách hiển thị
        let html = '';
        members.forEach(m => {
            // Tìm tên cha dựa trên fid
            const father = members.find(f => f._id === m.fid || f.id === m.fid);
            const fatherName = father ? father.full_name : '---';

            html += `
                <div class="member-item">
                    <span>${m.full_name || 'Không tên'}</span>
                    <span>${m.gender || '---'}</span>
                    <span>${m.generation || '---'}</span>
                    <span>${fatherName}</span>
                    <span>${m.branch || '---'}</span>
                </div>
            `;
        });

        container.innerHTML = html;

    } catch (err) {
        container.innerHTML = '<p style="color:red; padding:10px;">Lỗi kết nối Server.</p>';
    }
}

// Các hàm đóng/mở Modal giữ nguyên để bạn sử dụng sau
function openModal() { document.getElementById('member-modal').style.display = 'block'; }
function closeModal() { document.getElementById('member-modal').style.display = 'none'; }

// Hàm xử lý upload file (được gọi từ onchange của input file trong HTML)
async function uploadFile(input) {
    if (!input.files || !input.files[0]) return;

    const formData = new FormData();
    formData.append('file', input.files[0]);

    try {
        const res = await fetch('/api/import', {
            method: 'POST',
            body: formData
        });
        const data = await res.json();
        alert(data.message || 'Import hoàn tất');
        loadMembers(); // Tải lại dữ liệu và vẽ lại cây sau khi import
    } catch (err) {
        alert('Lỗi khi import: ' + err.message);
    } finally {
        input.value = ''; // Reset input để có thể chọn lại cùng 1 file
    }
}
