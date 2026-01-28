
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
    
    // 1. Tạo UI chọn số đời (nếu chưa có)
    const searchInput = document.getElementById('tree-search-input');
    if (searchInput && !document.getElementById('tree-gen-limit')) {
        const select = document.createElement('select');
        select.id = 'tree-gen-limit';
        select.className = 'tree-select'; // Sử dụng class CSS thay vì inline style
        
        const options = [
            {val: 5, text: 'Hiển thị: 5 Đời đầu'},
            {val: 10, text: 'Hiển thị: 10 Đời đầu'},
            {val: 0, text: 'Hiển thị: Tất cả'}
        ];
        
        options.forEach(opt => {
            const o = document.createElement('option');
            o.value = opt.val;
            o.textContent = opt.text;
            select.appendChild(o);
        });
        
        select.value = 5; // Mặc định 5 đời
        select.onchange = () => renderTreeTab(); // Vẽ lại khi thay đổi
        
        searchInput.parentNode.insertBefore(select, searchInput.nextSibling);

        // --- BỔ SUNG: Nút Đặt lại (Reset) ---
        const controls = document.querySelector('.tree-controls');
        if (controls && !document.getElementById('btn-reset-tree')) {
            const resetBtn = document.createElement('button');
            resetBtn.id = 'btn-reset-tree';
            resetBtn.className = 'btn-control';
            resetBtn.innerHTML = '<i class="fas fa-sync-alt"></i> Đặt lại';
            resetBtn.onclick = () => {
                const select = document.getElementById('tree-gen-limit');
                if (select) select.value = 5; // Reset về 5 đời
                renderTreeTab(); // Vẽ lại và tự động zoom chuẩn
            };
            
            // Chèn vào trước nút "Xem toàn bộ"
            const viewAllBtn = controls.querySelector('button[onclick*="zoomToNode"]');
            if (viewAllBtn) controls.insertBefore(resetBtn, viewAllBtn);
            else controls.appendChild(resetBtn);
        }
    }

    // 2. Lọc dữ liệu và Vẽ cây
    const limit = document.getElementById('tree-gen-limit') ? parseInt(document.getElementById('tree-gen-limit').value) : 5;
    const dataToDraw = (limit > 0) ? allMembers.filter(m => (parseInt(m.generation) || 999) <= limit) : allMembers;

    if (typeof drawTree === 'function') {
        drawTree(dataToDraw);
    }
    // Cập nhật ô tìm kiếm của cây
    const searchResults = document.getElementById('tree-search-results');
    if (searchInput) {
        searchInput.onkeyup = () => handleTreeSearch(searchInput, searchResults);
    }
}

