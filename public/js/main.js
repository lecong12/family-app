// Biến toàn cục lưu danh sách thành viên
let allMembers = [];
let chartInstances = {};

// Biến trạng thái để biết đang Thêm hay Sửa
let currentEditingId = null;

// 1. Khởi tạo khi trang tải xong
document.addEventListener('DOMContentLoaded', () => {
    const token = localStorage.getItem('token');
    if (!token) {
        window.location.href = '/login.html';
        return;
    }
    
    // Khởi tạo các ô tìm kiếm thông minh và cấu trúc form
    initSmartSelects();
    
    // Khởi tạo giao diện tab
    initTabs();

    // Tải dữ liệu và render tab mặc định (Dashboard)
    loadAndRenderAll();
});

// 2. Hàm tải dữ liệu từ Server
async function loadMembers() {
    try {
        const token = localStorage.getItem('token');
        const res = await fetch('/api/members', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        // Kiểm tra nếu server trả về HTML (lỗi 404/500) thay vì JSON
        const contentType = res.headers.get("content-type");
        if (!contentType || !contentType.includes("application/json")) {
            const text = await res.text();
            throw new Error("Server lỗi (trả về HTML): " + text.substring(0, 100) + "...");
        }

        if (!res.ok) {
            const errData = await res.json();
            if (res.status === 401) {
                logout(); // Gọi hàm đăng xuất chuẩn
                return;
            }
            throw new Error(errData.error || errData.message || "Lỗi tải dữ liệu từ server");
        }

        allMembers = await res.json();
        
        // Lưu dữ liệu vào Cache để lần sau refresh không bị mất
        localStorage.setItem('familyData', JSON.stringify(allMembers));
        
        renderData(allMembers);

    } catch (err) {
        console.error('Lỗi tải dữ liệu:', err);
        alert('⚠️ Hệ thống báo lỗi: ' + err.message); // Hiển thị lỗi cho người dùng thấy
    }
}

async function loadAndRenderAll() {
    await loadMembers();
    // Render tab mặc định (Dashboard) sau khi có dữ liệu
    renderDashboardTab();
}

function initTabs() {
    const tabButtons = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');

    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            // Tắt active cho tất cả
            tabButtons.forEach(btn => btn.classList.remove('active'));
            tabContents.forEach(content => content.classList.remove('active'));

            // Kích hoạt tab được click
            button.classList.add('active');
            const targetId = button.dataset.target;
            const targetContent = document.querySelector(targetId);
            if (targetContent) {
                targetContent.classList.add('active');
            }

            // Render nội dung cho tab tương ứng
            switch(targetId) {
                case '#dashboard-tab':
                    renderDashboardTab();
                    break;
                case '#tree-tab':
                    renderTreeTab();
                    break;
                case '#members-tab':
                    renderMembersTab();
                    break;
                case '#posts-tab':
                    renderPostsTab();
                    break;
                case '#settings-tab':
                    renderSettingsTab();
                    break;
            }
        });
    });
}

// Hàm render dữ liệu chung (khi dữ liệu thay đổi)
function renderData(members) {
    // Sau khi có dữ liệu, cập nhật lại tab đang active
    const activeTab = document.querySelector('.tab-content.active');
    if (!activeTab) {
        renderDashboardTab(); // Mặc định render dashboard
        return;
    }
    
    switch(activeTab.id) {
        case 'dashboard-tab': renderDashboardTab(); break;
        case 'tree-tab': renderTreeTab(); break;
        case 'members-tab': renderMembersTab(); break;
        case 'posts-tab': renderPostsTab(); break;
        case 'settings-tab': renderSettingsTab(); break;
    }
}

function renderTreeTab() {
    const treeContainer = document.querySelector('#tree-tab #tree-canvas');
    if (!treeContainer) return;
    
    // Luôn vẽ lại cây để đảm bảo dữ liệu mới nhất (renderer.js đã tạo SVG sẵn nên không check rỗng)
    if (typeof drawTree === 'function') {
        drawTree(allMembers);
    }
    // Cập nhật ô tìm kiếm của cây
    const searchInput = document.getElementById('tree-search-input');
    const searchResults = document.getElementById('tree-search-results');
    if (searchInput) {
        searchInput.onkeyup = () => handleTreeSearch(searchInput, searchResults);
    }
}

function renderMembersTab() {
    renderMemberList(allMembers);
    const searchInput = document.getElementById('member-search-input');
    if(searchInput) {
        searchInput.onkeyup = () => {
            const query = searchInput.value.toLowerCase();
            const filteredMembers = allMembers.filter(m => m.full_name.toLowerCase().includes(query));
            renderMemberList(filteredMembers);
        };
    }
}

