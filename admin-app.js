/**
 * CHARRMPARK - Admin Dashboard Logic
 * User management, RFID UID assignment, analytics, and real-time updates
 */
initSupabase(); startClock(); updateDBBadge();

let adminState = { users: [], pendingUsers: [], logs: [], slots: [] };

// Demo data (fallback)
const demoUsers = [
    { id:'1', full_name:'Juan Dela Cruz', role:'Student', rfid_uid:'B7 78 96 31', program:'BSIT', section:'3A', vehicle_type:'Car', vehicle_model:'Honda Civic', plate_number:'XYZ-123', vehicle_color:'Black', authorization_status:'AUTHORIZED', age:21, sex:'Male', address:'Ibajay, Aklan', created_at:'2024-01-15' },
    { id:'2', full_name:'Maria Santos', role:'Faculty', rfid_uid:'UID67890', program:'Engineering', section:'--', vehicle_type:'SUV', vehicle_model:'Toyota Fortuner', plate_number:'ABC-789', vehicle_color:'White', authorization_status:'AUTHORIZED', age:35, sex:'Female', address:'Kalibo, Aklan', created_at:'2024-02-01' },
    { id:'3', full_name:'Carlos Reyes', role:'Staff', rfid_uid:'UID55555', program:'Admin', section:'--', vehicle_type:'Motorcycle', vehicle_model:'Yamaha NMAX', plate_number:'DEF-456', vehicle_color:'Silver', authorization_status:'AUTHORIZED', age:28, sex:'Male', address:'Nabas, Aklan', created_at:'2024-03-10' },
    { id:'4', full_name:'Ana Lopez', role:'Student', rfid_uid:'', program:'BSCS', section:'2B', vehicle_type:'Motorcycle', vehicle_model:'Honda Click', plate_number:'GHI-789', vehicle_color:'Red', authorization_status:'PENDING', age:20, sex:'Female', address:'Ibajay, Aklan', created_at:'2024-05-13' },
    { id:'5', full_name:'Pedro Garcia', role:'Student', rfid_uid:'', program:'BSA', section:'1A', vehicle_type:'Car', vehicle_model:'Vios', plate_number:'JKL-012', vehicle_color:'Blue', authorization_status:'PENDING', age:19, sex:'Male', address:'Tangalan, Aklan', created_at:'2024-05-14' },
];

function generateSlots() {
    const s = [];
    for (let i=1;i<=10;i++) s.push({ id:`TM${i}`, slot_number:`TM${String(i).padStart(2,'0')}`, status: Math.random()>0.5?'OCCUPIED':'AVAILABLE' });
    return s;
}

// =====================
// VIEW SWITCHING
// =====================
function adminView(v) {
    document.querySelectorAll('.app-view').forEach(el=>{el.classList.add('hidden');el.classList.remove('flex');});
    const t = document.getElementById('aview-'+v);
    if(t){t.classList.remove('hidden');t.classList.add('flex');}
    document.querySelectorAll('.sidebar-item').forEach(s=>s.classList.remove('active'));
    const n = document.getElementById('anav-'+v);
    if(n) n.classList.add('active');
    if(v==='analytics') initCharts();
    renderAdmin();
}
window.adminView = adminView;

// =====================
// LOAD DATA
// =====================
async function loadData() {
    if (isConnected) {
        try {
            const {data:u, error:ue} = await supabaseClient.from('users').select('*').order('created_at',{ascending:false});
            if (ue) { console.error('Users error:', ue); throw ue; }
            if(u) adminState.users = u;

            const {data:s, error:se} = await supabaseClient.from('parking_slots').select('*');
            if (se) console.error('Slots error:', se);
            adminState.slots = s&&s.length?s:generateSlots();

            const {data:l, error:le} = await supabaseClient.from('parking_logs').select('*, users(full_name)').order('timestamp',{ascending:false}).limit(1000);
            if (le) console.error('Logs error:', le);
            if(l) adminState.logs = l;

            console.log('✅ Admin data loaded:', adminState.users.length, 'users');
        } catch(e) {
            console.error('Load error:', e);
            adminState.users = demoUsers;
            adminState.slots = generateSlots();
        }
    } else {
        adminState.users = [...demoUsers];
        adminState.slots = generateSlots();
        const local = JSON.parse(localStorage.getItem('charrmpark_registrations')||'[]');
        local.forEach(r => { if(!adminState.users.find(u=>u.id===r.id)) adminState.users.push(r); });
    }
    adminState.pendingUsers = adminState.users.filter(u=>u.authorization_status==='PENDING');
    renderAdmin();
}