function renderMembersTab() {
    // 1. Tạo dropdown lọc nếu chưa có
    const searchInput = document.getElementById('member-search-input');
    if (searchInput) {
        const searchBar = searchInput.closest('.search-bar');
        const header = searchBar ? searchBar.parentElement : null;
        
        if (header && !document.getElementById('member-filter-type')) {
            const select = document.createElement('select');
            select.id = 'member-filter-type';
            // Style trực tiếp để khớp với giao diện
            select.style.padding = '12px 16px';
            select.style.border = '2px solid #e5e7eb';
            select.style.borderRadius = '12px';
            select.style.fontSize = '15px';
            select.style.outline = 'none';
            select.style.cursor = 'pointer';
            select.style.minWidth = '180px';
            select.style.marginRight = '10px';
            
            select.innerHTML = `
                <option value="all">Tất cả thành viên</option>
                <option value="bloodline">🩸 Huyết thống</option>
                <option value="inlaw">💍 Dâu/Rể</option>
            `;
            
            // Chèn vào trước ô tìm kiếm
            header.insertBefore(select, searchBar);

            // --- BỔ SUNG: Nút Tìm kiếm nâng cao ---
            const advBtn = document.createElement('button');
            advBtn.innerHTML = '<i class="fas fa-filter"></i> Tìm nâng cao';
            advBtn.className = 'btn-primary'; // Sử dụng class có sẵn hoặc style trực tiếp
            advBtn.style.marginLeft = '10px';
            advBtn.style.padding = '10px 15px';
            advBtn.style.borderRadius = '8px';
            advBtn.style.cursor = 'pointer';
            advBtn.onclick = openAdvancedSearchModal;
            
            // Chèn vào sau search bar (nằm giữa search bar và nút Thêm thành viên)
            header.insertBefore(advBtn, searchBar.nextSibling);
        }
    }

    // 2. Hàm xử lý lọc kết hợp (Tên + Loại)
    const filterMembers = () => {
        const searchInput = document.getElementById('member-search-input');
        const filterSelect = document.getElementById('member-filter-type');
        
        const query = searchInput ? searchInput.value.toLowerCase() : '';
        const filterType = filterSelect ? filterSelect.value : 'all';
        
        const filteredMembers = allMembers.filter(m => {
            const matchesName = m.full_name.toLowerCase().includes(query);
            
            const isInLaw = !!m.pid && !m.fid && !m.mid;
            let matchesType = true;
            if (filterType === 'bloodline') matchesType = !isInLaw;
            else if (filterType === 'inlaw') matchesType = isInLaw;
            
            return matchesName && matchesType;
        });
        renderMemberList(filteredMembers);
    };

    // 3. Gắn sự kiện
    if (searchInput) searchInput.onkeyup = filterMembers;
    const filterSelect = document.getElementById('member-filter-type');
    if (filterSelect) filterSelect.onchange = filterMembers;

    // 4. Render lần đầu
    filterMembers();
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
    
    // --- Logic sắp xếp nâng cao theo dòng huyết thống ---
    const memberMap = new Map(allMembers.map(m => [String(m.id), m]));
    // Xóa cache sắp xếp cũ trước mỗi lần chạy để đảm bảo tính đúng đắn
    allMembers.forEach(m => delete m._ancestryOrder);

    const getBloodlineAncestryOrder = (member) => {
        if (!member) return [];
        if (member._ancestryOrder) return member._ancestryOrder; // Lấy từ cache nếu đã tính

        let bloodlineMember = member;
        // Nếu là dâu/rể, tìm người phối ngẫu để lấy dòng huyết thống
        if (bloodlineMember.pid && !bloodlineMember.fid && !bloodlineMember.mid) {
            const partner = memberMap.get(String(bloodlineMember.pid));
            if (partner) bloodlineMember = partner;
        }
        
        const getOrderChain = (m) => {
            if (!m) return [];
            if (m._ancestryOrder) return m._ancestryOrder;

            const parentId = m.fid || m.mid;
            const parent = parentId ? memberMap.get(String(parentId)) : null;
            const parentOrderChain = parent ? getOrderChain(parent) : [];
            const ancestryOrder = [...parentOrderChain, parseInt(m.order) || 999];
            
            m._ancestryOrder = ancestryOrder; // Cache lại kết quả
            return ancestryOrder;
        };

        const finalOrderChain = getOrderChain(bloodlineMember);
        member._ancestryOrder = finalOrderChain; // Cache cho cả thành viên gốc (dâu/rể)
        return finalOrderChain;
    };

    const sortedMembers = [...members].sort((a, b) => {
        // Rule 1: Sắp xếp theo Đời (Generation)
        const genA = parseInt(a.generation) || 999;
        const genB = parseInt(b.generation) || 999;
        if (genA !== genB) return genA - genB;

        // Rule 2: Sắp xếp theo "dòng" tổ tiên (con ông anh trước, con ông em sau)
        const ancestryA = getBloodlineAncestryOrder(a);
        const ancestryB = getBloodlineAncestryOrder(b);
        const minLength = Math.min(ancestryA.length, ancestryB.length);
        for (let i = 0; i < minLength; i++) {
            if (ancestryA[i] !== ancestryB[i]) return ancestryA[i] - ancestryB[i];
        }

        // Rule 3: Nếu dòng họ y hệt (vợ/chồng), xếp Nam trước Nữ
        if (a.gender !== b.gender) {
            return a.gender === 'Nam' ? -1 : 1;
        }

        return 0;
    });

    // Đảm bảo container hiển thị dạng Grid
    container.style.display = 'grid';
    container.style.gridTemplateColumns = 'repeat(auto-fill, minmax(300px, 1fr))';
    container.style.gap = '24px';

    sortedMembers.forEach(m => {
        // Logic xác định sinh tử (đồng bộ với Dashboard và Cây gia phả)
        const hasDeathDate = m.death_date && String(m.death_date).trim() !== '' && String(m.death_date).trim() !== '0';
        const isDeadByFlag = m.is_live === 0 || m.is_live === '0' || m.is_live === false || m.is_alive === 0 || m.is_alive === '0' || m.is_alive === false;
        const isDeceased = hasDeathDate || isDeadByFlag;

        // Logic Dâu/Rể (nếu có pid mà không có fid/mid)
        const isInLaw = !!m.pid && !m.fid && !m.mid;

        // Tìm tên vợ/chồng
        let spouseName = '';
        if (m.pid) {
            const spouse = members.find(s => String(s.id) === String(m.pid));
            if (spouse) spouseName = spouse.full_name;
        }

        // Tính tuổi (nếu còn sống và có năm sinh)
        let ageDisplay = '';
        if (!isDeceased && m.birth_date) {
            try {
                // Lấy năm sinh từ chuỗi (hỗ trợ dd/mm/yyyy hoặc yyyy)
                const parts = String(m.birth_date).split(/[\/\-]/);
                let year = 0;
                if (parts.length === 3) year = parts[0].length === 4 ? parseInt(parts[0]) : parseInt(parts[2]);
                else if (parts.length === 1 && parts[0].length === 4) year = parseInt(parts[0]);
                
                if (year > 0) {
                    const currentYear = new Date().getFullYear();
                    const age = currentYear - year;
                    if (age >= 0) ageDisplay = ` (${age} tuổi)`;
                }
            } catch(e) {}
        }

        // Tạo thẻ div thay vì chuỗi HTML để dễ gắn sự kiện onclick
        const card = document.createElement('div');
        card.className = `member-card ${m.gender === 'Nam' ? 'male' : 'female'} ${isDeceased ? 'deceased' : ''}`;
        
        // Branch display
        const branchMap = { '0': 'Tổ', '1': 'Phái Nhất', '2': 'Phái Nhì', '3': 'Phái Ba', '4': 'Phái Bốn' };
        let branchDisplay = branchMap[m.branch] || (m.branch ? `Phái ${m.branch}` : 'Gốc');
        if (m.branch === 'Gốc') branchDisplay = 'Gốc';

        // --- BỔ SUNG LẠI LOGIC BỊ THIẾU ---
        const avatarColor = isDeceased ? '#9ca3af' : (m.gender === 'Nam' ? '#3b82f6' : '#ec4899');
        const nameParts = (m.full_name || '?').trim().split(/\s+/);
        const avatarLetter = nameParts[nameParts.length - 1].charAt(0).toUpperCase();

        card.innerHTML = `
            <div class="member-card-header">
                <div class="member-card-avatar" style="background-color: ${avatarColor};">
                    ${avatarLetter}
                </div>
                <div class="member-card-info">
                    <h4 class="member-card-name">${m.full_name}</h4>
                    <div class="member-card-gender">
                        ${m.gender === 'Nam' ? '<i class="fas fa-mars"></i> Nam' : '<i class="fas fa-venus"></i> Nữ'}
                        ${ageDisplay}
                    </div>
                </div>
                ${isDeceased ? '<i class="fas fa-cross member-card-status-icon" title="Đã mất"></i>' : ''}
            </div>
            
            <div class="member-card-tags">
                <span class="tag tag-gen">Đời ${m.generation}</span>
                <span class="tag tag-branch">${branchDisplay}</span>
                ${isInLaw ? '<span class="tag tag-inlaw"><i class="fas fa-ring"></i> Dâu/Rể</span>' : ''}
            </div>

            <div class="member-card-body">
                <p><i class="fas fa-birthday-cake icon-birth"></i> ${m.birth_date || 'Không rõ'}</p>
                ${isDeceased ? `<p><i class="fas fa-star-of-life icon-death"></i> Mất: ${m.death_date || 'Không rõ'}</p>` : ''}
                ${spouseName ? `<p><i class="fas fa-ring icon-spouse"></i> VC: ${spouseName}</p>` : ''}
                ${m.job ? `<p><i class="fas fa-briefcase icon-job"></i> ${m.job}</p>` : ''}
            </div>
        `;

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
    document.getElementById('m-birth').value = '';
    document.getElementById('m-death').value = '';
    
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
    document.getElementById('m-birth').value = member.birth_date || '';
    document.getElementById('m-death').value = member.death_date || '';
    
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
        { id: 'm-birth', type: 'text' },
        { id: 'm-death', type: 'text' },
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
    const birthInput = document.getElementById('m-birth');
    const deathInput = document.getElementById('m-death');
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
        birth_date: birthInput ? birthInput.value.trim() : '',
        death_date: deathInput ? deathInput.value.trim() : '',
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
    const confirmSync = confirm("Hệ thống sẽ xóa dữ liệu cũ và nạp lại từ Google Sheets.");
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
    // Chỉ cần load dữ liệu, HTML tĩnh đã có sẵn trong index.html
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
                const shortContent = post.content.length > 150 ? post.content.substring(0, 150) + '...' : post.content;
                
                return `
                <div class="post-card ${post.is_pinned ? 'pinned' : ''}">
                    <div class="post-header">
                        <h3 class="post-title" style="margin:0; font-size:18px;">${post.title}</h3>
                        <div class="post-actions">
                            <button class="btn-edit" onclick="openEditPostModal('${post._id}')" style="padding:4px 8px; font-size:12px;"><i class="fas fa-edit"></i></button>
                            <button class="btn-delete" onclick="deletePost('${post._id}')" style="padding:4px 8px; font-size:12px;"><i class="fas fa-trash"></i></button>
                        </div>
                    </div>
                    <div class="post-meta">
                        <span class="post-category ${catClass}" style="background:#f3f4f6; padding:2px 8px; border-radius:4px;">${catMap[post.category]}</span>
                        <span><i class="far fa-clock"></i> ${date}</span>
                        ${pinnedIcon}
                    </div>
                    <div class="post-content" style="flex-grow:1; color:#4b5563; margin-bottom:15px;">${shortContent}</div>
                    <button onclick="openViewPostModal('${post._id}')" style="align-self:flex-start; background:none; border:none; color:#0ea5e9; cursor:pointer; padding:0; font-weight:600;">Đọc tiếp →</button>
                </div>`;
            }).join('');
        }
    } catch (err) {
        container.innerHTML = `<p style="color:red;">Lỗi tải bài viết: ${err.message}</p>`;
    }
}