// Hàm Đăng xuất: Xóa Token và Xóa Dữ liệu Cache
function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('familyData'); // Xóa sạch dữ liệu gia phả đã lưu
    window.location.href = '/login.html';
}

// 3. Render danh sách thành viên (Sidebar)
function renderMemberList(members) {
    const container = document.getElementById('membersGrid');
    if (!container) return;
    
    container.innerHTML = ''; // Xóa danh sách cũ trước khi render lại
    
    members.forEach(m => {
        // Tạo thẻ div thay vì chuỗi HTML để dễ gắn sự kiện onclick
        const card = document.createElement('div');
        card.className = 'member-card';
        card.innerHTML = `<h4>${m.full_name}</h4><p>Đời: ${m.generation} | ${m.gender}</p>`;
        
        // Thêm sự kiện click để zoom đến người đó trên cây
        card.onclick = () => { 
            openEditModal(m.id);
        };
        
        container.appendChild(card);
    });
}

// 5. Các hàm Modal (Tách riêng Thêm/Sửa và Import)

// Mở modal Thêm mới
function openAddModal() {
    currentEditingId = null; // Đặt lại trạng thái: đang thêm mới
    document.getElementById('modal-title').innerText = "Thêm thành viên mới";
    
    // Dọn dẹp form
    document.getElementById('m-name').value = '';
    document.getElementById('m-gender').value = 'Nam';
    
    ['m-fid', 'm-mid', 'm-pid'].forEach(id => {
        document.getElementById(id).value = ''; // Hidden input
        document.getElementById(id + '-search').value = ''; // Search input
    });

    // Ẩn nút Xóa khi ở chế độ Thêm mới
    document.getElementById('btn-delete-member').style.display = 'none';
    
    document.getElementById('add-member-modal').style.display = 'block';
}

// Mở modal Sửa (Được gọi khi click vào node)
window.openEditModal = function(memberId) {
    const member = allMembers.find(m => m.id == memberId);
    if (!member) {
        console.error("Không tìm thấy thành viên với ID:", memberId);
        return;
    }

    currentEditingId = memberId; // Đặt trạng thái: đang sửa
    document.getElementById('modal-title').innerText = "Sửa thông tin thành viên";

    // Điền dữ liệu cơ bản
    document.getElementById('m-name').value = member.full_name;
    document.getElementById('m-gender').value = member.gender;
    
    // Cải tiến: Tìm vợ/chồng 2 chiều để điền vào form
    let spouseId = member.pid;
    if (!spouseId) {
        // Tìm xem có ai khác coi người này là vợ/chồng không
        const spouse = allMembers.find(p => String(p.pid) === String(memberId));
        if (spouse) {
            spouseId = spouse.id;
        }
    }

    // Điền dữ liệu cho các ô tìm kiếm thông minh
    const relations = {
        'm-fid': member.fid,
        'm-mid': member.mid,
        'm-pid': spouseId // Sử dụng spouseId đã tìm được
    };
    for (const id in relations) {
        const relatedId = relations[id];
        document.getElementById(id).value = relatedId || ''; // Set hidden input
        const relatedMember = allMembers.find(m => String(m.id) === String(relatedId));
        document.getElementById(id + '-search').value = relatedMember ? relatedMember.full_name : ''; // Set search input
    }

    // Hiển thị nút Xóa khi ở chế độ Sửa
    document.getElementById('btn-delete-member').style.display = 'inline-block';

    document.getElementById('add-member-modal').style.display = 'block';
}

// Đóng tất cả modal
function closeModal() {
    const addModal = document.getElementById('add-member-modal');
    
    if (addModal) addModal.style.display = 'none';
    
    // Reset trạng thái sửa về null
    currentEditingId = null;
}

function updateSmartSelectOptions() {
    // Hàm này sẽ được gọi khi allMembers thay đổi để cập nhật lại dữ liệu cho các smart select
    // Hiện tại, logic lọc đã nằm trong event listener của searchInput, nên không cần làm gì nhiều ở đây.
    // Tuy nhiên, nếu có các trường hợp cần cập nhật lại danh sách hiển thị mà không cần gõ,
    // thì logic sẽ được thêm vào đây.
    // Ví dụ: khi chọn Cha, danh sách Mẹ sẽ tự động lọc lại mà không cần gõ lại.
    // Điều này đã được xử lý trong event listener của searchInput cho m-mid.
}