// =====================
// RENDER
// =====================
function renderAdmin() {
    const el = id => document.getElementById(id);
    const occ = adminState.slots.filter(s=>s.status==='OCCUPIED').length;

    if(el('adminStatUsers')) el('adminStatUsers').textContent = adminState.users.length;
    if(el('adminStatPending')) el('adminStatPending').textContent = adminState.pendingUsers.length;
    if(el('adminStatEntries')) el('adminStatEntries').textContent = adminState.logs.length || 0;
    if(el('adminStatSlots')) el('adminStatSlots').textContent = `${adminState.slots.length-occ}/${adminState.slots.length}`;

    // Pending table
    if(el('pendingTable')) {
        el('pendingTable').innerHTML = adminState.pendingUsers.length ? adminState.pendingUsers.map(u=>`<tr class="hover:bg-white/60 border-b border-slate-100/50"><td class="p-4 font-bold text-slate-800">${u.full_name}</td><td class="p-4"><span class="px-2 py-0.5 rounded text-xs font-bold bg-slate-200 text-slate-700 uppercase">${u.role}</span></td><td class="p-4 text-sm text-slate-600">${u.vehicle_type||'--'} - ${u.vehicle_model||'--'}</td><td class="p-4 text-sm text-slate-500">${u.created_at?new Date(u.created_at).toLocaleDateString():'--'}</td><td class="p-4 text-center"><span class="px-2 py-1 rounded text-[10px] font-bold bg-yellow-100 text-yellow-700">PENDING</span></td><td class="p-4 text-right whitespace-nowrap"><button onclick="approveUser('${u.id}')" class="px-3 py-1.5 rounded-lg bg-charm-green text-white text-xs font-bold hover:bg-green-600 mr-1">Approve</button><button onclick="denyRegistration('${u.id}')" class="px-3 py-1.5 rounded-lg bg-charm-red text-white text-xs font-bold hover:bg-red-600">Deny</button></td></tr>`).join('') : '<tr><td colspan="6" class="p-8 text-center text-slate-400">No pending registrations</td></tr>';
    }

    // Users table — show ALL authorized users with RFID UID assignment
    if(el('usersTable')) {
        const search = (el('userSearch')?.value||'').toLowerCase();
        const role = el('roleFilter')?.value||'';
        let filtered = adminState.users.filter(u => u.authorization_status==='AUTHORIZED');
        if(search) filtered = filtered.filter(u => (u.full_name||'').toLowerCase().includes(search) || (u.rfid_uid||'').toLowerCase().includes(search) || (u.plate_number||'').toLowerCase().includes(search));
        if(role) filtered = filtered.filter(u => u.role===role);
        el('usersTable').innerHTML = filtered.length ? filtered.map(u=>`<tr class="hover:bg-white/60 border-b border-slate-100/50">
            <td class="p-4 font-bold text-slate-800">${u.full_name}</td>
            <td class="p-4"><span class="px-2 py-0.5 rounded text-xs font-bold bg-slate-200 text-slate-700 uppercase">${u.role}</span><div class="text-xs text-slate-500 mt-1">${u.program||'--'} • ${u.section||'--'}</div></td>
            <td class="p-4 font-mono text-xs">${u.rfid_uid ? `<span class="text-green-600 font-bold">${u.rfid_uid}</span>` : '<span class="text-yellow-600 font-bold">Not Assigned</span>'}</td>
            <td class="p-4"><div class="font-semibold text-slate-700">${u.vehicle_type||'--'} - ${u.vehicle_model||'--'}</div></td>
            <td class="p-4 font-mono font-bold text-slate-700">${u.plate_number||'--'}</td>
            <td class="p-4 text-center"><span class="px-2 py-1 rounded text-[10px] font-bold ${u.rfid_uid?'bg-green-100 text-green-700':'bg-yellow-100 text-yellow-700'}">${u.rfid_uid?'ACTIVE':'NO RFID'}</span></td>
            <td class="p-4 text-right whitespace-nowrap">
                <button onclick="openUserModal('${u.id}')" class="p-1.5 text-slate-400 hover:text-charm-dark rounded-lg hover:bg-slate-100" title="Edit / Assign RFID"><i data-lucide="edit" class="w-4 h-4"></i></button>
                <button onclick="deleteUser('${u.id}')" class="p-1.5 text-slate-400 hover:text-red-500 ml-1 rounded-lg hover:bg-red-50" title="Delete"><i data-lucide="trash" class="w-4 h-4"></i></button>
            </td></tr>`).join('') : '<tr><td colspan="7" class="p-8 text-center text-slate-400">No authorized users found</td></tr>';
    }

    // Slots
    const renderSlots = (id) => {
        const c = el(id); if(!c) return;
        c.innerHTML = adminState.slots.map(s=>{const a=s.status==='AVAILABLE';const bg=a?'bg-charm-light/20 border-charm-light/40 text-charm-dark':'bg-red-50 border-red-200 text-red-600';const dot=a?'bg-charm-green':'bg-red-500';return `<div class="rounded-xl p-3 border ${bg} flex flex-col items-center justify-center slot-card"><div class="w-full flex justify-end mb-1"><div class="w-2 h-2 rounded-full ${dot}"></div></div><div class="text-lg font-display font-bold">${s.slot_number}</div><div class="text-[10px] font-bold uppercase mt-1">${s.status}</div></div>`;}).join('');
    };
    renderSlots('adminMonitorSlots');

    // Logs
    if(el('adminLogsTable')) {
        const recentLogs = adminState.logs.slice(0, 30);
        if (recentLogs.length) {
            el('adminLogsTable').innerHTML = recentLogs.map(l=>`<tr class="hover:bg-white/60 border-b border-slate-100/50"><td class="p-4 text-slate-500">${l.timestamp?new Date(l.timestamp).toLocaleTimeString('en-US',{hour12:false}):'--'}</td><td class="p-4 font-mono text-xs text-slate-400">${l.rfid_uid}</td><td class="p-4 font-bold text-slate-800">${l.users?.full_name||'Unknown'}</td><td class="p-4 text-center"><span class="px-2 py-1 rounded text-[10px] font-bold ${l.scan_type==='ENTRY'?'bg-green-100 text-green-700':'bg-red-100 text-red-700'}">${l.scan_type}</span></td><td class="p-4 font-bold">${l.parking_slot||'--'}</td><td class="p-4 text-right"><span class="text-[10px] font-bold ${l.status==='AUTHORIZED'?'text-green-600':'text-red-600'}">●</span></td></tr>`).join('');
        } else {
            el('adminLogsTable').innerHTML = '<tr><td colspan="6" class="p-8 text-center text-slate-400">No scan logs yet</td></tr>';
        }
    }
    lucide.createIcons();
}
window.filterUsers = renderAdmin;