function openCreatePostModal() {
    currentPostId = null;
    document.getElementById('post-modal-title').innerText = 'Viết bài mới';
    document.getElementById('post-title').value = '';
    document.getElementById('post-content').value = '';
    document.getElementById('post-category').value = 'announcement';
    document.getElementById('post-pinned').checked = false;
    
    document.getElementById('post-modal').style.display = 'block';
}

function closePostModal() {
    document.getElementById('post-modal').style.display = 'none';
    currentPostId = null;
}

async function openEditPostModal(id) {
    const token = localStorage.getItem('token');
    try {
        const res = await fetch(`/api/posts/${id}`, { headers: { 'Authorization': `Bearer ${token}` } });
        const data = await res.json();
        if (data.success) {
            const post = data.post;
            currentPostId = post._id;
            
            document.getElementById('post-modal-title').innerText = 'Sửa bài viết';
            document.getElementById('post-title').value = post.title;
            document.getElementById('post-content').value = post.content;
            document.getElementById('post-category').value = post.category;
            document.getElementById('post-pinned').checked = post.is_pinned;
            
            document.getElementById('post-modal').style.display = 'block';
        } else {
            alert(data.message);
        }
    } catch (err) {
        console.error(err);
        alert('Lỗi tải thông tin bài viết');
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
            closePostModal();
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
    // Cập nhật selector để tìm đúng thẻ card trong giao diện Settings mới
    const btn = document.querySelector('.settings-card[onclick="exportToCSV()"]');
    let originalText = '';
    
    if (btn) {
        originalText = btn.innerHTML;
        btn.innerHTML = '<div style="display:flex; flex-direction:column; align-items:center; justify-content:center; height:100%;"><h3>⌛ Đang xử lý...</h3><p>Đang tạo file CSV</p></div>';
        btn.style.pointerEvents = 'none'; // Chặn click nhiều lần
    }

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
        if (btn) {
            btn.innerHTML = originalText;
            btn.style.pointerEvents = 'auto';
        }
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
        <h2 style="text-align: center; margin-bottom: 20px; color: #ef4444; text-transform: uppercase;">Tổng quan Gia phả</h2>
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
                <div id="gen-list-container" style="max-height: 300px; overflow-y: auto;"></div>
            </div>
            <div class="dashboard-col">
                <h3>Thành phần Gia tộc</h3>
                <div style="height: 300px; position: relative; width: 100%;">
                    <canvas id="chartComp"></canvas>
                </div>
            </div>
        </div>
        <div class="dashboard-columns">
            <div class="dashboard-col">
                <h3>Phân bổ theo Phái</h3>
                <div id="branch-list-container" style="max-height: 300px; overflow-y: auto;"></div>
            </div>
            <div class="dashboard-col">
                <h3>Tình trạng sinh tử</h3>
                <div style="height: 300px; position: relative; width: 100%;">
                    <canvas id="chartStatus"></canvas>
                </div>
            </div>
        </div>
        <div class="dashboard-columns">
            <div class="dashboard-col">
                <h3>🎂 Sinh nhật sắp tới (30 ngày)</h3>
                <div id="upcoming-birthdays" style="max-height: 300px; overflow-y: auto;"></div>
            </div>
            <div class="dashboard-col">
                <h3>🕯️ Ngày giỗ sắp tới (30 ngày)</h3>
                <div id="upcoming-death-annivs" style="max-height: 300px; overflow-y: auto;"></div>
            </div>
        </div>
        <div class="dashboard-columns">
            <div class="dashboard-col" style="grid-column: 1 / -1;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
                    <h3 style="margin: 0;">Hoạt động gần đây</h3>
                    <button onclick="clearActivities()" style="background: #fee2e2; color: #dc2626; border: none; padding: 6px 12px; border-radius: 6px; cursor: pointer; font-size: 0.85em; font-weight: 600; transition: background 0.2s;">
                        <i class="fas fa-trash-alt"></i> Xóa lịch sử
                    </button>
                </div>
                <div id="recent-activities" style="max-height: 300px; overflow-y: auto;">Đang tải...</div>
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

    // Tính toán Tình trạng sinh tử
    let deceasedCount = 0;
    let aliveCount = 0;
    allMembers.forEach(m => {
        const hasDeathDate = m.death_date && String(m.death_date).trim() !== '';
        const isDeadByFlag = m.is_live === 0 || m.is_live === '0' || m.is_live === false || m.is_alive === 0 || m.is_alive === '0' || m.is_alive === false;

        if (hasDeathDate || isDeadByFlag) deceasedCount++;
        else aliveCount++;
    });

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

    // Tính toán cho Phân bổ theo Phái
    const branchCounts = allMembers.reduce((acc, m) => {
        let b = m.branch;
        // Nếu branch là 0, trống hoặc null thì quy về '0' (Tổ khảo, Tổ thúc)
        if (!b || String(b).trim() === '' || String(b).trim() === '0') {
            b = '0';
        }
        acc[b] = (acc[b] || 0) + 1;
        return acc;
    }, {});
    const branchLabels = Object.keys(branchCounts).sort();

    // --- Cập nhật thẻ ---
    document.getElementById('totalMembers').innerText = total;
    document.getElementById('maleCount').innerText = males;
    document.getElementById('femaleCount').innerText = females;
    document.getElementById('generationCount').innerText = genLabels.length;

    // --- Vẽ biểu đồ ---
    Object.values(chartInstances).forEach(chart => chart.destroy());
    chartInstances = {};
    const chartOptions = { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'top' } } };
    
    // Hiển thị danh sách Phân bố thế hệ (thay vì biểu đồ)
    const genListContainer = document.getElementById('gen-list-container');
    if (genListContainer) {
        if (genLabels.length === 0) {
            genListContainer.innerHTML = '<p style="text-align:center; color:#666; padding: 20px;">Chưa có dữ liệu.</p>';
        } else {
            let html = '<ul style="list-style: none; padding: 0; margin: 0;">';
            genLabels.forEach(label => {
                const count = genCounts[label];
                html += `<li style="padding: 12px 0; border-bottom: 1px solid #f0f0f0; display: flex; justify-content: space-between; align-items: center;">
                            <span style="color: #333; font-weight: 500;">Đời thứ ${label}</span>
                            <span style="background: #fff3e0; color: #e67e22; padding: 4px 12px; border-radius: 20px; font-weight: bold; font-size: 0.9em;">${count} người</span>
                         </li>`;
            });
            html += '</ul>';
            genListContainer.innerHTML = html;
        }
    }

    // Biểu đồ Thành phần
    const chartCompEl = document.getElementById('chartComp');
    if (chartCompEl) chartInstances.comp = new Chart(chartCompEl, { type: 'doughnut', data: { labels: ['Huyết thống', 'Dâu/Rể'], datasets: [{ data: [coreMembers, spouses], backgroundColor: ['#36a2eb', '#ff6384'] }] }, options: chartOptions });

    // Biểu đồ Tình trạng sinh tử
    const chartStatusEl = document.getElementById('chartStatus');
    if (chartStatusEl) chartInstances.status = new Chart(chartStatusEl, { type: 'doughnut', data: { labels: ['Còn sống', 'Đã mất'], datasets: [{ data: [aliveCount, deceasedCount], backgroundColor: ['#10b981', '#9ca3af'] }] }, options: chartOptions });

    // Hiển thị danh sách Phân bổ theo Phái
    const branchListContainer = document.getElementById('branch-list-container');
    if (branchListContainer) {
        if (branchLabels.length === 0) {
            branchListContainer.innerHTML = '<p style="text-align:center; color:#666; padding: 20px;">Chưa có dữ liệu phái.</p>';
        } else {
            let html = '<ul style="list-style: none; padding: 0; margin: 0;">';
            const branchMap = { 
                '0': 'Tổ khảo, Tổ thúc',
                '1': 'Phái Nhất', 
                '2': 'Phái Nhì', 
                '3': 'Phái Ba', 
                '4': 'Phái Bốn' 
            };
            
            branchLabels.forEach(label => {
                const count = branchCounts[label];
                // Lấy tên hiển thị, nếu không nằm trong 1-4 thì hiển thị nguyên gốc
                const displayName = branchMap[label] || (label === 'Gốc' ? 'Gốc' : `Phái ${label}`);
                
                html += `<li style="padding: 12px 0; border-bottom: 1px solid #f0f0f0; display: flex; justify-content: space-between; align-items: center;">
                            <span style="color: #333; font-weight: 500;">${displayName}</span>
                            <span style="background: #e0f2fe; color: #0284c7; padding: 4px 12px; border-radius: 20px; font-weight: bold; font-size: 0.9em;">${count} người</span>
                         </li>`;
            });
            html += '</ul>';
            branchListContainer.innerHTML = html;
        }
    }

    // --- Xử lý Sự kiện sắp tới ---
    const birthdaysContainer = document.getElementById('upcoming-birthdays');
    const deathAnnivsContainer = document.getElementById('upcoming-death-annivs');

    if (birthdaysContainer || deathAnnivsContainer) {
        const today = new Date();
        today.setHours(0, 0, 0, 0); // Reset giờ để so sánh chính xác
        const currentYear = today.getFullYear();
        const upcomingBirthdays = [];
        const upcomingDeathAnnivs = [];
        const checkDays = 30; // Số ngày kiểm tra trước

        // Hàm parse ngày tháng từ chuỗi (hỗ trợ dd/mm/yyyy, dd-mm-yyyy)
        const parseDayMonth = (dateStr) => {
            if (!dateStr) return null;
            
            // 1. Ưu tiên check format ISO: YYYY-MM-DD (để tránh nhầm năm thành ngày)
            const isoMatch = dateStr.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
            if (isoMatch) {
                return { day: parseInt(isoMatch[3]), month: parseInt(isoMatch[2]) };
            }

            // 2. Check format thường: DD/MM/YYYY
            const vnMatch = dateStr.match(/^(\d{1,2})[\/\-](\d{1,2})/);
            if (vnMatch) {
                return { day: parseInt(vnMatch[1]), month: parseInt(vnMatch[2]) };
            }
            return null;
        };

        allMembers.forEach(m => {
            // Xác định trạng thái sống/mất dựa trên dữ liệu
            // Nếu có death_date thì coi như đã mất. Nếu không, kiểm tra is_live (nếu có)
            const hasDeathDate = m.death_date && String(m.death_date).trim() !== '' && String(m.death_date).trim() !== '0';
            const isDeadByFlag = m.is_live === 0 || m.is_live === '0' || m.is_live === false || m.is_alive === 0 || m.is_alive === '0' || m.is_alive === false;
            const isDeceased = hasDeathDate || isDeadByFlag;

            // 1. Kiểm tra Sinh nhật (Chỉ áp dụng cho người còn sống)
            if (!isDeceased && m.birth_date) {
                const dm = parseDayMonth(m.birth_date);
                if (dm) checkEvent(m, dm, 'birthday', '🎂 Sinh nhật', upcomingBirthdays);
            }

            // 2. Kiểm tra Ngày giỗ (Chỉ áp dụng cho người đã mất có ngày mất)
            if (hasDeathDate) {
                const dm = parseDayMonth(m.death_date);
                if (dm) checkEvent(m, dm, 'death_anniv', '🕯️ Giỗ', upcomingDeathAnnivs);
            }
        });

        function checkEvent(member, { day, month }, type, label, targetList) {
            // Tạo ngày sự kiện trong năm nay
            let eventDate = new Date(currentYear, month - 1, day);
            
            // Nếu ngày này trong năm nay đã qua, xét năm sau
            if (eventDate < today) {
                eventDate.setFullYear(currentYear + 1);
            }

            // Tính khoảng cách ngày
            const diffTime = eventDate - today;
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

            if (diffDays >= 0 && diffDays <= checkDays) {
                targetList.push({
                    member: member,
                    type: type,
                    label: label,
                    dateStr: `${day}/${month}`,
                    daysLeft: diffDays,
                    fullDate: eventDate
                });
            }
        }

        // Hàm render danh sách
        const renderList = (container, list, emptyMsg) => {
            if (!container) return;
            
            list.sort((a, b) => a.daysLeft - b.daysLeft);

            if (list.length === 0) {
                container.innerHTML = `<p style="text-align:center; color:#666; padding: 20px;">${emptyMsg}</p>`;
                return;
            }

            let html = '<ul style="list-style: none; padding: 0; margin: 0;">';
            list.forEach(evt => {
                const timeText = evt.daysLeft === 0 ? '<span style="color:red; font-weight:bold;">Hôm nay</span>' : 
                                 evt.daysLeft === 1 ? '<span style="color:#e67e22; font-weight:bold;">Ngày mai</span>' : 
                                 `${evt.daysLeft} ngày nữa`;
                
                const bgColor = evt.type === 'birthday' ? '#ecfdf5' : '#f3f4f6'; // Xanh lá nhạt cho SN, Xám cho Giỗ
                const iconColor = evt.type === 'birthday' ? '#10b981' : '#6b7280';

                html += `
                <li style="padding: 12px; margin-bottom: 8px; background: ${bgColor}; border-radius: 8px; display: flex; justify-content: space-between; align-items: center; border-left: 4px solid ${iconColor};">
                    <div>
                        <div style="font-weight: 600; color: #374151;">${evt.label}: ${evt.member.full_name}</div>
                        <div style="font-size: 0.85em; color: #6b7280;">Ngày: ${evt.dateStr} (Đời ${evt.member.generation})</div>
                    </div>
                    <div style="text-align: right; font-size: 0.9em;">
                        ${timeText}
                    </div>
                </li>`;
            });
            html += '</ul>';
            container.innerHTML = html;
        };

        // Render 2 danh sách
        renderList(birthdaysContainer, upcomingBirthdays, 'Không có sinh nhật nào sắp tới.');
        renderList(deathAnnivsContainer, upcomingDeathAnnivs, 'Không có ngày giỗ nào sắp tới.');
    }

    // --- Tải Hoạt động gần đây ---
    loadRecentActivities();
}

