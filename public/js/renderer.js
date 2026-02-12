(function () {
  'use strict';

  class FamilyTreeRenderer {
    constructor(containerId = 'tree-canvas') {
      this.containerId = containerId;
      this.nodeW = 120;
      this.nodeH = 60;
      this.gap = 20;
      this.levelGap = 150;
      this.svg = null;
      this.g = null;
      this.zoom = null;
    }

    // Khởi tạo D3 với kiểm tra DOM nghiêm ngặt
    initD3() {
      const container = d3.select(`#${this.containerId}`);
      if (container.empty()) {
        console.error("Không tìm thấy thẻ div #tree-canvas");
        return false;
      }
      container.selectAll("*").remove();

      this.zoom = d3.zoom().scaleExtent([0.02, 3]).on("zoom", (e) => {
        if (this.g) this.g.attr("transform", e.transform);
      });

      this.svg = container.append("svg")
        .attr("width", "100%")
        .attr("height", "100%")
        .call(this.zoom)
        .on("dblclick.zoom", null);

      this.g = this.svg.append("g");
      return true;
    }

    async renderFullTree() {
      // Đảm bảo DOM đã load xong mới chạy
      if (!this.initD3()) {
        setTimeout(() => this.renderFullTree(), 500);
        return;
      }

      try {
        const token = localStorage.getItem('authToken');
        const res = await fetch(window.location.origin + '/api/family-tree', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        const json = await res.json();
        if (!json || !json.success || !json.data.members) {
          console.error("Dữ liệu API không hợp lệ");
          return;
        }

        this.processAndDraw(json.data.members);
      } catch (e) {
        console.error("Lỗi Fetch API:", e);
      }
    }

    processAndDraw(data) {
      this.g.selectAll("*").remove();

      // 1. ÉP KIỂU ID & TẠO MAP (Rất quan trọng)
      const memberMap = new Map();
      data.forEach(m => {
        const id = String(m.id);
        memberMap.set(id, {
          ...m,
          id,
          fid: m.fid ? String(m.fid) : null,
          mid: m.mid ? String(m.mid) : null,
          pids: Array.isArray(m.pids) ? m.pids.map(p => String(p)) : (m.pid ? [String(m.pid)] : [])
        });
      });

      // 2. GOM NHÓM GIA ĐÌNH (Logic giống dự án bạn tham khảo)
      const processed = new Set();
      const displayNodes = [];
      const memberToNode = new Map();

      // Sắp xếp ưu tiên Nam làm chủ hộ
      const sortedData = [...memberMap.values()].sort((a, b) => (a.gender === 'Nam' ? -1 : 1));

      sortedData.forEach(m => {
        if (processed.has(m.id)) return;

        // Tìm các vợ/chồng
        const spouses = m.pids.map(pid => memberMap.get(pid)).filter(Boolean);
        
        const familyMembers = [m, ...spouses];
        const node = {
          id: `fam-${m.id}`,
          members: familyMembers,
          children: [],
          representative: m // Người dùng để nối với đời trước
        };

        familyMembers.forEach(fm => {
          processed.add(fm.id);
          memberToNode.set(fm.id, node);
        });
        displayNodes.push(node);
      });

      // 3. XÂY DỰNG CẤY PHÂN CẤP (Hierarchy)
      const roots = [];
      displayNodes.forEach(node => {
        const rep = node.members.find(m => m.fid || m.mid) || node.representative;
        const parentId = rep.fid || rep.mid;
        const parentNode = parentId ? memberToNode.get(parentId) : null;

        if (parentNode && parentNode !== node) {
          parentNode.children.push(node);
        } else {
          roots.push(node);
        }
      });

      // 4. D3 TREE LAYOUT
      const superRoot = { id: 'super-root', children: roots };
      const rootD3 = d3.hierarchy(superRoot, d => d.children);
      
      const treeLayout = d3.tree().nodeSize([300, this.levelGap]);
      treeLayout(rootD3);

      // Căn chỉnh Y theo Generation nếu có
      rootD3.each(d => {
        if (d.data.representative && d.data.representative.generation) {
          d.y = (parseInt(d.data.representative.generation) - 1) * this.levelGap;
        }
      });

      // 5. VẼ ĐƯỜNG NỐI (Orthogonal - Vuông góc)
      const linksG = this.g.append("g").attr("fill", "none").attr("stroke", "#94a3b8").attr("stroke-width", 1.5);
      
      rootD3.links().forEach(link => {
        if (link.source.data.id === 'super-root') return;

        const parentFam = link.source.data;
        const childMain = link.target.data.members[0];

        // Tìm vị trí X của mẹ (nếu có)
        let sourceX = link.source.x;
        if (childMain.mid) {
          const mIdx = parentFam.members.findIndex(m => m.id === childMain.mid);
          if (mIdx !== -1) {
            const totalW = parentFam.members.length * this.nodeW + (parentFam.members.length - 1) * this.gap;
            sourceX = link.source.x - (totalW / 2) + mIdx * (this.nodeW + this.gap) + (this.nodeW / 2);
          }
        }

        const targetX = link.target.x;
        const midY = link.source.y + (link.target.y - link.source.y) / 2;
        linksG.append("path").attr("d", `M${sourceX},${link.source.y + this.nodeH} V${midY} H${targetX} V${link.target.y}`);
      });

      // 6. VẼ CÁC THÀNH VIÊN
      const nodeGroups = this.g.append("g").selectAll("g")
        .data(rootD3.descendants().filter(d => d.data.id !== 'super-root'))
        .enter().append("g")
        .attr("transform", d => `translate(${d.x},${d.y})`);

      const self = this;
      nodeGroups.each(function(d) {
        const group = d3.select(this);
        const members = d.data.members;
        const totalW = members.length * self.nodeW + (members.length - 1) * self.gap;
        let currentX = -(totalW / 2);

        members.forEach((m, i) => {
          const x = currentX + i * (self.nodeW + self.gap);
          const isNam = m.gender === 'Nam';
          
          const box = group.append("g").attr("transform", `translate(${x},0)`);
          
          box.append("rect")
            .attr("width", self.nodeW).attr("height", self.nodeH).attr("rx", 8)
            .attr("fill", isNam ? "#eff6ff" : "#fff1f2")
            .attr("stroke", isNam ? "#3b82f6" : "#ec4899").attr("stroke-width", 2);

          box.append("text")
            .attr("x", self.nodeW/2).attr("y", self.nodeH/2 + 5).attr("text-anchor", "middle")
            .style("font-size", "11px").style("font-weight", "bold")
            .text(m.full_name);

          if (i < members.length - 1) {
            group.append("line")
              .attr("x1", x + self.nodeW).attr("y1", self.nodeH/2)
              .attr("x2", x + self.nodeW + self.gap).attr("y2", self.nodeH/2)
              .attr("stroke", "#f472b6").attr("stroke-width", 2);
          }
        });
      });

      this.centerTree();
    }

    centerTree() {
      const bbox = this.g.node().getBBox();
      const svgNode = this.svg.node();
      const width = svgNode.clientWidth || window.innerWidth;
      const scale = Math.min(0.5, width / (bbox.width + 100));
      this.svg.call(this.zoom.transform, d3.zoomIdentity.translate(width/2 - (bbox.x + bbox.width/2)*scale, 50).scale(scale));
    }
  }

  window.FamilyTreeRenderer = FamilyTreeRenderer;
})();