function initSmartSelects() {
    const modalContent = document.querySelector('#add-member-modal .modal-content');
    if (!modalContent || modalContent.dataset.smartInit === 'true') return;

    const configs = [
        { id: 'm-name', type: 'text' }, // Giữ nguyên input text
        { id: 'm-gender', type: 'select' }, // Giữ nguyên select
        { id: 'm-fid', type: 'smart-select', filter: (m) => m.gender === 'Nam', placeholder: 'Gõ để tìm kiếm Cha...' },
        { id: 'm-mid', type: 'smart-select', filter: (m) => m.gender === 'Nữ', placeholder: 'Gõ để tìm kiếm Mẹ...' },
        { id: 'm-pid', type: 'smart-select', filter: () => true, placeholder: 'Gõ để tìm kiếm Vợ/Chồng...' },
    ];

    configs.forEach(({ id, type, filter, placeholder }) => {
        const originalEl = document.getElementById(id);
        if (!originalEl) return;

        // Tìm nhãn (label) đã có sẵn trong HTML
        const labelEl = modalContent.querySelector(`label[for="${id}"]`);

        // Tạo một div mới để nhóm label và input/smart-select
        const group = document.createElement('div');
        group.className = 'form-group';

        // Chèn group vào trước label hoặc input gốc
        const referenceNode = labelEl || originalEl;
        referenceNode.parentElement.insertBefore(group, referenceNode);

        // Di chuyển label đã có vào trong group
        if (labelEl) {
            group.appendChild(labelEl);
        }

        if (type === 'smart-select') {
            const wrapper = document.createElement('div');
            wrapper.className = 'smart-select-wrapper';

            const searchInput = document.createElement('input');
            searchInput.type = 'text';
            searchInput.id = id + '-search';
            searchInput.placeholder = placeholder || 'Gõ để tìm kiếm...';
            searchInput.autocomplete = 'off';

            const resultsDiv = document.createElement('div');
            resultsDiv.className = 'smart-select-results';

            const hiddenInput = document.createElement('input');
            hiddenInput.type = 'hidden';
            hiddenInput.id = id; // Giữ ID gốc cho input ẩn

            wrapper.appendChild(searchInput);
            wrapper.appendChild(resultsDiv);
            group.appendChild(wrapper);
            group.appendChild(hiddenInput);

            // Cập nhật lại thuộc tính 'for' của label để trỏ đúng vào ô tìm kiếm mới
            if (labelEl) {
                labelEl.setAttribute('for', id + '-search');
            }

            // Xóa thẻ <select> gốc đi
            originalEl.remove();

            // Logic tìm kiếm
            searchInput.addEventListener('input', () => {
                const query = searchInput.value.toLowerCase();
                resultsDiv.innerHTML = '';
                let dataSource;

                if (id === 'm-pid') { // Logic lọc danh sách Vợ/Chồng
                    const takenIds = new Set();
                    allMembers.forEach(p => {
                        if (p.pid) {
                            takenIds.add(String(p.id));
                            takenIds.add(String(p.pid));
                        }
                    });
                    const currentSpouseId = document.getElementById('m-pid').value;
                    dataSource = allMembers.filter(m => {
                        if (currentEditingId && String(m.id) === String(currentEditingId)) return false;
                        if (currentSpouseId && String(m.id) === String(currentSpouseId)) return true;
                        return !takenIds.has(String(m.id));
                    });
                } else if (id === 'm-mid') { // Logic lọc danh sách Mẹ theo Cha
                    dataSource = allMembers.filter(filter);
                    const fatherId = document.getElementById('m-fid').value;
                    if (fatherId) {
                        const father = allMembers.find(m => String(m.id) === String(fatherId));
                        if (father) {
                            const wifeIds = new Set();
                            allMembers.forEach(p => { if (String(p.pid) === String(fatherId) && p.gender === 'Nữ') wifeIds.add(p.id); });
                            if (father.pid) {
                                const spouse = allMembers.find(p => String(p.id) === String(father.pid));
                                if (spouse && spouse.gender === 'Nữ') wifeIds.add(spouse.id);
                            }
                            dataSource = allMembers.filter(m => wifeIds.has(String(m.id)));
                        }
                    }
                } else { // Các trường hợp khác (Cha)
                    dataSource = allMembers.filter(filter);
                }

                const matched = query ? dataSource.filter(m => m.full_name.toLowerCase().includes(query)) : dataSource;
                matched.slice(0, 10).forEach(member => {
                    const item = document.createElement('div');
                    item.textContent = member.full_name;
                    item.addEventListener('click', () => {
                        searchInput.value = member.full_name;
                        hiddenInput.value = member.id;
                        resultsDiv.style.display = 'none';
                        if (id === 'm-fid') { // Nếu vừa chọn Cha, tự động xóa lựa chọn Mẹ cũ
                            document.getElementById('m-mid-search').value = '';
                            document.getElementById('m-mid').value = '';
                        }
                    });
                    resultsDiv.appendChild(item);
                });
                resultsDiv.style.display = matched.length > 0 ? 'block' : 'none';
            });

            searchInput.addEventListener('focus', () => { if (!searchInput.value) searchInput.dispatchEvent(new Event('input')); });
            searchInput.addEventListener('change', () => { if (searchInput.value === '') hiddenInput.value = ''; });

        } else {
            // Đối với các trường input/select thường, chỉ cần di chuyển chúng vào trong nhóm
            group.appendChild(originalEl);
        }
    });

    // Đóng danh sách kết quả tìm kiếm khi click ra ngoài
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.smart-select-wrapper')) {
            document.querySelectorAll('.smart-select-results').forEach(div => div.style.display = 'none');
        }
    });

    modalContent.dataset.smartInit = 'true';
}