// =====================
// APPROVE / DENY / DELETE
// =====================
window.approveUser = async function(id) {
    try {
        if(isConnected) {
            const { error } = await supabaseClient.from('users').update({authorization_status:'AUTHORIZED'}).eq('id',id);
            if (error) throw error;
            await loadData();
        } else {
            const u = adminState.users.find(x=>x.id===id||x.id===String(id));
            if(u) u.authorization_status='AUTHORIZED';
            adminState.pendingUsers = adminState.users.filter(u=>u.authorization_status==='PENDING');
            renderAdmin();
        }
        showToast('User approved successfully!','success');
    } catch(e) { showToast('Error: '+e.message,'error'); }
};

window.denyRegistration = async function(id) {
    if(!confirm('Deny this registration?')) return;
    try {
        if(isConnected) {
            const { error } = await supabaseClient.from('users').update({authorization_status:'DENIED'}).eq('id',id);
            if (error) throw error;
            await loadData();
        } else {
            adminState.users = adminState.users.filter(u=>u.id!==id);
            adminState.pendingUsers = adminState.users.filter(u=>u.authorization_status==='PENDING');
            renderAdmin();
        }
        showToast('Registration denied.','warning');
    } catch(e) { showToast('Error: '+e.message,'error'); }
};

window.deleteUser = async function(id) {
    if(!confirm('Delete this user permanently?')) return;
    try {
        if(isConnected) {
            const { error } = await supabaseClient.from('users').delete().eq('id',id);
            if (error) throw error;
            await loadData();
        } else {
            adminState.users = adminState.users.filter(u=>u.id!==id);
            renderAdmin();
        }
        showToast('User deleted.','warning');
    } catch(e) { showToast('Error: '+e.message,'error'); }
};

