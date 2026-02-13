// Biến D3 toàn cục (Khởi tạo trễ để đảm bảo DOM đã sẵn sàng)
let zoom, svg, g;

function initD3() {
    if (svg) return true; // Đã khởi tạo rồi thì thôi
    
    const container = d3.select("#tree-canvas");
    if (container.empty()) return false; // Chưa tìm thấy thẻ div

    // Xóa nội dung cũ nếu có (để tránh tạo nhiều svg khi reload)
    container.selectAll("*").remove();

    zoom = d3.zoom().on("zoom", (e) => g.attr("transform", e.transform));

    svg = container.append("svg")
        .attr("width", "100%").attr("height", "100%")
        .call(zoom)
        .on("dblclick.zoom", null);

    g = svg.append("g");
    return true;
}

// Biến toàn cục để lưu trữ cây D3
let globalRootD3 = null;
// Biến toàn cục để lưu offset của cây, giúp hàm zoom tính toán chính xác
let treeOffsetX = 0;
let treeStartY = 0;

function drawTree(data) {
    // Đảm bảo D3 đã được khởi tạo trước khi vẽ
    if (!initD3()) return;

    g.selectAll("*").remove();
    if (!data || data.length === 0) return;

    // 1. Tiền xử lý: Gom nhóm Vợ/Chồng và tạo Node hiển thị
    const memberMap = new Map(data.map(d => [String(d.id), d])); // Chuyển ID sang String để đảm bảo khớp
    const spouseMap = new Map(); // Map lưu quan hệ: id -> Set([spouse_ids])

    // Xây dựng bản đồ quan hệ vợ chồng 2 chiều (xử lý trường hợp thiếu pid 1 chiều)
    data.forEach(d => {
        const myId = String(d.id);
        const pid = d.pid ? String(d.pid) : null;
        
        if (!spouseMap.has(myId)) spouseMap.set(myId, new Set());
        
        if (pid && memberMap.has(pid)) {
            spouseMap.get(myId).add(pid);
            // Tự động thêm quan hệ ngược lại cho người kia
            if (!spouseMap.has(pid)) spouseMap.set(pid, new Set());
            spouseMap.get(pid).add(myId);
        }
    });

    const memberToNode = new Map(); 
    const processed = new Set();
    const displayNodes = [];

    data.forEach(d => {
        const myId = String(d.id);
        if (processed.has(myId)) return;

        // Xác định chủ hộ (Head) để gom nhóm
        // Ưu tiên Nam làm chủ hộ. Nếu là Nữ, thử tìm chồng của cô ấy.
        let head = d;
        const spouses = Array.from(spouseMap.get(myId) || []);
        
        if (d.gender === 'Nữ') {
            const husbandId = spouses.find(sid => {
                const s = memberMap.get(sid);
                return s && s.gender === 'Nam';
            });
            if (husbandId) {
                head = memberMap.get(husbandId);
            }
        }

        // Nếu chủ hộ đã được xử lý (do đã duyệt qua thành viên khác trong gia đình này), bỏ qua
        if (processed.has(String(head.id))) return;

        // Tập hợp thành viên gia đình: [Chủ hộ, Vợ 1, Vợ 2...]
        const headId = String(head.id);
        const headSpousesIds = Array.from(spouseMap.get(headId) || []);
        
        // Lấy object member của các bà vợ và sắp xếp theo 'order' để xác định vợ trước, vợ sau
        const sortedSpouses = headSpousesIds
            .map(sid => memberMap.get(sid))
            .filter(s => s && String(s.id) !== headId) // Lọc ra chính head và các member không tồn tại
            .sort((a, b) => (a.order || 0) - (b.order || 0));

        let familyMembers;
        // Chỉ áp dụng logic sắp xếp Chồng-vào-giữa khi có từ 2 vợ trở lên
        if (sortedSpouses.length >= 2) {
            familyMembers = [sortedSpouses[0], head, ...sortedSpouses.slice(1)];
        } else {
            // Giữ nguyên logic cũ cho trường hợp 0 hoặc 1 vợ: [Chồng, Vợ]
            familyMembers = [head, ...sortedSpouses];
        }

        // Đánh dấu tất cả thành viên trong gia đình là đã xử lý
        familyMembers.forEach(m => processed.add(String(m.id)));

        const node = {
            id: `node-${head.id}`,
            type: familyMembers.length > 1 ? 'couple' : 'single',
            members: familyMembers,
            children: [],
            data: head // Dùng chủ hộ làm đại diện nối với cha
        };

        familyMembers.forEach(m => memberToNode.set(String(m.id), node));
        displayNodes.push(node);
    });

    // 2. Xây dựng cây phân cấp (Hierarchy)
    const roots = [];
    displayNodes.forEach(node => {
        // Lấy người đại diện để liên kết với cha mẹ.
        // Ưu tiên tìm người có thông tin cha/mẹ (con ruột) để tránh trường hợp "rể" làm đại diện và gây mồ côi.
        const representative = node.members.find(m => m.fid || m.mid) || node.members[0];
        
        // Tìm node cha mẹ dựa trên fid hoặc mid (chuyển sang String để khớp)
        // Dùng fid/mid của người đại diện (con ruột) để tìm node cha mẹ.
        let parentNode = null;
        if (representative.fid && memberToNode.has(String(representative.fid))) {
            parentNode = memberToNode.get(String(representative.fid));
        } else if (representative.mid && memberToNode.has(String(representative.mid))) {
            parentNode = memberToNode.get(String(representative.mid));
        }

        if (parentNode) {
            parentNode.children.push(node);
        } else {
            roots.push(node);
        }
    });

    // Sắp xếp các node con theo thứ tự (order) để đảm bảo đúng thứ tự phái/chi
    const sortNodes = (nodes) => {
        nodes.sort((a, b) => {
            // Sửa logic: Sắp xếp anh em theo `order` của người con ruột
            const childA = a.members.find(m => m.fid || m.mid) || a.members[0]; // Tìm con ruột để lấy order
            const childB = b.members.find(m => m.fid || m.mid) || b.members[0]; // Tìm con ruột để lấy order
            return (parseInt(childA.order) || 0) - (parseInt(childB.order) || 0);
        });

        nodes.forEach(node => {
            if (node.children && node.children.length > 0) sortNodes(node.children);
        });
    };
    sortNodes(roots);

    // Tạo một node gốc ảo để chứa tất cả các nhánh (trường hợp có nhiều cụ tổ)
    const superRoot = { id: 'super-root', children: roots, type: 'root', members: [] };

    // 3. Sử dụng thuật toán D3 Tree Layout
    const rootD3 = d3.hierarchy(superRoot, d => d.children);
    globalRootD3 = rootD3; // Lưu lại để hàm zoom có thể truy cập
    
    // Cấu hình kích thước
    const boxWidth = 120;
    const boxHeight = 60;
    const gap = 20; // Khoảng cách giữa vợ và chồng
    const levelSeparation = 150; // Khoảng cách giữa các đời

    const treeLayout = d3.tree()
        .nodeSize([260, levelSeparation]) // Kích thước vùng không gian cho mỗi node
        .separation((a, b) => {
            // Tăng khoảng cách nếu node là cặp vợ chồng
            const aIsCouple = a.data.type === 'couple';
            const bIsCouple = b.data.type === 'couple';
            let sep = 1;
            if (aIsCouple) sep += 0.5;
            if (bIsCouple) sep += 0.5;
            return (a.parent === b.parent ? sep : sep + 0.5);
        });

    treeLayout(rootD3);

    // Căn chỉnh lại vị trí Y theo đúng Đời (Generation) trong dữ liệu
    // Giúp các thành viên cùng đời luôn nằm trên một hàng thẳng tắp
    rootD3.each(d => {
        if (d.data.id === 'super-root') return;
        if (d.data.data && d.data.data.generation) {
            d.y = (d.data.data.generation - 1) * levelSeparation;
        }
    });

    // 4. Vẽ hiển thị
    // Tính toán offset để căn giữa cây vào màn hình
    let minX = Infinity;
    rootD3.each(d => { 
        // Bỏ qua super-root để tính toán khung hình chính xác hơn
        if (d.data.id !== 'super-root' && d.x < minX) minX = d.x; 
    });
    if (minX === Infinity) minX = 0;

    treeStartY = 20; // Giảm khoảng trắng ở trên
    treeOffsetX = -minX + 100;

    // Vẽ đường nối (Vuông góc - Orthogonal)
    g.selectAll(".link")
        .data(rootD3.links().filter(l => l.source.data.id !== 'super-root'))
        .enter().append("path")
        .attr("class", "link")
        .attr("d", d => {
            const parentMembers = d.source.data.members;
            const childMembers = d.target.data.members;
            
            // --- TÍNH TOÁN TARGET X (Con ruột) ---
            // Tìm thành viên trong node con là con ruột của cha/mẹ để nối dây vào đúng người đó
            const bioChildIndex = childMembers.findIndex(c => 
                parentMembers.some(p => String(p.id) === String(c.fid) || String(p.id) === String(c.mid))
            );
            const actualChildIndex = bioChildIndex !== -1 ? bioChildIndex : 0;
            
            const childTotalW = childMembers.length * boxWidth + (childMembers.length - 1) * gap;
            const childStartX = -(childTotalW / 2);
            const childOffset = childStartX + actualChildIndex * (boxWidth + gap) + (boxWidth / 2);
            
            const targetX = d.target.x + treeOffsetX + childOffset;
            const targetY = d.target.y + treeStartY;

            // Trường hợp 1 Vợ 1 Chồng: Nối từ điểm giữa (nơi có đường hôn nhân)
            if (parentMembers.length === 2) {
                const sourceX = d.source.x + treeOffsetX;
                // Bắt đầu từ giữa chiều cao (trên đường hôn nhân) thay vì đáy để không bị hở
                const sourceY = d.source.y + treeStartY + boxHeight / 2; 
                const midY = sourceY + (targetY - sourceY) / 2;
                return `M${sourceX},${sourceY} V${midY} H${targetX} V${targetY}`;
            }

            // Trường hợp Đa thê hoặc Đơn thân: Tìm đúng cha/mẹ để nối
            const bioChild = childMembers[actualChildIndex];

            let sourceX, sourceY;
            const totalW = parentMembers.length * boxWidth + (parentMembers.length - 1) * gap;
            const startXLocal = -(totalW / 2);

            const motherIndex = bioChild.mid ? parentMembers.findIndex(p => String(p.id) === String(bioChild.mid)) : -1;
            const husbandIndex = parentMembers.findIndex(p => p.gender === 'Nam');

            if (motherIndex !== -1 && husbandIndex !== -1 && motherIndex !== husbandIndex) {
                const motherCenterX = startXLocal + motherIndex * (boxWidth + gap) + (boxWidth / 2);
                const husbandCenterX = startXLocal + husbandIndex * (boxWidth + gap) + (boxWidth / 2);
                const parentCenterOffset = (motherCenterX + husbandCenterX) / 2;
                sourceX = d.source.x + treeOffsetX + parentCenterOffset;
                sourceY = d.source.y + treeStartY + boxHeight / 2;
            } else {
                let parentIndex = -1;
                if (motherIndex !== -1) { parentIndex = motherIndex; }
                else if (bioChild.fid) { const idx = parentMembers.findIndex(p => String(p.id) === String(bioChild.fid)); if (idx !== -1) parentIndex = idx; }
                if (parentIndex === -1) parentIndex = 0;
                
                const parentCenterOffset = startXLocal + parentIndex * (boxWidth + gap) + (boxWidth / 2);
                sourceX = d.source.x + treeOffsetX + parentCenterOffset;
                sourceY = d.source.y + treeStartY + boxHeight;
            }
            
            const midY = sourceY + (targetY - sourceY) / 2;
            return `M${sourceX},${sourceY} V${midY} H${targetX} V${targetY}`;
        });

    // Vẽ các Node (Nhóm thẻ chứa người)
    const nodeGroup = g.selectAll(".node")
        .data(rootD3.descendants().filter(d => d.data.id !== 'super-root'))
        .enter().append("g")
        .attr("class", "node")
        .attr("transform", d => `translate(${d.x + treeOffsetX},${d.y + treeStartY})`);

    nodeGroup.each(function(d) {
        const group = d3.select(this);
        const members = d.data.members;
        
        const totalW = members.length * boxWidth + (members.length - 1) * gap;
        let currentX = -(totalW / 2);

        members.forEach((m, index) => {
            drawMemberBox(group, m, currentX, 0, boxWidth, boxHeight);
            
            if (index < members.length - 1) {
                group.append("line") // Đường nối hôn nhân
                    .attr("class", "marriage-link")
                    .attr("x1", currentX + boxWidth).attr("y1", boxHeight/2)
                    .attr("x2", currentX + boxWidth + gap).attr("y2", boxHeight/2)
            }
            currentX += boxWidth + gap;
        });
    });

    // 5. Tự động zoom vào Thủy tổ khi tải xong
    zoomToNode(null);
}