async function saveMember() {
    const nameInput = document.getElementById('m-name');
    const genderInput = document.getElementById('m-gender');
    const fidInput = document.getElementById('m-fid');
    const midInput = document.getElementById('m-mid');
    const pidInput = document.getElementById('m-pid'); // Thêm input cho Vợ/Chồng

    // Validate cơ bản
    if (!nameInput || !nameInput.value.trim()) { alert("Vui lòng nhập họ tên!"); return; }

    // Tự động tính đời (Generation) dựa trên cha/mẹ hoặc vợ/chồng
    let generation = 1;
    const fid = fidInput ? fidInput.value : null;
    const mid = midInput ? midInput.value : null;
    const pid = pidInput ? pidInput.value : null;

    if (fid || mid) {
        const parent = allMembers.find(m => m.id == (fid || mid));
        if (parent) {
            generation = (parent.generation || 0) + 1;
        }
    } else if (pid) {
        // Nếu không có cha mẹ nhưng có vợ/chồng, lấy cùng đời với vợ/chồng
        const spouse = allMembers.find(m => m.id == pid);
        if (spouse) {
            generation = spouse.generation || 1;
        }
    }

    const payload = {
        full_name: nameInput.value.trim(),
        gender: genderInput ? genderInput.value : 'Nam',
        fid: fid,
        mid: mid,
        pid: pid, // Thêm pid vào payload
        generation: generation,
        // Các trường mặc định khác sẽ do Server hoặc Model xử lý
    };

    try {
        const token = localStorage.getItem('token');
        
        // Quyết định URL và Method dựa trên việc đang Thêm hay Sửa
        const url = currentEditingId ? `/api/members/${currentEditingId}` : '/api/members';
        const method = currentEditingId ? 'PUT' : 'POST';

        const res = await fetch(url, {
            method: method,
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}` 
            },
            body: JSON.stringify(payload)
        });

        if (!res.ok) {
            const errData = await res.json();
            throw new Error(errData.message || "Lỗi khi lưu thành viên");
        }

        alert(currentEditingId ? "✅ Cập nhật thành công!" : "✅ Thêm thành viên thành công!");
        
        closeModal();
        loadMembers(); // Tải lại dữ liệu để cập nhật cây
    } catch (err) {
        console.error(err);
        alert("❌ Lỗi: " + err.message);
    }
}

// Hàm xóa thành viên (được gọi từ nút Xóa trong modal)
async function deleteMember() {
    if (!currentEditingId) return;

    const memberToDelete = allMembers.find(m => m.id === currentEditingId);
    if (!memberToDelete) {
        alert("Không tìm thấy thành viên để xóa.");
        return;
    }

    const confirmDelete = confirm(`Bạn có chắc chắn muốn xóa thành viên "${memberToDelete.full_name}" không?\n\nHành động này không thể hoàn tác.`);
    if (!confirmDelete) return;

    try {
        const token = localStorage.getItem('token');
        const res = await fetch(`/api/members/${currentEditingId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.message || "Lỗi từ server");

        alert(`✅ ${data.message}`);
        closeModal();
        loadMembers(); // Tải lại cây gia phả
    } catch (err) {
        console.error("Lỗi xóa thành viên:", err);
        alert(`❌ Lỗi: ${err.message}`);
    }
}

// 6. Hàm đồng bộ Google Sheets
async function syncGoogleSheets() {
    const confirmSync = confirm("Hệ thống sẽ xóa dữ liệu cũ và nạp lại từ Google Sheets.\n\nQuy ước: 0 là Đã mất, 1 hoặc Trống là Còn sống.\n\nBạn có chắc chắn không?");
    if (!confirmSync) return;

    const btn = document.getElementById('btn-sync-sheets');
    const originalText = btn ? btn.innerHTML : '';
    
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = "⌛ Đang xử lý...";
        btn.style.backgroundColor = "#ccc";
    }

    try {
        const token = localStorage.getItem('token');
        const response = await fetch('/api/import-sheets', {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            }
        });
        const result = await response.json();

        if (response.ok) {
            alert("✅ Thành công: " + result.message);
            loadMembers(); // Tải lại cây gia phả
        } else {
            alert("❌ Lỗi: " + (result.message || response.statusText));
        }
    } catch (error) {
        console.error("Sync Error:", error);
        alert("❌ Lỗi kết nối đến Server!");
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = originalText;
            btn.style.backgroundColor = "#f39c12";
        }
    }
}

