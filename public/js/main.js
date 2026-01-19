const API_URL = '/api/members';

const App = () => {
    const [members, setMembers] = React.useState([]);
    const [loading, setLoading] = React.useState(true);
    const [modalOpen, setModalOpen] = React.useState(false);
    const [formData, setFormData] = React.useState({
        full_name: '', gender: 'Nam', fid: '', mid: ''
    });

    // Load dữ liệu khi component mount
    React.useEffect(() => {
        fetchMembers();
    }, []);

    const fetchMembers = async () => {
        try {
            const res = await fetch(API_URL);
            const data = await res.json();
            setMembers(data);
        } catch (err) {
            console.error('Lỗi tải dữ liệu:', err);
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        if (!formData.full_name) return alert("Vui lòng nhập tên!");

        await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(formData)
        });

        setModalOpen(false);
        setFormData({ full_name: '', gender: 'Nam', fid: '', mid: '' });
        fetchMembers(); // Tải lại danh sách
    };

    return (
        <div style={{display: 'flex', height: '100vh'}}>
            {/* Sidebar Danh sách */}
            <div id="memberList">
                <h3>Danh sách ({members.length})</h3>
                <button className="btn-add" onClick={() => setModalOpen(true)}>+ Thêm thành viên</button>
                {loading ? <p>Đang tải...</p> : members.map(m => (
                    <div key={m.id} className="member-card">
                        <h4>{m.full_name}</h4>
                        <p>Đời: {m.generation} | {m.gender}</p>
                    </div>
                ))}
            </div>
            
            {/* Khu vực vẽ cây */}
            <div style={{flex: 1, overflow: 'hidden', position: 'relative'}}>
                <FamilyTree members={members} />
            </div>

            {/* Modal Thêm mới */}
            {modalOpen && (
                <div className="modal" style={{display: 'block'}}>
                    <div className="modal-content">
                        <span className="close" onClick={() => setModalOpen(false)}>&times;</span>
                        <h2>Thêm thành viên</h2>
                        
                        <input type="text" placeholder="Họ tên" value={formData.full_name}
                            onChange={e => setFormData({...formData, full_name: e.target.value})} />
                        
                        <select value={formData.gender} onChange={e => setFormData({...formData, gender: e.target.value})}>
                            <option value="Nam">Nam</option>
                            <option value="Nữ">Nữ</option>
                        </select>

                        <select value={formData.fid} onChange={e => setFormData({...formData, fid: e.target.value})}>
                            <option value="">Chọn Cha</option>
                            {members.filter(m => m.gender === 'Nam').map(m => 
                                <option key={m.id} value={m.id}>{m.full_name}</option>
                            )}
                        </select>

                        <select value={formData.mid} onChange={e => setFormData({...formData, mid: e.target.value})}>
                            <option value="">Chọn Mẹ</option>
                            {members.filter(m => m.gender !== 'Nam').map(m => 
                                <option key={m.id} value={m.id}>{m.full_name}</option>
                            )}
                        </select>

                        <button className="btn-save" onClick={handleSave}>Lưu</button>
                    </div>
                </div>
            )}
        </div>
    );
};

// Render App vào div#root
const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);