async function loadRecentActivities() {
    const container = document.getElementById('recent-activities');
    if (!container) return;

    try {
        const token = localStorage.getItem('token');
        const res = await fetch('/api/activities', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();

        if (data.success) {
            if (!data.logs || data.logs.length === 0) {
                container.innerHTML = '<p style="text-align:center; color:#666; padding: 20px;">Chưa có hoạt động nào.</p>';
                return;
            }

            let html = '<ul style="list-style: none; padding: 0; margin: 0;">';
            data.logs.forEach(log => {
                const date = new Date(log.created_at).toLocaleString('vi-VN');
                
                // Icon tương ứng với hành động
                let icon = '📝';
                let colorClass = '#374151';
                if (log.action_type === 'create') { icon = '✅'; colorClass = '#059669'; }
                else if (log.action_type === 'update') { icon = '✏️'; colorClass = '#d97706'; }
                else if (log.action_type === 'delete') { icon = '🗑️'; colorClass = '#dc2626'; }

                // Badge cho vai trò
                const roleBadge = (log.actor_role === 'owner' || log.actor_role === 'admin')
                    ? '<span style="background:#ffedd5; color:#c2410c; padding:2px 6px; border-radius:4px; font-size:0.75em;">Admin</span>' 
                    : '<span style="background:#dbeafe; color:#0369a1; padding:2px 6px; border-radius:4px; font-size:0.75em;">Viewer</span>';

                html += `
                <li style="padding: 12px; border-bottom: 1px solid #f0f0f0;">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 4px;">
                        <span style="font-weight: 600; color: ${colorClass}; font-size: 0.95em;">${icon} ${log.description}</span>
                        <span style="font-size: 0.8em; color: #9ca3af; white-space: nowrap; margin-left: 8px;">${date}</span>
                    </div>
                    <div style="font-size: 0.85em; color: #6b7280; display: flex; align-items: center; gap: 6px;">
                        <i class="fas fa-user" style="font-size: 0.8em;"></i> ${log.actor_name} ${roleBadge}
                    </div>
                </li>`;
            });
            html += '</ul>';
            container.innerHTML = html;
        } else {
            // Xử lý khi success = false (để không bị treo chữ Đang tải)
            container.innerHTML = `<p style="text-align:center; color:#666; padding: 20px;">${data.message || 'Không có dữ liệu hoạt động.'}</p>`;
        }
    } catch (err) {
        console.error('Lỗi tải hoạt động:', err);
        container.innerHTML = '<p style="text-align:center; color:red; padding: 20px;">Không thể tải lịch sử hoạt động.</p>';
    }
}

// Hàm xóa toàn bộ lịch sử hoạt động
async function clearActivities() {
    if (!confirm('⚠️ Bạn có chắc chắn muốn xóa toàn bộ lịch sử hoạt động không?\nHành động này không thể hoàn tác.')) return;

    try {
        const token = localStorage.getItem('token');
        const res = await fetch('/api/activities', {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();

        if (data.success) {
            loadRecentActivities(); // Tải lại danh sách (sẽ trống)
        } else {
            alert('❌ ' + (data.message || 'Lỗi khi xóa lịch sử'));
        }
    } catch (err) {
        console.error('Lỗi:', err);
        alert('❌ Lỗi kết nối server');
    }
}

// --- Back to Top Feature ---
window.addEventListener('scroll', () => {
    const btn = document.getElementById('btn-back-to-top');
    if (btn) {
        // Hiện nút khi cuộn xuống quá 300px
        if (document.body.scrollTop > 300 || document.documentElement.scrollTop > 300) {
            btn.classList.add('show');
        } else {
            btn.classList.remove('show');
        }
    }
});

function scrollToTop() {
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ==========================================
// BỔ SUNG: CHỨC NĂNG TÌM KIẾM NÂNG CAO
// ==========================================

function createAdvancedSearchModal() {
    if (document.getElementById('advanced-search-modal')) return;

    const modalHtml = `
    <div id="advanced-search-modal" class="modal" style="display: none; position: fixed; z-index: 1000; left: 0; top: 0; width: 100%; height: 100%; overflow: auto; background-color: rgba(0,0,0,0.5);">
        <div class="modal-content" style="background-color: #fefefe; margin: 5% auto; padding: 20px; border: 1px solid #888; width: 90%; max-width: 600px; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.2);">
            <h2 style="text-align: center; margin-bottom: 20px; color: #2c3e50;">Tìm kiếm Nâng cao</h2>
            
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
                <!-- Họ và tên (Input) -->
                <div class="form-group" style="grid-column: 1 / -1;">
                    <label style="display: block; margin-bottom: 5px; font-weight: 600;">Họ và tên</label>
                    <input type="text" id="adv-name" placeholder="Nhập tên thành viên..." style="width: 100%; padding: 10px; border: 1px solid #ccc; border-radius: 6px;">
                </div>

                <!-- Đời (Select) -->
                <div class="form-group">
                    <label style="display: block; margin-bottom: 5px; font-weight: 600;">Đời (Thế hệ)</label>
                    <select id="adv-gen" style="width: 100%; padding: 10px; border: 1px solid #ccc; border-radius: 6px;">
                        <option value="">Tất cả</option>
                        ${Array.from({length: 15}, (_, i) => `<option value="${i+1}">Đời ${i+1}</option>`).join('')}
                    </select>
                </div>

                <!-- Phái (Select) -->
                <div class="form-group">
                    <label style="display: block; margin-bottom: 5px; font-weight: 600;">Phái / Chi</label>
                    <select id="adv-branch" style="width: 100%; padding: 10px; border: 1px solid #ccc; border-radius: 6px;">
                        <option value="">Tất cả</option>
                        <option value="0">Gốc (Tổ)</option>
                        <option value="1">Phái Nhất</option>
                        <option value="2">Phái Nhì</option>
                        <option value="3">Phái Ba</option>
                        <option value="4">Phái Bốn</option>
                    </select>
                </div>

                <!-- Giới tính (Select) -->
                <div class="form-group">
                    <label style="display: block; margin-bottom: 5px; font-weight: 600;">Giới tính</label>
                    <select id="adv-gender" style="width: 100%; padding: 10px; border: 1px solid #ccc; border-radius: 6px;">
                        <option value="">Tất cả</option>
                        <option value="Nam">Nam</option>
                        <option value="Nữ">Nữ</option>
                    </select>
                </div>

                <!-- Trạng thái (Select) -->
                <div class="form-group">
                    <label style="display: block; margin-bottom: 5px; font-weight: 600;">Trạng thái</label>
                    <select id="adv-status" style="width: 100%; padding: 10px; border: 1px solid #ccc; border-radius: 6px;">
                        <option value="">Tất cả</option>
                        <option value="alive">Còn sống</option>
                        <option value="deceased">Đã mất</option>
                    </select>
                </div>

                <!-- Nghề nghiệp (Input) -->
                <div class="form-group">
                    <label style="display: block; margin-bottom: 5px; font-weight: 600;">Nghề nghiệp</label>
                    <input type="text" id="adv-job" placeholder="VD: Giáo viên, Kỹ sư..." style="width: 100%; padding: 10px; border: 1px solid #ccc; border-radius: 6px;">
                </div>

                <!-- Địa chỉ (Input) -->
                <div class="form-group">
                    <label style="display: block; margin-bottom: 5px; font-weight: 600;">Địa chỉ</label>
                    <input type="text" id="adv-address" placeholder="Nhập địa chỉ..." style="width: 100%; padding: 10px; border: 1px solid #ccc; border-radius: 6px;">
                </div>
            </div>

            <div style="margin-top: 25px; text-align: right;">
                <button onclick="resetAdvancedSearch()" style="padding: 10px 20px; border: none; background: #f39c12; color: white; border-radius: 6px; cursor: pointer; margin-right: 10px;">Đặt lại</button>
                <button onclick="document.getElementById('advanced-search-modal').style.display='none'" style="padding: 10px 20px; border: none; background: #95a5a6; color: white; border-radius: 6px; cursor: pointer; margin-right: 10px;">Đóng</button>
                <button onclick="performAdvancedSearch()" style="padding: 10px 20px; border: none; background: #3498db; color: white; border-radius: 6px; cursor: pointer; font-weight: bold;">🔍 Tìm kiếm</button>
            </div>
        </div>
    </div>`;
    
    document.body.insertAdjacentHTML('beforeend', modalHtml);
}

function openAdvancedSearchModal() {
    createAdvancedSearchModal();
    document.getElementById('advanced-search-modal').style.display = 'block';
}

function resetAdvancedSearch() {
    document.getElementById('adv-name').value = '';
    document.getElementById('adv-gen').value = '';
    document.getElementById('adv-branch').value = '';
    document.getElementById('adv-gender').value = '';
    document.getElementById('adv-status').value = '';
    document.getElementById('adv-job').value = '';
    document.getElementById('adv-address').value = '';
    
    renderMemberList(allMembers);
}

function performAdvancedSearch() {
    const name = document.getElementById('adv-name').value.toLowerCase();
    const gen = document.getElementById('adv-gen').value;
    const branch = document.getElementById('adv-branch').value;
    const gender = document.getElementById('adv-gender').value;
    const status = document.getElementById('adv-status').value;
    const job = document.getElementById('adv-job').value.toLowerCase();
    const address = document.getElementById('adv-address').value.toLowerCase();

    const filtered = allMembers.filter(m => {
        // Logic xác định sinh tử
        const hasDeathDate = m.death_date && String(m.death_date).trim() !== '' && String(m.death_date).trim() !== '0';
        const isDeadByFlag = m.is_live === 0 || m.is_live === '0' || m.is_live === false || m.is_alive === 0 || m.is_alive === '0' || m.is_alive === false;
        const isDeceased = hasDeathDate || isDeadByFlag;

        // Kiểm tra từng tiêu chí
        if (name && !(m.full_name || '').toLowerCase().includes(name)) return false;
        if (gen && String(m.generation) !== gen) return false;
        if (branch && String(m.branch || '0') !== branch) return false;
        if (gender && m.gender !== gender) return false;
        if (status === 'alive' && isDeceased) return false;
        if (status === 'deceased' && !isDeceased) return false;
        if (job && (!m.job || !m.job.toLowerCase().includes(job))) return false;
        if (address && (!m.address || !m.address.toLowerCase().includes(address))) return false;

        return true;
    });

    document.getElementById('advanced-search-modal').style.display = 'none';
    renderMemberList(filtered);
    
    // Reset ô tìm kiếm thường để tránh nhầm lẫn
    const simpleSearch = document.getElementById('member-search-input');
    if (simpleSearch) simpleSearch.value = '';
}

// ==========================================
// BỔ SUNG: CHỨC NĂNG XEM CHI TIẾT BÀI VIẾT
// ==========================================

async function openViewPostModal(postId) {
    // Tạo modal nếu chưa có
    if (!document.getElementById('view-post-modal')) {
        const modalHtml = `
        <div id="view-post-modal" class="modal" style="display: none; position: fixed; z-index: 1000; left: 0; top: 0; width: 100%; height: 100%; overflow: auto; background-color: rgba(0,0,0,0.5);">
            <div class="modal-content" style="background-color: #fff; margin: 5% auto; padding: 30px; border: none; width: 90%; max-width: 800px; border-radius: 12px; box-shadow: 0 10px 25px rgba(0,0,0,0.2);">
                <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 15px;">
                    <h2 id="view-post-title" style="margin: 0; color: #1f2937; font-size: 24px;"></h2>
                    <button onclick="document.getElementById('view-post-modal').style.display='none'" style="background: none; border: none; font-size: 24px; cursor: pointer; color: #6b7280;">&times;</button>
                </div>
                <div style="margin-bottom: 20px; color: #6b7280; font-size: 14px; border-bottom: 1px solid #e5e7eb; padding-bottom: 10px;">
                    <span id="view-post-cat" style="background: #f3f4f6; padding: 4px 8px; border-radius: 4px; margin-right: 10px; font-weight: 600;"></span>
                    <span id="view-post-date"><i class="far fa-clock"></i> </span>
                </div>
                <div id="view-post-content" style="line-height: 1.8; color: #374151; font-size: 16px; white-space: pre-wrap;"></div>
            </div>
        </div>`;
        document.body.insertAdjacentHTML('beforeend', modalHtml);
    }

    const token = localStorage.getItem('token');
    try {
        const res = await fetch(`/api/posts/${postId}`, { headers: { 'Authorization': `Bearer ${token}` } });
        const data = await res.json();
        if (data.success) {
            const post = data.post;
            const catMap = { 'announcement': 'Thông báo', 'event': 'Sự kiện', 'news': 'Tin tức' };
            
            document.getElementById('view-post-title').innerText = post.title;
            document.getElementById('view-post-cat').innerText = catMap[post.category] || post.category;
            document.getElementById('view-post-date').innerHTML = `<i class="far fa-clock"></i> ${new Date(post.created_at).toLocaleDateString('vi-VN')}`;
            document.getElementById('view-post-content').innerText = post.content;
            
            document.getElementById('view-post-modal').style.display = 'block';
        }
    } catch (err) {
        alert('Không thể tải bài viết.');
    }
}