// =====================
// USER MODAL (Add / Edit / Assign RFID)
// =====================
window.openUserModal = function(id) {
    const m = document.getElementById('userModal');
    document.getElementById('formUserId').value = id||'';
    
    if(id) {
        document.getElementById('modalTitle').textContent = 'Edit User / Assign RFID';
        const u = adminState.users.find(x => x.id === id || x.id === String(id));
        if(u) {
            document.getElementById('formName').value = u.full_name || '';
            document.getElementById('formUid').value = u.rfid_uid || '';
            document.getElementById('formRole').value = u.role || 'Student';
            document.getElementById('formAge').value = u.age || '';
            document.getElementById('formSex').value = u.sex || 'Male';
            document.getElementById('formAddress').value = u.address || '';
            document.getElementById('formProgram').value = u.program || '';
            document.getElementById('formSection').value = u.section || '';
            document.getElementById('formVehType').value = u.vehicle_type || 'Car';
            document.getElementById('formPlate').value = u.plate_number || '';
            document.getElementById('formVehModel').value = u.vehicle_model || '';
            document.getElementById('formVehColor').value = u.vehicle_color || '';

            // Set Image Previews
            const profileImg = u.profile_image || `https://ui-avatars.com/api/?name=${encodeURIComponent(u.full_name)}&background=random`;
            const motorImg = u.motorcycle_image || 'https://images.unsplash.com/photo-1558981403-c5f91cbba527?auto=format&fit=crop&q=80&w=200';
            
            document.getElementById('prevProfile').src = profileImg;
            document.getElementById('prevMotor').src = motorImg;
            document.getElementById('prevIDFront').src = u.id_front_image || 'https://via.placeholder.com/150?text=ID+Front';
            document.getElementById('prevIDBack').src = u.id_back_image || 'https://via.placeholder.com/150?text=ID+Back';
            document.getElementById('prevLicense').src = u.drivers_license_image || 'https://via.placeholder.com/150?text=License';
        }
    } else {
        document.getElementById('modalTitle').textContent = 'Register New User';
        document.getElementById('userForm').reset();
        document.getElementById('prevProfile').src = 'https://ui-avatars.com/api/?name=User&background=random';
        document.getElementById('prevMotor').src = 'https://images.unsplash.com/photo-1558981403-c5f91cbba527?auto=format&fit=crop&q=80&w=200';
        document.getElementById('prevIDFront').src = 'https://via.placeholder.com/150?text=ID+Front';
        document.getElementById('prevIDBack').src = 'https://via.placeholder.com/150?text=ID+Back';
        document.getElementById('prevLicense').src = 'https://via.placeholder.com/150?text=License';
    }
    
    m.classList.remove('hidden');
    setTimeout(()=>{
        m.classList.remove('opacity-0');
        document.getElementById('userModalContent').classList.remove('scale-95');
    }, 10);
    lucide.createIcons();
};

window.closeUserModal = function() {
    const m = document.getElementById('userModal');
    m.classList.add('opacity-0');
    document.getElementById('userModalContent').classList.add('scale-95');
    setTimeout(()=>m.classList.add('hidden'), 300);
};

