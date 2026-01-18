const API_URL = '/api/members';

// Tải danh sách thành viên khi web vừa mở
document.addEventListener('DOMContentLoaded', loadMembers);

async function loadMembers() {
    try {
        const res = await fetch(API_URL);
        const members = await res.json();
        
        if (members.length === 0) console.log("Database trống!");

        // 1. Hiển thị danh sách trước (để đảm bảo nhìn thấy dữ liệu dù cây bị lỗi)
        renderMemberList(members);
        
        // 2. Sau đó mới vẽ cây
        if (typeof drawTree === 'function') drawTree(members);
        
        updateSelectOptions(members);
    } catch (err) {
        console.error('Lỗi tải dữ liệu:', err);
    }
}

// Cập nhật danh sách chọn Cha/Mẹ trong Modal
function updateSelectOptions(members) {
    const fidSelect = document.getElementById('m-fid');
    const midSelect = document.getElementById('m-mid');
    
    // Giữ lại option đầu tiên (Chọn Cha/Mẹ)
    fidSelect.innerHTML = '<option value="">Chọn Cha</option>';
    midSelect.innerHTML = '<option value="">Chọn Mẹ</option>';

    members.forEach(m => {
        const option = `<option value="${m.id}">${m.full_name}</option>`;
        if (m.gender === 'Nam') fidSelect.innerHTML += option;
        else midSelect.innerHTML += option;
    });
}

// Hiển thị danh sách thành viên dạng list
function renderMemberList(members) {
    const container = document.getElementById('memberList');
    if (!container) return;

    if (members.length > 0) {
        container.style.display = 'block';
        container.innerHTML = `<h3>Danh sách (${members.length})</h3>` + 
            members.map(m => `
                <div class="member-item">
                    <strong>${m.full_name}</strong> - Đời: ${m.generation}
                </div>
            `).join('');
    }
}

// Các hàm xử lý Modal
function openModal() { document.getElementById('member-modal').style.display = 'block'; }
function closeModal() { document.getElementById('member-modal').style.display = 'none'; }

// Lưu thành viên mới
async function saveMember() {
    const data = {
        full_name: document.getElementById('m-name').value,
        gender: document.getElementById('m-gender').value,
        fid: document.getElementById('m-fid').value || null,
        mid: document.getElementById('m-mid').value || null
    };

    if (!data.full_name) return alert("Vui lòng nhập tên!");

    await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    });

    closeModal();
    loadMembers(); // Tải lại cây
}

// Upload file
async function uploadFile(input) {
    const file = input.files[0];
    if (!file) return;
    const formData = new FormData();
    formData.append('file', file);
    await fetch('/api/import', { method: 'POST', body: formData });
    alert("Import thành công!");
    loadMembers();
}