// Hàm vẽ hộp thông tin thành viên
function drawMemberBox(group, member, x, y, w, h) {
    const g = group.append("g")
        .attr("class", "member-box")
        .attr("transform", `translate(${x},${y})`)
        .style("cursor", "pointer")
        .on("click", (event) => {
            event.stopPropagation();
            // LOGIC MỚI: Click để zoom/focus vào thành viên
            zoomToNode(member.id, 1.2);
        });

    // Chỉ thêm hành động sửa/xóa cho admin
    const userRole = localStorage.getItem('userRole');
    const isAdmin = userRole === 'admin' || userRole === 'owner';
    // Kiểm tra quyền Editor (Admin, Owner, hoặc Branch_*)
    const isEditor = userRole === 'admin' || userRole === 'owner' || (userRole && userRole.startsWith('branch_'));

        if (isEditor) {
            g.on("dblclick", (event) => {
                event.stopPropagation();
                if (window.openEditModal) window.openEditModal(member.id);
            });

            // Thêm nút Sửa nhỏ (hiện khi hover) để người dùng dễ nhận biết
            const editBtn = g.append("g")
                .attr("class", "edit-btn")
                .attr("transform", `translate(${w - 22}, -10)`) // Góc trên phải
                .style("opacity", 0)
                .on("click", (e) => {
                    e.stopPropagation();
                    if (window.openEditModal) window.openEditModal(member.id);
                });
            editBtn.append("circle").attr("r", 10).attr("cx", 10).attr("cy", 10).attr("fill", "white").attr("stroke", "#ccc");
            editBtn.append("text").text("✎").attr("x", 10).attr("y", 14).attr("text-anchor", "middle").attr("font-size", "12px").attr("fill", "#333");

            g.on("mouseenter", function() { d3.select(this).select(".edit-btn").transition().duration(200).style("opacity", 1); })
             .on("mouseleave", function() { d3.select(this).select(".edit-btn").transition().duration(200).style("opacity", 0); });
        }

    const isSpouse = !!member.pid && !member.fid && !member.mid;
    const isDeceased = (member.death_date && String(member.death_date).trim() !== '' && String(member.death_date).trim() !== '0') || member.is_live === 0 || member.is_live === '0' || member.is_live === false || member.is_alive === 0 || member.is_alive === '0' || member.is_alive === false;

    // Thêm các class để CSS có thể tùy biến
    g.classed(member.gender === 'Nam' ? 'male' : 'female', true);
    g.classed(isSpouse ? 'spouse' : 'bloodline', true);
    g.classed('deceased', isDeceased);

    g.append("rect")
        .attr("id", `rect-${member.id}`)
        .attr("class", "member-rect")
        .attr("width", w).attr("height", h).attr("rx", 8); // Tăng bo tròn góc

    g.append("text").text(member.full_name || "Chưa có tên").attr("class", "member-name").attr("x", w/2).attr("y", h/2 - 5).attr("text-anchor", "middle");
    g.append("text").text(member.birth_date ? `NS: ${member.birth_date}` : "").attr("class", "member-meta").attr("x", w/2).attr("y", h/2 + 15).attr("text-anchor", "middle");
}