window.saveUser = async function() {
    const name = document.getElementById('formName').value.trim();
    const uid = document.getElementById('formUid').value.toUpperCase().trim();
    const role = document.getElementById('formRole').value;
    
    if(!name || !role) {
        showToast('Name and Role are required.','warning');
        return;
    }
    
    const userData = {
        full_name: name,
        rfid_uid: uid || null,  // NULL if empty (admin hasn't assigned yet)
        role: role,
        age: document.getElementById('formAge').value ? parseInt(document.getElementById('formAge').value) : null,
        sex: document.getElementById('formSex').value,
        address: document.getElementById('formAddress').value.trim() || null,
        program: document.getElementById('formProgram').value.trim() || null,
        section: document.getElementById('formSection').value.trim() || null,
        vehicle_type: document.getElementById('formVehType').value,
        plate_number: document.getElementById('formPlate').value.toUpperCase().trim() || null,
        vehicle_model: document.getElementById('formVehModel').value.trim() || null,
        vehicle_color: document.getElementById('formVehColor').value.trim() || null,
        authorization_status: 'AUTHORIZED',
        profile_image: document.getElementById('prevProfile').src.startsWith('data:') ? document.getElementById('prevProfile').src : undefined,
        motorcycle_image: document.getElementById('prevMotor').src.startsWith('data:') ? document.getElementById('prevMotor').src : undefined
    };

    // Remove undefined fields so we don't overwrite with null if not changed
    Object.keys(userData).forEach(key => userData[key] === undefined && delete userData[key]);
    
    const userId = document.getElementById('formUserId').value;
    
    try {
        if(isConnected) {
            if(userId) {
                // UPDATE existing user
                const { error } = await supabaseClient.from('users').update(userData).eq('id', userId);
                if (error) throw error;
                console.log('✅ User updated:', name, 'RFID:', uid || 'none');
            } else {
                // INSERT new user
                const { data, error } = await supabaseClient.from('users').insert([userData]).select();
                if (error) throw error;
                console.log('✅ User created:', data);
            }
            await loadData();
        } else {
            if(userId) {
                const i = adminState.users.findIndex(u => u.id === userId);
                if(i > -1) Object.assign(adminState.users[i], userData);
            } else {
                adminState.users.push({...userData, id: 'local_' + Date.now(), created_at: new Date().toISOString()});
            }
            adminState.pendingUsers = adminState.users.filter(u=>u.authorization_status==='PENDING');
            renderAdmin();
        }
        closeUserModal();
        showToast(userId ? 'User updated successfully!' : 'User created successfully!', 'success');
    } catch(e) {
        console.error('Save error:', e);
        showToast('Error: ' + (e.message || e.details || 'Unknown error'), 'error');
    }
};

window.previewFile = function(input, imgId) {
    const file = input.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function(e) {
            document.getElementById(imgId).src = e.target.result;
        }
        reader.readAsDataURL(file);
    }
};

window.viewFullImage = function(src) {
    if (src.includes('placeholder.com')) return;
    window.open(src, '_blank');
};

// =====================
// CHARTS & ANALYTICS
// =====================
let chart1, chart2, chart3;