// --- Chức năng Bài Viết (Posts) ---
let currentPostId = null;

function renderPostsTab() {
    const wrapper = document.getElementById('posts-content-wrapper');
    if (!wrapper) return;
    wrapper.innerHTML = `
        <div class="members-header">
            <h2 style="font-size: 20px; margin: 0;">Bài Viết & Thông Báo</h2>
            <button class="btn-add" onclick="showPostForm()">+ Viết bài mới</button>
        </div>
        <div id="posts-list-container" class="posts-container" style="margin-top: 24px;">Đang tải...</div>
        <!-- Form Thêm/Sửa bài viết (Mặc định ẩn) -->
        <div id="post-form-container" style="display:none; margin-top: 24px;">
            <h3 id="post-form-title">Viết bài mới</h3>
            <div class="form-group"><label>Tiêu đề:</label><input type="text" id="post-title"></div>
            <div class="form-group"><label>Danh mục:</label><select id="post-category"><option value="announcement">📢 Thông báo</option><option value="event">📅 Sự kiện</option><option value="news">📰 Tin tức</option></select></div>
            <div class="form-group"><label>Nội dung:</label><textarea id="post-content" rows="10"></textarea></div>
            <div class="form-group" style="flex-direction: row; gap: 10px; align-items: center;"><input type="checkbox" id="post-pinned" style="width: auto; flex-grow: 0;"><label for="post-pinned" style="flex-basis: auto;">Ghim lên đầu trang</label></div>
            <div class="modal-actions">
                <button class="btn-danger" onclick="hidePostForm()">Hủy</button>
                <button class="btn-primary" onclick="savePost()">Lưu bài viết</button>
            </div>
        </div>
    `;
    loadPosts();
}