// Hàm tìm kiếm và zoom tới node
function zoomToNode(memberId, customScale = 0.7) {
    if (!globalRootD3 || !svg) {
        console.warn("Cây chưa được vẽ, không thể zoom.");
        return;
    }

    d3.selectAll(".member-rect").classed("highlighted", false);

    const parent = g.node().parentElement;
    const fullWidth = parent.clientWidth;
    const fullHeight = parent.clientHeight;

    // Nếu container không hiển thị, không thể tính toán kích thước
    if (fullWidth === 0 || fullHeight === 0) {
        console.warn("Zoom thất bại: Container có kích thước bằng 0. Tab có đang hiển thị không?");
        return;
    }

    if (memberId) {
        // --- Trường hợp 1: Zoom vào một thành viên cụ thể ---
        const targetNode = globalRootD3.descendants().find(d => 
            d.data.members && d.data.members.some(m => String(m.id) === String(memberId))
        );
        
        if (targetNode) {
            // Đánh dấu node được chọn
            const targetRect = document.getElementById(`rect-${memberId}`);
            if (targetRect) {
                d3.select(targetRect).classed("highlighted", true);
            }

            // Tính toán tọa độ và scale để đưa node vào trung tâm
            const targetX = targetNode.x + treeOffsetX;
            const targetY = targetNode.y + treeStartY;
            const scale = customScale;

            const transform = d3.zoomIdentity
                .translate(fullWidth / 2 - targetX * scale, fullHeight / 2 - targetY * scale)
                .scale(scale);
            
            // Dùng transition để zoom mượt mà
            svg.transition().duration(750).call(zoom.transform, transform);
        }
    } else {
        // --- Trường hợp 2: Zoom mặc định, CĂN GIỮA THỦY TỔ ---
        const bounds = g.node().getBBox();
        const width = bounds.width;
        const height = bounds.height;

        if (width === 0 || height === 0) return; // Cây rỗng, không cần zoom

        // 1. Tìm node thủy tổ (đời 1) để lấy làm mốc căn giữa
        const ancestorNode = globalRootD3.descendants().find(d => d.data.data && d.data.data.generation == 1);

        // 2. Xác định tọa độ X cần căn giữa.
        // Nếu tìm thấy thủy tổ, dùng tọa độ X của họ. Nếu không, dùng tọa độ giữa của cả cây làm dự phòng.
        const centerX = ancestorNode ? (ancestorNode.x + treeOffsetX) : (bounds.x + width / 2);

        // 3. Giữ nguyên logic scale đã có để đảm bảo độ phóng to hợp lý
        let scale = Math.min(fullWidth / width, fullHeight / height) * 0.9;
        
        // --- CẢI TIẾN: Giới hạn zoom tối thiểu để nhìn rõ chữ ---
        if (scale < 0.8) scale = 0.8; // Đặt tối thiểu 0.8 để chữ luôn rõ ràng (chấp nhận có thanh cuộn nếu cây quá to)
        if (scale > 1.2) scale = 1.2; // Không cho phép quá to lúc đầu

        // 4. Tính toán vị trí dịch chuyển (Translate)
        // - TranslateX: Đưa "centerX" của thủy tổ vào giữa màn hình (fullWidth / 2)
        // - TranslateY: Luôn đẩy đỉnh của cây lên gần trên cùng (cách 40px) để thấy rõ các đời đầu
        const translateX = fullWidth / 2 - centerX * scale;
        const translateY = 40 - bounds.y * scale;

        const transform = d3.zoomIdentity
            .translate(translateX, translateY)
            .scale(scale);
        
        // Áp dụng ngay lập tức, không cần transition
        svg.call(zoom.transform, transform);
    }
}