function initCharts() {
    Chart.defaults.font.family = "'Inter', sans-serif";
    Chart.defaults.color = '#64748b';

    // Calculate real data from users
    const students = adminState.users.filter(u=>u.role==='Student').length;
    const faculty = adminState.users.filter(u=>u.role==='Faculty').length;
    const staff = adminState.users.filter(u=>u.role==='Staff').length;

    const ctx1 = document.getElementById('chartUserTypes');
    if(ctx1) {
        if(chart1) chart1.destroy();
        chart1 = new Chart(ctx1,{type:'doughnut',data:{labels:['Students','Faculty','Staff'],datasets:[{data:[students||1,faculty||0,staff||0],backgroundColor:['#1F6B4F','#B7D8B0','#F4C542'],borderWidth:0,hoverOffset:4}]},options:{responsive:true,maintainAspectRatio:false,layout:{padding:{bottom:10}},plugins:{legend:{position:'bottom',labels:{boxWidth:12,usePointStyle:true,padding:15}}},cutout:'75%'}});
    }
    
    // Entry vs Exit based on logs
    let entries = 0, exits = 0;
    adminState.logs.forEach(l => { if(l.scan_type==='ENTRY') entries++; else if(l.scan_type==='EXIT') exits++; });

    const ctx2 = document.getElementById('chartEntryExit');
    if(ctx2) {
        if(chart2) chart2.destroy();
        chart2 = new Chart(ctx2,{type:'bar',data:{labels:['Total Scans'],datasets:[{label:'Entries',data:[entries||0],backgroundColor:'#1F6B4F',borderRadius:4},{label:'Exits',data:[exits||0],backgroundColor:'#B7D8B0',borderRadius:4}]},options:{responsive:true,maintainAspectRatio:false,scales:{y:{beginAtZero:true,grid:{color:'#f1f5f9'},border:{display:false}},x:{grid:{display:false},border:{display:false}}},plugins:{legend:{position:'bottom'}}}});
    }
    
    const ctx3 = document.getElementById('chartPeakHours');
    if(ctx3) {
        if(chart3) chart3.destroy();
        chart3 = new Chart(ctx3,{type:'line',data:{labels:['7AM','9AM','11AM','1PM','3PM','5PM','7PM'],datasets:[{label:'Vehicles',data:[30,120,100,110,80,40,10],borderColor:'#F4C542',backgroundColor:'rgba(244,197,66,0.2)',fill:true,tension:0.4,pointBackgroundColor:'#1F6B4F',pointBorderWidth:2}]},options:{responsive:true,maintainAspectRatio:false,scales:{y:{beginAtZero:true,grid:{color:'#f1f5f9'},border:{display:false}},x:{grid:{display:false},border:{display:false}}},plugins:{legend:{display:false}}}});
    }

    // Process Rankings
    const logCounts = {};
    adminState.logs.forEach(l => {
        if (l.user_id) {
            logCounts[l.user_id] = (logCounts[l.user_id] || 0) + 1;
        }
    });

    const rankedUsers = adminState.users
        .map(u => ({ ...u, logCount: logCounts[u.id] || 0 }))
        .filter(u => u.logCount > 0)
        .sort((a, b) => b.logCount - a.logCount);

    const studentsRank = rankedUsers.filter(u => u.role === 'Student').slice(0, 10);
    const facultyRank = rankedUsers.filter(u => u.role === 'Faculty' || u.role === 'Staff').slice(0, 10);

    const sTable = document.getElementById('studentRankingTable');
    if (sTable) {
        sTable.innerHTML = studentsRank.length ? studentsRank.map((u, i) => `
            <tr class="hover:bg-white/60 border-b border-slate-100/50">
                <td class="p-3 text-slate-500 font-bold w-12">#${i + 1}</td>
                <td class="p-3 font-bold text-slate-800">${u.full_name}</td>
                <td class="p-3 text-center text-xs text-slate-500">${u.program || '--'}</td>
                <td class="p-3 text-right font-display font-bold text-charm-dark">${u.logCount}</td>
            </tr>
        `).join('') : '<tr><td colspan="4" class="p-6 text-center text-slate-400">No student activity</td></tr>';
    }

    const fTable = document.getElementById('facultyRankingTable');
    if (fTable) {
        fTable.innerHTML = facultyRank.length ? facultyRank.map((u, i) => `
            <tr class="hover:bg-white/60 border-b border-slate-100/50">
                <td class="p-3 text-slate-500 font-bold w-12">#${i + 1}</td>
                <td class="p-3 font-bold text-slate-800">${u.full_name}</td>
                <td class="p-3 text-center text-xs text-slate-500"><span class="px-2 py-0.5 rounded bg-slate-100">${u.role}</span></td>
                <td class="p-3 text-right font-display font-bold text-charm-mid">${u.logCount}</td>
            </tr>
        `).join('') : '<tr><td colspan="4" class="p-6 text-center text-slate-400">No faculty/staff activity</td></tr>';
    }
}

// =====================
// SUPABASE REALTIME
// =====================
if (isConnected) {
    console.log('🔌 Admin: Setting up Realtime...');
    
    supabaseClient.channel('admin-users')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'users' }, async () => {
            console.log('👤 Users table changed, reloading...');
            await loadData();
        })
        .subscribe();

    supabaseClient.channel('admin-logs')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'parking_logs' }, async () => {
            console.log('📋 New log entry, reloading...');
            await loadData();
        })
        .subscribe();
}

// =====================
// INIT
// =====================
loadData();
lucide.createIcons();