async function loadPosts() {
    const container = document.getElementById('posts-list-container');
    try {
        const token = localStorage.getItem('token');
        const res = await fetch('/api/posts', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();

        if (data.success) {
            if (data.posts.length === 0) {
                container.innerHTML = '<p style="text-align:center; color:#666;">Chưa có bài viết nào.</p>';
                return;
            }

            container.innerHTML = data.posts.map(post => {
                const date = new Date(post.created_at).toLocaleDateString('vi-VN');
                const pinnedIcon = post.is_pinned ? '<span class="pinned-icon">📌 Đã ghim</span>' : '';
                const catMap = { 'announcement': 'Thông báo', 'event': 'Sự kiện', 'news': 'Tin tức' };
                const catClass = `cat-${post.category}`;
                
                return `
                <div class="post-card ${post.is_pinned ? 'pinned' : ''}">
                    <div class="post-header">
                        <span class="post-category ${catClass}">${catMap[post.category]}</span>
                        ${pinnedIcon}
                        <span class="post-date">${date} - bởi <b>${post.author ? post.author.username : 'Ẩn danh'}</b></span>
                    </div>
                    <h3 class="post-title">${post.title}</h3>
                    <div class="post-content">${post.content.replace(/\n/g, '<br>')}</div>
                    <div class="post-actions">
                        <button class="btn-small" onclick="editPost('${post._id}')">✏️ Sửa</button>
                        <button class="btn-small btn-delete" onclick="deletePost('${post._id}')">🗑️ Xóa</button>
                    </div>
                </div>`;
            }).join('');
        }
    } catch (err) {
        container.innerHTML = `<p style="color:red;">Lỗi tải bài viết: ${err.message}</p>`;
    }
}

function showPostForm(post = null) {
    document.getElementById('post-form-container').style.display = 'block';
    document.querySelector('#posts-tab .members-header').style.display = 'none'; // Ẩn header
    document.getElementById('posts-list-container').style.display = 'none'; // Ẩn danh sách

    if (post) {
        currentPostId = post._id;
        document.getElementById('post-form-title').innerText = 'Sửa bài viết';
        document.getElementById('post-title').value = post.title;
        document.getElementById('post-content').value = post.content;
        document.getElementById('post-category').value = post.category;
        document.getElementById('post-pinned').checked = post.is_pinned;
    } else {
        currentPostId = null;
        document.getElementById('post-form-title').innerText = 'Viết bài mới';
        document.getElementById('post-title').value = '';
        document.getElementById('post-content').value = '';
        document.getElementById('post-category').value = 'announcement';
        document.getElementById('post-pinned').checked = false;
    }
}

function hidePostForm() {
    document.getElementById('post-form-container').style.display = 'none';
    document.querySelector('#posts-tab .members-header').style.display = 'flex';
    document.getElementById('posts-list-container').style.display = 'block';
}

async function editPost(id) {
    // Cần lấy lại dữ liệu chi tiết hoặc tìm trong DOM, ở đây fetch lại cho chắc
    const token = localStorage.getItem('token');
    const res = await fetch(`/api/posts/${id}`, { headers: { 'Authorization': `Bearer ${token}` } });
    const data = await res.json();
    if (data.success) {
        showPostForm(data.post);
    } else {
        alert(data.message);
    }
}

async function savePost() {
    const title = document.getElementById('post-title').value;
    const content = document.getElementById('post-content').value;
    const category = document.getElementById('post-category').value;
    const is_pinned = document.getElementById('post-pinned').checked;

    const payload = { title, content, category, is_pinned };
    const method = currentPostId ? 'PUT' : 'POST';
    const url = currentPostId ? `/api/posts/${currentPostId}` : '/api/posts';
    const token = localStorage.getItem('token');

    try {
        const res = await fetch(url, {
            method: method,
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (data.success) {
            alert('✅ Lưu thành công!');
            hidePostForm();
            loadPosts();
        } else {
            alert('❌ Lỗi: ' + data.message);
        }
    } catch (err) {
        alert('❌ Lỗi kết nối: ' + err.message);
    }
}

async function deletePost(id) {
    if (!confirm('Bạn có chắc chắn muốn xóa bài viết này?')) return;
    const token = localStorage.getItem('token');
    try {
        const res = await fetch(`/api/posts/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        if (data.success) {
            loadPosts();
        } else {
            alert('❌ ' + data.message);
        }
    } catch (err) {
        alert('❌ Lỗi: ' + err.message);
    }
}

function renderSettingsTab() {
// --- Chức năng Import File từ Máy tính ---

    const wrapper = document.getElementById('settings-content-wrapper');
    if (!wrapper) return;
    wrapper.innerHTML = `
        <div class="settings-card" onclick="syncGoogleSheets()">
            <i class="fas fa-cloud-download-alt" style="color: #3498db;"></i>
            <h3>Đồng bộ Google Sheets</h3>
            <p>Xóa dữ liệu cũ và nạp lại từ Google Sheets.</p>
        </div>
        <div class="settings-card" onclick="openImportModal()">
            <i class="fas fa-file-csv" style="color: #27ae60;"></i>
            <h3>Nhập từ File CSV</h3>
            <p>Thêm hoặc cập nhật thành viên từ file CSV.</p>
        </div>
        <div class="settings-card" onclick="exportToCSV()">
            <i class="fas fa-file-export" style="color: #f39c12;"></i>
            <h3>Xuất ra File CSV</h3>
            <p>Tải xuống toàn bộ dữ liệu gia phả hiện tại.</p>
        </div>
    `;
}

function openImportModal() {
    const modal = document.getElementById('import-modal');
    if (modal) {
        // Reset lại form mỗi khi mở
        document.getElementById('csv-file-input').value = '';
        const statusDiv = document.getElementById('import-status');
        statusDiv.innerHTML = '';
        statusDiv.className = ''; // Xóa các class success/error/info
        
        // Reset hiển thị tên file và nút tải lên
        updateFileName(document.getElementById('csv-file-input'));

        // Reset nút upload
        const uploadBtn = document.getElementById('btn-upload-csv');
        uploadBtn.innerHTML = 'Tải lên & Xử lý';

        modal.style.display = 'block';
    }
}

function updateFileName(input) {
    const fileNameDisplay = document.getElementById('file-name-display');
    const uploadBtn = document.getElementById('btn-upload-csv');
    if (input.files.length > 0) {
        fileNameDisplay.textContent = `Đã chọn: ${input.files[0].name}`;
        fileNameDisplay.style.color = '#0f5132'; // Màu xanh lá cây đậm
        uploadBtn.disabled = false; // Kích hoạt nút tải lên
    } else {
        fileNameDisplay.textContent = 'Chưa có file nào được chọn';
        fileNameDisplay.style.color = '#6c757d'; // Màu xám
        uploadBtn.disabled = true; // Vô hiệu hóa nút
    }
}

async function handleFileUpload() {
    const fileInput = document.getElementById('csv-file-input');
    const statusDiv = document.getElementById('import-status');
    const uploadBtn = document.getElementById('btn-upload-csv');

    if (fileInput.files.length === 0) {
        alert('Vui lòng chọn một file CSV.');
        return;
    }

    const file = fileInput.files[0];
    const formData = new FormData();
    formData.append('csvfile', file); // 'csvfile' phải khớp với tên field trong upload.single() ở backend

    uploadBtn.disabled = true;
    uploadBtn.innerHTML = '⌛ Đang xử lý...';
    statusDiv.className = 'info';
    statusDiv.innerHTML = 'Đang tải file lên và xử lý, vui lòng chờ...';

    try {
        const token = localStorage.getItem('token');
        const response = await fetch('/api/import-csv', {
            method: 'POST',
            headers: {
                // 'Content-Type': 'multipart/form-data' được trình duyệt tự động thêm vào khi dùng FormData
                'Authorization': `Bearer ${token}`
            },
            body: formData
        });

        const result = await response.json();

        if (response.ok) {
            statusDiv.className = 'success';
            statusDiv.innerHTML = result.message.replace(/\n/g, '<br>'); // Thay \n bằng <br> để xuống dòng
            
            const hasWarning = result.message.includes('⚠️');

            if (hasWarning) {
                // Có cảnh báo, giữ modal mở và bật lại nút để thử lại
                uploadBtn.disabled = false;
                uploadBtn.innerHTML = 'Tải lên & Xử lý';
            } else {
                // Thành công không có cảnh báo, tự động đóng sau 2.5 giây
                setTimeout(() => {
                    const modal = document.getElementById('import-modal');
                    if (modal) modal.style.display = 'none';
                }, 2500);
            }

            loadMembers(); // Tải lại toàn bộ dữ liệu gia phả
        } else {
            // Server có thể trả về lỗi dạng { message: ... } hoặc { error: ... }
            throw new Error(result.message || result.error || 'Lỗi không xác định từ server.');
        }

    } catch (error) {
        console.error('Lỗi import file:', error);
        statusDiv.className = 'error';
        statusDiv.innerHTML = `❌ Lỗi: ${error.message}`;
        // Nếu có lỗi, kích hoạt lại nút để người dùng có thể thử lại
        uploadBtn.disabled = false;
        uploadBtn.innerHTML = 'Tải lên & Xử lý';
    }
}

async function exportToCSV() {
    const btn = document.querySelector('#settings-dropdown a[onclick="exportToCSV()"]');
    const originalText = btn.innerHTML;
    btn.innerHTML = '⌛ Đang tạo file...';

    try {
        const token = localStorage.getItem('token');
        const response = await fetch('/api/export-csv', {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (!response.ok) {
            const errData = await response.json();
            throw new Error(errData.message || 'Lỗi khi tạo file CSV');
        }

        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        const date = new Date().toISOString().slice(0, 10);
        a.download = `giapha_export_${date}.csv`;
        
        document.body.appendChild(a);
        a.click();
        
        window.URL.revokeObjectURL(url);
        a.remove();
    } catch (error) {
        console.error('Lỗi xuất CSV:', error);
        alert('❌ Lỗi: ' + error.message);
    } finally {
        btn.innerHTML = originalText;
    }
}

function handleTreeSearch(input, resultsContainer) {
    const filter = input.value.toLowerCase();

    if (!filter) {
        resultsContainer.style.display = 'none';
        return;
    }

    const results = allMembers.filter(m => m.full_name.toLowerCase().includes(filter));

    resultsContainer.innerHTML = '';
    if (results.length > 0) {
        results.slice(0, 5).forEach(member => {
            const div = document.createElement('div');
            div.className = 'search-item';
            div.innerHTML = `${member.full_name} (Đời ${member.generation})`;
            div.onclick = () => {
                if (typeof zoomToNode === 'function') zoomToNode(member.id);
                input.value = '';
                resultsContainer.style.display = 'none';
            };
            resultsContainer.appendChild(div);
        });
        resultsContainer.style.display = 'block';
    } else {
        resultsContainer.style.display = 'none';
    }
}

function renderDashboardTab() {
    const wrapper = document.getElementById('stats-content-wrapper');
    if (!wrapper) return;

    // Chèn HTML dashboard vào
    wrapper.innerHTML = `
        <h2 style="text-align: center; margin-bottom: 20px;">Tổng quan Gia phả</h2>
        <div class="stats-grid">
            <div class="stat-card">
                <div class="stat-icon" style="background: linear-gradient(135deg, #f97316, #fbbf24);">
                    <i class="fa-solid fa-users"></i>
                </div>
                <div class="stat-info">
                    <h3>Tổng Thành Viên</h3>
                    <div class="stat-number" id="totalMembers">0</div>
                </div>
            </div>
            <div class="stat-card">
                <div class="stat-icon" style="background: linear-gradient(135deg, #06b6d4, #0ea5e9);">
                    <i class="fa-solid fa-male"></i>
                </div>
                <div class="stat-info">
                    <h3>Nam</h3>
                    <div class="stat-number" id="maleCount">0</div>
                </div>
            </div>
            <div class="stat-card">
                <div class="stat-icon" style="background: linear-gradient(135deg, #ec4899, #f43f5e);">
                    <i class="fa-solid fa-female"></i>
                </div>
                <div class="stat-info">
                    <h3>Nữ</h3>
                    <div class="stat-number" id="femaleCount">0</div>
                </div>
            </div>
            <div class="stat-card">
                <div class="stat-icon" style="background: linear-gradient(135deg, #10b981, #34d399);">
                    <i class="fa-solid fa-layer-group"></i>
                </div>
                <div class="stat-info">
                    <h3>Số Thế Hệ</h3>
                    <div class="stat-number" id="generationCount">0</div>
                </div>
            </div>
        </div>

        <div class="dashboard-columns">
            <div class="dashboard-col">
                <h3>Phân bố theo Thế hệ</h3>
                <canvas id="chartGen"></canvas>
            </div>
            <div class="dashboard-col">
                <h3>Thành phần Gia tộc</h3>
                <canvas id="chartComp"></canvas>
            </div>
        </div>
        <div class="dashboard-columns">
            <div class="dashboard-col">
                <h3>Sự kiện sắp tới</h3>
                <div id="upcoming-events">
                    <p>Chức năng đang phát triển (Sinh nhật, ngày giỗ...)</p>
                </div>
            </div>
        </div>
    `;

    if (allMembers.length === 0) {
        wrapper.querySelector('.stats-grid').innerHTML = '<p style="text-align: center; grid-column: 1 / -1;">Chưa có dữ liệu để thống kê.</p>';
        return;
    }

    // --- Tính toán ---
    const total = allMembers.length;
    const males = allMembers.filter(m => m.gender === 'Nam').length;
    const females = total - males;
    const spouses = allMembers.filter(m => m.pid && !m.fid && !m.mid).length;
    const coreMembers = total - spouses;

    // Tính toán cho biểu đồ thế hệ
    const genCounts = allMembers.reduce((acc, m) => {
        // Chỉ tính các thế hệ hợp lệ (số dương) để biểu đồ hiển thị đúng thứ tự
        if (m.generation && !isNaN(m.generation) && m.generation > 0) {
            const gen = m.generation;
            acc[gen] = (acc[gen] || 0) + 1;
        }
        return acc;
    }, {});
    // Sắp xếp label theo giá trị số (1, 2, 3... 10, 11) thay vì string (1, 10, 11, 2...)
    const genLabels = Object.keys(genCounts).sort((a, b) => parseInt(a) - parseInt(b));
    const genData = genLabels.map(label => genCounts[label]);

    // --- Cập nhật thẻ ---
    document.getElementById('totalMembers').innerText = total;
    document.getElementById('maleCount').innerText = males;
    document.getElementById('femaleCount').innerText = females;
    document.getElementById('generationCount').innerText = genLabels.length;

    // --- Vẽ biểu đồ ---
    Object.values(chartInstances).forEach(chart => chart.destroy());
    chartInstances = {};
    const chartOptions = { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'top' } } };

    // Biểu đồ Phân bố thế hệ
    const chartGenEl = document.getElementById('chartGen');
    if (chartGenEl) chartInstances.gen = new Chart(chartGenEl, { type: 'bar', data: { labels: genLabels.map(l => `Đời ${l}`), datasets: [{ label: 'Số người', data: genData, backgroundColor: '#ff9f40' }] }, options: { ...chartOptions, plugins: { legend: { display: false } } } });
    
    // Biểu đồ Thành phần
    const chartCompEl = document.getElementById('chartComp');
    if (chartCompEl) chartInstances.comp = new Chart(chartCompEl, { type: 'doughnut', data: { labels: ['Huyết thống', 'Dâu/Rể'], datasets: [{ data: [coreMembers, spouses], backgroundColor: ['#36a2eb', '#ff6384'] }] }, options: chartOptions });
}